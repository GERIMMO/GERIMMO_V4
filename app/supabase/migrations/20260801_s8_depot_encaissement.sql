-- Module 2.1 : encaissement du dépôt de garantie. Plafond légal bloquant
-- (1 mois nu / 2 mois meublé, hors charges), versant tiers tracé (RM-2.1.4),
-- encaissement partiel possible (solde signalé), jamais révisé (RM-2.1.5).
create table public.depot_encaissements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  montant numeric not null check (montant > 0),
  date_encaissement date not null default current_date,
  moyen text,
  versant_person_id uuid references public.persons (id),
  versant_libelle text,
  created_at timestamptz not null default now()
);
create index depot_encaissements_bail_idx on public.depot_encaissements (bail_id);
alter table public.depot_encaissements enable row level security;

create policy depot_enc_select on public.depot_encaissements for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy depot_enc_delete on public.depot_encaissements for delete
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.encaisser_depot(
  p_bail uuid, p_montant numeric, p_date date, p_moyen text,
  p_versant_person uuid default null, p_versant_libelle text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;

  -- Plafond légal : hors charges, 2 mois meublé / 1 mois sinon (RM-2.1.1/2)
  v_mois := case when v.type = 'meuble' then 2 else 1 end;
  v_plafond := coalesce(v.loyer_hc, 0) * v_mois;
  if coalesce(v.depot_garantie, 0) > v_plafond then
    raise exception 'Dépôt de % € supérieur au plafond légal de % € (% mois hors charges)',
      v.depot_garantie, v_plafond, v_mois;
  end if;

  -- Pas d'encaissement au-delà du dépôt dû
  select coalesce(sum(montant), 0) into v_cumul from public.depot_encaissements where bail_id = p_bail;
  if v_cumul + p_montant > coalesce(v.depot_garantie, 0) then
    raise exception 'Encaissement (% €) dépasse le dépôt dû restant (% €)',
      p_montant, coalesce(v.depot_garantie, 0) - v_cumul;
  end if;

  insert into public.depot_encaissements
    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle);
  return v_cumul + p_montant;
end $$;

revoke execute on function public.encaisser_depot(uuid, numeric, date, text, uuid, text) from public, anon;

-- RM-2.6.1 : le locataire voit le montant et la date d'encaissement de son
-- dépôt dès l'encaissement (jamais les retenues envisagées, RM-2.6.2).
create function public.mon_depot_locataire(p_org uuid)
returns table (depot_du numeric, encaisse numeric, derniere_date date)
language sql stable security definer set search_path = '' as $$
  select coalesce(b.depot_garantie, 0),
         coalesce((select sum(d.montant) from public.depot_encaissements d where d.bail_id = b.id), 0),
         (select max(d.date_encaissement) from public.depot_encaissements d where d.bail_id = b.id)
  from public.baux b
  join public.persons p on p.id = b.locataire_principal
  where b.organization_id = p_org
    and p.account_id = (select auth.uid())
    and b.etat in ('actif', 'preavis')
  order by b.created_at desc
  limit 1;
$$;
