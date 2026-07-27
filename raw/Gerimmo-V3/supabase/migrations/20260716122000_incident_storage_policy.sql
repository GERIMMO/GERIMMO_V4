-- GERIMMO V3 - Lecture securisee des pieces jointes Telegram liees aux incidents.

begin;

drop policy if exists incident_storage_select on storage.objects;
create policy incident_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'incident-attachments'
  and exists (
    select 1
    from public.bot_attachments attachment
    where attachment.storage_path = name
      and attachment.archived_at is null
      and public.can_access_bot_data(attachment.organization_id, attachment.profile_id)
  )
);

commit;
