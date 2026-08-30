-- Sprint « Alertes & documents » (créé le 2026-08-29, développé le 2026-08-30).
--
-- 1. Bail sans bouton « Valider » : le dépôt du bail signé active le bail et
--    loue le lot (contrôles de mise en location au dépôt) ; l'état des lieux
--    d'entrée non signé devient une alerte liée au bail, fermée à la signature.
--    « Corriger » remet un bail tout juste activé en brouillon (devalider_bail).
-- 2. Alertes : une alerte par objet pour les crons diagnostics/assurance (mise à
--    jour du seuil au lieu d'un empilement), alertes d'approche du compteur de
--    restitution (J-7, dépassé), fermées à la finalisation du décompte.
-- 3. Documents : les pièces du bail (bail signé, règlement de copropriété)
--    sont exposées au locataire — un seul prédicat partagé par les quatre
--    fonctions du périmètre locataire.

-- ============================================================
-- 1. Bail
-- ============================================================
alter table public.baux add column if not exists signe_envoye_le timestamptz;
comment on column public.baux.signe_envoye_le is
  'Bail signé envoyé au locataire (email + espace « Mes documents ») — évite le double envoi.';

-- Les contrôles de mise en location, sans effet : appelés AVANT le dépôt du
-- PDF (refuser un dépôt vaut mieux qu'un bail signé stocké sans activation).
create or replace function public.controler_mise_en_location(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;
  if v.locataire_principal is null then
    raise exception 'Le locataire principal est obligatoire';
  end if;

  if v.loyer_hc is not null and v.depot_garantie is not null then
    v_plafond := (case when v.type = 'meuble' then 2 else 1 end) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        (case when v.type = 'meuble' then 2 else 1 end), v_plafond;
    end if;
  end if;

  -- Un seul bail actif par lot ; le brouillon suivant attend la fin du précédent
  if exists (
    select 1 from public.baux b
    where b.lot_id = v.lot_id and b.id <> p_bail and b.etat in ('actif', 'preavis')
  ) then
    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;
end;
$$;
revoke execute on function public.controler_mise_en_location(uuid) from public, anon;

-- Activation : les mêmes contrôles + le PDF signé, puis bail actif → lot loué.
-- Sans état des lieux d'entrée signé : alerte liée au bail (origine = bail),
-- fermée d'elle-même à la signature (trigger ci-dessous).
create or replace function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
  v_lot record;
  v_locataire text;
begin
  perform public.controler_mise_en_location(p_bail);
  select * into v from public.baux where id = p_bail;
  if v.document_signe is null then
    raise exception 'Déposez le bail signé (PDF) : c''est lui qui active le bail (V0 : signature hors plateforme)';
  end if;

  update public.baux
     set etat = 'actif',
         date_debut = coalesce(date_debut, current_date),
         updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;

  if not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
    select * into v_lot from public.lots where id = v.lot_id;
    select trim(coalesce(prenom, '') || ' ' || nom) into v_locataire
    from public.persons where id = v.locataire_principal;
    -- Échéance : l'état des lieux se fait à la remise des clés, donc à la prise d'effet
    insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
    values (v.organization_id, 'edl_entree', 'normale',
            format('État des lieux d''entrée — %s · %s',
                   v_lot.nom, coalesce(nullif(v_locataire, ''), 'locataire')),
            jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id,
                               'person_id', v.locataire_principal,
                               'libelle', format('%s · %s', v_lot.nom,
                                                 coalesce(nullif(v_locataire, ''), 'locataire'))),
            coalesce(v.date_debut, current_date));
  end if;
end;
$$;

-- « Corriger » : un bail actif que rien n'a encore fait vivre (aucun loyer
-- appelé ni encaissé, pas de congé, pas de restitution) revient en brouillon ;
-- le lot redevient disponible, le PDF déposé est détaché (il reste en GED).
create function public.devalider_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'actif' then
    raise exception 'Seul un bail actif peut être remis en brouillon';
  end if;
  if exists (select 1 from public.appels_loyer a where a.bail_id = p_bail)
     or exists (select 1 from public.encaissements e where e.bail_id = p_bail)
     or exists (select 1 from public.restitutions r where r.bail_id = p_bail) then
    raise exception 'Ce bail a déjà vécu (loyers appelés ou encaissés) : il ne revient pas en brouillon — passez par un avenant ou un congé';
  end if;

  update public.baux
     set etat = 'brouillon', document_signe = null, signe_envoye_le = null, updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'disponible' where id = v.lot_id;
  perform public.fermer_alertes_origine(v.organization_id, 'bail', p_bail,
    'Bail remis en brouillon pour correction', array['edl_entree']);
end;
$$;
revoke execute on function public.devalider_bail(uuid) from public, anon;

-- Transition loué → disponible : uniquement quand plus aucun bail ne vit sur
-- le lot (devalider_bail). Le reste de la matrice est inchangé.
create or replace function public.verifier_transition_lot()
returns trigger language plpgsql set search_path to '' as $function$
declare
  v_blocages text[];
begin
  if old.etat in ('loue', 'preavis') then
    if new.surface_m2 is distinct from old.surface_m2
       or new.pieces is distinct from old.pieces
       or new.surface_carrez is distinct from old.surface_carrez then
      raise exception 'Lot loué : surface et pièces sont verrouillées (avenant au bail requis)';
    end if;
  end if;

  if new.etat = old.etat then return new; end if;

  if not (
    (old.etat = 'brouillon'  and new.etat in ('disponible', 'archive'))
    or (old.etat = 'disponible' and new.etat in ('brouillon', 'loue', 'archive'))
    or (old.etat = 'loue'       and new.etat in ('preavis', 'disponible'))
    or (old.etat = 'preavis'    and new.etat in ('loue', 'disponible'))
    or (old.etat = 'archive'    and new.etat = 'brouillon')
  ) then
    raise exception 'Transition interdite : % → %', old.etat, new.etat;
  end if;

  if new.etat = 'disponible' and old.etat = 'brouillon' then
    v_blocages := public.lot_blocages_location(new.id);
    if array_length(v_blocages, 1) is not null then
      raise exception 'Passage en disponible impossible : %',
        array_to_string(v_blocages, ' · ');
    end if;
  end if;

  -- Un lot loué ne redevient disponible que si plus aucun bail ne vit dessus
  if new.etat = 'disponible' and old.etat = 'loue' then
    if exists (select 1 from public.baux b
                where b.lot_id = new.id and b.etat in ('actif', 'preavis')) then
      raise exception 'Ce lot porte un bail en cours : il reste loué';
    end if;
  end if;

  if new.etat = 'loue' then
    if not exists (select 1 from public.baux b
                    where b.lot_id = new.id and b.etat in ('actif', 'preavis')) then
      raise exception 'Ce lot n''a pas de bail : créez le bail et activez-le, le lot passera en loué tout seul';
    end if;
  end if;

  if new.etat = 'preavis' then
    if not exists (select 1 from public.baux b
                    where b.lot_id = new.id and b.etat = 'preavis') then
      raise exception 'Aucun congé enregistré sur ce bail : enregistrez le congé, le lot passera en préavis tout seul';
    end if;
  end if;

  if old.etat = 'archive' and new.etat = 'brouillon' then
    if not (
      new.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','proprietaire_direct']::public.membership_role[]))
      or public.is_super_admin()
    ) then
      raise exception 'Réactivation réservée à l''admin de l''agence';
    end if;
  end if;

  return new;
end;
$function$;

-- L'état des lieux d'entrée signé ferme l'alerte edl_entree (celui de sortie
-- fermait déjà edl_sortie).
create or replace function public.edl_signe_ferme_alertes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.etat = 'signe' and old.etat <> 'signe' then
    if new.type = 'sortie' then
      perform public.fermer_alertes_origine(new.organization_id, 'bail', new.bail_id,
        'État des lieux de sortie signé', array['edl_sortie']);
    else
      perform public.fermer_alertes_origine(new.organization_id, 'bail', new.bail_id,
        'État des lieux d''entrée signé', array['edl_entree']);
    end if;
  end if;
  return new;
end $$;

-- ============================================================
-- 2. Alertes — une alerte par objet, mise à jour au fil des seuils
-- ============================================================
create or replace function public.alerte_origine(p_type text, p_details jsonb,
  out origine_type text, out origine_id uuid)
language plpgsql immutable set search_path = '' as $$
declare v_cle text;
begin
  origine_type := case p_type
    when 'edl_entree' then 'bail' when 'edl_sortie' then 'bail'
    when 'diagnostic_expiration' then 'diagnostic'
    when 'assurance_expiration' then 'document' when 'attestation_a_verifier' then 'document'
    when 'incident_a_qualifier' then 'incident' when 'incident_conteste' then 'incident'
    when 'versement_proprietaire' then 'rapport' when 'ecart_versement' then 'rapport'
    when 'decompte' then 'restitution' when 'decompte_lrar' then 'restitution'
    when 'restitution_echeance' then 'restitution'
    when 'retenue_sans_justificatif' then
      case when p_details ? 'retenue_id' then 'retenue' else 'restitution' end
    else null end;
  v_cle := case origine_type
    when 'bail' then 'bail_id' when 'diagnostic' then 'diagnostic_id'
    when 'document' then 'document_id' when 'incident' then 'incident_id'
    when 'rapport' then 'rapport_id' when 'restitution' then 'restitution_id'
    when 'retenue' then 'retenue_id' else null end;
  if v_cle is null or not (p_details ? v_cle) then
    origine_type := null; origine_id := null; return;
  end if;
  begin
    origine_id := (p_details ->> v_cle)::uuid;
  exception when others then
    origine_type := null; origine_id := null;
  end;
end $$;

-- Pose ou met à jour l'alerte d'un objet suivi par un cron : s'il existe une
-- alerte OUVERTE pour cet objet, elle passe au nouveau seuil (criticité,
-- titre, échéance) au lieu d'être doublée ; sinon une alerte naît — sauf si
-- ce seuil précis a déjà été traité à la main (alerte fermée conservée).
-- Retourne 1 si une alerte a été créée, 0 sinon.
create function public.poser_alerte_seuil(
  p_org uuid, p_type text, p_cle text, p_objet uuid, p_seuil text,
  p_criticite public.alerte_criticite, p_titre text, p_details jsonb, p_echeance date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ouverte uuid;
begin
  select a.id into v_ouverte
  from public.alerts a
  where a.type = p_type and a.statut = 'ouverte'
    and a.details ->> p_cle = p_objet::text
  order by a.created_at desc
  limit 1;

  if v_ouverte is not null then
    update public.alerts
       set criticite = p_criticite, titre = p_titre, echeance = p_echeance,
           details = details || p_details || jsonb_build_object('seuil', p_seuil),
           updated_at = now()
     where id = v_ouverte
       and (details ->> 'seuil' is distinct from p_seuil or criticite <> p_criticite);
    return 0;
  end if;

  if exists (
    select 1 from public.alerts a
    where a.type = p_type and a.details ->> p_cle = p_objet::text
      and a.details ->> 'seuil' = p_seuil
  ) then
    return 0;
  end if;

  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (p_org, p_type, p_criticite, p_titre,
          p_details || jsonb_build_object('seuil', p_seuil), p_echeance);
  return 1;
end;
$$;
revoke execute on function public.poser_alerte_seuil(uuid, text, text, uuid, text, public.alerte_criticite, text, jsonb, date) from public, anon;

create or replace function public.generer_alertes_diagnostics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diag record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_diagnostics: reserve au cron et au super admin';
  end if;

  for v_diag in
    select d.id, d.organization_id, d.type, d.date_expiration,
           coalesce(l.nom, b2.nom) as cible,
           coalesce(b.nom, b2.nom) as bien_nom
    from public.diagnostics d
    left join public.lots l on l.id = d.lot_id
    left join public.biens b on b.id = l.bien_id
    left join public.biens b2 on b2.id = d.bien_id
    where d.archived_at is null and d.date_expiration is not null
      and d.date_expiration <= current_date + 90
  loop
    v_seuil := case
      when v_diag.date_expiration <= current_date then 'J+0'
      when v_diag.date_expiration <= current_date + 30 then 'J-30'
      else 'J-90'
    end;
    v_criticite := case v_seuil
      when 'J+0' then 'critique'::public.alerte_criticite
      when 'J-30' then 'normale'::public.alerte_criticite
      else 'informative'::public.alerte_criticite
    end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_diag.organization_id, 'diagnostic_expiration', 'diagnostic_id', v_diag.id, v_seuil,
      v_criticite,
      format('%s — %s : %s',
        upper(v_diag.type::text), v_diag.bien_nom,
        case when v_seuil = 'J+0'
          then 'diagnostic expiré (bail bloqué tant qu''il n''est pas redéposé)'
          else format('expire le %s', to_char(v_diag.date_expiration, 'DD/MM/YYYY')) end),
      jsonb_build_object('diagnostic_id', v_diag.id, 'type_diagnostic', v_diag.type),
      v_diag.date_expiration);
  end loop;

  return v_crees;
end;
$$;

create or replace function public.generer_alertes_assurance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_assurance: reserve au cron et au super admin';
  end if;

  for v_att in
    select d.id as document_id, d.organization_id, d.expire_le,
           dl.entite_id as person_id, p.nom as person_nom
    from public.documents d
    join public.document_liens dl
      on dl.document_id = d.id and dl.entite = 'personne'
    join public.persons p on p.id = dl.entite_id
    where d.type = 'attestation_assurance'
      and d.purged_at is null
      and d.expire_le is not null
      and d.expire_le <= current_date + 30
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  loop
    v_seuil := case
      when v_att.expire_le <= current_date - 15 then 'J+15'
      when v_att.expire_le <= current_date then 'J+0'
      when v_att.expire_le <= current_date + 15 then 'J-15'
      else 'J-30'
    end;
    v_criticite := case v_seuil
      when 'J-30' then 'informative'::public.alerte_criticite
      when 'J-15' then 'normale'::public.alerte_criticite
      else 'critique'::public.alerte_criticite
    end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_att.organization_id, 'assurance_expiration', 'document_id', v_att.document_id, v_seuil,
      v_criticite,
      format('Assurance habitation — %s : %s', v_att.person_nom,
        case v_seuil
          when 'J-30' then format('expire le %s (rappel locataire)', to_char(v_att.expire_le, 'DD/MM/YYYY'))
          when 'J-15' then format('expire le %s (relance à faire)', to_char(v_att.expire_le, 'DD/MM/YYYY'))
          when 'J+0' then 'défaut d''assurance constaté'
          else 'défaut d''assurance persistant (motif possible de résiliation)'
        end),
      jsonb_build_object('document_id', v_att.document_id, 'person_id', v_att.person_id),
      v_att.expire_le);
  end loop;

  return v_crees;
end;
$$;

-- Compteur de restitution : 1 mois (conforme) / 2 mois (écarts) après la
-- remise des clés. Approche à J-7, dépassement à J+0 — fermées à la
-- finalisation du décompte.
create function public.restitution_date_limite(p_date_remise date, p_delai_mois integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_date_remise + make_interval(months => p_delai_mois))::date;
$$;

create function public.generer_alertes_restitution()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_limite date;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_restitution: reserve au cron et au super admin';
  end if;

  for v_r in
    select r.id, r.organization_id, r.bail_id, r.date_remise_cles, r.delai_mois,
           l.nom as lot_nom,
           trim(coalesce(p.prenom, '') || ' ' || p.nom) as locataire
    from public.restitutions r
    join public.baux b on b.id = r.bail_id
    join public.lots l on l.id = b.lot_id
    left join public.persons p on p.id = b.locataire_principal
    where r.statut = 'en_cours'
  loop
    v_limite := public.restitution_date_limite(v_r.date_remise_cles, v_r.delai_mois);
    if v_limite > current_date + 7 then continue; end if;
    v_seuil := case when v_limite <= current_date then 'J+0' else 'J-7' end;
    v_criticite := case v_seuil when 'J+0' then 'critique'::public.alerte_criticite
                                else 'normale'::public.alerte_criticite end;
    v_crees := v_crees + public.poser_alerte_seuil(
      v_r.organization_id, 'restitution_echeance', 'restitution_id', v_r.id, v_seuil,
      v_criticite,
      format('Restitution du dépôt — %s · %s : %s',
        v_r.lot_nom, coalesce(nullif(v_r.locataire, ''), 'locataire'),
        case when v_seuil = 'J+0'
          then format('délai légal dépassé depuis le %s (intérêts de retard dus)', to_char(v_limite, 'DD/MM/YYYY'))
          else format('à rendre avant le %s', to_char(v_limite, 'DD/MM/YYYY')) end),
      jsonb_build_object('restitution_id', v_r.id, 'bail_id', v_r.bail_id),
      v_limite);
  end loop;

  return v_crees;
end;
$$;
revoke execute on function public.generer_alertes_restitution() from public, anon;

select cron.schedule('alertes-restitutions-quotidiennes', '15 4 * * *',
  $$select public.generer_alertes_restitution()$$);

-- La finalisation du décompte ferme le compteur ; l'alerte « décompte à
-- envoyer » porte enfin son échéance (la date limite légale).
create or replace function public.finaliser_decompte(p_restitution uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_retenues numeric; v_solde numeric; v_lot uuid;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte déjà finalisé'; end if;
  select coalesce(sum(montant_retenu), 0) into v_retenues from public.retenues where restitution_id = p_restitution;
  v_solde := round(v.depot - v.impayes - v_retenues, 2);
  update public.restitutions set statut = 'finalise', solde = v_solde, date_emission = current_date
    where id = p_restitution;

  select lot_id into v_lot from public.baux where id = v.bail_id;
  if v_solde > 0 then
    insert into public.ecritures
      (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
    values (v.organization_id, v.bail_id, v_lot, 'depot_garantie', 'depense', v_solde,
            current_date, current_date, 'Restitution du dépôt de garantie', true);
  end if;

  perform public.fermer_alertes_origine(v.organization_id, 'restitution', p_restitution,
    'Décompte finalisé', array['restitution_echeance']);

  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (v.organization_id,
          case when v_retenues > 0 then 'decompte_lrar' else 'decompte' end, 'normale',
          case when v_solde < 0 then 'Solde de tout compte : créance sur le locataire'
               else 'Décompte de restitution à envoyer' end,
          jsonb_build_object('restitution_id', p_restitution, 'bail_id', v.bail_id, 'solde', v_solde),
          public.restitution_date_limite(v.date_remise_cles, v.delai_mois));
  return v_solde;
end $$;

-- ============================================================
-- 3. Documents — les pièces du bail visibles par le locataire
-- ============================================================
-- Un seul prédicat pour les quatre fonctions du périmètre locataire : les
-- pièces (bail signé, règlement de copropriété) des baux vivants dont je suis
-- locataire principal ou colocataire, avec une adhésion locataire active.
create function public.pieces_bail_locataire()
returns table (document_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select x.document_id, b.organization_id
  from public.baux b
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  cross join lateral (values (b.document_signe), (b.reglement_copropriete)) as x(document_id)
  where x.document_id is not null
    and b.etat in ('actif', 'preavis')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status = 'active')
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'));
$$;
revoke execute on function public.pieces_bail_locataire() from public, anon;

create or replace function public.mes_pieces_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text,
               mime_type text, depose_le timestamptz, expire_le date,
               verifie_le timestamptz, source text)
language sql stable security definer set search_path = '' as $$
  with ma_personne as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
      and exists (select 1 from public.memberships m
                  where m.account_id = p.account_id
                    and m.organization_id = p_org
                    and m.role = 'locataire' and m.status = 'active')
  ),
  dossier as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org
      and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
      and d.purged_at is null
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  ),
  attestation_validee as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org
      and d.purged_at is null and d.type = 'attestation_assurance'
      and d.verifie_le is not null
    order by d.verifie_le desc
    limit 1
  ),
  pieces_bail as (
    select distinct d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.pieces_bail_locataire() pb
    join public.documents d on d.id = pb.document_id
    where pb.organization_id = p_org and d.purged_at is null
  )
  select id, type, titre, mime_type, created_at, expire_le, verifie_le, 'dossier'
  from dossier
  union
  select av.id, av.type, av.titre, av.mime_type, av.created_at, av.expire_le,
         av.verifie_le, 'dossier'
  from attestation_validee av
  where not exists (select 1 from dossier x where x.id = av.id)
    and exists (select 1 from dossier x
                where x.type = 'attestation_assurance' and x.verifie_le is null)
  union
  select pb.id, pb.type, pb.titre, pb.mime_type, pb.created_at, pb.expire_le,
         pb.verifie_le, 'bail'
  from pieces_bail pb
  where not exists (select 1 from dossier x where x.id = pb.id)
  order by 5 desc;
$$;

create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text,
               storage_path text, purged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status = 'active')
    and (
      (d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (select 1 from public.pieces_bail_locataire() pb
                 where pb.document_id = d.id and pb.organization_id = p_org));
$$;

create or replace function public.chemins_pieces_locataire()
returns setof text
language sql stable security definer set search_path = '' as $$
  select d.storage_path
  from public.pieces_bail_locataire() pb
  join public.documents d on d.id = pb.document_id
  where d.purged_at is null and d.storage_path is not null
  union
  select d.storage_path
  from public.documents d
  join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
  join public.persons p on p.id = dl.entite_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = p.organization_id
    and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = p.organization_id
                  and m.role = 'locataire' and m.status = 'active');
$$;

create or replace function public.log_document_access(doc uuid, acces text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if acces not in ('consultation', 'telechargement') then
    raise exception 'log_document_access: action inconnue %', acces;
  end if;
  select d.organization_id into v_org from public.documents d where d.id = doc;
  if v_org is null then
    raise exception 'log_document_access: document inconnu';
  end if;
  if not (
    v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or public.is_super_admin()
    or (
      exists (select 1 from public.memberships m
              where m.account_id = (select auth.uid())
                and m.organization_id = v_org
                and m.role = 'locataire' and m.status = 'active')
      and (
        exists (select 1 from public.pieces_bail_locataire() pb
                where pb.document_id = doc and pb.organization_id = v_org)
        or exists (
          select 1 from public.document_liens dl
          join public.persons p on p.id = dl.entite_id
          join public.documents d on d.id = dl.document_id
          where dl.document_id = doc and dl.entite = 'personne'
            and p.organization_id = v_org
            and d.organization_id = v_org
            and d.type in ('attestation_assurance', 'piece_identite', 'justificatif')
            and p.account_id = (select auth.uid()))))
  ) then
    raise exception 'log_document_access: acces refuse';
  end if;
  insert into public.acces_pieces_log (organization_id, account_id, document_id, action)
  values (v_org, (select auth.uid()), doc, acces);
end;
$$;
