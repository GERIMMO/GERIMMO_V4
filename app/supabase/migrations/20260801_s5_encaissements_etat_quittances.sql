-- Sprint 5B : encaissements (saisis manuellement), état des loyers avec imputation
-- du plus ancien au plus récent (RM-3.3.2), quittances (encaissement intégral) /
-- reçus (partiel). Excédent reporté automatiquement (running total).

create table public.encaissements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  montant numeric not null check (montant > 0),
  date_paiement date not null default current_date,
  mode text,
  note text,
  created_at timestamptz not null default now()
);
create index encaissements_bail_idx on public.encaissements (bail_id);
alter table public.encaissements enable row level security;

create policy encaissements_select on public.encaissements for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy encaissements_insert on public.encaissements for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy encaissements_update on public.encaissements for update
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy encaissements_delete on public.encaissements for delete
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create table public.quittances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  appel_id uuid not null references public.appels_loyer (id) on delete cascade unique,
  est_quittance boolean not null default true,
  montant numeric not null,
  date_emission date not null default current_date,
  created_at timestamptz not null default now()
);
create index quittances_bail_idx on public.quittances (bail_id);
alter table public.quittances enable row level security;

create policy quittances_select on public.quittances for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.etat_loyers_bail(p_bail uuid)
returns table (
  appel_id uuid, periode date, date_echeance date, montant_du numeric,
  cumul_du numeric, montant_couvert numeric, statut text
)
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select id, periode, date_echeance, montant_du,
      sum(montant_du) over (order by periode rows between unbounded preceding and current row) as cumul_du
    from public.appels_loyer where bail_id = p_bail
  ), tot as (
    select coalesce(sum(montant), 0) as encaisse from public.encaissements where bail_id = p_bail
  )
  select
    a.id, a.periode, a.date_echeance, a.montant_du, a.cumul_du,
    round(least(a.montant_du, greatest(0, tot.encaisse - (a.cumul_du - a.montant_du))), 2) as montant_couvert,
    case
      when tot.encaisse >= a.cumul_du then 'paye'
      when tot.encaisse > (a.cumul_du - a.montant_du) then 'partiel'
      when a.date_echeance < current_date then 'impaye'
      else 'attendu'
    end as statut
  from a, tot
  order by a.periode;
$$;

create function public.emettre_quittances(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid; v_crees int := 0; r record;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  for r in
    select e.appel_id, e.montant_du from public.etat_loyers_bail(p_bail) e
    where e.statut = 'paye'
      and not exists (select 1 from public.quittances q where q.appel_id = e.appel_id)
  loop
    insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
    values (v_org, p_bail, r.appel_id, true, r.montant_du);
    v_crees := v_crees + 1;
  end loop;
  return v_crees;
end;
$$;
revoke execute on function public.etat_loyers_bail(uuid) from public, anon;
revoke execute on function public.emettre_quittances(uuid) from public, anon;
