-- GERIMMO V3 Sprint 8 - stockage documentaire et index critiques.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and public.can_access_document(((storage.foldername(name))[2])::uuid)
);

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and public.can_manage_documents(((storage.foldername(name))[1])::uuid)
);

drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and public.can_manage_documents(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'documents'
  and public.can_manage_documents(((storage.foldername(name))[1])::uuid)
);

create index if not exists bot_messages_organization_id_idx on public.bot_messages (organization_id, created_at desc);
