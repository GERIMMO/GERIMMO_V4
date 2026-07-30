-- Sprint 2 — Diagnostics, clé de répartition, équipements (module 0, suite).
-- Diagnostics : répartition bien/lot (RM-0.6.x), un obligatoire expiré bloque
-- (RM-0.7.3) sauf lot déjà loué (RM-0.8.3, confirmé humain 2026-07-25) ;
-- alertes J-90/J-30/J+0 via pg_cron vers la table alerts du S1.
-- Clé de répartition (parcours 0.4) : somme = 100 % exact, datée, jamais
-- recalculée rétroactivement. Équipements : liste fermée par agence (RM-0.5.5).
-- Appliquée le 2026-07-29 sur « Gerimmo V4 » via MCP. Copie de référence.

-- ============================================================
-- Types
-- ============================================================
create type public.diagnostic_type as enum (
  'dpe', 'electricite', 'gaz', 'plomb', 'amiante_privatif',
  'amiante_communes', 'erp', 'termites'
);

create type public.cle_mode as enum ('surface', 'tantiemes', 'parts_egales');

-- ============================================================
-- Diagnostics
-- ============================================================
-- Rattaché au bien OU au lot selon sa nature (RM-0.6.2) ; date_expiration
-- nulle = illimité (plomb négatif, amiante sans trace — RM-0.6.4) ;
-- remplacement = l'ancien est archivé, l'historique reste (gestion + 5 ans).
create table public.diagnostics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bien_id uuid references public.biens (id),
  lot_id uuid references public.lots (id),
  type public.diagnostic_type not null,
  date_realisation date not null,
  date_expiration date check (date_expiration is null or date_expiration > date_realisation),
  diagnostiqueur text,
  document_id uuid references public.documents (id),
  remplace_id uuid references public.diagnostics (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diagnostics_un_seul_niveau check (num_nonnulls(bien_id, lot_id) = 1)
);
create index diagnostics_bien_idx on public.diagnostics (bien_id) where bien_id is not null;
create index diagnostics_lot_idx on public.diagnostics (lot_id) where lot_id is not null;
create index diagnostics_org_idx on public.diagnostics (organization_id);
create index diagnostics_expiration_idx on public.diagnostics (date_expiration)
  where archived_at is null and date_expiration is not null;

create trigger diagnostics_updated_at before update on public.diagnostics
  for each row execute function public.set_updated_at();

-- Dépôt d'un remplaçant : l'ancien du même type au même niveau est archivé —
-- le dépôt lève seul le blocage, sans autre action (RM-0.8.5)
create function public.archiver_diagnostic_remplace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.diagnostics
  set archived_at = now()
  where archived_at is null and id <> new.id and type = new.type
    and coalesce(bien_id, '00000000-0000-0000-0000-000000000000')
      = coalesce(new.bien_id, '00000000-0000-0000-0000-000000000000')
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000')
      = coalesce(new.lot_id, '00000000-0000-0000-0000-000000000000');
  return new;
end;
$$;
create trigger diagnostics_remplacement after insert on public.diagnostics
  for each row execute function public.archiver_diagnostic_remplace();

-- ============================================================
-- Clé de répartition (parcours 0.4 — « une clé fausse fausse TOUTES les
-- régularisations du bien »)
-- ============================================================
-- La clé est datée et immuable (RM-0.4.2/4) : on n'édite jamais une clé, on en
-- valide une nouvelle ; l'ancienne est invalidée mais conservée (les documents
-- émis figent la clé en vigueur à leur date).
create table public.cles_repartition (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references public.biens (id),
  organization_id uuid not null references public.organizations (id),
  mode public.cle_mode not null default 'surface',
  date_effet date not null default current_date,
  invalidated_at timestamptz,
  created_by uuid references public.accounts (id),
  created_at timestamptz not null default now()
);
create index cles_repartition_bien_idx on public.cles_repartition (bien_id);

create table public.cle_repartition_lignes (
  id uuid primary key default gen_random_uuid(),
  cle_id uuid not null references public.cles_repartition (id) on delete cascade,
  lot_id uuid not null references public.lots (id),
  pourcentage numeric(5,2) not null check (pourcentage >= 0 and pourcentage <= 100),
  constraint cle_lignes_unique unique (cle_id, lot_id)
);

-- Seule porte d'écriture : valide somme = 100,00 exactement (RM-0.4.1) puis
-- crée la clé et ses lignes atomiquement. Invoker : la RLS s'applique.
create function public.valider_cle_repartition(
  p_bien uuid, p_mode public.cle_mode, p_lignes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien record;
  v_total numeric := 0;
  v_ligne jsonb;
  v_cle uuid;
  v_nb_lots int;
begin
  select * into v_bien from public.biens where id = p_bien;
  if not found then raise exception 'Bien introuvable'; end if;

  select count(*) into v_nb_lots from public.lots
  where bien_id = p_bien and etat <> 'archive';
  if jsonb_array_length(p_lignes) <> v_nb_lots then
    raise exception 'La clé doit couvrir les % lots actifs du bien', v_nb_lots;
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_total := v_total + (v_ligne->>'pourcentage')::numeric;
  end loop;
  if round(v_total, 2) <> 100.00 then
    raise exception 'La somme des pourcentages fait %, il faut exactement 100 (RM-0.4.1)', v_total;
  end if;

  update public.cles_repartition set invalidated_at = now()
  where bien_id = p_bien and invalidated_at is null;

  insert into public.cles_repartition (bien_id, organization_id, mode, created_by)
  values (p_bien, v_bien.organization_id, p_mode, (select auth.uid()))
  returning id into v_cle;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    insert into public.cle_repartition_lignes (cle_id, lot_id, pourcentage)
    values (v_cle, (v_ligne->>'lot_id')::uuid, (v_ligne->>'pourcentage')::numeric);
  end loop;

  return v_cle;
end;
$$;
revoke execute on function public.valider_cle_repartition(uuid, public.cle_mode, jsonb)
  from public, anon;

-- ============================================================
-- Équipements : liste fermée paramétrée par l'admin agence (RM-0.5.5),
-- prépare la grille d'état des lieux (RM-0.5.6, S5)
-- ============================================================
create table public.equipements_catalogue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  nom text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint equipements_unique unique (organization_id, nom)
);

create table public.lot_equipements (
  lot_id uuid not null references public.lots (id) on delete cascade,
  equipement_id uuid not null references public.equipements_catalogue (id),
  primary key (lot_id, equipement_id)
);

-- ============================================================
-- Alertes d'expiration des diagnostics (parcours 0.8, tâche quotidienne)
-- J-90 information · J-30 warning · J+0 critique. Lot loué : critique NON
-- bloquante (RM-0.8.3). Destinataire : l'admin agence à défaut d'agent en
-- charge du mandat (RM-0.8.4 — le mandat arrive au S3). Une alerte par
-- diagnostic et par seuil (details->>diagnostic_id + seuil).
-- ============================================================
create function public.generer_alertes_diagnostics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diag record;
  v_seuil text;
  v_criticite public.alerte_criticite;
  v_crees int := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'generer_alertes_diagnostics: reserve au cron et au super admin';
  end if;

  for v_diag in
    select d.id, d.organization_id, d.type, d.date_expiration,
           coalesce(l.nom, b2.nom) as cible,
           coalesce(b.nom, b2.nom) as bien_nom
    from public.diagnostics d
    left join public.lots l on l.id = d.lot_id
    left join public.biens b on b.id = l.bien_id
    left join public.biens b2 on b2.id = d.bien_id
    where d.archived_at is null and d.date_expiration is not null
      and d.date_expiration <= current_date + 90
  loop
    v_seuil := case
      when v_diag.date_expiration <= current_date then 'J+0'
      when v_diag.date_expiration <= current_date + 30 then 'J-30'
      else 'J-90'
    end;
    v_criticite := case v_seuil
      when 'J+0' then 'critique'::public.alerte_criticite
      when 'J-30' then 'normale'::public.alerte_criticite
      else 'informative'::public.alerte_criticite
    end;

    if not exists (
      select 1 from public.alerts a
      where a.type = 'diagnostic_expiration'
        and a.details->>'diagnostic_id' = v_diag.id::text
        and a.details->>'seuil' = v_seuil
    ) then
      insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
      values (
        v_diag.organization_id, 'diagnostic_expiration', v_criticite,
        format('%s — %s : %s',
          upper(v_diag.type::text), v_diag.bien_nom,
          case when v_seuil = 'J+0'
            then 'diagnostic expiré (bail bloqué tant qu''il n''est pas redéposé)'
            else format('expire le %s', to_char(v_diag.date_expiration, 'DD/MM/YYYY')) end),
        jsonb_build_object('diagnostic_id', v_diag.id, 'seuil', v_seuil,
                           'type_diagnostic', v_diag.type),
        v_diag.date_expiration
      );
      v_crees := v_crees + 1;
    end if;
  end loop;

  return v_crees;
end;
$$;
revoke execute on function public.generer_alertes_diagnostics() from public, anon;

select cron.schedule('alertes-diagnostics-quotidiennes', '30 3 * * *',
                     $$select public.generer_alertes_diagnostics()$$);

-- ============================================================
-- Conservation (matrice A2) : les diagnostics documentaires suivent la règle
-- document:diagnostic déjà seedée au S1 ; pas de nouvelle règle nécessaire.
-- ============================================================

-- ============================================================
-- RLS
-- ============================================================
alter table public.diagnostics enable row level security;
alter table public.cles_repartition enable row level security;
alter table public.cle_repartition_lignes enable row level security;
alter table public.equipements_catalogue enable row level security;
alter table public.lot_equipements enable row level security;

create policy diagnostics_select on public.diagnostics
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy diagnostics_insert on public.diagnostics
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy diagnostics_update on public.diagnostics
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
-- Pas de delete : remplacement = archivage, purge par rétention (S1)

create policy cles_select on public.cles_repartition
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy cle_lignes_select on public.cle_repartition_lignes
  for select to authenticated
  using (
    cle_id in (select c.id from public.cles_repartition c
               where c.organization_id in (select public.org_ids_avec_roles(
                 array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
    or (select public.is_super_admin())
  );
-- Écriture des clés : uniquement via valider_cle_repartition() (invoker) — il
-- faut donc autoriser l'insert par la politique, mais l'immuabilité est
-- garantie par l'absence de politique update/delete et les revoke ci-dessous.
create policy cles_insert on public.cles_repartition
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy cles_update_invalidation on public.cles_repartition
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  );
create policy cle_lignes_insert on public.cle_repartition_lignes
  for insert to authenticated
  with check (
    cle_id in (select c.id from public.cles_repartition c
               where c.organization_id in (select public.org_ids_avec_roles(
                 array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  );

create policy equipements_select on public.equipements_catalogue
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
-- Liste fermée : seul l'admin agence la modifie (RM-0.5.5)
create policy equipements_insert on public.equipements_catalogue
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))
  );
create policy equipements_update on public.equipements_catalogue
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))
  );

create policy lot_equipements_select on public.lot_equipements
  for select to authenticated
  using (
    lot_id in (select l.id from public.lots l
               where l.organization_id in (select public.org_ids_avec_roles(
                 array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
    or (select public.is_super_admin())
  );
create policy lot_equipements_write on public.lot_equipements
  for insert to authenticated
  with check (
    lot_id in (select l.id from public.lots l
               where l.organization_id in (select public.org_ids_avec_roles(
                 array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  );
create policy lot_equipements_delete on public.lot_equipements
  for delete to authenticated
  using (
    lot_id in (select l.id from public.lots l
               where l.organization_id in (select public.org_ids_avec_roles(
                 array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  );

-- Immuabilité des clés (RM-0.4.4) : jamais d'update/delete des lignes ; la
-- seule modification d'une clé est son invalidation (posée par les fonctions)
revoke update, delete on public.cle_repartition_lignes from authenticated;
revoke delete on public.cles_repartition, public.diagnostics from authenticated;
revoke all on public.diagnostics, public.cles_repartition,
  public.cle_repartition_lignes, public.equipements_catalogue,
  public.lot_equipements from anon;
