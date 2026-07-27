-- Validation des artisans par le super admin.
-- La navigation /admin/contractor-validation existait déjà en placeholder ; cette
-- migration matérialise le vrai statut de validation (contrôle des justificatifs
-- légaux avant activation). Un artisan = organization_members.member_type='contractor'.
-- La validation est GLOBALE (au niveau de la personne), pas par organisation.

create table if not exists public.artisan_validations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'en_attente' check (status in ('en_attente', 'valide', 'refuse')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  constraint artisan_validations_profile_unique unique (profile_id)
);

create index if not exists artisan_validations_status_idx
  on public.artisan_validations (status) where archived_at is null;

alter table public.artisan_validations enable row level security;

-- Lecture : super admin (tout), l'artisan lui-même (son statut), et les gestionnaires
-- d'une organisation dont l'artisan est membre (pour afficher le badge côté agence).
create policy artisan_validations_select_policy on public.artisan_validations
  for select using (
    public.is_super_admin()
    or profile_id = auth.uid()
    or exists (
      select 1
      from public.organization_members om
      where om.profile_id = artisan_validations.profile_id
        and om.archived_at is null
        and public.can_manage_users(om.organization_id)
    )
  );

-- Écriture (validation/refus) : super admin uniquement.
create policy artisan_validations_insert_policy on public.artisan_validations
  for insert with check (public.is_super_admin());
create policy artisan_validations_update_policy on public.artisan_validations
  for update using (public.is_super_admin()) with check (public.is_super_admin());
create policy artisan_validations_delete_policy on public.artisan_validations
  for delete using (public.is_super_admin());
