-- Correctif Sprint 1 : Supabase interdit le DELETE SQL sur storage.objects
-- (trigger storage.protect_delete — « Use the Storage API instead »).
-- Nouvelle architecture de purge :
--  1) la purge SQL rend le fichier inaccessible IMMÉDIATEMENT : la politique
--     de lecture du bucket exige un document vivant (purged_at is null) —
--     sans lecture, aucun lien signé ne peut être créé ;
--  2) le chemin part dans une file (purge_fichiers) ; la suppression physique
--     passe par l'API Storage (action Super Admin « Lancer la purge »).
-- Appliquée le 2026-07-28 sur « Gerimmo V4 » via MCP. Copie de référence.

create table public.purge_fichiers (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  queued_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.purge_fichiers enable row level security;
create policy purge_fichiers_select on public.purge_fichiers
  for select to authenticated
  using ((select public.is_super_admin()));
create policy purge_fichiers_update on public.purge_fichiers
  for update to authenticated
  using ((select public.is_super_admin()));
revoke insert, delete on public.purge_fichiers from authenticated;
revoke all on public.purge_fichiers from anon;

-- Lecture du bucket : gérant de l'agence ET document vivant
create index documents_storage_path_idx on public.documents (storage_path)
  where storage_path is not null;

drop policy ged_select on storage.objects;
create policy ged_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = name and d.purged_at is null
    )
    and (
      (storage.foldername(name))[1] in (
        select o::text from public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) o)
      or (select public.is_super_admin())
    )
  );

-- Suppression physique : Super Admin uniquement, via l'API Storage
create policy ged_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (select public.is_super_admin()));

-- La purge n'écrit plus dans storage.objects : elle met en file
create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regle record;
  v_doc record;
  v_docs_purges int := 0;
  v_journaux jsonb := '{}'::jsonb;
  v_count bigint;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'appliquer_retention: reserve au super admin';
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:tech_log' and actif;
  if found then
    delete from public.tech_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('tech_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:acces_pieces' and actif;
  if found then
    delete from public.acces_pieces_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('acces_pieces_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'journal:audit_log' and actif;
  if found then
    delete from public.audit_log
      where created_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('audit_log', v_count);
  end if;

  select duree_mois into v_regle from public.retention_rules
    where data_type = 'alerte:traitee' and actif;
  if found then
    delete from public.alerts
      where statut = 'fermee'
        and closed_at < now() - make_interval(months => v_regle.duree_mois);
    get diagnostics v_count = row_count;
    v_journaux := v_journaux || jsonb_build_object('alertes', v_count);
  end if;

  for v_doc in
    select d.id, d.organization_id, d.type, d.storage_path, r.sort, r.data_type
    from public.documents d
    join public.retention_rules r
      on r.data_type = 'document:' || d.type::text and r.actif
    where d.purged_at is null
      and r.sort in ('suppression', 'anonymisation')
      and d.retention_reference_date + make_interval(months => r.duree_mois) <= now()
  loop
    insert into public.purge_fichiers (storage_path) values (v_doc.storage_path);
    delete from public.document_liens where document_id = v_doc.id;
    update public.documents
      set purged_at = now(), storage_path = null, mime_type = null,
          taille_octets = null, empreinte = null, titre = null,
          deposited_by = null
      where id = v_doc.id;
    insert into public.audit_log (account_id, organization_id, action, details)
    values ((select auth.uid()), v_doc.organization_id, 'purge_retention',
            jsonb_build_object('document_id', v_doc.id, 'type', v_doc.type,
                               'regle', v_doc.data_type, 'sort', v_doc.sort));
    v_docs_purges := v_docs_purges + 1;
  end loop;

  return jsonb_build_object('journaux', v_journaux, 'documents_purges', v_docs_purges,
                            'fichiers_en_attente', (select count(*) from public.purge_fichiers where deleted_at is null));
end;
$$;
