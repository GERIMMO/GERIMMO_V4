-- GERIMMO V3 Sprint 9 - Administration nationale et intelligence metier explicable.

alter table public.organizations
  add column if not exists organization_type text not null default 'agency';
alter table public.organizations drop constraint if exists organizations_type_valid;
alter table public.organizations add constraint organizations_type_valid
  check (organization_type in ('agency', 'independent_owner', 'internal'));
create index if not exists organizations_type_status_idx
  on public.organizations (organization_type, status) where archived_at is null;

alter table public.organization_branding add column if not exists legal_name text;
alter table public.organization_branding add column if not exists address_line1 text;
alter table public.organization_branding add column if not exists postal_code text;
alter table public.organization_branding add column if not exists city text;
alter table public.organization_branding add column if not exists primary_color text;
alter table public.organization_branding add column if not exists official_signature text;
alter table public.organization_branding add column if not exists official_document_ids uuid[] not null default '{}';

create table if not exists public.admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_profile_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_impersonation_reason_not_empty check (length(trim(reason)) >= 5)
);
create index if not exists admin_impersonation_active_idx
  on public.admin_impersonation_sessions (super_admin_profile_id, started_at desc) where ended_at is null;

create table if not exists public.data_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null,
  file_type text not null,
  status text not null default 'draft',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  processed_rows integer not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint data_import_jobs_file_type_valid check (file_type in ('csv', 'xlsx')),
  constraint data_import_jobs_status_valid check (status in ('draft', 'validated', 'processing', 'partial', 'completed', 'failed', 'archived'))
);

create table if not exists public.data_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.data_import_jobs(id) on delete restrict,
  row_number integer not null,
  entity_type text not null,
  source_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  errors jsonb not null default '[]'::jsonb,
  duplicate_key text,
  result_record_id uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint data_import_rows_entity_valid check (entity_type in ('agency', 'owner', 'property', 'tenant')),
  constraint data_import_rows_status_valid check (status in ('pending', 'valid', 'duplicate', 'error', 'imported')),
  constraint data_import_rows_number_positive check (row_number > 0),
  unique (import_job_id, row_number)
);
create index if not exists data_import_jobs_created_idx on public.data_import_jobs (created_at desc);
create index if not exists data_import_rows_job_status_idx on public.data_import_rows (import_job_id, status, row_number);
create index if not exists data_import_rows_duplicate_idx on public.data_import_rows (duplicate_key) where duplicate_key is not null;

create table if not exists public.cms_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text not null,
  content text not null,
  article_type text not null default 'article',
  status text not null default 'draft',
  audience text not null default 'all',
  published_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint cms_articles_title_not_empty check (length(trim(title)) > 0),
  constraint cms_articles_type_valid check (article_type in ('article', 'news', 'maintenance', 'release')),
  constraint cms_articles_status_valid check (status in ('draft', 'published', 'archived')),
  constraint cms_articles_audience_valid check (audience in ('all', 'agencies', 'independent_owners'))
);
create index if not exists cms_articles_status_published_idx on public.cms_articles (status, published_at desc);
create index if not exists cms_articles_search_idx on public.cms_articles using gin (to_tsvector('french', title || ' ' || summary));

create table if not exists public.business_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  recommendation_type text not null,
  severity text not null default 'info',
  title text not null,
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  target_type text not null,
  target_id uuid,
  action_url text,
  status text not null default 'active',
  generated_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint business_recommendations_type_valid check (recommendation_type in ('document_expiring', 'incident_blocked', 'artisan_high_rating', 'quote_outlier', 'recurring_incidents', 'inactive_user')),
  constraint business_recommendations_severity_valid check (severity in ('info', 'attention', 'urgent')),
  constraint business_recommendations_status_valid check (status in ('active', 'accepted', 'dismissed', 'archived'))
);
create unique index if not exists business_recommendations_active_target_idx
  on public.business_recommendations (organization_id, recommendation_type, target_type, target_id)
  where status = 'active' and archived_at is null;
create index if not exists business_recommendations_org_status_idx
  on public.business_recommendations (organization_id, status, severity, generated_at desc);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  plan_key text not null default 'foundation',
  status text not null default 'trial',
  started_at timestamptz not null default now(),
  renews_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint organization_subscriptions_status_valid check (status in ('trial', 'active', 'past_due', 'suspended', 'archived'))
);
create index if not exists organization_subscriptions_status_idx on public.organization_subscriptions (status, renews_at);

create or replace function public.log_sprint9_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (organization_id, actor_profile_id, action, table_name, record_id, old_values, new_values)
  values (
    nullif(row_data ->> 'organization_id', '')::uuid,
    auth.uid(),
    tg_op,
    tg_table_name,
    nullif(row_data ->> 'id', '')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.refresh_business_recommendations(target_organization_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  generated_count integer := 0;
  added_count integer := 0;
begin
  if not public.is_super_admin() and (target_organization_id is null or not public.is_active_organization_member(target_organization_id)) then
    raise exception 'ACCESS_DENIED';
  end if;

  insert into public.business_recommendations (organization_id, recommendation_type, severity, title, explanation, evidence, target_type, target_id, action_url)
  select d.organization_id, 'document_expiring', 'attention', 'Document bientôt expiré',
    'La date d’expiration intervient dans moins de 30 jours.', jsonb_build_object('expires_at', d.expires_at),
    'document', d.id, '/dashboard/documents'
  from public.documents d
  where d.archived_at is null and d.expires_at between now() and now() + interval '30 days'
    and (target_organization_id is null or d.organization_id = target_organization_id)
  on conflict do nothing;
  get diagnostics generated_count = row_count;

  insert into public.business_recommendations (organization_id, recommendation_type, severity, title, explanation, evidence, target_type, target_id, action_url)
  select i.organization_id, 'incident_blocked', case when i.priority = 'urgente' then 'urgent' else 'attention' end,
    'Incident sans progression', 'Aucune modification depuis plus de 7 jours alors que le dossier reste ouvert.',
    jsonb_build_object('number', i.number, 'updated_at', i.updated_at), 'incident', i.id, '/dashboard/incidents/dossier'
  from public.incidents i
  where i.archived_at is null and i.status not in ('cloture', 'archive') and i.updated_at < now() - interval '7 days'
    and (target_organization_id is null or i.organization_id = target_organization_id)
  on conflict do nothing;
  get diagnostics added_count = row_count;
  generated_count := generated_count + added_count;
  return generated_count;
end;
$$;

alter table public.admin_impersonation_sessions enable row level security;
alter table public.data_import_jobs enable row level security;
alter table public.data_import_rows enable row level security;
alter table public.cms_articles enable row level security;
alter table public.business_recommendations enable row level security;
alter table public.organization_subscriptions enable row level security;

create policy admin_impersonation_super_admin on public.admin_impersonation_sessions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy data_import_jobs_super_admin on public.data_import_jobs for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy data_import_rows_super_admin on public.data_import_rows for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy cms_articles_select on public.cms_articles for select to authenticated using (public.is_super_admin() or (status = 'published' and archived_at is null));
create policy cms_articles_manage on public.cms_articles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy business_recommendations_select on public.business_recommendations for select to authenticated using (public.is_super_admin() or (organization_id is not null and public.is_active_organization_member(organization_id)));
create policy business_recommendations_manage on public.business_recommendations for update to authenticated using (public.is_super_admin() or (organization_id is not null and public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier']))) with check (public.is_super_admin() or (organization_id is not null and public.has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier'])));
create policy organization_subscriptions_select on public.organization_subscriptions for select to authenticated using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']));
create policy organization_subscriptions_manage on public.organization_subscriptions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create trigger data_import_jobs_updated_at before update on public.data_import_jobs for each row execute function public.set_updated_at();
create trigger cms_articles_updated_at before update on public.cms_articles for each row execute function public.set_updated_at();
create trigger organization_subscriptions_updated_at before update on public.organization_subscriptions for each row execute function public.set_updated_at();
create trigger admin_impersonation_audit after insert or update on public.admin_impersonation_sessions for each row execute function public.log_sprint9_changes();
create trigger data_import_jobs_audit after insert or update on public.data_import_jobs for each row execute function public.log_sprint9_changes();
create trigger cms_articles_audit after insert or update on public.cms_articles for each row execute function public.log_sprint9_changes();
create trigger business_recommendations_audit after insert or update on public.business_recommendations for each row execute function public.log_sprint9_changes();

grant select, insert, update, delete on public.admin_impersonation_sessions, public.data_import_jobs, public.data_import_rows, public.cms_articles, public.business_recommendations, public.organization_subscriptions to authenticated, service_role;
grant execute on function public.refresh_business_recommendations(uuid) to authenticated, service_role;
