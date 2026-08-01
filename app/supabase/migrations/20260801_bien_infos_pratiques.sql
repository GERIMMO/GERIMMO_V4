-- Informations pratiques du logement/immeuble (feature 2026-08-01, hors référentiel V3) :
-- consignes destinées au locataire (sortie poubelles, gardien, travaux copro…).
-- Éditées par les gérants ; la lecture par le locataire sera ajoutée avec l'espace LO.
create table public.bien_infos_pratiques (
  bien_id uuid primary key references public.biens (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  sortie_poubelles text,
  local_poubelles text,
  gardien text,
  travaux text,
  stationnement text,
  autres text,
  updated_at timestamptz not null default now()
);
alter table public.bien_infos_pratiques enable row level security;

create policy bip_select on public.bien_infos_pratiques for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy bip_insert on public.bien_infos_pratiques for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy bip_update on public.bien_infos_pratiques for update
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
