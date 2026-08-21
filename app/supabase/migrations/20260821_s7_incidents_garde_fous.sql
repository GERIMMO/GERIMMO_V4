-- Sprint 7 — garde-fous (revue n°1) : trois règles qui n'étaient que des
-- conventions TypeScript deviennent des contraintes — « interdit par
-- construction, pas par convention » :
-- 1. la catégorie est une liste fermée (les RPC sont appelables en direct :
--    un slug inconnu casserait libellés, repère juridique et détection de
--    doublon). Toute nouvelle catégorie = migration + lib/incidents.ts.
-- 2. dix photos au plus par incident (le plafond TS était par requête).
-- 3. un incident terminé ne se classe pas « sans suite » : l'intervention a
--    eu lieu — l'UI ne le proposait pas, la base l'acceptait (dérive relevée
--    en revue).

alter table public.incidents add constraint incidents_categorie_connue check (
  categorie in (
    'plomberie_joint', 'plomberie_canalisation',
    'chauffage_entretien', 'chauffage_remplacement', 'chauffage_panne',
    'electricite_courant', 'electricite_tableau',
    'menuiserie_vitre', 'humidite_infiltration',
    'serrurerie_cle', 'serrurerie_porte',
    'nuisibles', 'autre'
  )
);

create or replace function public.joindre_photo_incident(
  p_org uuid, p_incident uuid, p_storage_path text,
  p_mime text, p_taille bigint, p_empreinte text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_gerant boolean;
  v_declarant boolean;
  v_doc uuid;
  v_nb bigint;
begin
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  left join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org;
  if not found then raise exception 'Incident introuvable'; end if;

  v_gerant := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  v_declarant := v.declarant_account = (select auth.uid())
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
  if not (v_gerant or v_declarant) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'clos' then
    raise exception 'Cet incident est clos — rouvrez-le si le problème persiste';
  end if;
  if p_mime not in ('image/jpeg', 'image/png') then
    raise exception 'Une photo d''incident est une image (JPEG ou PNG)';
  end if;
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de stockage invalide';
  end if;
  -- Plafond par incident (revue n°1) : la limite TS ne portait que sur une
  -- requête — répétée, elle laissait gonfler la GED sans borne.
  select count(*) into v_nb
  from public.document_liens dl
  join public.documents d on d.id = dl.document_id and d.purged_at is null
  where dl.organization_id = p_org and dl.entite = 'incident' and dl.entite_id = p_incident;
  if v_nb >= 10 then
    raise exception 'Dix photos au maximum par incident — faites le tri avant d''en ajouter';
  end if;

  begin
    insert into public.documents
      (organization_id, type, titre, storage_path, mime_type, taille_octets,
       empreinte, deposited_by)
    values
      (p_org, 'photo_incident', 'Photo — ' || v.numero, p_storage_path, p_mime,
       p_taille, p_empreinte, (select auth.uid()))
    returning id into v_doc;
  exception when unique_violation then
    raise exception 'Cette photo a déjà été déposée';
  end;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'incident', p_incident);

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'photo', (select auth.uid()),
          jsonb_build_object('document_id', v_doc));

  return v_doc;
end;
$$;

create or replace function public.cloturer_incident(
  p_org uuid, p_incident uuid,
  p_motif public.incident_cloture, p_commentaire text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat = 'en_cours' then
    raise exception 'Une intervention en cours ne se clôture pas sans compte rendu (RM-7.5.1)';
  end if;
  if v.etat not in ('declare', 'qualifie', 'termine') then
    raise exception 'Cet incident ne peut pas être clôturé depuis l''état « % » (RM-A5.1)', v.etat;
  end if;
  -- Le classement sans suite vaut pour un incident non qualifié ; une fois
  -- jugé (qualifié) ou intervenu (terminé), il se clôture « résolu ».
  if v.etat in ('qualifie', 'termine') and p_motif = 'sans_suite' then
    raise exception 'Un incident qualifié ou terminé se clôture « résolu » — le classement sans suite vaut pour un incident non qualifié';
  end if;
  if v.etat = 'declare' and p_motif = 'resolu' then
    raise exception 'Qualifiez l''incident avant de le clôturer « résolu » — ou classez-le sans suite';
  end if;

  update public.incidents
  set etat = 'clos', cloture_motif = p_motif,
      cloture_commentaire = nullif(trim(coalesce(p_commentaire, '')), ''),
      clos_le = now(), clos_par = (select auth.uid())
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'cloture', (select auth.uid()),
          jsonb_build_object('motif', p_motif,
                             'commentaire', nullif(trim(coalesce(p_commentaire, '')), '')));

  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = 'Incident ' || v.numero || ' clos'
  where organization_id = p_org and statut = 'ouverte'
    and details->>'incident_id' = p_incident::text;
end;
$$;
