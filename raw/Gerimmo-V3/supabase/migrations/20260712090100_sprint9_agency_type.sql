-- GERIMMO V3 Sprint 9 - agency identity is based on the organization contract.
create or replace function public.is_agency_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations
    where id = target_organization_id
      and organization_type = 'agency'
      and status <> 'archived'
      and archived_at is null
  );
$$;

grant execute on function public.is_agency_organization(uuid) to authenticated, service_role;
