-- GERIMMO V3 Sprint 10 - Business engine.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  billing_interval text not null,
  amount_cents integer,
  setup_fee_cents integer not null default 0,
  annual_fee_cents integer not null default 0,
  currency text not null default 'eur',
  trial_days integer not null default 14,
  stripe_product_id text unique,
  stripe_price_id text unique,
  is_active boolean not null default true,
  is_purchasable boolean not null default false,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint subscription_plans_interval_valid check (billing_interval in ('monthly', 'annual')),
  constraint subscription_plans_amount_positive check (amount_cents is null or amount_cents >= 0),
  constraint subscription_plans_trial_valid check (trial_days between 0 and 90),
  constraint subscription_plans_purchase_ready check (not is_purchasable or (amount_cents is not null and stripe_price_id is not null))
);

insert into public.subscription_plans (code, name, description, billing_interval, trial_days, features)
values
  ('gerimmo_monthly', 'GERIMMO Mensuel', 'Abonnement mensuel GERIMMO.', 'monthly', 14, '["maintenance","assistance","mises_a_jour","evolutions"]'::jsonb),
  ('gerimmo_annual', 'GERIMMO Annuel', 'Abonnement annuel GERIMMO.', 'annual', 14, '["maintenance","assistance","mises_a_jour_reglementaires","evolutions"]'::jsonb)
on conflict (code) do nothing;

create table if not exists public.promotion_codes (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  campaign text,
  discount_type text not null,
  discount_value integer not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  single_use_per_organization boolean not null default true,
  applicable_plan_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint promotion_codes_type_valid check (discount_type in ('percent', 'fixed', 'free_month')),
  constraint promotion_codes_value_valid check (discount_value > 0 and (discount_type <> 'percent' or discount_value <= 100)),
  constraint promotion_codes_limit_valid check (max_redemptions is null or max_redemptions > 0)
);

alter table public.organization_subscriptions drop constraint if exists organization_subscriptions_status_valid;
alter table public.organization_subscriptions add column if not exists plan_id uuid references public.subscription_plans(id) on delete restrict;
alter table public.organization_subscriptions add column if not exists billing_interval text;
alter table public.organization_subscriptions add column if not exists trial_started_at timestamptz;
alter table public.organization_subscriptions add column if not exists trial_ends_at timestamptz;
alter table public.organization_subscriptions add column if not exists current_period_start timestamptz;
alter table public.organization_subscriptions add column if not exists current_period_end timestamptz;
alter table public.organization_subscriptions add column if not exists cancelled_at timestamptz;
alter table public.organization_subscriptions add column if not exists suspension_reason text;
alter table public.organization_subscriptions add column if not exists stripe_customer_id text unique;
alter table public.organization_subscriptions add column if not exists stripe_subscription_id text unique;
alter table public.organization_subscriptions add column if not exists promotion_code_id uuid references public.promotion_codes(id) on delete set null;
alter table public.organization_subscriptions add column if not exists discount_percent integer;
alter table public.organization_subscriptions add column if not exists next_invoice_at timestamptz;
alter table public.organization_subscriptions add column if not exists metadata jsonb not null default '{}'::jsonb;
update public.organization_subscriptions set status = case status when 'past_due' then 'suspended' when 'archived' then 'cancelled' else status end;
alter table public.organization_subscriptions add constraint organization_subscriptions_status_valid check (status in ('trial', 'active', 'suspended', 'expired', 'cancelled'));
alter table public.organization_subscriptions add constraint organization_subscriptions_billing_interval_valid check (billing_interval is null or billing_interval in ('monthly', 'annual'));
alter table public.organization_subscriptions add constraint organization_subscriptions_trial_dates_valid check (trial_ends_at is null or trial_started_at is null or trial_ends_at > trial_started_at);

create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete restrict,
  previous_status text,
  next_status text not null,
  reason text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  source text not null default 'application',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_code_id uuid not null references public.promotion_codes(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid references public.organization_subscriptions(id) on delete restrict,
  discount_amount_cents integer,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (promotion_code_id, organization_id)
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid references public.organization_subscriptions(id) on delete restrict,
  number text not null unique,
  status text not null default 'draft',
  currency text not null default 'eur',
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  setup_fee_cents integer not null default 0,
  annual_fee_cents integer not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  stripe_invoice_id text unique,
  hosted_invoice_url text,
  invoice_pdf_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  constraint billing_invoices_status_valid check (status in ('draft', 'open', 'paid', 'void', 'uncollectible', 'refunded')),
  constraint billing_invoices_amounts_positive check (subtotal_cents >= 0 and discount_cents >= 0 and tax_cents >= 0 and total_cents >= 0 and amount_paid_cents >= 0)
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid references public.billing_invoices(id) on delete restrict,
  subscription_id uuid references public.organization_subscriptions(id) on delete restrict,
  status text not null,
  amount_cents integer not null,
  currency text not null default 'eur',
  stripe_payment_intent_id text unique,
  failure_code text,
  failure_message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_status_valid check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  constraint billing_payments_amount_positive check (amount_cents >= 0)
);

create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.billing_payments(id) on delete restrict,
  amount_cents integer not null,
  reason text,
  status text not null default 'pending',
  stripe_refund_id text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint billing_refunds_status_valid check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  constraint billing_refunds_amount_positive check (amount_cents > 0)
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint stripe_webhook_events_status_valid check (status in ('received', 'processing', 'processed', 'failed'))
);

create table if not exists public.onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  sort_order integer not null,
  action_url text,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.onboarding_steps (code, title, description, sort_order, action_url)
values
  ('account', 'Création du compte', 'Activez votre accès sécurisé.', 1, '/auth/v2/register'),
  ('plan', 'Choix de l’abonnement', 'Choisissez une facturation mensuelle ou annuelle.', 2, '/dashboard/abonnement'),
  ('organization', 'Création de l’organisation', 'Renseignez votre agence.', 3, '/dashboard/onboarding'),
  ('branding', 'Identité', 'Ajoutez votre logo et vos coordonnées.', 4, '/dashboard/parametres/telegram'),
  ('import', 'Import des biens', 'Importez votre patrimoine CSV ou Excel.', 5, '/dashboard/super-admin/imports'),
  ('users', 'Utilisateurs', 'Invitez votre équipe.', 6, '/dashboard/utilisateurs'),
  ('telegram', 'Telegram', 'Connectez le canal Telegram.', 7, '/dashboard/parametres/telegram'),
  ('first_login', 'Première connexion', 'Découvrez votre espace.', 8, '/dashboard/accueil'),
  ('tutorial', 'Tutoriel', 'Parcourez les fonctions essentielles.', 9, '/dashboard/onboarding'),
  ('operational', 'Plateforme opérationnelle', 'Votre agence est prête.', 10, '/dashboard/accueil')
on conflict (code) do update set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order, action_url = excluded.action_url;

create table if not exists public.organization_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  step_id uuid not null references public.onboarding_steps(id) on delete restrict,
  status text not null default 'pending',
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_onboarding_status_valid check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  unique (organization_id, step_id)
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  subject_template text not null,
  html_template text not null,
  text_template text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  template_code text not null references public.email_templates(code) on delete restrict,
  recipient_email citext not null,
  recipient_name text,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint business_email_outbox_status_valid check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'))
);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  constraint automation_events_status_valid check (status in ('pending', 'processing', 'processed', 'failed'))
);

create sequence if not exists public.billing_invoice_number_seq;

create or replace function public.start_organization_trial(target_organization_id uuid, target_plan_id uuid)
returns public.organization_subscriptions language plpgsql security definer set search_path = public as $$
declare result public.organization_subscriptions;
begin
  if not public.is_super_admin() and not public.has_organization_role(target_organization_id, array['administrateur_agence']) then raise exception 'ACCESS_DENIED'; end if;
  insert into public.organization_subscriptions (organization_id, plan_id, plan_key, billing_interval, status, trial_started_at, trial_ends_at, current_period_start, current_period_end)
  select target_organization_id, p.id, p.code, p.billing_interval, 'trial', now(), now() + make_interval(days => p.trial_days), now(), now() + make_interval(days => p.trial_days)
  from public.subscription_plans p where p.id = target_plan_id and p.is_active and p.archived_at is null
  on conflict (organization_id) do update set plan_id = excluded.plan_id, plan_key = excluded.plan_key, billing_interval = excluded.billing_interval, status = 'trial', trial_started_at = excluded.trial_started_at, trial_ends_at = excluded.trial_ends_at, current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, updated_at = now()
  returning * into result;
  insert into public.subscription_history (organization_id, subscription_id, next_status, reason, actor_profile_id) values (target_organization_id, result.id, 'trial', 'Essai gratuit de 14 jours démarré', auth.uid());
  insert into public.automation_events (organization_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key) values (target_organization_id, 'trial.started', 'subscription', result.id, jsonb_build_object('trial_ends_at', result.trial_ends_at), 'trial.started:' || result.id || ':' || extract(epoch from result.trial_started_at)::bigint);
  return result;
end;
$$;

create or replace function public.transition_subscription(target_subscription_id uuid, target_status text, transition_reason text, transition_source text default 'application')
returns public.organization_subscriptions language plpgsql security definer set search_path = public as $$
declare current_row public.organization_subscriptions; result public.organization_subscriptions;
begin
  select * into current_row from public.organization_subscriptions where id = target_subscription_id for update;
  if current_row.id is null then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if not public.is_super_admin() and not public.has_organization_role(current_row.organization_id, array['administrateur_agence']) then raise exception 'ACCESS_DENIED'; end if;
  if target_status not in ('trial','active','suspended','expired','cancelled') then raise exception 'INVALID_STATUS'; end if;
  update public.organization_subscriptions set status = target_status, suspension_reason = case when target_status = 'suspended' then transition_reason else null end, cancelled_at = case when target_status = 'cancelled' then now() else cancelled_at end, updated_at = now() where id = target_subscription_id returning * into result;
  insert into public.subscription_history (organization_id, subscription_id, previous_status, next_status, reason, actor_profile_id, source) values (result.organization_id, result.id, current_row.status, target_status, transition_reason, auth.uid(), transition_source);
  insert into public.automation_events (organization_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key) values (result.organization_id, 'subscription.' || target_status, 'subscription', result.id, jsonb_build_object('previous_status', current_row.status, 'reason', transition_reason), 'subscription:' || result.id || ':' || target_status || ':' || extract(epoch from now())::bigint);
  return result;
end;
$$;

create or replace function public.apply_promotion_code(target_subscription_id uuid, submitted_code text)
returns public.organization_subscriptions language plpgsql security definer set search_path = public as $$
declare subscription_row public.organization_subscriptions; promotion public.promotion_codes%rowtype; result public.organization_subscriptions;
begin
  select * into subscription_row from public.organization_subscriptions where id = target_subscription_id for update;
  if not public.is_super_admin() and not public.has_organization_role(subscription_row.organization_id, array['administrateur_agence']) then raise exception 'ACCESS_DENIED'; end if;
  select * into promotion from public.promotion_codes where code = submitted_code::citext and is_active and archived_at is null and starts_at <= now() and (expires_at is null or expires_at > now()) and (max_redemptions is null or redemption_count < max_redemptions) for update;
  if promotion.id is null then raise exception 'PROMOTION_INVALID'; end if;
  insert into public.promotion_redemptions (promotion_code_id, organization_id, subscription_id, redeemed_by) values (promotion.id, subscription_row.organization_id, subscription_row.id, auth.uid());
  update public.promotion_codes set redemption_count = redemption_count + 1, updated_at = now() where id = promotion.id;
  update public.organization_subscriptions set promotion_code_id = promotion.id, discount_percent = case when promotion.discount_type = 'percent' then promotion.discount_value else discount_percent end, current_period_end = case when promotion.discount_type = 'free_month' then coalesce(current_period_end, now()) + interval '1 month' else current_period_end end, updated_at = now() where id = subscription_row.id returning * into result;
  return result;
end;
$$;

create or replace function public.evaluate_subscription_lifecycle()
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer := 0;
begin
  with expired as (
    update public.organization_subscriptions set status = 'expired', updated_at = now()
    where status = 'trial' and trial_ends_at <= now() returning *
  ), history as (
    insert into public.subscription_history (organization_id, subscription_id, previous_status, next_status, reason, source)
    select organization_id, id, 'trial', 'expired', 'Fin automatique de la période d’essai', 'scheduler' from expired returning 1
  ) select count(*) into changed from history;
  return changed;
end;
$$;

create index if not exists subscription_history_subscription_created_idx on public.subscription_history (subscription_id, created_at desc);
create index if not exists billing_invoices_org_created_idx on public.billing_invoices (organization_id, created_at desc);
create index if not exists billing_payments_org_created_idx on public.billing_payments (organization_id, created_at desc);
create index if not exists onboarding_progress_org_status_idx on public.organization_onboarding_progress (organization_id, status);
create index if not exists email_outbox_status_scheduled_idx on public.business_email_outbox (status, scheduled_at) where archived_at is null;
create index if not exists automation_events_pending_idx on public.automation_events (status, available_at) where status in ('pending','failed');

alter table public.subscription_plans enable row level security;
alter table public.promotion_codes enable row level security;
alter table public.subscription_history enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.onboarding_steps enable row level security;
alter table public.organization_onboarding_progress enable row level security;
alter table public.email_templates enable row level security;
alter table public.business_email_outbox enable row level security;
alter table public.automation_events enable row level security;

create policy subscription_plans_read on public.subscription_plans for select to authenticated using (is_active and archived_at is null or public.is_super_admin());
create policy subscription_plans_admin on public.subscription_plans for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy promotion_codes_admin on public.promotion_codes for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy subscription_history_read on public.subscription_history for select to authenticated using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']));
create policy promotion_redemptions_read on public.promotion_redemptions for select to authenticated using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']));
create policy billing_invoices_read on public.billing_invoices for select to authenticated using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']));
create policy billing_payments_read on public.billing_payments for select to authenticated using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']));
create policy billing_refunds_admin on public.billing_refunds for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy stripe_webhook_events_admin on public.stripe_webhook_events for select to authenticated using (public.is_super_admin());
create policy onboarding_steps_read on public.onboarding_steps for select to authenticated using (true);
create policy onboarding_progress_read on public.organization_onboarding_progress for select to authenticated using (public.is_super_admin() or public.is_active_organization_member(organization_id));
create policy onboarding_progress_manage on public.organization_onboarding_progress for all to authenticated using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence'])) with check (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence']));
create policy email_templates_read on public.email_templates for select to authenticated using (is_active or public.is_super_admin());
create policy email_templates_admin on public.email_templates for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy business_email_outbox_read on public.business_email_outbox for select to authenticated using (public.is_super_admin() or (organization_id is not null and public.has_organization_role(organization_id, array['administrateur_agence'])));
create policy automation_events_admin on public.automation_events for select to authenticated using (public.is_super_admin());

create trigger subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();
create trigger promotion_codes_updated_at before update on public.promotion_codes for each row execute function public.set_updated_at();
create trigger billing_invoices_updated_at before update on public.billing_invoices for each row execute function public.set_updated_at();
create trigger billing_payments_updated_at before update on public.billing_payments for each row execute function public.set_updated_at();
create trigger onboarding_progress_updated_at before update on public.organization_onboarding_progress for each row execute function public.set_updated_at();
create trigger email_templates_updated_at before update on public.email_templates for each row execute function public.set_updated_at();
create trigger business_email_outbox_updated_at before update on public.business_email_outbox for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.subscription_plans, public.promotion_codes, public.subscription_history, public.promotion_redemptions, public.billing_invoices, public.billing_payments, public.billing_refunds, public.stripe_webhook_events, public.onboarding_steps, public.organization_onboarding_progress, public.email_templates, public.business_email_outbox, public.automation_events to authenticated, service_role;
grant execute on function public.start_organization_trial(uuid, uuid), public.transition_subscription(uuid, text, text, text), public.apply_promotion_code(uuid, text), public.evaluate_subscription_lifecycle() to authenticated, service_role;
