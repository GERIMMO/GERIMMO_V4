-- Registre des loyers (base du flux « loyer reçu ? → quittance / relance »).
-- Un enregistrement = un loyer attendu pour un bien + locataire + mois.
-- Qui gère le bien (donc qui confirme) = déduit du type d'organisation :
--   agency → agents/admins ; independent_owner → le propriétaire.

create table if not exists public.rent_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bien_id uuid not null references public.biens (id) on delete cascade,
  tenant_profile_id uuid references public.profiles (id) on delete set null,
  tenant_name text,
  period_month date not null,
  due_date date not null,
  amount_cents integer not null default 0,
  status text not null default 'attendu'
    check (status in ('attendu', 'recu', 'impaye', 'mise_en_demeure', 'annule')),
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  mise_en_demeure_at timestamptz,
  quittance_document_id uuid references public.documents (id) on delete set null,
  quittance_status text not null default 'aucune'
    check (quittance_status in ('aucune', 'a_valider', 'validee', 'envoyee')),
  quittance_validated_by uuid references public.profiles (id) on delete set null,
  quittance_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  constraint rent_periods_amount_positive check (amount_cents >= 0),
  constraint rent_periods_reminder_positive check (reminder_count >= 0),
  constraint rent_periods_unique unique (bien_id, tenant_profile_id, period_month)
);

create index if not exists rent_periods_org_status_idx
  on public.rent_periods (organization_id, status) where archived_at is null;
create index if not exists rent_periods_due_idx
  on public.rent_periods (due_date) where archived_at is null;
create index if not exists rent_periods_tenant_idx
  on public.rent_periods (tenant_profile_id) where archived_at is null;

-- Peut gérer les loyers d'un bien : super admin, gestionnaires d'incidents de l'org
-- (agence : admin + agent), ou propriétaire (rôle proprietaire dans l'org, ou occupant proprietaire du bien).
create or replace function public.can_manage_rent(target_organization_id uuid, target_bien_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
    or public.can_manage_incidents(target_organization_id)
    or public.has_organization_role(target_organization_id, array['proprietaire'])
    or coalesce((
      select true from public.bien_occupants bo
      where bo.bien_id = target_bien_id
        and bo.profile_id = auth.uid()
        and bo.occupant_type = 'proprietaire'
        and bo.archived_at is null
      limit 1
    ), false);
$$;

alter table public.rent_periods enable row level security;

-- Lecture : gestionnaires du bien + le locataire concerné (pour voir ses quittances).
create policy rent_periods_select_policy on public.rent_periods
  for select using (
    public.can_manage_rent(organization_id, bien_id)
    or tenant_profile_id = auth.uid()
  );

create policy rent_periods_insert_policy on public.rent_periods
  for insert with check (public.can_manage_rent(organization_id, bien_id));
create policy rent_periods_update_policy on public.rent_periods
  for update using (public.can_manage_rent(organization_id, bien_id))
  with check (public.can_manage_rent(organization_id, bien_id));
create policy rent_periods_delete_policy on public.rent_periods
  for delete using (public.is_super_admin());
