-- Audit de la PR #264, FL-01 (critique, exposition à un tiers) : l'incident ouvert par le gérant en colocation.
--
-- Constat : `ouvrir_incident_agence` rattachait l'incident au bail vivant le PLUS RÉCENT du lot (`order by created_at
-- desc limit 1`) et enregistrait son locataire principal comme déclarant. En colocation à baux individuels, le
-- colocataire de la chambre 2 voyait comme le sien l'incident de la porte de la chambre 1, pouvait en contester
-- l'imputation, et l'occupante de la chambre 1 ne voyait rien. Deux baux créés au même instant rendaient le choix
-- aléatoire.
--
-- Correction :
--  1. `ouvrir_incident_agence` reçoit le bail concerné (`p_bail`, facultatif). Un bail n'est rattaché que s'il est
--     choisi (il doit être en cours sur ce lot), ou s'il est le SEUL bail vivant du lot. Sinon l'incident reste sur le
--     lot seul — parties communes, tout le logement — et aucun locataire ne le voit.
--  2. Le gérant n'est plus enregistré comme déclarant au nom d'un locataire : pour le canal « agence »,
--     `declarant_person_id` reste vide.
--  3. Ce que la saisie donnait jusqu'ici au locataire du bail rattaché est conservé : informé (RM-7.2.4), il conteste
--     l'imputation (RM-7.2.5) et rouvre le dossier clos. `titulaire_incident` désigne cette personne — le déclarant,
--     ou, pour un incident ouvert par le gérant sans déclarant, le locataire principal du bail vivant rattaché — et
--     sert à `mes_incidents_locataire` (`est_declarant`), `contester_imputation` et `rouvrir_incident`. Ce qu'un
--     locataire voit ne change pas : ses déclarations et les incidents de son bail en cours.
--
-- Les trois fonctions refaites repartent de leur définition installée (texte de 20260821141744 et 20260906140000, plus
-- la garde de portefeuille posée par 20260913150000) ; seules les lignes commentées « FL-01 » changent.
-- Rejouable : la signature à sept arguments est retirée si elle existe (un appel à sept arguments trouve la nouvelle,
-- dont `p_bail` vaut null par défaut), le reste en `create or replace`. Aucune donnée existante n'est modifiée : les
-- incidents déjà rattachés à un colocataire se relèvent par supabase/retours-arriere/releve-incidents-gerant-colocation.sql
-- (lecture seule).
-- Retour : supabase/retours-arriere/20261027100100_incident_gerant_bail_explicite.retour.sql.

-- 1. La personne qui agit sur l'incident depuis l'espace locataire (contester, rouvrir).
create or replace function public.titulaire_incident(
  p_declarant uuid, p_canal public.incident_canal, p_bail uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_declarant,
    case when p_canal = 'agence' then
      (select b.locataire_principal from public.baux b
        where b.id = p_bail and b.etat in ('actif', 'preavis'))
    end);
$$;
revoke execute on function public.titulaire_incident(uuid, public.incident_canal, uuid)
  from public, anon, authenticated;
comment on function public.titulaire_incident(uuid, public.incident_canal, uuid) is
  'Le déclarant ; à défaut, pour un incident ouvert par le gérant, le locataire principal du bail vivant rattaché (FL-01, audit PR #264).';

-- 2. Saisie par le gérant : le bail choisi, ou le seul bail vivant du lot ; jamais de déclarant.
drop function if exists public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence);
create or replace function public.ouvrir_incident_agence(
  p_org uuid, p_lot uuid, p_categorie text, p_description text,
  p_piece text, p_anciennete text, p_urgence public.incident_urgence,
  p_bail uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot record;
  v_bail uuid;
  v_vivants uuid[];
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.lot_hors_portefeuille(p_org, p_lot) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select id, etat into v_lot from public.lots
  where id = p_lot and organization_id = p_org;
  if v_lot.id is null then
    raise exception 'Lot introuvable dans cette agence';
  end if;
  if v_lot.etat = 'archive' then
    raise exception 'Ce lot est archivé — aucun incident ne peut y être ouvert';
  end if;

  -- FL-01 : plus de « bail le plus récent ». Le bail choisi doit être en cours sur CE lot ; sans choix, seul un
  -- bail vivant unique se rattache — plusieurs (colocation à baux individuels) : le lot seul, vu de personne.
  select array_agg(b.id) into v_vivants
  from public.baux b
  where b.organization_id = p_org and b.lot_id = p_lot and b.etat in ('actif', 'preavis');
  if p_bail is not null then
    if not (p_bail = any (coalesce(v_vivants, array[]::uuid[]))) then
      raise exception 'Ce bail n''est pas en cours sur ce lot — choisissez à nouveau la chambre concernée';
    end if;
    v_bail := p_bail;
  elsif cardinality(v_vivants) = 1 then
    v_bail := v_vivants[1];
  end if;

  -- FL-01 : aucun déclarant au nom d'un locataire ; le locataire du bail rattaché suit l'incident par son bail.
  return public.incident_creer(p_org, p_lot, v_bail, null,
    'agence', p_categorie, p_description, p_piece, p_anciennete, p_urgence,
    (select auth.uid()));
end;
$$;
revoke execute on function public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence, uuid)
  from public, anon;
grant execute on function public.ouvrir_incident_agence(uuid, uuid, text, text, text, text, public.incident_urgence, uuid)
  to authenticated;

-- 3. Lecture locataire : mêmes lignes ; `est_declarant` dit « ce dossier est le vôtre » (contester, rouvrir).
create or replace function public.mes_incidents_locataire(p_org uuid)
returns table (id uuid, numero text, categorie text, piece text, description text,
               anciennete text, urgence public.incident_urgence, etat public.incident_etat,
               imputation public.incident_imputation, imputation_justification text,
               imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
               clos_le timestamptz, declare_le timestamptz, lot_nom text,
               nb_photos bigint, est_declarant boolean)
language sql stable security definer set search_path to '' as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  ),
  mes_baux as (
    select b.id from public.baux b
    where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal in (select id from mes_fiches)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id in (select id from mes_fiches)))
  )
  select i.id, i.numero, i.categorie, i.piece, i.description, i.anciennete,
         i.urgence, i.etat, i.imputation, i.imputation_justification,
         i.imputation_contestee_le, i.cloture_motif, i.clos_le, i.created_at,
         l.nom,
         (select count(*) from public.document_liens dl
            join public.documents d on d.id = dl.document_id and d.purged_at is null
          where dl.organization_id = p_org
            and dl.entite = 'incident' and dl.entite_id = i.id),
         -- FL-01 : le déclarant, ou le locataire principal du bail rattaché à un incident ouvert par le gérant.
         coalesce(public.titulaire_incident(i.declarant_person_id, i.canal, i.bail_id) in (select id from mes_fiches), false)
  from public.incidents i
  join public.lots l on l.id = i.lot_id
  where i.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (i.declarant_person_id in (select id from mes_fiches)
         or i.bail_id in (select id from mes_baux))
  order by (i.etat = 'clos'), i.created_at desc;
$$;
revoke execute on function public.mes_incidents_locataire(uuid) from public, anon;

-- 4. Contestation (RM-7.2.5) : par le titulaire de l'incident, plus seulement par le déclarant.
create or replace function public.contester_imputation(p_org uuid, p_incident uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  -- Adhésion locataire active exigée (un ex-locataire ne conteste plus)
  if not (p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select i.* into v from public.incidents i
  -- FL-01 : le titulaire (déclarant, ou locataire principal du bail rattaché par le gérant), jamais un voisin.
  join public.persons p on p.id = public.titulaire_incident(i.declarant_person_id, i.canal, i.bail_id)
  where i.id = p_incident and i.organization_id = p_org
    and p.account_id = (select auth.uid())
  for update of i;
  if not found then raise exception 'Incident introuvable'; end if;
  -- Un incident clos ne se conteste plus : l'alerte n'aurait plus de clôture
  -- pour la solder (RM-7.6.2) — il se rouvre si le désordre persiste.
  if v.etat = 'clos' then
    raise exception 'Cet incident est clos — rouvrez-le si le problème persiste';
  end if;
  if v.imputation is null then
    raise exception 'Cet incident n''est pas encore qualifié — il n''y a rien à contester';
  end if;
  if v.imputation_contestee_le is not null then
    raise exception 'Votre contestation a déjà été transmise';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'Expliquez pourquoi vous contestez cette imputation';
  end if;

  update public.incidents
  set imputation_contestee_le = now(), imputation_contestation = trim(p_message)
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'contestation', (select auth.uid()),
          jsonb_build_object('imputation', v.imputation, 'message', trim(p_message)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_conteste', 'normale',
          'Imputation contestée par le locataire — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_message), 140)));
end;
$$;
revoke execute on function public.contester_imputation(uuid, uuid, text) from public, anon;

-- 5. Réouverture : le gérant, ou le titulaire de l'incident côté locataire.
create or replace function public.rouvrir_incident(p_org uuid, p_incident uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_gerant boolean;
  v_declarant boolean;
begin
  -- Périmètre incident de l'agent (recette 13/09).
  if public.incident_hors_portefeuille(p_org, p_incident) then
    raise exception 'Ce dossier est hors de votre portefeuille' using errcode = '42501';
  end if;
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  -- FL-01 : le titulaire (déclarant, ou locataire principal du bail rattaché par le gérant).
  left join public.persons p on p.id = public.titulaire_incident(i.declarant_person_id, i.canal, i.bail_id)
  where i.id = p_incident and i.organization_id = p_org
  for update of i;
  if not found then raise exception 'Incident introuvable'; end if;

  v_gerant := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  v_declarant := v.declarant_account = (select auth.uid())
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
  if not (v_gerant or v_declarant) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'clos' then
    raise exception 'Seul un incident clos peut être rouvert';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Dites pourquoi vous rouvrez — le désordre réapparu, par exemple';
  end if;

  -- La requalification repart de zéro : l'ancienne imputation ne préjuge pas
  -- de la nouvelle (elle reste dans l'événement de réouverture).
  update public.incidents
  set etat = 'rouvert',
      imputation = null, imputation_justification = null,
      imputation_contestee_le = null, imputation_contestation = null,
      cloture_motif = null, cloture_commentaire = null,
      clos_le = null, clos_par = null
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'reouverture', (select auth.uid()),
          jsonb_build_object('motif', trim(p_motif), 'cloture_precedente',
            jsonb_build_object('motif', v.cloture_motif, 'clos_le', v.clos_le,
                               'imputation', v.imputation)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          (case when v.urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
          'Incident rouvert, à requalifier — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_motif), 140)));
end;
$$;
revoke execute on function public.rouvrir_incident(uuid, uuid, text) from public, anon;

notify pgrst, 'reload schema';
select public.fermer_fonctions_a_anon();
