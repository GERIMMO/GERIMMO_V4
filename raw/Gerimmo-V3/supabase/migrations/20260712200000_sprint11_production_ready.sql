-- GERIMMO V3 Sprint 11 - Quality, observability, recovery and privacy foundations.

create table if not exists public.quality_reports (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('QUAL-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  organization_id uuid references public.organizations(id) on delete restrict,
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  screen_path text,
  api_path text,
  browser_info jsonb not null default '{}'::jsonb,
  device_info jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint quality_reports_priority_valid check (priority in ('low','normal','high','critical')),
  constraint quality_reports_status_valid check (status in ('new','analyzing','awaiting_approval','approved','resolved','rejected','archived'))
);

create table if not exists public.quality_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.quality_reports(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint quality_attachment_size_valid check (size_bytes > 0 and size_bytes <= 52428800),
  constraint quality_attachment_type_valid check (mime_type in ('image/png','image/jpeg','image/webp','video/mp4','video/webm'))
);

create table if not exists public.observability_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  quality_report_id uuid references public.quality_reports(id) on delete set null,
  correlation_id uuid not null,
  source text not null,
  event_type text not null,
  severity text not null default 'info',
  module text,
  screen_path text,
  api_path text,
  duration_ms integer,
  status_code integer,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  fingerprint text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint observability_source_valid check (source in ('browser','api','supabase','n8n','telegram','storage','build','system')),
  constraint observability_severity_valid check (severity in ('info','warning','error','critical'))
);

create table if not exists public.quality_analyses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.quality_reports(id) on delete restrict,
  probable_cause text not null,
  severity text not null,
  affected_modules text[] not null default '{}',
  affected_files text[] not null default '{}',
  affected_workflows text[] not null default '{}',
  impacted_users_estimate integer not null default 1,
  business_impact text not null,
  security_impact text not null,
  performance_impact text not null,
  confidence_percent integer not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'rules_engine',
  constraint quality_analysis_severity_valid check (severity in ('low','medium','high','critical')),
  constraint quality_analysis_confidence_valid check (confidence_percent between 0 and 100)
);

create table if not exists public.correction_proposals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.quality_reports(id) on delete restrict,
  problem text not null,
  cause text not null,
  why text not null,
  modified_files text[] not null default '{}',
  impacted_tables text[] not null default '{}',
  impacted_workflows text[] not null default '{}',
  impacted_users text not null,
  risks text not null,
  changes text not null,
  unchanged text not null,
  positive_outcomes text not null,
  estimated_minutes integer,
  planned_tests text[] not null default '{}',
  rollback_plan text not null,
  git_backup_plan text not null,
  requires_human_approval boolean not null default true,
  sensitive_areas text[] not null default '{}',
  status text not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint correction_proposal_status_valid check (status in ('draft','awaiting_approval','approved','rejected','applied','rolled_back'))
);

create table if not exists public.monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  alert_type text not null,
  severity text not null,
  title text not null,
  message text not null,
  source text not null,
  fingerprint text not null,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open',
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (fingerprint, status),
  constraint monitoring_alert_severity_valid check (severity in ('info','warning','error','critical')),
  constraint monitoring_alert_status_valid check (status in ('open','acknowledged','resolved','ignored'))
);

create table if not exists public.backup_registry (
  id uuid primary key default gen_random_uuid(),
  backup_type text not null,
  provider text not null default 'supabase',
  status text not null default 'scheduled',
  started_at timestamptz,
  completed_at timestamptz,
  retention_until timestamptz,
  checksum text,
  size_bytes bigint,
  restore_tested_at timestamptz,
  restore_test_result text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint backup_type_valid check (backup_type in ('daily','weekly','manual','restore_test')),
  constraint backup_status_valid check (status in ('scheduled','running','completed','failed','expired'))
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('RGPD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  organization_id uuid references public.organizations(id) on delete restrict,
  subject_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  request_type text not null,
  legal_basis text,
  status text not null default 'requested',
  due_at timestamptz not null default (now() + interval '30 days'),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  export_storage_path text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_request_type_valid check (request_type in ('export','anonymization','deletion','retention_review')),
  constraint privacy_request_status_valid check (status in ('requested','reviewing','approved','rejected','processing','completed'))
);

create table if not exists public.privacy_audit_logs (
  id uuid primary key default gen_random_uuid(),
  privacy_request_id uuid not null references public.privacy_requests(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quality_reports_status_priority_idx on public.quality_reports (status, priority, created_at desc);
create index if not exists quality_reports_organization_idx on public.quality_reports (organization_id, created_at desc);
create index if not exists observability_events_correlation_idx on public.observability_events (correlation_id, occurred_at);
create index if not exists observability_events_source_severity_idx on public.observability_events (source, severity, occurred_at desc);
create index if not exists observability_events_fingerprint_idx on public.observability_events (fingerprint, occurred_at desc) where fingerprint is not null;
create index if not exists monitoring_alerts_status_idx on public.monitoring_alerts (status, severity, last_seen_at desc);
create index if not exists privacy_requests_status_due_idx on public.privacy_requests (status, due_at);

alter table public.quality_reports enable row level security;
alter table public.quality_attachments enable row level security;
alter table public.observability_events enable row level security;
alter table public.quality_analyses enable row level security;
alter table public.correction_proposals enable row level security;
alter table public.monitoring_alerts enable row level security;
alter table public.backup_registry enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.privacy_audit_logs enable row level security;

create policy quality_reports_insert_own on public.quality_reports for insert to authenticated with check (reporter_profile_id = auth.uid() and (organization_id is null or public.is_active_organization_member(organization_id)));
create policy quality_reports_read on public.quality_reports for select to authenticated using (public.is_super_admin() or reporter_profile_id = auth.uid());
create policy quality_attachments_insert_own on public.quality_attachments for insert to authenticated with check (uploaded_by = auth.uid() and exists (select 1 from public.quality_reports q where q.id = report_id and (q.reporter_profile_id = auth.uid() or public.is_super_admin())));
create policy quality_attachments_read on public.quality_attachments for select to authenticated using (public.is_super_admin() or uploaded_by = auth.uid());
create policy observability_events_insert on public.observability_events for insert to authenticated with check (profile_id = auth.uid() or profile_id is null);
create policy observability_events_super_admin on public.observability_events for select to authenticated using (public.is_super_admin());
create policy quality_analyses_super_admin on public.quality_analyses for select to authenticated using (public.is_super_admin());
create policy correction_proposals_super_admin on public.correction_proposals for select to authenticated using (public.is_super_admin());
create policy monitoring_alerts_super_admin on public.monitoring_alerts for select to authenticated using (public.is_super_admin());
create policy backup_registry_super_admin on public.backup_registry for select to authenticated using (public.is_super_admin());
create policy privacy_requests_read on public.privacy_requests for select to authenticated using (public.is_super_admin() or subject_profile_id = auth.uid() or requested_by = auth.uid());
create policy privacy_requests_insert on public.privacy_requests for insert to authenticated with check (requested_by = auth.uid() and subject_profile_id = auth.uid());
create policy privacy_audit_super_admin on public.privacy_audit_logs for select to authenticated using (public.is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quality-attachments', 'quality-attachments', false, 52428800, array['image/png','image/jpeg','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy quality_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'quality-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy quality_storage_read on storage.objects for select to authenticated using (bucket_id = 'quality-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

create trigger quality_reports_updated_at before update on public.quality_reports for each row execute function public.set_updated_at();
create trigger correction_proposals_updated_at before update on public.correction_proposals for each row execute function public.set_updated_at();
create trigger privacy_requests_updated_at before update on public.privacy_requests for each row execute function public.set_updated_at();
