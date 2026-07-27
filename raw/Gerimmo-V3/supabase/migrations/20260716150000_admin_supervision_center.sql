-- GERIMMO V3 - Centre de supervision sans usurpation d'identite.

create table if not exists public.admin_supervision_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_profile_id uuid not null references public.profiles(id) on delete restrict,
  root_organization_id uuid not null references public.organizations(id) on delete restrict,
  reason text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_supervision_sessions_reason_not_empty check (length(trim(reason)) >= 5),
  constraint admin_supervision_sessions_status_valid check (status in ('active', 'ended')),
  constraint admin_supervision_sessions_end_consistency check (
    (status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null)
  )
);

create table if not exists public.admin_supervision_contexts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.admin_supervision_sessions(id) on delete restrict,
  parent_context_id uuid references public.admin_supervision_contexts(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  context_type text not null,
  target_id uuid not null,
  target_label text not null,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_supervision_contexts_type_valid check (
    context_type in ('agency', 'owner', 'property', 'tenant', 'contractor', 'user')
  ),
  constraint admin_supervision_contexts_label_not_empty check (length(trim(target_label)) > 0)
);

create table if not exists public.admin_supervision_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.admin_supervision_sessions(id) on delete restrict,
  context_id uuid references public.admin_supervision_contexts(id) on delete set null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action text not null,
  route text,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_supervision_events_action_not_empty check (length(trim(action)) > 0)
);

create unique index if not exists admin_supervision_one_active_session_idx
  on public.admin_supervision_sessions (super_admin_profile_id) where status = 'active';
create index if not exists admin_supervision_sessions_admin_started_idx
  on public.admin_supervision_sessions (super_admin_profile_id, started_at desc);
create index if not exists admin_supervision_contexts_session_entered_idx
  on public.admin_supervision_contexts (session_id, entered_at);
create index if not exists admin_supervision_contexts_active_idx
  on public.admin_supervision_contexts (session_id, entered_at desc) where exited_at is null;
create index if not exists admin_supervision_events_session_created_idx
  on public.admin_supervision_events (session_id, created_at desc);
create index if not exists admin_supervision_events_organization_created_idx
  on public.admin_supervision_events (organization_id, created_at desc);

alter table public.admin_supervision_sessions enable row level security;
alter table public.admin_supervision_contexts enable row level security;
alter table public.admin_supervision_events enable row level security;

create policy admin_supervision_sessions_super_admin on public.admin_supervision_sessions
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_supervision_contexts_super_admin on public.admin_supervision_contexts
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_supervision_events_super_admin on public.admin_supervision_events
  for select to authenticated using (public.is_super_admin());
create policy admin_supervision_events_insert_super_admin on public.admin_supervision_events
  for insert to authenticated with check (public.is_super_admin());

grant select, insert, update on public.admin_supervision_sessions to authenticated, service_role;
grant select, insert, update on public.admin_supervision_contexts to authenticated, service_role;
grant select, insert on public.admin_supervision_events to authenticated, service_role;

