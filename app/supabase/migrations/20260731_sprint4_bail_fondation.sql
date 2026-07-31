-- Sprint 4 (incrément 1) — Bail : fondation
-- Source : wiki/concepts/Bail (module 1). Le bail lie un LOT et un locataire
-- (colocation = solidarité, garant porté par le bail). Chaîne à l'activation :
-- contrôles amont (lot_blocages_location vide : détention 100 %, diagnostics
-- valides) + PDF signé déposé → bail actif → lot loué → alerte EDL d'entrée.

create type public.bail_type as enum ('nu', 'meuble', 'colocation');
create type public.bail_etat as enum ('brouillon', 'actif', 'preavis', 'termine');

create table public.baux (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  lot_id uuid not null,
  type public.bail_type not null default 'nu',
  etat public.bail_etat not null default 'brouillon',
  locataire_principal uuid,
  date_debut date,
  date_fin date,
  loyer_hc numeric(10, 2) check (loyer_hc is null or loyer_hc >= 0),
  charges numeric(10, 2) check (charges is null or charges >= 0),
  depot_garantie numeric(10, 2) check (depot_garantie is null or depot_garantie >= 0),
  jour_echeance smallint not null default 1 check (jour_echeance between 1 and 28),
  document_signe uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint baux_id_org_unique unique (id, organization_id),
  constraint baux_lot_meme_org_fk
    foreign key (lot_id, organization_id) references public.lots (id, organization_id),
  constraint baux_locataire_meme_org_fk
    foreign key (locataire_principal, organization_id) references public.persons (id, organization_id),
  constraint baux_document_meme_org_fk
    foreign key (document_signe, organization_id) references public.documents (id, organization_id)
);

-- Colocataires (solidarité) et garants — le lien de garantie est porté par le bail
create table public.bail_personnes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null,
  person_id uuid not null,
  role text not null default 'colocataire' check (role in ('colocataire', 'garant')),
  created_at timestamptz not null default now(),
  constraint bail_personnes_bail_meme_org_fk
    foreign key (bail_id, organization_id) references public.baux (id, organization_id) on delete cascade,
  constraint bail_personnes_person_meme_org_fk
    foreign key (person_id, organization_id) references public.persons (id, organization_id),
  constraint bail_personnes_unique unique (bail_id, person_id, role)
);

create index baux_org_idx on public.baux (organization_id);
create index baux_lot_idx on public.baux (lot_id);
create index baux_locataire_idx on public.baux (locataire_principal);
create index bail_personnes_bail_idx on public.bail_personnes (bail_id);
create index bail_personnes_person_idx on public.bail_personnes (person_id);

-- Activer un bail : contrôles amont + PDF signé → bail actif → lot loué + alerte EDL
create function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;
  if v.locataire_principal is null then
    raise exception 'Le locataire principal est obligatoire';
  end if;
  if v.document_signe is null then
    raise exception 'Déposez le bail signé (PDF) avant activation (V0 : signature hors plateforme)';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;

  update public.baux set etat = 'actif', updated_at = now() where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id, 'edl_entree', 'normale',
          'État des lieux d''entrée à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id));
end;
$$;
revoke execute on function public.activer_bail(uuid) from public, anon;

-- ============================================================
-- RLS — étanchéité par agence (rôles gestion). Le locataire lira SON bail via
-- une fonction dédiée (incrément UI), pas par policy large.
-- ============================================================
alter table public.baux enable row level security;
alter table public.bail_personnes enable row level security;

create policy baux_select on public.baux
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy baux_insert on public.baux
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy baux_update on public.baux
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );

create policy bail_personnes_select on public.bail_personnes
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy bail_personnes_insert on public.bail_personnes
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy bail_personnes_delete on public.bail_personnes
  for delete to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );

revoke delete on public.baux from authenticated;
revoke all on public.baux, public.bail_personnes from anon;
