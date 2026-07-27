-- GERIMMO V3 Sprint 10 - Business access for independent owners.

drop policy if exists organization_subscriptions_select on public.organization_subscriptions;
create policy organization_subscriptions_select on public.organization_subscriptions for select to authenticated
using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']));

drop policy if exists subscription_history_read on public.subscription_history;
create policy subscription_history_read on public.subscription_history for select to authenticated
using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']));

drop policy if exists promotion_redemptions_read on public.promotion_redemptions;
create policy promotion_redemptions_read on public.promotion_redemptions for select to authenticated
using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']));

drop policy if exists billing_invoices_read on public.billing_invoices;
create policy billing_invoices_read on public.billing_invoices for select to authenticated
using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']));

drop policy if exists billing_payments_read on public.billing_payments;
create policy billing_payments_read on public.billing_payments for select to authenticated
using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']));

drop policy if exists onboarding_progress_manage on public.organization_onboarding_progress;
create policy onboarding_progress_manage on public.organization_onboarding_progress for all to authenticated
using (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']))
with check (public.is_super_admin() or public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire']));

drop policy if exists business_email_outbox_read on public.business_email_outbox;
create policy business_email_outbox_read on public.business_email_outbox for select to authenticated
using (public.is_super_admin() or (organization_id is not null and public.has_organization_role(organization_id, array['administrateur_agence', 'proprietaire'])));
