-- Sprint 2 — Le parc : biens et lots (module 0).
-- Le BIEN est l'unité physique (adresse, clé, diagnostics communs) ; le LOT est
-- l'unité locative (propriétaires, bail, loyer — RM-0.2.5 : « le bail porte
-- toujours sur un LOT, jamais sur un bien »). Tout bien naît avec un lot unique
-- (RM-0.1.2) ; le multi-lots reste invisible dans ~90 % des cas (RM-0.3.4).
-- Machine à états du lot (tranché 2026-07-25, le module 0 fait foi) :
-- brouillon → disponible → loué ⇄ préavis → archivé (réactivation AA seul).
-- Appliquée le 2026-07-29 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- Types
-- ============================================================
create type public.bien_type as enum (
  'appartement', 'maison', 'local', 'parking', 'terrain', 'autre'
);

create type public.lot_etat as enum (
  'brouillon', 'disponible', 'loue', 'preavis', 'archive'
);

-- ============================================================
-- Tables
-- ============================================================

-- L'unité physique : adresse, structure, copropriété (module 0 / 0c)
create table public.biens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  nom text not null,                    -- référence interne (« 12 rue des Lilas »)
  type public.bien_type not null,
  address_line1 text not null,
  address_line2 text,
  postal_code text not null,
  city text not null,
  annee_construction integer check (annee_construction between 1000 and 2100),
  copropriete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index biens_org_idx on public.biens (organization_id);

-- L'unité locative : états, caractéristiques, détention (module 0)
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references public.biens (id),
  organization_id uuid not null references public.organizations (id),
  nom text not null,                    -- « Lot unique », « Lot 2 — RDC gauche »…
  etat public.lot_etat not null default 'brouillon',
  surface_m2 numeric(7,2) check (surface_m2 is null or surface_m2 > 0),
  pieces integer check (pieces is null or pieces > 0),
  -- Carrez : champ simple en V1 (RM-0.5.7 — réserve documentée : sans date ni
  -- mesureur, pas de défense en cas de contestation > 5 %)
  surface_carrez numeric(7,2) check (surface_carrez is null or surface_carrez > 0),
  meuble boolean not null default false,
  etage text,
  description text,
  -- Copropriété (module 0c) : le tantième est porté par le lot (RM-0c.1.1)
  tantieme numeric(10,2) check (tantieme is null or tantieme > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lots_bien_idx on public.lots (bien_id);
create index lots_org_etat_idx on public.lots (organization_id, etat);

-- La détention : propriétaire ↔ lot, par quote-parts DATÉES (RM-0.2.3/4 :
-- jamais supprimée — un rapport de mars doit citer le propriétaire de mars).
-- Fin de détention = date_fin posée, jamais de DELETE.
create table public.detentions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id),
  organization_id uuid not null references public.organizations (id),
  person_id uuid not null references public.persons (id),
  quote_part numeric(5,2) not null check (quote_part > 0 and quote_part <= 100),
  date_debut date not null default current_date,
  date_fin date check (date_fin is null or date_fin >= date_debut),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index detentions_lot_idx on public.detentions (lot_id);
create index detentions_person_idx on public.detentions (person_id);
create index detentions_org_idx on public.detentions (organization_id);

create trigger biens_updated_at before update on public.biens
  for each row execute function public.set_updated_at();
create trigger lots_updated_at before update on public.lots
  for each row execute function public.set_updated_at();
create trigger detentions_updated_at before update on public.detentions
  for each row execute function public.set_updated_at();

-- ============================================================
-- Gardes métier (triggers)
-- ============================================================

-- Somme des quote-parts actives d'un lot ≤ 100 % (RM-0.2.1, bloquant)
create function public.verifier_detention_totale()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(quote_part), 0) into v_total
  from public.detentions
  where lot_id = new.lot_id and date_fin is null and id <> new.id;
  if new.date_fin is null and v_total + new.quote_part > 100 then
    raise exception 'La somme des quote-parts actives dépasserait 100 %% (% %%)',
      round(v_total + new.quote_part, 2);
  end if;
  return new;
end;
$$;
create trigger detentions_total_check before insert or update on public.detentions
  for each row execute function public.verifier_detention_totale();

-- Ce qui empêche un lot d'être loué : liste de blocages, affichée telle quelle
-- par l'app (démo S2 : « bail bloqué par un DPE expiré »).
--  - complétude : nom, surface (RM-0.5.4)
--  - détention active à exactement 100 % (RM-0.2.2)
--  - diagnostics obligatoires présents et non expirés (RM-0.7.3/4) :
--    DPE au lot (habitation), ERP au bien — les autres dépendent de données
--    (année, zone) vérifiées à la saisie côté app
create function public.lot_blocages_location(p_lot uuid)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_lot record;
  v_bien record;
  v_total numeric;
  v_blocages text[] := '{}';
  v_habitation boolean;
begin
  select * into v_lot from public.lots where id = p_lot;
  if not found then return array['Lot introuvable']; end if;
  select * into v_bien from public.biens where id = v_lot.bien_id;

  if v_lot.nom is null or length(trim(v_lot.nom)) = 0 then
    v_blocages := array_append(v_blocages, 'Nom du lot manquant');
  end if;
  if v_lot.surface_m2 is null then
    v_blocages := array_append(v_blocages, 'Surface manquante');
  end if;

  select coalesce(sum(quote_part), 0) into v_total
  from public.detentions where lot_id = p_lot and date_fin is null;
  if v_total <> 100 then
    v_blocages := array_append(v_blocages,
      format('Détention incomplète (%s %% — il faut exactement 100 %%)', v_total));
  end if;

  v_habitation := v_bien.type in ('appartement', 'maison');
  if v_habitation and not exists (
    select 1 from public.diagnostics d
    where d.lot_id = p_lot and d.type = 'dpe' and d.archived_at is null
      and (d.date_expiration is null or d.date_expiration >= current_date)
  ) then
    v_blocages := array_append(v_blocages, 'DPE absent ou expiré (obligatoire en habitation)');
  end if;
  if not exists (
    select 1 from public.diagnostics d
    where d.bien_id = v_lot.bien_id and d.type = 'erp' and d.archived_at is null
      and (d.date_expiration is null or d.date_expiration >= current_date)
  ) then
    v_blocages := array_append(v_blocages, 'ERP absent ou expiré (état des risques, validité 6 mois)');
  end if;
  -- Autres diagnostics obligatoires sous condition, expirés (électricité, gaz,
  -- plomb, amiante, termites) : bloquants dès lors qu'ils ont été déposés
  if exists (
    select 1 from public.diagnostics d
    where (d.lot_id = p_lot or d.bien_id = v_lot.bien_id)
      and d.type not in ('dpe', 'erp') and d.archived_at is null
      and d.date_expiration is not null and d.date_expiration < current_date
  ) then
    v_blocages := array_append(v_blocages, 'Un diagnostic déposé est expiré');
  end if;

  -- Multi-lots : une clé de répartition valide est requise (RM-0.4.1/0.3.3)
  if (select count(*) from public.lots l
      where l.bien_id = v_lot.bien_id and l.etat <> 'archive') > 1
     and not exists (
       select 1 from public.cles_repartition c
       where c.bien_id = v_lot.bien_id and c.invalidated_at is null
     ) then
    v_blocages := array_append(v_blocages, 'Clé de répartition à (re)valider');
  end if;

  return v_blocages;
end;
$$;

-- Machine à états (module 0, tranché le 2026-07-25) + verrouillages RM-0.5.1
create function public.verifier_transition_lot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_blocages text[];
begin
  -- Champs verrouillés quand le lot est loué ou en préavis (RM-0.5.1) :
  -- modification par avenant au bail uniquement (S4)
  if old.etat in ('loue', 'preavis') then
    if new.surface_m2 is distinct from old.surface_m2
       or new.pieces is distinct from old.pieces
       or new.surface_carrez is distinct from old.surface_carrez then
      raise exception 'Lot loué : surface et pièces sont verrouillées (avenant au bail requis)';
    end if;
  end if;

  if new.etat = old.etat then return new; end if;

  -- Transitions autorisées
  if not (
    (old.etat = 'brouillon'  and new.etat in ('disponible', 'archive'))
    or (old.etat = 'disponible' and new.etat in ('brouillon', 'loue', 'archive'))
    or (old.etat = 'loue'       and new.etat = 'preavis')
    or (old.etat = 'preavis'    and new.etat in ('loue', 'disponible'))
    or (old.etat = 'archive'    and new.etat = 'brouillon')  -- réactivation
  ) then
    raise exception 'Transition interdite : % → %', old.etat, new.etat;
  end if;

  -- Passage en disponible : toutes les conditions de mise en location (RM-0.5.4,
  -- RM-0.2.2, RM-0.7.3) — le dépôt du diagnostic manquant lève seul le blocage
  if new.etat = 'disponible' and old.etat = 'brouillon' then
    v_blocages := public.lot_blocages_location(new.id);
    if array_length(v_blocages, 1) is not null then
      raise exception 'Passage en disponible impossible : %',
        array_to_string(v_blocages, ' · ');
    end if;
  end if;

  -- Réactivation d'un lot archivé : admin agence uniquement (RM-0.9.4)
  if old.etat = 'archive' and new.etat = 'brouillon' then
    if not (
      new.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','proprietaire_direct']::public.membership_role[]))
      or public.is_super_admin()
    ) then
      raise exception 'Réactivation réservée à l''admin de l''agence';
    end if;
  end if;

  return new;
end;
$$;
create trigger lots_transitions before update on public.lots
  for each row execute function public.verifier_transition_lot();

-- Adresse verrouillée si un lot du bien est loué (RM-0.5.1 côté bien)
create function public.verifier_bien_verrouille()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.address_line1, new.address_line2, new.postal_code, new.city)
     is distinct from
     (old.address_line1, old.address_line2, old.postal_code, old.city)
     and exists (select 1 from public.lots l
                 where l.bien_id = new.id and l.etat in ('loue', 'preavis')) then
    raise exception 'Un lot de ce bien est loué : adresse verrouillée (avenant au bail requis)';
  end if;
  return new;
end;
$$;
create trigger biens_verrouillage before update on public.biens
  for each row execute function public.verifier_bien_verrouille();

-- ============================================================
-- Opérations de structure (invoker : la RLS s'applique à l'appelant)
-- ============================================================

-- Créer un bien, c'est créer son lot unique (RM-0.1.2) — atomique.
create function public.creer_bien_avec_lot(
  p_org uuid, p_nom text, p_type public.bien_type,
  p_address_line1 text, p_address_line2 text, p_postal_code text, p_city text,
  p_annee integer, p_copropriete boolean,
  p_surface numeric, p_pieces integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien uuid;
begin
  insert into public.biens (organization_id, nom, type, address_line1,
    address_line2, postal_code, city, annee_construction, copropriete)
  values (p_org, p_nom, p_type, p_address_line1, p_address_line2,
    p_postal_code, p_city, p_annee, p_copropriete)
  returning id into v_bien;

  insert into public.lots (bien_id, organization_id, nom, surface_m2, pieces)
  values (v_bien, p_org, 'Lot unique', p_surface, p_pieces);

  return v_bien;
end;
$$;

-- Découper un bien en lots supplémentaires (parcours 0.3) :
--  - le lot d'origine loué ne se redécoupe pas (RM-0.3.8)
--  - les nouveaux lots héritent des propriétaires actifs de l'origine (RM-0.3.6)
--  - tout changement du nombre de lots invalide la clé : les lots non loués
--    retournent en brouillon tant qu'elle n'est pas revalidée (RM-0.3.3)
create function public.decouper_bien(p_bien uuid, p_lots jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien record;
  v_origine record;
  v_lot jsonb;
  v_nouveau uuid;
begin
  select * into v_bien from public.biens where id = p_bien;
  if not found then raise exception 'Bien introuvable'; end if;

  select * into v_origine from public.lots
  where bien_id = p_bien and etat <> 'archive'
  order by created_at limit 1;
  if v_origine.etat in ('loue', 'preavis') then
    raise exception 'Lot loué : résilier, archiver puis recréer (RM-0.3.8)';
  end if;

  if jsonb_typeof(p_lots) <> 'array' or jsonb_array_length(p_lots) = 0 then
    raise exception 'Aucun lot à créer';
  end if;

  for v_lot in select * from jsonb_array_elements(p_lots) loop
    insert into public.lots (bien_id, organization_id, nom, surface_m2, pieces)
    values (p_bien, v_bien.organization_id,
            v_lot->>'nom',
            nullif(v_lot->>'surface_m2', '')::numeric,
            nullif(v_lot->>'pieces', '')::integer)
    returning id into v_nouveau;
    -- Héritage du propriétaire d'origine (RM-0.3.6)
    insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut)
    select v_nouveau, organization_id, person_id, quote_part, current_date
    from public.detentions
    where lot_id = v_origine.id and date_fin is null;
    return next v_nouveau;
  end loop;

  -- La clé en vigueur ne couvre plus la structure : invalidation
  update public.cles_repartition set invalidated_at = now()
  where bien_id = p_bien and invalidated_at is null;
  -- Les lots non loués retournent en brouillon
  update public.lots set etat = 'brouillon'
  where bien_id = p_bien and etat = 'disponible';
end;
$$;

revoke execute on function public.creer_bien_avec_lot(uuid, text, public.bien_type,
  text, text, text, text, integer, boolean, numeric, integer) from public, anon;
revoke execute on function public.decouper_bien(uuid, jsonb) from public, anon;
revoke execute on function public.lot_blocages_location(uuid) from public, anon;

-- ============================================================
-- RLS
-- ============================================================
alter table public.biens enable row level security;
alter table public.lots enable row level security;
alter table public.detentions enable row level security;

create policy biens_select on public.biens
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy biens_insert on public.biens
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy biens_update on public.biens
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
-- Pas de delete : un bien s'archive via ses lots, ne se supprime pas

create policy lots_select on public.lots
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy lots_insert on public.lots
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy lots_update on public.lots
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );

create policy detentions_select on public.detentions
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy detentions_insert on public.detentions
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy detentions_update on public.detentions
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
-- Jamais de delete sur les détentions (RM-0.2.3) : clôture par date_fin

revoke delete on public.biens, public.lots, public.detentions from authenticated;
revoke all on public.biens, public.lots, public.detentions from anon;
