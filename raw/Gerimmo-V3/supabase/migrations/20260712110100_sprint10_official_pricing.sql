-- GERIMMO V3 Sprint 10 - Official pricing grid.

alter table public.subscription_plans add column if not exists audience text not null default 'agency';
alter table public.subscription_plans add column if not exists min_properties integer not null default 1;
alter table public.subscription_plans add column if not exists max_properties integer;
alter table public.subscription_plans add column if not exists requires_quote boolean not null default false;
alter table public.subscription_plans drop constraint if exists subscription_plans_audience_valid;
alter table public.subscription_plans add constraint subscription_plans_audience_valid check (audience in ('owner', 'agency'));
alter table public.subscription_plans add constraint subscription_plans_property_range_valid check (min_properties > 0 and (max_properties is null or max_properties >= min_properties));
alter table public.subscription_plans drop constraint if exists subscription_plans_purchase_ready;
alter table public.subscription_plans add constraint subscription_plans_purchase_ready check (not is_purchasable or (amount_cents is not null and stripe_price_id is not null and not requires_quote));

update public.subscription_plans set is_active = false, archived_at = coalesce(archived_at, now()) where code in ('gerimmo_monthly', 'gerimmo_annual');

insert into public.subscription_plans (code, name, description, billing_interval, amount_cents, setup_fee_cents, annual_fee_cents, trial_days, audience, min_properties, max_properties, requires_quote, features)
values
  ('owner_1_5', 'Propriétaire 1 à 5 biens', 'Pour les propriétaires bailleurs indépendants.', 'monthly', 1900, 4900, 7900, 14, 'owner', 1, 5, false, '["plateforme_complete","assistance","maintenance"]'),
  ('owner_6_20', 'Propriétaire 6 à 20 biens', 'Pour les patrimoines en croissance.', 'monthly', 3900, 4900, 7900, 14, 'owner', 6, 20, false, '["plateforme_complete","assistance","maintenance"]'),
  ('owner_21_50', 'Propriétaire 21 à 50 biens', 'Pour les patrimoines importants.', 'monthly', 6900, 9900, 14900, 14, 'owner', 21, 50, false, '["plateforme_complete","assistance_prioritaire","maintenance"]'),
  ('agency_1_50', 'Agence 1 à 50 biens', 'Première offre professionnelle agence.', 'monthly', 7900, 19900, 19900, 14, 'agency', 1, 50, false, '["multi_utilisateurs","personnalisation","plateforme_complete"]'),
  ('agency_51_150', 'Agence 51 à 150 biens', 'Pour les agences établies.', 'monthly', 14900, 39900, 19900, 14, 'agency', 51, 150, false, '["multi_utilisateurs","personnalisation","support_prioritaire"]'),
  ('agency_151_300', 'Agence 151 à 300 biens', 'Pour les portefeuilles étendus.', 'monthly', 24900, 39900, 39900, 14, 'agency', 151, 300, false, '["multi_utilisateurs","personnalisation","support_prioritaire"]'),
  ('agency_301_600', 'Agence 301 à 600 biens', 'Accompagnement de mise en place sur devis.', 'monthly', 39900, 0, 39900, 14, 'agency', 301, 600, true, '["accompagnement","support_prioritaire","plateforme_complete"]'),
  ('agency_600_plus', 'Agence plus de 600 biens', 'Offre nationale sur mesure.', 'monthly', null, 0, 0, 14, 'agency', 601, null, true, '["offre_sur_mesure","accompagnement","support_dedie"]')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  amount_cents = excluded.amount_cents,
  setup_fee_cents = excluded.setup_fee_cents,
  annual_fee_cents = excluded.annual_fee_cents,
  audience = excluded.audience,
  min_properties = excluded.min_properties,
  max_properties = excluded.max_properties,
  requires_quote = excluded.requires_quote,
  features = excluded.features,
  is_active = true,
  archived_at = null;

create or replace function public.evaluate_subscription_lifecycle()
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer := 0;
begin
  with suspended as (
    update public.organization_subscriptions
    set status = 'suspended', suspension_reason = 'Essai terminé sans abonnement actif', updated_at = now()
    where status = 'trial' and trial_ends_at <= now()
    returning *
  ), history as (
    insert into public.subscription_history (organization_id, subscription_id, previous_status, next_status, reason, source)
    select organization_id, id, 'trial', 'suspended', 'Fin automatique de la période d’essai', 'scheduler' from suspended returning 1
  ), events as (
    insert into public.automation_events (organization_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key)
    select organization_id, 'trial.expired', 'subscription', id, jsonb_build_object('suspended', true), 'trial.expired:' || id
    from suspended on conflict (idempotency_key) do nothing returning 1
  ) select count(*) into changed from history;
  return changed;
end;
$$;
