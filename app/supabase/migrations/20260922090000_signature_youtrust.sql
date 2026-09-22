-- Signature électronique Youtrust : suivi du circuit, réception asynchrone
-- et classement automatique du PDF signé avec son dossier de preuve.
-- La sandbox n'est jamais utilisée par les actions métier de production.

alter table public.demandes_signature
  add column prestataire text not null default 'manuel'
    check (prestataire in ('manuel','youtrust')),
  add column external_request_id text,
  add column external_document_id text,
  add column external_signer_id text,
  add column external_status text,
  add column preuve_document_id uuid references public.documents(id),
  add column external_updated_at timestamptz;

create unique index demandes_signature_external_request_unique
  on public.demandes_signature(external_request_id)
  where external_request_id is not null;
create index demandes_signature_external_status_idx
  on public.demandes_signature(external_status, external_updated_at)
  where prestataire='youtrust' and signee_le is null;

-- Le webhook répond immédiatement ; la tâche signatures traite ensuite le
-- téléchargement, qui peut prendre plusieurs secondes. L'identifiant fourni
-- par Youtrust déduplique ses relances.
create table public.signature_evenements (
  event_id uuid primary key,
  event_name text not null,
  request_id text not null,
  payload jsonb not null,
  etat text not null default 'a_traiter'
    check (etat in ('a_traiter','traite','echec')),
  tentatives integer not null default 0 check (tentatives between 0 and 20),
  erreur text,
  recu_le timestamptz not null default now(),
  traite_le timestamptz
);
create index signature_evenements_file_idx
  on public.signature_evenements(etat, recu_le)
  where etat in ('a_traiter','echec');
alter table public.signature_evenements enable row level security;
revoke all on public.signature_evenements from public, anon, authenticated;
grant select, insert, update, delete on public.signature_evenements to service_role;

-- L'utilisateur a déjà passé les gardes d'envoyer_pour_signature. Cette RPC
-- rattache l'identifiant externe à la demande qu'il vient de créer, sans lui
-- permettre d'écrire sur une autre organisation.
create function public.rattacher_signature_youtrust(
  p_org uuid, p_demande uuid, p_request text, p_document text, p_signer text,
  p_statut text
) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  update public.demandes_signature set
    prestataire='youtrust', external_request_id=p_request,
    external_document_id=p_document, external_signer_id=p_signer,
    external_status=p_statut, external_updated_at=now()
  where id=p_demande and organization_id=p_org and signee_le is null;
  if not found then raise exception 'Demande de signature introuvable'; end if;
end $$;
revoke all on function public.rattacher_signature_youtrust(uuid,uuid,text,text,text,text)
  from public,anon;
grant execute on function public.rattacher_signature_youtrust(uuid,uuid,text,text,text,text)
  to authenticated;

-- Seul le worker de plateforme peut transformer les fichiers reçus du
-- prestataire en pièces GED. Un second passage rend les mêmes identifiants :
-- le traitement est idempotent même si le webhook est rejoué.
create function public.finaliser_signature_youtrust(
  p_request text,
  p_signed_path text, p_signed_size bigint, p_signed_hash text,
  p_proof_path text, p_proof_size bigint, p_proof_hash text
) returns table(document_signe uuid, document_preuve uuid)
language plpgsql security definer set search_path='' as $$
declare
  v_demande public.demandes_signature%rowtype;
  v_original public.documents%rowtype;
  v_nom text;
  v_signe uuid;
  v_preuve uuid;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Accès refusé'; end if;
  select * into v_demande from public.demandes_signature
  where external_request_id=p_request and prestataire='youtrust' for update;
  if v_demande.id is null then raise exception 'Demande Youtrust inconnue'; end if;
  if v_demande.signee_le is not null then
    return query select v_demande.document_retour_id, v_demande.preuve_document_id;
    return;
  end if;
  if p_signed_path not like v_demande.organization_id::text || '/signature-youtrust/%'
     or p_proof_path not like v_demande.organization_id::text || '/signature-youtrust/%' then
    raise exception 'Chemin de signature invalide';
  end if;
  select * into v_original from public.documents where id=v_demande.document_id;
  select trim(coalesce(prenom||' ','')||nom) into v_nom
    from public.persons where id=v_demande.person_id;

  insert into public.documents(organization_id,type,titre,storage_path,mime_type,
    taille_octets,empreinte)
  values(v_demande.organization_id,v_original.type,
    coalesce(v_original.titre,'Document')||' — signé',p_signed_path,
    'application/pdf',p_signed_size,p_signed_hash)
  returning id into v_signe;

  insert into public.documents(organization_id,type,titre,storage_path,mime_type,
    taille_octets,empreinte)
  values(v_demande.organization_id,'autre',
    'Dossier de preuve — '||coalesce(v_original.titre,'Document'),p_proof_path,
    'application/pdf',p_proof_size,p_proof_hash)
  returning id into v_preuve;

  insert into public.document_liens(document_id,organization_id,entite,entite_id)
  select v_signe, organization_id, entite, entite_id
  from public.document_liens where document_id=v_original.id;
  insert into public.document_liens(document_id,organization_id,entite,entite_id)
  select v_preuve, organization_id, entite, entite_id
  from public.document_liens where document_id=v_original.id;

  update public.demandes_signature set signee_le=now(), document_retour_id=v_signe,
    preuve_document_id=v_preuve, external_status='done', external_updated_at=now()
  where id=v_demande.id;
  insert into public.alerts(organization_id,type,criticite,titre,details)
  values(v_demande.organization_id,'signature_retournee','normale',
    format('Signature électronique terminée — %s',coalesce(v_nom,'Signataire')),
    jsonb_build_object('document_id',v_signe,'person_id',v_demande.person_id,
      'preuve_document_id',v_preuve,'libelle',coalesce(v_original.titre,'Document')||' — à contrôler'));
  return query select v_signe,v_preuve;
end $$;
revoke all on function public.finaliser_signature_youtrust(text,text,bigint,text,text,bigint,text)
  from public,anon,authenticated;
grant execute on function public.finaliser_signature_youtrust(text,text,bigint,text,text,bigint,text)
  to service_role;

create function public.classer_echec_signature_youtrust(p_request text,p_statut text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.demandes_signature%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Accès refusé'; end if;
  update public.demandes_signature set external_status=p_statut,external_updated_at=now()
  where external_request_id=p_request returning * into v;
  if v.id is not null and p_statut in ('declined','expired','canceled','rejected') then
    insert into public.alerts(organization_id,type,criticite,titre,details)
    values(v.organization_id,'signature_a_reprendre','normale',
      'Signature électronique à reprendre',
      jsonb_build_object('document_id',v.document_id,'person_id',v.person_id,
        'demande_signature_id',v.id,'statut',p_statut));
  end if;
end $$;
revoke all on function public.classer_echec_signature_youtrust(text,text) from public,anon,authenticated;
grant execute on function public.classer_echec_signature_youtrust(text,text) to service_role;

drop function if exists public.demandes_signature_document(uuid,uuid);

create or replace function public.demandes_signature_document(p_org uuid,p_doc uuid)
returns table(id uuid,person_id uuid,demandee_le timestamptz,signee_le timestamptz,
  document_retour_id uuid,prestataire text,external_status text,preuve_document_id uuid)
language sql stable security definer set search_path='' as $$
  select ds.id,ds.person_id,ds.demandee_le,ds.signee_le,ds.document_retour_id,
    ds.prestataire,ds.external_status,ds.preuve_document_id
  from public.demandes_signature ds
  where ds.organization_id=p_org
    and (ds.document_id=p_doc or ds.document_retour_id=p_doc or ds.preuve_document_id=p_doc)
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  order by ds.demandee_le desc;
$$;
revoke all on function public.demandes_signature_document(uuid,uuid) from public,anon;
grant execute on function public.demandes_signature_document(uuid,uuid) to authenticated;
