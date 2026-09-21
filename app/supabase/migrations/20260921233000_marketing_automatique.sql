-- Pilotage autonome du marketing : deux prises de parole par semaine, pause
-- immédiate et plafond publicitaire mensuel. Une seule ligne de réglages
-- gouverne la plateforme ; seul le super administrateur la modifie.

create table if not exists public.marketing_reglages (
  singleton boolean primary key default true check (singleton),
  actif boolean not null default true,
  publication_automatique boolean not null default true,
  publicite_active boolean not null default true,
  publications_semaine smallint not null default 2 check (publications_semaine between 1 and 5),
  jours_semaine smallint[] not null default array[2,5]::smallint[],
  heure_paris smallint not null default 9 check (heure_paris between 0 and 23),
  budget_mensuel_cents integer not null default 1000 check (budget_mensuel_cents between 0 and 100000),
  modifie_par uuid references auth.users(id) on delete set null,
  modifie_le timestamptz not null default now(),
  check (cardinality(jours_semaine) = publications_semaine),
  check (0 < all(jours_semaine) and 7 >= all(jours_semaine))
);

insert into public.marketing_reglages
  (singleton, actif, publication_automatique, publicite_active, publications_semaine, jours_semaine, heure_paris, budget_mensuel_cents)
values (true, true, true, true, 2, array[2,5]::smallint[], 9, 1000)
on conflict (singleton) do update set
  actif = true,
  publication_automatique = true,
  publicite_active = true,
  publications_semaine = 2,
  jours_semaine = array[2,5]::smallint[],
  budget_mensuel_cents = 1000,
  modifie_le = now();

alter table public.marketing_campagnes
  add column if not exists publication_id uuid references public.publications(id) on delete set null;
create unique index if not exists marketing_campagnes_publication_unique
  on public.marketing_campagnes(publication_id) where publication_id is not null;

alter table public.marketing_reglages enable row level security;
drop policy if exists marketing_reglages_super_admin on public.marketing_reglages;
create policy marketing_reglages_super_admin on public.marketing_reglages
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Fermer explicitement les tables marketing : la RLS reste la deuxième barrière.
revoke all on public.marketing_reglages, public.marketing_campagnes, public.marketing_mesures from anon, authenticated;
grant select, update on public.marketing_reglages to authenticated;
grant select, insert, update, delete on public.marketing_campagnes to authenticated;
grant select, insert, update, delete on public.marketing_mesures to authenticated;

comment on table public.marketing_reglages is
  'Interrupteurs et plafond mensuel de l Agent marketing. Le plafond est un maximum absolu, jamais une cible à dépasser.';
