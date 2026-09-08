-- Chantier documentaire (08/09, demande de l'humain) — vague SQL :
--  1. SIGNATURE PRÉENREGISTRÉE : l'organisation (agence ou bailleur direct)
--     dépose une image de signature, apposée sur les documents qu'elle émet
--     seule (quittances, reçus, courriers). Jamais sur un bail ou un EDL :
--     là, la signature est un acte des parties, pas un tampon.
--  2. ENVOYER POUR SIGNATURE : un document généré se transmet au signataire
--     (locataire à espace actif) — il le voit dans « À signer », le télécharge,
--     le signe et dépose le PDF signé ; le gestionnaire est alerté du retour.
--  3. L'espace locataire reçoit ses QUITTANCES et COURRIERS PDF générés
--     (documents liés à sa fiche) — pas seulement ses pièces de dossier.

-- 1. Signature de l'organisation ------------------------------------------
alter table public.organizations add column signature_path text;

-- 2. Demandes de signature -------------------------------------------------
create table public.demandes_signature (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null references public.documents(id),
  person_id uuid not null,
  demandee_le timestamptz not null default now(),
  signee_le timestamptz,
  document_retour_id uuid references public.documents(id),
  created_by uuid references public.accounts(id),
  constraint demandes_signature_person_meme_org_fk
    foreign key (person_id, organization_id)
    references public.persons (id, organization_id) on delete cascade
);
create index demandes_signature_org_idx on public.demandes_signature (organization_id);
create index demandes_signature_person_idx on public.demandes_signature (person_id);
alter table public.demandes_signature enable row level security;
create policy demandes_signature_gerants on public.demandes_signature
  for all using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

-- Côté locataire : ses demandes en attente (adhésion active — on ne signe pas
-- un document après la sortie)
create function public.mes_demandes_signature(p_org uuid)
returns table (id uuid, document_id uuid, titre text, type public.document_type,
               demandee_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select ds.id, ds.document_id, d.titre, d.type, ds.demandee_le
  from public.demandes_signature ds
  join public.documents d on d.id = ds.document_id and d.purged_at is null
  where ds.organization_id = p_org
    and ds.person_id = public.ma_personne_locataire(p_org)
    and ds.signee_le is null
  order by ds.demandee_le;
$$;
revoke execute on function public.mes_demandes_signature(uuid) from public, anon;

-- Retour du document signé : dépôt par le locataire, alerte au gestionnaire
create function public.retourner_document_signe(
  p_org uuid, p_demande uuid, p_storage_path text, p_mime text,
  p_taille bigint, p_empreinte text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
  v_person_nom text;
  v_demande record;
  v_original record;
  v_doc uuid;
begin
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Format refusé : PDF, JPEG ou PNG uniquement';
  end if;
  if p_storage_path not like p_org::text || '/%' then
    raise exception 'Chemin de fichier invalide';
  end if;
  v_person := public.ma_personne_locataire(p_org);
  if v_person is null then
    raise exception 'Aucune fiche rattachée à votre compte dans cette agence';
  end if;
  select trim(coalesce(prenom || ' ', '') || nom) into v_person_nom
  from public.persons where id = v_person;

  select ds.* into v_demande from public.demandes_signature ds
  where ds.id = p_demande and ds.organization_id = p_org
    and ds.person_id = v_person and ds.signee_le is null;
  if v_demande.id is null then
    raise exception 'Cette demande n''existe plus — elle a peut-être déjà été satisfaite';
  end if;
  select d.* into v_original from public.documents d where d.id = v_demande.document_id;

  insert into public.documents
    (organization_id, type, titre, storage_path, mime_type, taille_octets,
     empreinte, deposited_by)
  values
    (p_org, v_original.type,
     coalesce(v_original.titre, 'Document') || ' — signé',
     p_storage_path, p_mime, p_taille, p_empreinte, (select auth.uid()))
  returning id into v_doc;

  insert into public.document_liens (document_id, organization_id, entite, entite_id)
  values (v_doc, p_org, 'organisation', p_org),
         (v_doc, p_org, 'personne', v_person);

  update public.demandes_signature
     set signee_le = now(), document_retour_id = v_doc
   where id = p_demande;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'signature_retournee', 'normale',
          format('Document signé retourné — %s', v_person_nom),
          jsonb_build_object('document_id', v_doc, 'person_id', v_person,
                             'libelle', coalesce(v_original.titre, 'Document') ||
                                        ' — à contrôler puis classer'));
  return v_doc;
end;
$$;
revoke execute on function public.retourner_document_signe(uuid, uuid, text, text, bigint, text) from public, anon;

-- L'alerte de retour se rattache au document (fermetures automatiques)
create or replace function public.alerte_origine(p_type text, p_details jsonb,
  out origine_type text, out origine_id uuid)
returns record
language plpgsql immutable set search_path = '' as $$
declare v_cle text;
begin
  origine_type := case p_type
    when 'edl_entree' then 'bail' when 'edl_sortie' then 'bail'
    when 'conge_intention' then 'bail'
    when 'diagnostic_expiration' then 'diagnostic'
    when 'assurance_expiration' then 'document' when 'attestation_a_verifier' then 'document'
    when 'piece_deposee' then 'document'
    when 'signature_retournee' then 'document'
    when 'incident_a_qualifier' then 'incident' when 'incident_conteste' then 'incident'
    when 'versement_proprietaire' then 'rapport' when 'ecart_versement' then 'rapport'
    when 'decompte' then 'restitution' when 'decompte_lrar' then 'restitution'
    when 'restitution_echeance' then 'restitution'
    when 'retenue_sans_justificatif' then case when p_details ? 'retenue_id' then 'retenue' else 'restitution' end
    else null end;
  v_cle := case origine_type
    when 'bail' then 'bail_id' when 'diagnostic' then 'diagnostic_id'
    when 'document' then 'document_id' when 'incident' then 'incident_id'
    when 'rapport' then 'rapport_id' when 'restitution' then 'restitution_id'
    when 'retenue' then 'retenue_id' else null end;
  if v_cle is null or not (p_details ? v_cle) then origine_type := null; origine_id := null; return; end if;
  begin origine_id := (p_details ->> v_cle)::uuid;
  exception when others then origine_type := null; origine_id := null; end;
end $$;

-- 3. Quittances et courriers PDF dans l'espace locataire -------------------
-- Le « dossier » du locataire s'élargit aux documents qui lui sont ADRESSÉS
-- (quittances, courriers liés à sa fiche) — RM-12.5 : le locataire voit SES
-- documents ; plus les documents qu'on lui demande de signer.
create or replace function public.mes_pieces_locataire(p_org uuid)
returns table (document_id uuid, type public.document_type, titre text, mime_type text,
               depose_le timestamptz, expire_le date, verifie_le timestamptz, source text)
language sql stable security definer set search_path to '' as $$
  with ma_personne as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
      and exists (select 1 from public.memberships m where m.account_id = p.account_id and m.organization_id = p_org and m.role = 'locataire' and m.status in ('active', 'inactive'))
  ),
  dossier as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org and d.type in ('attestation_assurance', 'piece_identite', 'justificatif', 'quittance', 'courrier') and d.purged_at is null
      and not exists (select 1 from public.documents d2 where d2.remplace_id = d.id)
  ),
  attestation_validee as (
    select d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.documents d
    join public.document_liens dl on dl.document_id = d.id and dl.entite = 'personne'
    join ma_personne mp on mp.id = dl.entite_id
    where d.organization_id = p_org and d.purged_at is null and d.type = 'attestation_assurance' and d.verifie_le is not null
    order by d.verifie_le desc limit 1
  ),
  pieces_bail as (
    select distinct d.id, d.type, d.titre, d.mime_type, d.created_at, d.expire_le, d.verifie_le
    from public.pieces_bail_locataire() pb
    join public.documents d on d.id = pb.document_id
    where pb.organization_id = p_org and d.purged_at is null
  )
  select id, type, titre, mime_type, created_at, expire_le, verifie_le, 'dossier' from dossier
  union
  select av.id, av.type, av.titre, av.mime_type, av.created_at, av.expire_le, av.verifie_le, 'dossier'
  from attestation_validee av
  where not exists (select 1 from dossier x where x.id = av.id)
    and exists (select 1 from dossier x where x.type = 'attestation_assurance' and x.verifie_le is null)
  union
  select pb.id, pb.type, pb.titre, pb.mime_type, pb.created_at, pb.expire_le, pb.verifie_le, 'bail'
  from pieces_bail pb
  where not exists (select 1 from dossier x where x.id = pb.id)
  order by 5 desc;
$$;
revoke execute on function public.mes_pieces_locataire(uuid) from public, anon;

create or replace function public.mon_document_locataire(p_org uuid, p_doc uuid)
returns table (document_id uuid, titre text, mime_type text, storage_path text, purged_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select d.id, d.titre, d.mime_type, d.storage_path, d.purged_at
  from public.documents d
  where d.id = p_doc and d.organization_id = p_org
    and exists (select 1 from public.memberships m
                where m.account_id = (select auth.uid())
                  and m.organization_id = p_org
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
    and (
      (d.type in ('attestation_assurance', 'piece_identite', 'justificatif', 'quittance', 'courrier')
       and exists (
        select 1 from public.document_liens dl
        join public.persons p on p.id = dl.entite_id
        where dl.document_id = d.id and dl.entite = 'personne'
          and p.organization_id = p_org
          and p.account_id = (select auth.uid())))
      or exists (select 1 from public.pieces_bail_locataire() pb
                 where pb.document_id = d.id and pb.organization_id = p_org)
      -- Un document qu'on me demande de signer (et mon retour signé)
      or exists (
        select 1 from public.demandes_signature ds
        join public.persons p on p.id = ds.person_id
        where (ds.document_id = d.id or ds.document_retour_id = d.id)
          and ds.organization_id = p_org
          and p.account_id = (select auth.uid()))
      or exists (
        select 1 from public.retenues t
        join public.restitutions r on r.id = t.restitution_id and r.statut = 'finalise'
        where t.justificatif_document = d.id
          and r.organization_id = p_org
          and r.bail_id = public.mon_dernier_bail_locataire(p_org))
      or exists (
        select 1 from public.regularisations_charges rc
        join public.baux b on b.id = rc.bail_id
        join public.persons p on p.organization_id = b.organization_id
                             and p.account_id = (select auth.uid())
        where rc.justificatif_document = d.id
          and b.organization_id = p_org
          and (p.id = b.locataire_principal
               or exists (select 1 from public.bail_personnes bp
                          where bp.bail_id = b.id and bp.person_id = p.id
                            and bp.role = 'colocataire'))));
$$;
revoke execute on function public.mon_document_locataire(uuid, uuid) from public, anon;

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
    and d.type in ('attestation_assurance', 'piece_identite', 'justificatif', 'quittance', 'courrier')
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = p.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.demandes_signature ds
  join public.persons p on p.id = ds.person_id
                       and p.account_id = (select auth.uid())
  join public.documents d on d.id = ds.document_id or d.id = ds.document_retour_id
  where d.purged_at is null and d.storage_path is not null
    and d.organization_id = ds.organization_id
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = ds.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.retenues r
  join public.restitutions re on re.id = r.restitution_id and re.statut = 'finalise'
  join public.baux b on b.id = re.bail_id
  join public.documents d on d.id = r.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'))
  union
  select d.storage_path
  from public.regularisations_charges rc
  join public.baux b on b.id = rc.bail_id
  join public.documents d on d.id = rc.justificatif_document
  join public.persons p on p.organization_id = b.organization_id
                       and p.account_id = (select auth.uid())
  where d.purged_at is null and d.storage_path is not null
    and (p.id = b.locataire_principal
         or exists (select 1 from public.bail_personnes bp
                    where bp.bail_id = b.id and bp.person_id = p.id
                      and bp.role = 'colocataire'))
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id
                  and m.organization_id = b.organization_id
                  and m.role = 'locataire' and m.status in ('active', 'inactive'));
$$;
