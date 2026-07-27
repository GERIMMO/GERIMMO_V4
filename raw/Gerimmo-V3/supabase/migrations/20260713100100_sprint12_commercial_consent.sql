-- GERIMMO V3 Sprint 12 - Explicit commercial consent.

alter table public.commercial_leads add column if not exists marketing_consent boolean not null default false;
alter table public.commercial_leads add column if not exists consented_at timestamptz;
alter table public.commercial_leads add constraint commercial_leads_consent_valid
check ((marketing_consent and consented_at is not null) or (not marketing_consent));
