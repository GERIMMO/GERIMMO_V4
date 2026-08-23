-- Sprint 7 — correctif : la criticité de l'alerte « à qualifier » sortait
-- d'un CASE en text, or alerts.criticite est l'enum alerte_criticite — le
-- planificateur refuse l'insert dès le premier appel (attrapé par la
-- vérification d'intégration du 21/08). Cast explicite dans les deux
-- fonctions qui lèvent cette alerte.

create or replace function public.incident_creer(
  p_org uuid, p_lot uuid, p_bail uuid, p_declarant uuid,
  p_canal public.incident_canal, p_categorie text, p_description text,
  p_piece text, p_anciennete text, p_urgence public.incident_urgence,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident uuid;
  v_numero text;
  v_doublon boolean;
begin
  if length(trim(coalesce(p_categorie, ''))) = 0 then
    raise exception 'Choisissez la catégorie du problème';
  end if;
  if length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'Décrivez le problème en une phrase au moins';
  end if;

  v_doublon := exists (
    select 1 from public.incidents i
    where i.organization_id = p_org and i.lot_id = p_lot
      and i.categorie = p_categorie and i.etat <> 'clos'
  );

  v_numero := public.incident_prochain_numero(p_org);
  insert into public.incidents
    (organization_id, numero, lot_id, bail_id, declarant_person_id, canal,
     categorie, piece, description, anciennete, urgence, created_by)
  values
    (p_org, v_numero, p_lot, p_bail, p_declarant, p_canal,
     trim(p_categorie), nullif(trim(coalesce(p_piece, '')), ''),
     trim(p_description), nullif(trim(coalesce(p_anciennete, '')), ''),
     p_urgence, p_created_by)
  returning id into v_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v_incident, 'declaration', p_created_by,
          jsonb_build_object('canal', p_canal, 'urgence', p_urgence, 'doublon_possible', v_doublon));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          (case when p_urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
          case when p_urgence = 'urgente'
               then 'Incident urgent à qualifier — ' || v_numero
               else 'Incident à qualifier — ' || v_numero end,
          jsonb_build_object('incident_id', v_incident, 'lot_id', p_lot,
                             'libelle', case when v_doublon
                               then 'Doublon possible : un incident du même type est déjà ouvert sur ce lot'
                               end));
  return v_incident;
end;
$$;

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
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  left join public.persons p on p.id = i.declarant_person_id
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

  update public.incidents
  set etat = 'rouvert', cloture_motif = null, cloture_commentaire = null,
      clos_le = null, clos_par = null
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'reouverture', (select auth.uid()),
          jsonb_build_object('motif', trim(p_motif), 'cloture_precedente',
            jsonb_build_object('motif', v.cloture_motif, 'clos_le', v.clos_le)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          (case when v.urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
          'Incident rouvert, à requalifier — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_motif), 140)));
end;
$$;
