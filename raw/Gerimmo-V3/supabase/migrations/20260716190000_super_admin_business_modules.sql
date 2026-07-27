-- GERIMMO V3 - Functional Super Admin centers.

create table if not exists public.admin_support_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  requester_profile_id uuid not null references public.profiles(id) on delete restrict,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  subject text not null,
  description text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  archived_at timestamptz,
  constraint admin_support_priority_valid check (priority in ('low','normal','high','urgent')),
  constraint admin_support_status_valid check (status in ('new','in_progress','waiting','resolved','rejected','archived'))
);

create table if not exists public.admin_support_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.admin_support_requests(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null,
  status text not null default 'submitted',
  popularity_score integer not null default 0,
  estimated_difficulty text,
  estimated_minutes integer,
  added_value text,
  codex_evolution text,
  codex_recommendation text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint product_ideas_status_valid check (status in ('submitted','reviewing','accepted','postponed','refused','archived')),
  constraint product_ideas_difficulty_valid check (estimated_difficulty is null or estimated_difficulty in ('low','medium','high')),
  constraint product_ideas_estimate_valid check (estimated_minutes is null or estimated_minutes > 0)
);

create table if not exists public.product_idea_votes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.product_ideas(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (idea_id, profile_id)
);

create table if not exists public.product_idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.product_ideas(id) on delete restrict,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.admin_communications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  message text not null,
  severity text,
  audience_type text not null default 'all_users',
  organization_id uuid references public.organizations(id) on delete restrict,
  owner_profile_id uuid references public.profiles(id) on delete restrict,
  property_id uuid references public.biens(id) on delete restrict,
  residence_id uuid references public.residences(id) on delete restrict,
  channels text[] not null default '{application}',
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  requires_acknowledgement boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint admin_communications_kind_valid check (kind in ('practical_info','alert','announcement')),
  constraint admin_communications_severity_valid check (severity is null or severity in ('information','vigilance','urgent','critical')),
  constraint admin_communications_audience_valid check (audience_type in ('all_agencies','organization','all_owners','owner','property','residence','all_tenants','all_contractors','all_users')),
  constraint admin_communications_status_valid check (status in ('draft','scheduled','published','expired','archived')),
  constraint admin_communications_dates_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.admin_communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  subject text not null,
  body text not null,
  default_channels text[] not null default '{application}',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (name)
);

insert into public.admin_communication_templates (name, category, subject, body, default_channels)
values
  ('Incident collectif', 'incident_collectif', 'Incident collectif en cours', 'Un incident collectif est en cours de traitement. Nous vous tiendrons informés de son évolution.', '{application,email}'),
  ('Maintenance', 'maintenance', 'Maintenance programmée', 'Une opération de maintenance est programmée. Les services concernés et les horaires sont précisés dans cette communication.', '{application,email}'),
  ('Coupure d’eau', 'coupure_eau', 'Coupure d’eau', 'Une coupure d’eau est prévue. Merci de prendre les dispositions nécessaires pendant la période indiquée.', '{application,email}'),
  ('Panne', 'panne', 'Panne en cours', 'Une panne a été signalée et prise en charge. Une nouvelle information sera publiée dès que possible.', '{application}'),
  ('Travaux', 'travaux', 'Travaux programmés', 'Des travaux sont programmés. Les zones concernées et les horaires figurent dans cette communication.', '{application,email}'),
  ('Demande de documents', 'demande_documents', 'Documents requis', 'Merci de transmettre les documents indiqués afin de poursuivre le traitement de votre dossier.', '{application,email}'),
  ('Relance', 'relance', 'Rappel GERIMMO', 'Une action reste attendue de votre part. Merci de consulter votre portail GERIMMO.', '{application,email}'),
  ('Communication réglementaire', 'reglementaire', 'Information réglementaire', 'Une information réglementaire importante est disponible dans votre portail GERIMMO.', '{application,email}')
on conflict (name) do nothing;

create table if not exists public.admin_communication_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  communication_id uuid not null references public.admin_communications(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  acknowledged_at timestamptz not null default now(),
  unique (communication_id, profile_id)
);

create table if not exists public.system_integrations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  status text not null default 'not_configured',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  response_time_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_integrations_status_valid check (status in ('operational','degraded','down','not_configured'))
);

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  provider text not null default 'n8n',
  external_id text,
  status text not null default 'inactive',
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  run_count integer not null default 0,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint automation_workflows_status_valid check (status in ('active','inactive','error','paused'))
);

create table if not exists public.admin_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  description text not null,
  expected_benefit text not null,
  impact text not null,
  difficulty text not null,
  affected_components text[] not null default '{}',
  risk text not null,
  estimated_minutes integer not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',
  generated_by text not null default 'rules_engine',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint admin_ai_category_valid check (category in ('performance','ux','feature','preventive_fix','database','automation','code','security')),
  constraint admin_ai_difficulty_valid check (difficulty in ('low','medium','high')),
  constraint admin_ai_status_valid check (status in ('proposed','accepted','postponed','refused','archived')),
  constraint admin_ai_estimate_valid check (estimated_minutes > 0)
);

create index if not exists admin_support_status_idx on public.admin_support_requests (status, priority, created_at desc) where archived_at is null;
create index if not exists admin_support_org_idx on public.admin_support_requests (organization_id, created_at desc);
create index if not exists admin_support_events_request_idx on public.admin_support_events (request_id, created_at desc);
create index if not exists product_ideas_status_idx on public.product_ideas (status, popularity_score desc, created_at desc) where archived_at is null;
create index if not exists product_idea_votes_idea_idx on public.product_idea_votes (idea_id);
create index if not exists product_idea_comments_idea_idx on public.product_idea_comments (idea_id, created_at);
create index if not exists admin_communications_scope_idx on public.admin_communications (kind, status, audience_type, starts_at desc) where archived_at is null;
create index if not exists admin_communications_org_idx on public.admin_communications (organization_id, kind, status) where archived_at is null;
create index if not exists admin_communication_ack_profile_idx on public.admin_communication_acknowledgements (profile_id, acknowledged_at desc);
create index if not exists system_integrations_status_idx on public.system_integrations (status, last_checked_at desc);
create index if not exists automation_workflows_status_idx on public.automation_workflows (status, next_run_at);
create index if not exists admin_ai_status_idx on public.admin_ai_recommendations (status, category, created_at desc) where archived_at is null;

alter table public.admin_support_requests enable row level security;
alter table public.admin_support_events enable row level security;
alter table public.product_ideas enable row level security;
alter table public.product_idea_votes enable row level security;
alter table public.product_idea_comments enable row level security;
alter table public.admin_communications enable row level security;
alter table public.admin_communication_templates enable row level security;
alter table public.admin_communication_acknowledgements enable row level security;
alter table public.system_integrations enable row level security;
alter table public.automation_workflows enable row level security;
alter table public.admin_ai_recommendations enable row level security;

create policy admin_support_super_admin on public.admin_support_requests for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_support_create_own on public.admin_support_requests for insert to authenticated with check (
  requester_profile_id = auth.uid() and (organization_id is null or public.is_active_organization_member(organization_id))
);
create policy admin_support_read_own on public.admin_support_requests for select to authenticated using (requester_profile_id = auth.uid());
create policy admin_support_events_super_admin on public.admin_support_events for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy product_ideas_read on public.product_ideas for select to authenticated using (archived_at is null or public.is_super_admin());
create policy product_ideas_create on public.product_ideas for insert to authenticated with check (author_profile_id = auth.uid());
create policy product_ideas_admin on public.product_ideas for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy product_idea_votes_own on public.product_idea_votes for all to authenticated using (profile_id = auth.uid() or public.is_super_admin()) with check (profile_id = auth.uid() or public.is_super_admin());
create policy product_idea_comments_read on public.product_idea_comments for select to authenticated using (archived_at is null or public.is_super_admin());
create policy product_idea_comments_create on public.product_idea_comments for insert to authenticated with check (author_profile_id = auth.uid());
create policy admin_communications_admin on public.admin_communications for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_communications_portal_read on public.admin_communications for select to authenticated using (
  status = 'published' and archived_at is null and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) and (
    audience_type = 'all_users'
    or (organization_id is not null and public.is_active_organization_member(organization_id))
    or owner_profile_id = auth.uid()
    or (property_id is not null and exists (select 1 from public.biens b where b.id = property_id and public.is_active_organization_member(b.organization_id)))
    or (residence_id is not null and exists (select 1 from public.residences r where r.id = residence_id and public.is_active_organization_member(r.organization_id)))
    or (audience_type = 'all_agencies' and exists (
      select 1 from public.organization_members om join public.organizations o on o.id = om.organization_id
      where om.profile_id = auth.uid() and om.status = 'active' and om.archived_at is null and o.organization_type = 'agency'
    ))
    or (audience_type = 'all_owners' and exists (
      select 1 from public.organization_members om join public.member_role_assignments mra on mra.organization_member_id = om.id join public.roles ro on ro.id = mra.role_id
      where om.profile_id = auth.uid() and om.status = 'active' and om.archived_at is null and ro.key = 'proprietaire'
    ))
    or (audience_type = 'all_tenants' and exists (
      select 1 from public.organization_members om join public.member_role_assignments mra on mra.organization_member_id = om.id join public.roles ro on ro.id = mra.role_id
      where om.profile_id = auth.uid() and om.status = 'active' and om.archived_at is null and ro.key = 'locataire'
    ))
    or (audience_type = 'all_contractors' and exists (
      select 1 from public.organization_members om join public.member_role_assignments mra on mra.organization_member_id = om.id join public.roles ro on ro.id = mra.role_id
      where om.profile_id = auth.uid() and om.status = 'active' and om.archived_at is null and ro.key = 'artisan'
    ))
  )
);
create policy admin_communication_templates_admin on public.admin_communication_templates for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_communication_ack_own on public.admin_communication_acknowledgements for all to authenticated using (profile_id = auth.uid() or public.is_super_admin()) with check (profile_id = auth.uid() or public.is_super_admin());
create policy system_integrations_admin on public.system_integrations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy automation_workflows_admin on public.automation_workflows for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy admin_ai_recommendations_admin on public.admin_ai_recommendations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create trigger admin_support_updated_at before update on public.admin_support_requests for each row execute function public.set_updated_at();
create trigger product_ideas_updated_at before update on public.product_ideas for each row execute function public.set_updated_at();
create trigger admin_communications_updated_at before update on public.admin_communications for each row execute function public.set_updated_at();
create trigger admin_communication_templates_updated_at before update on public.admin_communication_templates for each row execute function public.set_updated_at();
create trigger system_integrations_updated_at before update on public.system_integrations for each row execute function public.set_updated_at();
create trigger automation_workflows_updated_at before update on public.automation_workflows for each row execute function public.set_updated_at();
create trigger admin_ai_recommendations_updated_at before update on public.admin_ai_recommendations for each row execute function public.set_updated_at();

create or replace function public.archive_stale_product_ideas()
returns integer language plpgsql security definer set search_path = public as $$
declare archived_count integer;
begin
  if not public.is_super_admin() and auth.role() <> 'service_role' then raise exception 'ACCESS_DENIED'; end if;
  update public.product_ideas
  set status = 'archived', archived_at = now(), updated_at = now()
  where status in ('refused','postponed') and archived_at is null and updated_at < date_trunc('month', now()) - interval '1 month';
  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

grant select, insert, update, delete on public.admin_support_requests, public.admin_support_events, public.product_ideas, public.product_idea_votes, public.product_idea_comments, public.admin_communications, public.admin_communication_templates, public.admin_communication_acknowledgements, public.system_integrations, public.automation_workflows, public.admin_ai_recommendations to authenticated, service_role;
grant execute on function public.archive_stale_product_ideas() to authenticated, service_role;
