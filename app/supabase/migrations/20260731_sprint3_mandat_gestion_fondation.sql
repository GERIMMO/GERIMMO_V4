-- Sprint 3 (incrément 1) — Mandat de gestion : fondation
-- Source : wiki/concepts/Mandat de gestion (module 5).
-- Le mandat lie un propriétaire (mandant) à l'agence sur des LOTS (jamais des
-- biens, RM-5.1.1) ; chaque ligne couvre un lot avec son propre taux (RM-5.1.4).
-- Règles appliquées ici :
--   - seuls les lots dont le mandant est propriétaire sont intégrables (RM-5.1.1) ;
--   - un lot n'a qu'un mandat actif à la fois (RM-5.1.3) ;
--   - 3 paramètres : taux/lot (défaut 7 %), date de rapport (défaut le 10),
--     seuil de délégation (null = défaut agence 500 €, surchargeable).

create type public.mandat_etat as enum
  ('brouillon', 'a_signer', 'actif', 'preavis', 'resilie');

create table public.mandats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  person_id uuid not null,                        -- le mandant (propriétaire)
  etat public.mandat_etat not null default 'brouillon',
  date_rapport smallint not null default 10 check (date_rapport between 1 and 28),
  seuil_delegation numeric(10, 2) check (seuil_delegation is null or seuil_delegation >= 0),
  duree_mois smallint not null default 12 check (duree_mois between 1 and 120),
  preavis_mois smallint not null default 3 check (preavis_mois >= 0),
  date_debut date,
  date_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.accounts (id),
  constraint mandats_id_org_unique unique (id, organization_id),
  constraint mandats_person_meme_org_fk
    foreign key (person_id, organization_id)
    references public.persons (id, organization_id)
);

create table public.mandat_lignes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  mandat_id uuid not null,
  lot_id uuid not null,
  taux_honoraires numeric(5, 2) not null default 7.0
    check (taux_honoraires >= 0 and taux_honoraires <= 100),
  date_debut date not null default current_date,
  date_fin date,
  created_at timestamptz not null default now(),
  constraint mandat_lignes_mandat_meme_org_fk
    foreign key (mandat_id, organization_id)
    references public.mandats (id, organization_id) on delete cascade,
  constraint mandat_lignes_lot_meme_org_fk
    foreign key (lot_id, organization_id)
    references public.lots (id, organization_id)
);

-- Index couvrant les FK (retour advisor S2 : FK sans index couvrant)
create index mandats_org_idx on public.mandats (organization_id);
create index mandats_person_idx on public.mandats (person_id);
create index mandat_lignes_mandat_idx on public.mandat_lignes (mandat_id);
create index mandat_lignes_lot_idx on public.mandat_lignes (lot_id);
create index mandat_lignes_org_idx on public.mandat_lignes (organization_id);

-- Contrôles métier à l'insertion/màj d'une ligne (RM-5.1.1 + RM-5.1.3)
create function public.mandat_ligne_verifier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_conflit int;
begin
  select person_id into v_person from public.mandats where id = new.mandat_id;

  -- 1. Le lot doit être détenu par le mandant (détention ouverte) — RM-5.1.1
  if not exists (
    select 1 from public.detentions
    where lot_id = new.lot_id and person_id = v_person and date_fin is null
  ) then
    raise exception 'Lot non détenu par le mandant : seuls ses lots sont intégrables (RM-5.1.1)';
  end if;

  -- 2. Un lot n'a qu'un mandat actif à la fois — RM-5.1.3
  if new.date_fin is null then
    select count(*) into v_conflit
    from public.mandat_lignes ml
    join public.mandats m on m.id = ml.mandat_id
    where ml.lot_id = new.lot_id
      and ml.id <> new.id
      and ml.date_fin is null
      and m.etat <> 'resilie';
    if v_conflit > 0 then
      raise exception 'Ce lot est déjà couvert par un mandat actif (RM-5.1.3)';
    end if;
  end if;

  return new;
end;
$$;

create trigger mandat_ligne_verifier_trg
  before insert or update on public.mandat_lignes
  for each row execute function public.mandat_ligne_verifier();

-- ============================================================
-- RLS — étanchéité par agence (rôles gestion). Le mandant (PM) n'a pas d'accès.
-- ============================================================
alter table public.mandats enable row level security;
alter table public.mandat_lignes enable row level security;

create policy mandats_select on public.mandats
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy mandats_insert on public.mandats
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy mandats_update on public.mandats
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );

create policy mandat_lignes_select on public.mandat_lignes
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy mandat_lignes_insert on public.mandat_lignes
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy mandat_lignes_update on public.mandat_lignes
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );

-- Pas de suppression directe (avenants, pas de suppression) ; anon exclu.
revoke delete on public.mandats, public.mandat_lignes from authenticated;
revoke all on public.mandats, public.mandat_lignes from anon;
-- Le contrôle est un trigger, jamais appelable en direct (leçon advisor S2)
revoke execute on function public.mandat_ligne_verifier() from public, anon, authenticated;
