-- Calendrier et résultats de l'Agent marketing Gerimmo.
-- Les données commerciales globales sont réservées au super administrateur.

create table if not exists public.marketing_campagnes (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(btrim(nom)) between 3 and 160),
  description text,
  canal text not null default 'facebook' check (canal in ('facebook', 'instagram', 'autre')),
  nature text not null default 'organique' check (nature in ('organique', 'sponsorisee')),
  objectif text not null default 'notoriete' check (objectif in ('notoriete', 'trafic', 'prospects', 'conversion')),
  statut text not null default 'planifiee' check (statut in ('idee', 'planifiee', 'active', 'terminee', 'annulee')),
  publication_prevue_le timestamptz,
  debut_le timestamptz,
  fin_le timestamptz,
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  meta_campaign_id text,
  meta_ad_id text,
  cree_par uuid references auth.users(id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (fin_le is null or debut_le is null or fin_le >= debut_le)
);

create table if not exists public.marketing_mesures (
  id bigint generated always as identity primary key,
  campagne_id uuid references public.marketing_campagnes(id) on delete cascade,
  meta_ad_id text,
  portee integer not null default 0 check (portee >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  clics integer not null default 0 check (clics >= 0),
  depense_cents integer not null default 0 check (depense_cents >= 0),
  prospects integer not null default 0 check (prospects >= 0),
  mesure_le timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists marketing_campagnes_statut_date_idx
  on public.marketing_campagnes (statut, publication_prevue_le);
create index if not exists marketing_campagnes_meta_id_idx
  on public.marketing_campagnes (meta_campaign_id) where meta_campaign_id is not null;
create index if not exists marketing_mesures_campagne_date_idx
  on public.marketing_mesures (campagne_id, mesure_le desc);
create index if not exists marketing_mesures_meta_date_idx
  on public.marketing_mesures (meta_ad_id, mesure_le desc) where meta_ad_id is not null;

alter table public.marketing_campagnes enable row level security;
alter table public.marketing_mesures enable row level security;

drop policy if exists marketing_campagnes_super_admin on public.marketing_campagnes;
create policy marketing_campagnes_super_admin on public.marketing_campagnes
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists marketing_mesures_super_admin on public.marketing_mesures;
create policy marketing_mesures_super_admin on public.marketing_mesures
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.marketing_campagnes is
  'Calendrier marketing de Gerimmo ; une ligne planifiée ne déclenche jamais seule une dépense Meta.';
comment on table public.marketing_mesures is
  'Photographies horodatées des résultats publicitaires, pour suivre leur évolution sans écraser l historique.';
