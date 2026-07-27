-- GERIMMO V3 Sprint 3 - Utilisateurs.

create table if not exists public.user_profile_details (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_title text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'France',
  mobile_phone text,
  landline_phone text,
  notes text,
  bot_context jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null
);

create unique index if not exists user_profile_details_one_active_idx on public.user_profile_details (profile_id, organization_id) where archived_at is null;

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email citext not null,
  full_name text,
  member_type text not null,
  role_key text not null references public.roles(key) on delete restrict,
  status text not null default 'pending',
  token_hash text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint user_invitations_email_not_empty check (length(trim(email::text)) > 0),
  constraint user_invitations_member_type_valid check (member_type in ('admin', 'agent', 'owner', 'contractor', 'tenant')),
  constraint user_invitations_status_valid check (status in ('pending', 'accepted', 'expired', 'revoked', 'archived'))
);

create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_activity_logs_action_not_empty check (length(trim(action)) > 0)
);

create table if not exists public.user_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  organization_member_id uuid references public.organization_members(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  previous_status text,
  next_status text not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_status_history_next_status_valid check (next_status in ('invited', 'active', 'inactive', 'suspended', 'archived')),
  constraint user_status_history_previous_status_valid check (previous_status is null or previous_status in ('invited', 'active', 'inactive', 'suspended', 'archived'))
);

create index if not exists user_profile_details_profile_id_idx on public.user_profile_details (profile_id);
create index if not exists user_profile_details_organization_id_idx on public.user_profile_details (organization_id);
create index if not exists user_invitations_organization_id_idx on public.user_invitations (organization_id);
create index if not exists user_invitations_email_idx on public.user_invitations (email);
create index if not exists user_invitations_status_idx on public.user_invitations (status);
create index if not exists user_activity_logs_organization_id_idx on public.user_activity_logs (organization_id);
create index if not exists user_activity_logs_profile_id_idx on public.user_activity_logs (profile_id);
create index if not exists user_activity_logs_created_at_idx on public.user_activity_logs (created_at desc);
create index if not exists user_status_history_organization_id_idx on public.user_status_history (organization_id);
create index if not exists user_status_history_profile_id_idx on public.user_status_history (profile_id);
create index if not exists user_status_history_created_at_idx on public.user_status_history (created_at desc);

create or replace function public.can_manage_users(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_organization_role(target_organization_id, array['super_admin', 'administrateur_agence']);
$$;

create or replace function public.log_user_member_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_status_history (organization_id, organization_member_id, profile_id, previous_status, next_status, changed_by)
    values (new.organization_id, new.id, new.profile_id, null, new.status, auth.uid());
    insert into public.user_activity_logs (organization_id, profile_id, actor_profile_id, action, metadata)
    values (new.organization_id, new.profile_id, auth.uid(), 'MEMBER_CREATED', jsonb_build_object('status', new.status, 'member_type', new.member_type));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.user_status_history (organization_id, organization_member_id, profile_id, previous_status, next_status, changed_by)
    values (new.organization_id, new.id, new.profile_id, old.status, new.status, auth.uid());
    insert into public.user_activity_logs (organization_id, profile_id, actor_profile_id, action, metadata)
    values (new.organization_id, new.profile_id, auth.uid(), 'STATUS_CHANGED', jsonb_build_object('previous_status', old.status, 'next_status', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists user_profile_details_set_updated_at on public.user_profile_details;
create trigger user_profile_details_set_updated_at before update on public.user_profile_details for each row execute function public.set_updated_at();
drop trigger if exists user_invitations_set_updated_at on public.user_invitations;
create trigger user_invitations_set_updated_at before update on public.user_invitations for each row execute function public.set_updated_at();
drop trigger if exists organization_members_status_history on public.organization_members;
create trigger organization_members_status_history after insert or update on public.organization_members for each row execute function public.log_user_member_status();

alter table public.user_profile_details enable row level security;
alter table public.user_invitations enable row level security;
alter table public.user_activity_logs enable row level security;
alter table public.user_status_history enable row level security;

drop policy if exists user_profile_details_select_policy on public.user_profile_details;
create policy user_profile_details_select_policy on public.user_profile_details for select to authenticated using (public.is_super_admin() or profile_id = auth.uid() or public.is_active_organization_member(organization_id));
drop policy if exists user_profile_details_insert_policy on public.user_profile_details;
create policy user_profile_details_insert_policy on public.user_profile_details for insert to authenticated with check (public.can_manage_users(organization_id));
drop policy if exists user_profile_details_update_policy on public.user_profile_details;
create policy user_profile_details_update_policy on public.user_profile_details for update to authenticated using (profile_id = auth.uid() or public.can_manage_users(organization_id)) with check (profile_id = auth.uid() or public.can_manage_users(organization_id));
drop policy if exists user_profile_details_delete_policy on public.user_profile_details;
create policy user_profile_details_delete_policy on public.user_profile_details for delete to authenticated using (public.is_super_admin());

drop policy if exists user_invitations_select_policy on public.user_invitations;
create policy user_invitations_select_policy on public.user_invitations for select to authenticated using (public.is_super_admin() or public.can_manage_users(organization_id));
drop policy if exists user_invitations_insert_policy on public.user_invitations;
create policy user_invitations_insert_policy on public.user_invitations for insert to authenticated with check (public.can_manage_users(organization_id));
drop policy if exists user_invitations_update_policy on public.user_invitations;
create policy user_invitations_update_policy on public.user_invitations for update to authenticated using (public.can_manage_users(organization_id)) with check (public.can_manage_users(organization_id));
drop policy if exists user_invitations_delete_policy on public.user_invitations;
create policy user_invitations_delete_policy on public.user_invitations for delete to authenticated using (public.is_super_admin());

drop policy if exists user_activity_logs_select_policy on public.user_activity_logs;
create policy user_activity_logs_select_policy on public.user_activity_logs for select to authenticated using (public.is_super_admin() or profile_id = auth.uid() or (organization_id is not null and public.can_manage_users(organization_id)));
drop policy if exists user_activity_logs_delete_policy on public.user_activity_logs;
create policy user_activity_logs_delete_policy on public.user_activity_logs for delete to authenticated using (public.is_super_admin());

drop policy if exists user_status_history_select_policy on public.user_status_history;
create policy user_status_history_select_policy on public.user_status_history for select to authenticated using (public.is_super_admin() or profile_id = auth.uid() or public.can_manage_users(organization_id));
drop policy if exists user_status_history_delete_policy on public.user_status_history;
create policy user_status_history_delete_policy on public.user_status_history for delete to authenticated using (public.is_super_admin());

grant select, insert, update, delete on table public.user_profile_details to authenticated, service_role;
grant select, insert, update, delete on table public.user_invitations to authenticated, service_role;
grant select, insert, delete on table public.user_activity_logs to authenticated, service_role;
grant select, insert, delete on table public.user_status_history to authenticated, service_role;
grant execute on function public.can_manage_users(uuid) to authenticated, service_role;
