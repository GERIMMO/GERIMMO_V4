-- Autorise la déclaration d'incident par le locataire de son logement et sécurise les photos du dashboard.

begin;

create or replace function public.can_create_incident(
  target_organization_id uuid,
  target_bien_id uuid,
  target_creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.can_manage_incidents(target_organization_id)
    or (
      target_creator_id = auth.uid()
      and exists (
        select 1
        from public.organization_members member
        join public.bien_occupants occupant
          on occupant.organization_id = member.organization_id
         and occupant.profile_id = member.profile_id
         and occupant.occupant_type = 'locataire'
         and occupant.archived_at is null
         and occupant.ended_at is null
        join public.biens bien
          on bien.id = occupant.bien_id
         and bien.organization_id = member.organization_id
         and bien.archived_at is null
        where member.organization_id = target_organization_id
          and member.profile_id = auth.uid()
          and member.member_type = 'tenant'
          and member.status = 'active'
          and member.archived_at is null
          and bien.id = target_bien_id
      )
    );
$$;

drop policy if exists incidents_insert_policy on public.incidents;
create policy incidents_insert_policy
on public.incidents
for insert
to authenticated
with check (public.can_create_incident(organization_id, bien_id, created_by));

drop policy if exists incident_storage_insert on storage.objects;
create policy incident_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_active_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists incident_storage_select on storage.objects;
create policy incident_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'incident-attachments'
  and (
    exists (
      select 1
      from public.bot_attachments attachment
      where attachment.storage_path = name
        and attachment.archived_at is null
        and public.can_access_bot_data(attachment.organization_id, attachment.profile_id)
    )
    or exists (
      select 1
      from public.incidents incident
      cross join lateral jsonb_array_elements(incident.photos) photo
      where photo ->> 'url' = name
        and public.can_access_incident(incident.id)
    )
  )
);

drop policy if exists incident_storage_delete_own on storage.objects;
create policy incident_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'incident-attachments'
  and owner_id = auth.uid()::text
);

grant execute on function public.can_create_incident(uuid, uuid, uuid) to authenticated, service_role;

commit;
