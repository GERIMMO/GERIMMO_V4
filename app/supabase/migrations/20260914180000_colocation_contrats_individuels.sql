-- Colocation à contrats individuels : une chambre par contrat, un même lot physique.
-- Les flux financiers, congés, EDL et régularisations restent indexés par bail.
-- Loi du 6 juillet 1989, art. 8-1 ; Service Public F34661, vérifié le 14/09/2026.
-- Aucun bail existant n'est converti. chambre_id NULL conserve le contrat du logement entier.
alter table public.lots add column colocation_loyer_reference numeric(12,2)
  check (colocation_loyer_reference > 0);
comment on column public.lots.colocation_loyer_reference is
  'Loyer HC maximum applicable au logement entier, vérifié par le gestionnaire avant activation des contrats individuels.';

create table public.lot_chambres (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lot_id uuid not null,
  nom text not null check (length(btrim(nom)) between 1 and 100),
  surface_m2 numeric(10,2) not null check (surface_m2 >= 9),
  volume_m3 numeric(10,2) not null check (volume_m3 >= 20),
  description text not null check (length(btrim(description)) > 0),
  espaces_partages text not null check (length(btrim(espaces_partages)) > 0),
  equipements text,
  created_at timestamptz not null default now(),
  unique (id, lot_id, organization_id),
  foreign key (lot_id, organization_id) references public.lots(id, organization_id)
);
create unique index lot_chambres_nom_unique on public.lot_chambres(lot_id, lower(btrim(nom)));
alter table public.lot_chambres enable row level security;
create policy chambres_gerant on public.lot_chambres for all to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.lot_hors_portefeuille(organization_id, lot_id))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.lot_hors_portefeuille(organization_id, lot_id));
grant select, insert, update, delete on public.lot_chambres to authenticated;
grant all on public.lot_chambres to service_role;

alter table public.baux add column chambre_id uuid;
alter table public.baux add constraint baux_chambre_meme_lot_fk
  foreign key (chambre_id, lot_id, organization_id) references public.lot_chambres(id, lot_id, organization_id);
alter table public.baux add constraint baux_chambre_colocation check (chambre_id is null or type = 'colocation');
drop index public.baux_un_seul_vivant_par_lot;
create unique index baux_un_seul_vivant_par_lot on public.baux(lot_id)
  where etat in ('actif','preavis') and chambre_id is null;
create unique index baux_un_seul_vivant_par_chambre on public.baux(chambre_id)
  where etat in ('actif','preavis') and chambre_id is not null;

-- Sérialiser sur le logement : deux activations simultanées ne dépassent pas le plafond.
create function public.controler_contrat_individuel()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_plafond numeric; v_total numeric; v_surface numeric;
begin
  perform 1 from public.lots where id = new.lot_id for update;
  if tg_op = 'UPDATE' and old.etat <> 'brouillon' and (old.chambre_id is not null or new.chambre_id is not null)
     and (new.chambre_id is distinct from old.chambre_id or new.lot_id is distinct from old.lot_id) then
    raise exception 'Un contrat signé ne change pas de chambre ni de logement : préparez un nouveau bail';
  end if;
  if new.chambre_id is not null then
    if exists (select 1 from public.bail_personnes bp where bp.bail_id = new.id and bp.role = 'colocataire') then
      raise exception 'Un contrat individuel porte un seul locataire : retirez les cotitulaires du brouillon';
    end if;
    select l.colocation_loyer_reference, l.surface_m2 into v_plafond, v_surface from public.lots l where l.id = new.lot_id;
    if new.etat in ('actif','preavis') then
      if v_plafond is null then raise exception 'Renseignez le loyer de référence du logement entier avant d’activer un contrat individuel'; end if;
      if new.locataire_principal is null or new.date_debut is null or new.loyer_hc is null then
        raise exception 'Le contrat individuel exige un locataire, une date de début et un loyer';
      end if;
      select coalesce(sum(b.loyer_hc), 0) + new.loyer_hc into v_total from public.baux b
        where b.lot_id = new.lot_id and b.id <> new.id and b.etat in ('actif','preavis');
      if v_total > v_plafond then raise exception 'Le total des loyers individuels (% €) dépasse le plafond du logement (% €)', v_total, v_plafond; end if;
      if exists (select 1 from public.baux b where b.lot_id = new.lot_id and b.id <> new.id
        and b.etat in ('actif','preavis') and b.locataire_principal = new.locataire_principal) then
        raise exception 'Ce locataire possède déjà un contrat en cours dans ce logement';
      end if;
    end if;
  end if;
  if new.etat in ('actif','preavis') and exists (
    select 1 from public.baux b where b.lot_id = new.lot_id and b.id <> new.id
      and b.etat in ('actif','preavis') and (new.chambre_id is not null or b.chambre_id is not null)
      and (new.chambre_id is null or b.chambre_id is null or b.chambre_id = new.chambre_id)
  ) then raise exception 'Un bail est déjà en cours sur ce lot ou cette chambre : terminez-le avant d’activer ce contrat'; end if;
  return new;
end $$;
revoke all on function public.controler_contrat_individuel() from public, anon, authenticated;
create trigger baux_contrat_individuel before insert or update on public.baux
  for each row execute function public.controler_contrat_individuel();

create function public.controler_chambre_et_plafond()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_lot uuid; v_surface numeric; v_total numeric;
begin
  if tg_table_name = 'lots' then
    if new.colocation_loyer_reference is distinct from old.colocation_loyer_reference then
      select sum(b.loyer_hc) into v_total from public.baux b where b.lot_id = new.id and b.chambre_id is not null and b.etat in ('actif','preavis');
      if v_total is not null and (new.colocation_loyer_reference is null or new.colocation_loyer_reference < v_total) then
        raise exception 'Le plafond ne peut pas être inférieur aux loyers des contrats en cours (% €)', v_total;
      end if;
    end if;
    if new.surface_m2 is not null and new.surface_m2 < (select sum(c.surface_m2) from public.lot_chambres c where c.lot_id = new.id) then
      raise exception 'La surface du logement ne peut pas être inférieure au total des chambres';
    end if;
    return new;
  end if;
  v_lot := case when tg_op = 'DELETE' then old.lot_id else new.lot_id end;
  select l.surface_m2 into v_surface from public.lots l where l.id = v_lot for update;
  if tg_op <> 'INSERT' and exists (select 1 from public.baux b where b.chambre_id = old.id and b.etat <> 'brouillon') then
    raise exception 'Cette chambre est décrite dans un contrat signé : ses caractéristiques sont conservées';
  end if;
  if tg_op = 'UPDATE' and (new.lot_id <> old.lot_id or new.organization_id <> old.organization_id) then
    raise exception 'Une chambre ne change pas de logement';
  end if;
  if tg_op <> 'DELETE' then
    select coalesce(sum(c.surface_m2), 0) + new.surface_m2 into v_total from public.lot_chambres c where c.lot_id = new.lot_id and c.id <> new.id;
    if v_surface is null or v_total >= v_surface then
      raise exception 'Le total des chambres doit laisser une surface pour les espaces partagés : vérifiez la surface du logement';
    end if;
    return new;
  end if;
  return old;
end $$;
revoke all on function public.controler_chambre_et_plafond() from public, anon, authenticated;
create trigger chambres_caracteristiques before insert or update or delete on public.lot_chambres
  for each row execute function public.controler_chambre_et_plafond();
create trigger lots_plafond_colocation before update on public.lots
  for each row execute function public.controler_chambre_et_plafond();

create function public.controler_cotitulaire_individuel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'colocataire' and exists (select 1 from public.baux b where b.id = new.bail_id and b.chambre_id is not null) then
    raise exception 'Un contrat individuel ne comporte pas de cotitulaire ni de solidarité entre colocataires';
  end if;
  return new;
end $$;
revoke all on function public.controler_cotitulaire_individuel() from public, anon, authenticated;
create trigger bail_personnes_individuel before insert or update on public.bail_personnes
  for each row execute function public.controler_cotitulaire_individuel();

-- L'état du logement résume tous ses contrats : actif prioritaire, puis préavis.
create function public.etat_location_du_lot(p_lot uuid)
returns public.lot_etat language sql stable security definer set search_path = '' as $$
  select case when bool_or(b.etat = 'actif') then 'loue'::public.lot_etat
    when bool_or(b.etat = 'preavis') then 'preavis'::public.lot_etat
    else 'disponible'::public.lot_etat end
  from public.baux b where b.lot_id = p_lot and b.etat in ('actif','preavis');
$$;
revoke all on function public.etat_location_du_lot(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verifier_transition_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_blocages text[];
  v_bail record;
  v_attendu public.lot_etat;
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

  -- Le lot suit le bail : l'état d'arrivée doit être celui que le bail vivant
  -- commande. Un seul bail vivant par lot (baux_un_seul_vivant_par_lot).
  select b.etat, b.date_fin into v_bail
    from public.baux b
   where b.lot_id = new.id and b.etat in ('actif', 'preavis')
   order by case b.etat when 'actif' then 0 else 1 end, b.id limit 1;
  v_attendu := (case v_bail.etat when 'actif' then 'loue'
                                 when 'preavis' then 'preavis' end)::public.lot_etat;

  if v_attendu = 'loue' and new.etat <> 'loue' then
    raise exception 'Ce lot porte un bail en cours : il reste loué. Le départ se constate sur le bail — enregistrez le congé, puis clôturez le bail une fois l''état des lieux de sortie signé ; le lot redeviendra disponible tout seul';
  elsif v_attendu = 'preavis' and new.etat <> 'preavis' then
    raise exception 'Le bail de ce lot court encore (préavis %) : le lot ne se libère pas à la main. Clôturez le bail une fois l''état des lieux de sortie signé (RM-3.11.2) — le lot repassera en disponible tout seul',
      coalesce('jusqu''au ' || to_char(v_bail.date_fin, 'DD/MM/YYYY'), 'en cours');
  elsif v_attendu is null and new.etat = 'loue' then
    raise exception 'Ce lot n''a pas de bail : créez le bail et activez-le, le lot passera en loué tout seul';
  elsif v_attendu is null and new.etat = 'preavis' then
    raise exception 'Aucun congé enregistré sur ce bail : enregistrez le congé, le lot passera en préavis tout seul';
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
$function$
;

CREATE OR REPLACE FUNCTION public.verifier_coherence_lot_bail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lots uuid[];
  v_lot uuid;
  v_lot_etat public.lot_etat;
  v_lot_nom text;
  v_bail record;
  v_attendu public.lot_etat;
begin
  if tg_table_name = 'lots' then
    if tg_op = 'UPDATE' and new.etat is not distinct from old.etat then
      return null;   -- rien de l'état n'a bougé : rien à revérifier
    end if;
    v_lots := array[new.id];
  elsif tg_op = 'DELETE' then
    v_lots := array[old.lot_id];
  elsif tg_op = 'UPDATE' then
    if new.etat is not distinct from old.etat
       and new.lot_id is not distinct from old.lot_id then
      return null;
    end if;
    -- Un bail rattaché à un AUTRE lot laisse deux lots à vérifier : celui
    -- qu'il rejoint et celui qu'il quitte — ce dernier n'a plus de bail
    -- vivant et ne peut donc rester « loué » ou « en préavis ». Sans cela,
    -- `update baux set lot_id = …` (permis par la policy `baux_update`, qui
    -- ne contrôle que l'organisation) abandonnait derrière lui un lot
    -- éternellement loué sans locataire.
    v_lots := array[new.lot_id];
    if new.lot_id is distinct from old.lot_id then
      v_lots := v_lots || old.lot_id;
    end if;
  else
    v_lots := array[new.lot_id];
  end if;

  foreach v_lot in array v_lots loop
    select l.etat, l.nom into v_lot_etat, v_lot_nom
      from public.lots l where l.id = v_lot;
    if v_lot_etat is null then continue; end if;   -- lot disparu : rien à tenir

    select b.etat, b.date_fin into v_bail
      from public.baux b
     where b.lot_id = v_lot and b.etat in ('actif', 'preavis')
     order by case b.etat when 'actif' then 0 else 1 end, b.id limit 1;
    v_attendu := (case v_bail.etat when 'actif' then 'loue'
                                   when 'preavis' then 'preavis' end)::public.lot_etat;

    if v_attendu is not null and v_lot_etat is distinct from v_attendu then
      raise exception 'Le lot « % » porte un bail % (%) : son état doit être « % », pas « % » — le lot suit le bail (activation, congé, clôture), il ne se pilote pas à la main',
        v_lot_nom, v_bail.etat,
        coalesce('échéance ' || to_char(v_bail.date_fin, 'DD/MM/YYYY'), 'sans terme enregistré'),
        v_attendu, v_lot_etat;
    end if;

    if v_attendu is null and v_lot_etat in ('loue', 'preavis') then
      raise exception 'Le lot « % » est « % » alors qu''aucun bail ne vit dessus : sans bail, un lot n''est ni loué ni en préavis',
        v_lot_nom, v_lot_etat;
    end if;
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enregistrer_conge(p_bail uuid, p_par conge_par, p_date_presentation date, p_preavis_mois smallint, p_motif text DEFAULT NULL::text, p_justificatif uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_meuble boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.type, b.etat, coalesce(bi.zone_tendue, false),
         (b.type = 'meuble' or (b.type = 'colocation' and coalesce(l.meuble, false)))
    into v_org, v_lot, v_type, v_etat, v_zone, v_meuble
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation nue) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_meuble then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_meuble then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, v_zone)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  -- Le bail fait foi : le lot suit, sinon le parc annonce « loué » pour un
  -- logement dont le locataire part.
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  -- L'intention transmise depuis l'espace locataire est soldée par ce congé
  update public.intentions_conge
     set traitee_le = now(), conge_id = v_conge
   where bail_id = p_bail and traitee_le is null;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Congé enregistré'
   where organization_id = v_org and statut = 'ouverte'
     and type = 'conge_intention' and (details ->> 'bail_id')::uuid = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end $function$
;

CREATE OR REPLACE FUNCTION public.annuler_conge(p_bail uuid, p_motif text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_lot uuid;
  v_etat public.bail_etat;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.etat into v_org, v_lot, v_etat
  from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'preavis' then
    raise exception 'Ce bail n''est pas en préavis : il n''y a pas de congé à annuler';
  end if;

  if exists (select 1 from public.etats_des_lieux e
              where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'L''état des lieux de sortie est signé : le départ a eu lieu, le congé ne s''annule plus';
  end if;
  if exists (select 1 from public.restitutions r where r.bail_id = p_bail) then
    raise exception 'La restitution du dépôt est engagée : le congé ne s''annule plus';
  end if;

  select c.id into v_conge from public.conges c
   where c.bail_id = p_bail and c.annule_le is null
   order by c.created_at desc limit 1;
  if v_conge is null then
    raise exception 'Aucun congé en cours sur ce bail';
  end if;

  update public.conges
     set annule_le = now(),
         annulation_motif = nullif(btrim(coalesce(p_motif, '')), '')
   where id = v_conge;

  -- Le bail d'abord, le lot ensuite : le déclencheur du lot exige un bail
  -- vivant pour accepter « loué ».
  update public.baux set etat = 'actif', date_fin = null, updated_at = now()
   where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  -- L'alerte d'état des lieux de sortie n'a plus d'objet.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = auth.uid(),
         closed_action = 'Congé annulé — le locataire reste', updated_at = now()
   where organization_id = v_org
     and type = 'edl_sortie'
     and statut = 'ouverte'
     and details->>'bail_id' = p_bail::text;

  -- Un état des lieux de sortie commencé mais non signé redevient sans objet :
  -- on le laisse en brouillon, il resservira si un nouveau congé arrive.
end $function$
;

CREATE OR REPLACE FUNCTION public.devalider_bail(p_bail uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  update public.lots set etat = public.etat_location_du_lot(v.lot_id) where id = v.lot_id;
  perform public.fermer_alertes_origine(v.organization_id, 'bail', p_bail,
    'Bail remis en brouillon pour correction', array['edl_entree']);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.terminer_bail(p_bail uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bail record;
begin
  select b.* into v_bail from public.baux b where b.id = p_bail;
  if v_bail.id is null then raise exception 'Bail introuvable'; end if;
  if not (v_bail.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_bail.etat <> 'preavis' then
    raise exception 'Seul un bail en préavis se clôture — enregistrez d''abord le congé';
  end if;
  if not exists (select 1 from public.etats_des_lieux e
                 where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'Clôture impossible sans état des lieux de sortie signé (RM-3.11.2)';
  end if;

  update public.baux set etat = 'termine', updated_at = now() where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_bail.lot_id) where id = v_bail.lot_id and etat in ('loue','preavis');

  -- Les personnes du bail sans autre bail vivant perdent le geste, pas la
  -- lecture : adhésion locataire désactivée (espace en consultation, D2)
  update public.memberships m
     set status = 'inactive'
   where m.organization_id = v_bail.organization_id
     and m.role = 'locataire' and m.status = 'active'
     and m.account_id in (
       select p.account_id from public.persons p
       where p.organization_id = v_bail.organization_id
         and p.account_id is not null
         and (p.id = v_bail.locataire_principal
              or exists (select 1 from public.bail_personnes bp
                         where bp.bail_id = p_bail and bp.person_id = p.id)))
     and not exists (
       select 1 from public.baux b2
       join public.persons p2 on p2.account_id = m.account_id
                             and p2.organization_id = b2.organization_id
       where b2.organization_id = v_bail.organization_id
         and b2.etat in ('actif', 'preavis')
         and (b2.locataire_principal = p2.id
              or exists (select 1 from public.bail_personnes bp2
                         where bp2.bail_id = b2.id and bp2.person_id = p2.id)));

  -- Les alertes encore ouvertes du bail (EDL de sortie, intention) se ferment
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Bail clôturé'
   where organization_id = v_bail.organization_id and statut = 'ouverte'
     and details ->> 'bail_id' = p_bail::text
     and type in ('edl_sortie', 'edl_entree', 'conge_intention');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.controler_mise_en_location(p_bail uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_mentions text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  perform 1 from public.lots where id = v.lot_id for update;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;

  -- Mentions obligatoires du contrat : sans elles, le bail activé est un bail
  -- faux — appels de loyer à 0 €, prorata d'entrée arbitraire, dépôt sans plafond
  -- opposable (wiki « Mentions obligatoires du bail »).
  v_mentions := public.bail_mentions_manquantes_valeurs(v.locataire_principal, v.date_debut, v.loyer_hc);
  if array_length(v_mentions, 1) > 0 then
    raise exception 'Mentions obligatoires du bail manquantes : % — à compléter dans le brouillon avant de déposer le bail signé',
      array_to_string(v_mentions, ' ; ');
  end if;

  if v.depot_garantie is not null then
    v_plafond := public.plafond_depot_mois(v.type::text, v.lot_id) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        public.plafond_depot_mois(v.type::text, v.lot_id), v_plafond;
    end if;
  end if;

  -- Un seul bail actif par lot ; le brouillon suivant attend la fin du précédent
  if exists (
    select 1 from public.baux b
    where b.lot_id = v.lot_id and b.id <> p_bail and b.etat in ('actif', 'preavis')
      and (v.chambre_id is null or b.chambre_id is null or b.chambre_id = v.chambre_id)
  ) then
    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis')) then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fiche_lot(p_lot uuid)
 RETURNS TABLE(portee text, lot_id uuid, lot_nom text, lot_etat lot_etat, surface_m2 numeric, pieces integer, etage text, meuble boolean, bien_id uuid, bien_nom text, bien_type bien_type, adresse text, code_postal text, ville text, copropriete boolean, bail_id uuid, bail_etat bail_etat, bail_type bail_type, locataire text, locataire_email text, locataire_telephone text, loyer_hc numeric, charges numeric, depot_garantie numeric, date_debut date, date_fin date, jour_echeance smallint, mandat_id uuid, mandat_etat mandat_etat, mandant text, mandant_email text, taux_honoraires numeric, jour_rapport smallint, proprietaires text, blocages text[], incidents_ouverts integer, impaye_echu numeric, termes_impayes integer, diagnostics_manquants integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with relation as (
    -- À QUEL TITRE cet appelant regarde-t-il ce lot ? La question est posée
    -- une fois, ici, et tout le reste en découle. `portee is null` = il ne le
    -- regarde à aucun titre, et la fonction ne rend rien.
    select
      l.id as lot, l.organization_id as org,
      case
        when l.organization_id in (select public.org_ids_avec_roles(
               array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
             and not public.lot_hors_portefeuille(l.organization_id, l.id)
          then 'gerant'
        when exists (
          select 1
          from public.baux b
          join public.persons p
            on p.organization_id = b.organization_id
           and p.account_id = (select auth.uid())
          where b.lot_id = l.id
            and b.etat in ('actif','preavis')
            and exists (select 1 from public.memberships m
                        where m.account_id = (select auth.uid())
                          and m.organization_id = b.organization_id
                          and m.role = 'locataire' and m.status = 'active')
            and (p.id = b.locataire_principal
                 or exists (select 1 from public.bail_personnes bp
                            where bp.bail_id = b.id and bp.person_id = p.id
                              and bp.role = 'colocataire'))
        ) then 'locataire'
      end as portee
    from public.lots l
    where l.id = p_lot
  )
  select
    r.portee,
    l.id, l.nom, l.etat, l.surface_m2, l.pieces, l.etage, l.meuble,
    b.id, b.nom, b.type, b.address_line1, b.postal_code, b.city, b.copropriete,
    ba.id, ba.etat, ba.type,
    case when ba.id is not null then btrim(coalesce(pl.prenom,'') || ' ' || pl.nom) end,
    -- Le contact de l'occupant n'est rendu que tant que le bail vit : on ne
    -- laisse pas le téléphone de quelqu'un qui n'habite plus là.
    case when ba.etat in ('actif','preavis') then pl.email end,
    case when ba.etat in ('actif','preavis') then pl.telephone end,
    ba.loyer_hc, ba.charges, ba.depot_garantie,
    ba.date_debut, ba.date_fin, ba.jour_echeance,
    -- ── Ce qui appartient au propriétaire et à son gestionnaire ──
    case when r.portee = 'gerant' then m.id end,
    case when r.portee = 'gerant' then m.etat end,
    case when r.portee = 'gerant' then btrim(coalesce(pm.prenom,'') || ' ' || pm.nom) end,
    case when r.portee = 'gerant' then pm.email end,
    case when r.portee = 'gerant' then ml.taux_honoraires end,
    case when r.portee = 'gerant' then m.date_rapport end,
    case when r.portee = 'gerant' then
      (select string_agg(btrim(coalesce(p2.prenom,'') || ' ' || p2.nom)
                         || ' (' || round(d.quote_part) || ' %)', ', ' order by d.quote_part desc)
         from public.detentions d
         join public.persons p2 on p2.id = d.person_id
        where d.lot_id = l.id and d.date_fin is null)
    end,
    -- Ce qui bloque une MISE EN LOCATION est la liste de tâches de l'agence :
    -- un locataire en place n'a rien à en faire, et la lui montrer serait lui
    -- dire que son logement n'est pas louable.
    case when r.portee = 'gerant' then public.lot_blocages_location(l.id) end,
    case
      when r.portee = 'gerant' then
        (select count(*)::integer from public.incidents i
          where i.lot_id = l.id and i.etat <> 'clos')
      else
        -- Le locataire ne compte que SES signalements — pas ceux des voisins
        -- de palier, ni ceux que l'agence a ouverts de son côté.
        (select count(*)::integer from public.incidents i
          where i.lot_id = l.id and i.etat <> 'clos'
            and i.declarant_person_id = public.ma_personne_locataire(l.organization_id))
    end,
    -- CE QUI RESTE DÛ SUR LES TERMES ÉCHUS, et pas un calcul de plus.
    -- `etat_loyers_bail_brut` est la source que le produit utilise déjà pour
    -- poser l'alerte d'impayé et pour l'échéancier du locataire. En refaire une
    -- somme à partir des écritures donnerait un second chiffre qui divergerait
    -- du premier — et c'est le chiffre dont on se sert pour relancer quelqu'un.
    coalesce((select sum(x.montant_du - x.montant_couvert)
                from public.etat_loyers_bail_brut(ba.id) x
               where x.date_echeance < current_date and x.montant_du > x.montant_couvert), 0),
    coalesce((select count(*)::integer
                from public.etat_loyers_bail_brut(ba.id) x
               where x.date_echeance < current_date and x.montant_du > x.montant_couvert), 0),
    case when r.portee = 'gerant' then
      (select count(*)::integer from unnest(public.lot_blocages_location(l.id)) x
        where x ilike '%diagnostic%' or x ilike '%dpe%' or x ilike '%erp%')
    else 0 end
  from relation r
  join public.lots l on l.id = r.lot
  join public.biens b on b.id = l.bien_id
  left join public.baux ba on ba.lot_id = l.id and ba.etat in ('actif','preavis','brouillon')
    and (r.portee = 'gerant' or ba.id = public.mon_dernier_bail_locataire(r.org))
  left join public.persons pl on pl.id = ba.locataire_principal
  left join public.mandat_lignes ml on ml.lot_id = l.id and ml.date_fin is null
  left join public.mandats m on m.id = ml.mandat_id and m.etat in ('actif','preavis')
  left join public.persons pm on pm.id = m.person_id
  where r.portee is not null
  order by case ba.etat when 'actif' then 0 when 'preavis' then 1 else 2 end
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.generer_grille_edl(p_edl uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record;
  v_crees int := 0;
  v_ordre int := 0;
  v_piece record;
  v_element text;
  v_equip record;
  v_a_pieces boolean;
  v_entree uuid;
  v_elements text[] := array['Sols','Murs','Plafonds','Fenêtres et volets','Portes','Prises électriques','Éclairage et interrupteurs'];
begin
  select e.organization_id, e.etat, e.type, e.bail_id, b.lot_id, b.chambre_id into v
  from public.etats_des_lieux e
  join public.baux b on b.id = e.bail_id
  where e.id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'La grille ne se régénère pas sur un EDL signé';
  end if;

  delete from public.edl_lignes where edl_id = p_edl;

  if v.type = 'sortie' then
    select e.id into v_entree from public.etats_des_lieux e
    where e.bail_id = v.bail_id and e.type = 'entree' and e.etat = 'signe'
    order by e.created_at desc limit 1;
    if v_entree is not null then
      insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
      select v.organization_id, p_edl, l.categorie, l.piece, l.libelle, l.ordre
      from public.edl_lignes l where l.edl_id = v_entree
      order by l.ordre;
      get diagnostics v_crees = row_count;

      -- La structure suit, jamais le constat : ni l'index relevé, ni le nombre
      -- de clés rendues. Une régénération n'écrase pas une annexe déjà remplie.
      if not exists (select 1 from public.edl_compteurs c where c.edl_id = p_edl) then
        insert into public.edl_compteurs (organization_id, edl_id, type, numero, releve)
        select v.organization_id, p_edl, c.type, c.numero, null
        from public.edl_compteurs c where c.edl_id = v_entree
        order by c.created_at, c.type;
      end if;
      if not exists (select 1 from public.edl_cles k where k.edl_id = p_edl) then
        insert into public.edl_cles (organization_id, edl_id, libelle, nombre, reference)
        select v.organization_id, p_edl, k.libelle, null, k.reference
        from public.edl_cles k where k.edl_id = v_entree
        order by k.created_at, k.libelle;
      end if;

      return v_crees;
    end if;
  end if;

  -- Contrat individuel : aucun constat sur les chambres d'autrui.
  if v.chambre_id is not null then
    for v_piece in select c.nom from public.lot_chambres c where c.id = v.chambre_id
      union all select 'Espaces partagés' loop
      foreach v_element in array v_elements loop
        insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
        values (v.organization_id, p_edl, 'piece', v_piece.nom, v_element, v_ordre);
        v_ordre := v_ordre + 1; v_crees := v_crees + 1;
      end loop;
    end loop;
    return v_crees;
  end if;

  select exists (select 1 from public.lot_pieces lp where lp.lot_id = v.lot_id) into v_a_pieces;

  if v_a_pieces then
    for v_piece in select nom from public.lot_pieces where lot_id = v.lot_id order by ordre, nom loop
      foreach v_element in array v_elements loop
        insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
        values (v.organization_id, p_edl, 'piece', v_piece.nom, v_element, v_ordre);
        v_ordre := v_ordre + 1; v_crees := v_crees + 1;
      end loop;
    end loop;
  else
    foreach v_element in array v_elements loop
      insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
      values (v.organization_id, p_edl, 'general', v_element, v_ordre);
      v_ordre := v_ordre + 1; v_crees := v_crees + 1;
    end loop;
  end if;

  for v_equip in
    select ec.nom from public.lot_equipements le
    join public.equipements_catalogue ec on ec.id = le.equipement_id
    where le.lot_id = v.lot_id order by ec.nom
  loop
    insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
    values (v.organization_id, p_edl, 'equipement', v_equip.nom, v_ordre);
    v_ordre := v_ordre + 1; v_crees := v_crees + 1;
  end loop;

  return v_crees;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.documents_du_lot(p_lot uuid)
 RETURNS TABLE(document_id uuid, titre text, type document_type, depose_le timestamp with time zone, expire_le date, taille_octets bigint, rattachement text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with contexte as (
    select l.id as lot, l.organization_id as org,
           ba.id as bail, ml.mandat_id as mandat,
           (l.organization_id in (select public.org_ids_avec_roles(
              array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
            and not public.lot_hors_portefeuille(l.organization_id, l.id)) as gerant
    from public.lots l
    left join public.baux ba on ba.lot_id = l.id and ba.etat in ('actif','preavis','brouillon')
    left join public.mandat_lignes ml on ml.lot_id = l.id and ml.date_fin is null
    where l.id = p_lot
    limit 1
  )
  select d.id, d.titre, d.type, d.created_at, d.expire_le, d.taille_octets,
         case dl.entite when 'lot' then 'ce lot'
                        when 'bail' then 'le bail'
                        when 'mandat' then 'le mandat'
                        else dl.entite::text end
  from public.document_liens dl
  join public.documents d on d.id = dl.document_id
  cross join contexte c
  where c.gerant
    and d.purged_at is null
    and ((dl.entite = 'lot' and dl.entite_id = c.lot)
      or (dl.entite = 'bail' and dl.entite_id in (select b.id from public.baux b where b.lot_id = c.lot))
      or (dl.entite = 'mandat' and dl.entite_id = c.mandat))
  union all
  select p.document_id, p.titre, p.type, p.depose_le, p.expire_le, null::bigint, p.source
  from contexte c
  cross join lateral public.mes_pieces_locataire(c.org) p
  where not c.gerant
    -- La portée « locataire » se vérifie ici comme dans `fiche_lot` : être
    -- locataire DE CE LOT, pas seulement locataire quelque part dans l'agence.
    and exists (
      select 1 from public.baux b
      where b.lot_id = c.lot and b.etat in ('actif','preavis')
        and (b.locataire_principal = public.ma_personne_locataire(c.org)
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id
                          and bp.person_id = public.ma_personne_locataire(c.org)
                          and bp.role = 'colocataire'))
    )
  order by 4 desc;
$function$
;

-- Liste par contrat pour la fenêtre du lot ; locataire : uniquement son contrat.
create function public.contrats_du_lot(p_lot uuid)
returns table (id uuid, chambre text, locataire text, etat public.bail_etat, loyer_hc numeric, charges numeric, date_fin date, impaye_echu numeric, termes_impayes integer)
language sql stable security definer set search_path = '' as $$
  select b.id, c.nom, btrim(coalesce(p.prenom, '') || ' ' || p.nom), b.etat, b.loyer_hc, b.charges, b.date_fin,
    coalesce((select sum(x.montant_du-x.montant_couvert) from public.etat_loyers_bail_brut(b.id) x where x.date_echeance < current_date and x.montant_du > x.montant_couvert),0),
    (select count(*)::integer from public.etat_loyers_bail_brut(b.id) x where x.date_echeance < current_date and x.montant_du > x.montant_couvert)
  from public.baux b join public.lot_chambres c on c.id = b.chambre_id
  left join public.persons p on p.id = b.locataire_principal
  where b.lot_id = p_lot and b.etat in ('actif','preavis')
    and ((b.organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      and not public.lot_hors_portefeuille(b.organization_id, b.lot_id))
      or b.id = public.mon_dernier_bail_locataire(b.organization_id))
  order by c.nom, b.id;
$$;
revoke all on function public.contrats_du_lot(uuid) from public, anon;
grant execute on function public.contrats_du_lot(uuid) to authenticated;

select public.poser_gardes_abonnement();
