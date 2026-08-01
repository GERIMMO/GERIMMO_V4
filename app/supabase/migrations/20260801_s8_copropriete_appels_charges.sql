-- Module 0c : appels de charges de copropriété. Gerimmo n'est pas un syndic —
-- on reçoit l'appel, on le saisit poste par poste et on le ventile
-- récupérable (locataire) / non récupérable (propriétaire). Décret 87-713.

alter table public.biens
  add column syndic_nom text,
  add column syndic_email text,
  add column reference_copropriete text;

create table public.appels_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  lot_id uuid not null references public.lots (id) on delete cascade,
  exercice integer not null,
  date_reception date not null default current_date,
  total numeric not null check (total > 0),
  document_id uuid references public.documents (id),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'ventile', 'fige')),
  created_at timestamptz not null default now()
);
create index appels_charges_lot_idx on public.appels_charges (lot_id, exercice);
alter table public.appels_charges enable row level security;
create policy appels_charges_all on public.appels_charges for all
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create table public.appel_charges_postes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  appel_id uuid not null references public.appels_charges (id) on delete cascade,
  libelle text not null,
  montant numeric not null check (montant > 0),
  nature text not null default 'a_qualifier'
    check (nature in ('recuperable', 'non_recuperable', 'a_qualifier')),
  fonds_alur boolean not null default false,
  propose boolean not null default false,
  created_at timestamptz not null default now(),
  constraint alur_jamais_recuperable check (not (fonds_alur and nature = 'recuperable'))
);
create index appel_charges_postes_appel_idx on public.appel_charges_postes (appel_id);
alter table public.appel_charges_postes enable row level security;
create policy postes_all on public.appel_charges_postes for all
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.postes_appel_non_fige()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_statut text;
begin
  select statut into v_statut from public.appels_charges
    where id = coalesce(new.appel_id, old.appel_id);
  if v_statut = 'fige' then
    raise exception 'Appel figé par une régularisation : correction par régularisation rectificative uniquement (RM-0c.3.6)';
  end if;
  return coalesce(new, old);
end $$;
create trigger postes_appel_non_fige_trg
  before insert or update or delete on public.appel_charges_postes
  for each row execute function public.postes_appel_non_fige();

create function public.valider_ventilation(p_appel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record; v_somme numeric; v_aqualifier integer;
begin
  select * into v from public.appels_charges where id = p_appel;
  if v.id is null then raise exception 'Appel introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'fige' then raise exception 'Appel figé : plus de ventilation possible'; end if;
  select coalesce(sum(montant), 0), count(*) filter (where nature = 'a_qualifier')
    into v_somme, v_aqualifier
    from public.appel_charges_postes where appel_id = p_appel;
  if v_aqualifier > 0 then
    raise exception '% poste(s) restent à qualifier — ventilation bloquée (RM-0c.3.3)', v_aqualifier;
  end if;
  if round(v_somme, 2) <> round(v.total, 2) then
    raise exception 'Total des postes (% €) différent du total de l''appel (% €) — bloquant (RM-0c.2.2)',
      round(v_somme, 2), round(v.total, 2);
  end if;
  update public.appels_charges set statut = 'ventile' where id = p_appel;
end $$;

create function public.charges_recuperables_exercice(p_lot uuid, p_exercice integer)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.montant), 0)
  from public.appel_charges_postes p
  join public.appels_charges a on a.id = p.appel_id
  where a.lot_id = p_lot and a.exercice = p_exercice
    and a.statut in ('ventile', 'fige') and p.nature = 'recuperable';
$$;

revoke execute on function public.valider_ventilation(uuid) from public, anon;
