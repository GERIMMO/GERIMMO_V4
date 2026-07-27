-- GERIMMO V3 Sprint 12 - Commercial acquisition and marketing analytics.

create table if not exists public.commercial_leads (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  full_name text not null,
  company text not null,
  properties_count integer not null,
  request_type text not null,
  message text,
  source text not null default 'website',
  status text not null default 'new',
  converted_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint commercial_leads_request_valid check (request_type in ('demo','appointment','contact','quote','callback')),
  constraint commercial_leads_status_valid check (status in ('new','contacted','qualified','trial','converted','lost','archived')),
  constraint commercial_leads_properties_positive check (properties_count > 0)
);

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.commercial_leads(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  event_type text not null,
  source text not null default 'website',
  campaign text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists commercial_leads_status_created_idx on public.commercial_leads (status, created_at desc) where archived_at is null;
create index if not exists commercial_leads_email_idx on public.commercial_leads (email, created_at desc);
create index if not exists marketing_events_type_date_idx on public.marketing_events (event_type, occurred_at desc);
alter table public.commercial_leads enable row level security;
alter table public.marketing_events enable row level security;
create policy commercial_leads_super_admin on public.commercial_leads for select to authenticated using (public.is_super_admin());
create policy marketing_events_super_admin on public.marketing_events for select to authenticated using (public.is_super_admin());
create trigger commercial_leads_updated_at before update on public.commercial_leads for each row execute function public.set_updated_at();
