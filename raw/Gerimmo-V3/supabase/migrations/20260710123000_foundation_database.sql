-- GERIMMO V3 foundation database
-- Scope: identity, organizations, roles, permissions, memberships and audit only.
-- No business module table is created in this migration.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email citext unique,
  full_name text,
  phone text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint profiles_email_not_empty check (email is null or length(trim(email::text)) > 0),
  constraint profiles_full_name_not_empty check (full_name is null or length(trim(full_name)) > 0)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint organizations_name_not_empty check (length(trim(name)) > 0),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_status_valid check (status in ('active', 'suspended', 'archived')),
  constraint organizations_archived_status_consistency check (
    (archived_at is null and status <> 'archived') or (archived_at is not null)
  )
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  member_type text not null,
  status text not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint organization_members_member_type_valid check (
    member_type in ('admin', 'agent', 'owner', 'contractor', 'tenant')
  ),
  constraint organization_members_status_valid check (status in ('invited', 'active', 'suspended', 'archived')),
  constraint organization_members_archived_status_consistency check (
    (archived_at is null and status <> 'archived') or (archived_at is not null)
  )
);

create unique index organization_members_one_active_membership_idx
  on public.organization_members (organization_id, profile_id)
  where archived_at is null;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  scope text not null default 'organization',
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint roles_key_format check (key ~ '^[a-z0-9_]+$'),
  constraint roles_name_not_empty check (length(trim(name)) > 0),
  constraint roles_scope_valid check (scope in ('global', 'organization'))
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint permissions_key_format check (key ~ '^[a-z0-9_.]+$'),
  constraint permissions_name_not_empty check (length(trim(name)) > 0),
  constraint permissions_category_not_empty check (length(trim(category)) > 0)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null
);

create unique index role_permissions_one_active_assignment_idx
  on public.role_permissions (role_id, permission_id)
  where archived_at is null;

create table public.member_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_member_id uuid not null references public.organization_members(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null
);

create unique index member_role_assignments_one_active_role_idx
  on public.member_role_assignments (organization_member_id, role_id)
  where archived_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_empty check (length(trim(action)) > 0),
  constraint audit_logs_table_name_not_empty check (length(trim(table_name)) > 0)
);

create index profiles_archived_at_idx on public.profiles (archived_at);
create index profiles_is_super_admin_idx on public.profiles (is_super_admin) where archived_at is null;

create index organizations_status_idx on public.organizations (status);
create index organizations_archived_at_idx on public.organizations (archived_at);
create index organizations_created_by_idx on public.organizations (created_by);

create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index organization_members_profile_id_idx on public.organization_members (profile_id);
create index organization_members_status_idx on public.organization_members (status);
create index organization_members_member_type_idx on public.organization_members (member_type);
create index organization_members_archived_at_idx on public.organization_members (archived_at);

create index roles_scope_idx on public.roles (scope);
create index roles_archived_at_idx on public.roles (archived_at);

create index permissions_category_idx on public.permissions (category);
create index permissions_archived_at_idx on public.permissions (archived_at);

create index role_permissions_role_id_idx on public.role_permissions (role_id);
create index role_permissions_permission_id_idx on public.role_permissions (permission_id);
create index role_permissions_archived_at_idx on public.role_permissions (archived_at);

create index member_role_assignments_member_id_idx on public.member_role_assignments (organization_member_id);
create index member_role_assignments_role_id_idx on public.member_role_assignments (role_id);
create index member_role_assignments_archived_at_idx on public.member_role_assignments (archived_at);

create index audit_logs_organization_id_idx on public.audit_logs (organization_id);
create index audit_logs_actor_profile_id_idx on public.audit_logs (actor_profile_id);
create index audit_logs_table_name_idx on public.audit_logs (table_name);
create index audit_logs_record_id_idx on public.audit_logs (record_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select true
    from public.profiles p
    where p.id = auth.uid()
      and p.is_super_admin is true
      and p.archived_at is null
    limit 1
  ), false)
  or coalesce((
    select true
    from public.organization_members om
    join public.member_role_assignments mra on mra.organization_member_id = om.id
    join public.roles r on r.id = mra.role_id
    where om.profile_id = auth.uid()
      and om.status = 'active'
      and om.archived_at is null
      and mra.archived_at is null
      and r.key = 'super_admin'
      and r.archived_at is null
    limit 1
  ), false);
$$;

create or replace function public.is_active_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select true
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.profile_id = auth.uid()
      and om.status = 'active'
      and om.archived_at is null
    limit 1
  ), false);
$$;

create or replace function public.has_organization_role(target_organization_id uuid, role_keys text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or coalesce((
    select true
    from public.organization_members om
    join public.member_role_assignments mra on mra.organization_member_id = om.id
    join public.roles r on r.id = mra.role_id
    where om.organization_id = target_organization_id
      and om.profile_id = auth.uid()
      and om.status = 'active'
      and om.archived_at is null
      and mra.archived_at is null
      and r.archived_at is null
      and r.key = any(role_keys)
    limit 1
  ), false);
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_organization_role(target_organization_id, array['super_admin', 'administrateur_agence']);
$$;

create or replace function public.can_access_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or target_profile_id = auth.uid()
    or coalesce((
      select true
      from public.organization_members target_member
      where target_member.profile_id = target_profile_id
        and target_member.archived_at is null
        and (
          public.has_organization_role(target_member.organization_id, array['administrateur_agence', 'agent_immobilier'])
          or exists (
            select 1
            from public.organization_members current_member
            where current_member.organization_id = target_member.organization_id
              and current_member.profile_id = auth.uid()
              and current_member.id = target_member.id
              and current_member.status = 'active'
              and current_member.archived_at is null
          )
        )
      limit 1
    ), false);
$$;

create or replace function public.can_access_organization_member(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or coalesce((
      select true
      from public.organization_members om
      where om.id = target_member_id
        and om.archived_at is null
        and (
          om.profile_id = auth.uid()
          or public.has_organization_role(om.organization_id, array['administrateur_agence', 'agent_immobilier'])
        )
      limit 1
    ), false);
$$;

create or replace function public.audit_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_record_id uuid;
  changed_organization_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_record_id = old.id;
    changed_organization_id = case when to_jsonb(old) ? 'organization_id' then (to_jsonb(old)->>'organization_id')::uuid else null end;

    insert into public.audit_logs (organization_id, actor_profile_id, action, table_name, record_id, old_values, new_values)
    values (changed_organization_id, auth.uid(), tg_op, tg_table_name, changed_record_id, to_jsonb(old), null);

    return old;
  end if;

  changed_record_id = new.id;
  changed_organization_id = case when to_jsonb(new) ? 'organization_id' then (to_jsonb(new)->>'organization_id')::uuid else null end;

  if tg_op = 'INSERT' or to_jsonb(old) is distinct from to_jsonb(new) then
    insert into public.audit_logs (organization_id, actor_profile_id, action, table_name, record_id, old_values, new_values)
    values (
      changed_organization_id,
      auth.uid(),
      tg_op,
      tg_table_name,
      changed_record_id,
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      to_jsonb(new)
    );
  end if;

  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create trigger permissions_set_updated_at
before update on public.permissions
for each row execute function public.set_updated_at();

create trigger member_role_assignments_set_updated_at
before update on public.member_role_assignments
for each row execute function public.set_updated_at();

create trigger profiles_audit_changes
after insert or update or delete on public.profiles
for each row execute function public.audit_table_changes();

create trigger organizations_audit_changes
after insert or update or delete on public.organizations
for each row execute function public.audit_table_changes();

create trigger organization_members_audit_changes
after insert or update or delete on public.organization_members
for each row execute function public.audit_table_changes();

create trigger roles_audit_changes
after insert or update or delete on public.roles
for each row execute function public.audit_table_changes();

create trigger permissions_audit_changes
after insert or update or delete on public.permissions
for each row execute function public.audit_table_changes();

create trigger role_permissions_audit_changes
after insert or update or delete on public.role_permissions
for each row execute function public.audit_table_changes();

create trigger member_role_assignments_audit_changes
after insert or update or delete on public.member_role_assignments
for each row execute function public.audit_table_changes();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_role_assignments enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_policy
on public.profiles for select to authenticated
using (public.can_access_profile(id));

create policy profiles_insert_policy
on public.profiles for insert to authenticated
with check (id = auth.uid() or public.is_super_admin());

create policy profiles_update_policy
on public.profiles for update to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

create policy profiles_delete_policy
on public.profiles for delete to authenticated
using (public.is_super_admin());

create policy organizations_select_policy
on public.organizations for select to authenticated
using (public.is_super_admin() or public.is_active_organization_member(id));

create policy organizations_insert_policy
on public.organizations for insert to authenticated
with check (public.is_super_admin());

create policy organizations_update_policy
on public.organizations for update to authenticated
using (public.can_manage_organization(id))
with check (public.can_manage_organization(id));

create policy organizations_delete_policy
on public.organizations for delete to authenticated
using (public.is_super_admin());

create policy organization_members_select_policy
on public.organization_members for select to authenticated
using (public.can_access_organization_member(id));

create policy organization_members_insert_policy
on public.organization_members for insert to authenticated
with check (public.can_manage_organization(organization_id));

create policy organization_members_update_policy
on public.organization_members for update to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy organization_members_delete_policy
on public.organization_members for delete to authenticated
using (public.is_super_admin());

create policy roles_select_policy
on public.roles for select to authenticated
using (archived_at is null or public.is_super_admin());

create policy roles_insert_policy
on public.roles for insert to authenticated
with check (public.is_super_admin());

create policy roles_update_policy
on public.roles for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy roles_delete_policy
on public.roles for delete to authenticated
using (public.is_super_admin());

create policy permissions_select_policy
on public.permissions for select to authenticated
using (archived_at is null or public.is_super_admin());

create policy permissions_insert_policy
on public.permissions for insert to authenticated
with check (public.is_super_admin());

create policy permissions_update_policy
on public.permissions for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy permissions_delete_policy
on public.permissions for delete to authenticated
using (public.is_super_admin());

create policy role_permissions_select_policy
on public.role_permissions for select to authenticated
using (archived_at is null or public.is_super_admin());

create policy role_permissions_insert_policy
on public.role_permissions for insert to authenticated
with check (public.is_super_admin());

create policy role_permissions_update_policy
on public.role_permissions for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy role_permissions_delete_policy
on public.role_permissions for delete to authenticated
using (public.is_super_admin());

create policy member_role_assignments_select_policy
on public.member_role_assignments for select to authenticated
using (
  public.is_super_admin()
  or public.can_access_organization_member(organization_member_id)
);

create policy member_role_assignments_insert_policy
on public.member_role_assignments for insert to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.organization_members om
    where om.id = organization_member_id
      and public.can_manage_organization(om.organization_id)
  )
);

create policy member_role_assignments_update_policy
on public.member_role_assignments for update to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.organization_members om
    where om.id = organization_member_id
      and public.can_manage_organization(om.organization_id)
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.organization_members om
    where om.id = organization_member_id
      and public.can_manage_organization(om.organization_id)
  )
);

create policy member_role_assignments_delete_policy
on public.member_role_assignments for delete to authenticated
using (public.is_super_admin());

create policy audit_logs_select_policy
on public.audit_logs for select to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is not null
    and public.has_organization_role(organization_id, array['administrateur_agence'])
  )
);
