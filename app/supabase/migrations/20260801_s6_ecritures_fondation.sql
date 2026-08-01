-- Sprint 6 (fondations) : journal de gestion. Écritures immuables (RLS : pas de
-- update/delete), correction par contre-écriture (RM-4.4.3), clôture mensuelle
-- verrouillante (RM-4.4.1), honoraires automatiques sur encaissement (taux du mandat).

create table public.ecritures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid references public.baux (id) on delete set null,
  lot_id uuid references public.lots (id) on delete set null,
  mandat_id uuid references public.mandats (id) on delete set null,
  categorie text not null,
  sens text not null check (sens in ('recette', 'depense')),
  montant numeric not null check (montant > 0),
  date_piece date not null default current_date,
  date_imputation date not null default current_date,
  libelle text,
  systeme boolean not null default false,
  contre_ecriture_de uuid references public.ecritures (id),
  created_at timestamptz not null default now()
);
create index ecritures_org_mois_idx on public.ecritures (organization_id, date_imputation);
create index ecritures_lot_idx on public.ecritures (lot_id);
alter table public.ecritures enable row level security;

create policy ecritures_select on public.ecritures for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy ecritures_insert on public.ecritures for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create table public.clotures_comptables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  mois date not null,
  cloture_at timestamptz not null default now(),
  unique (organization_id, mois)
);
alter table public.clotures_comptables enable row level security;
create policy clotures_select on public.clotures_comptables for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.ecriture_mois_ouvert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.clotures_comptables c
    where c.organization_id = new.organization_id
      and c.mois = date_trunc('month', new.date_imputation)::date
  ) then
    raise exception 'Mois clôturé : imputez au mois ouvert ou passez une contre-écriture (RM-4.4.1)';
  end if;
  return new;
end; $$;
create trigger ecritures_mois_ouvert before insert on public.ecritures
  for each row execute function public.ecriture_mois_ouvert();

create function public.contre_ecriture(p_ecriture uuid, p_motif text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_new uuid;
begin
  select * into v from public.ecritures where id = p_ecriture;
  if v.id is null then raise exception 'Écriture introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Motif de contre-écriture obligatoire'; end if;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
     date_piece, date_imputation, libelle, systeme, contre_ecriture_de)
  values (v.organization_id, v.bail_id, v.lot_id, v.mandat_id, v.categorie,
     case when v.sens = 'recette' then 'depense' else 'recette' end, v.montant,
     v.date_piece, current_date, 'Contre-écriture : ' || p_motif, v.systeme, v.id)
  returning id into v_new;
  return v_new;
end; $$;

create function public.cloturer_mois(p_org uuid, p_mois date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[]))) then
    raise exception 'Seul l''admin d''agence peut clôturer';
  end if;
  insert into public.clotures_comptables (organization_id, mois)
  values (p_org, date_trunc('month', p_mois)::date)
  on conflict (organization_id, mois) do nothing;
end; $$;

create function public.rouvrir_mois(p_org uuid, p_mois date, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(array['admin_agence']::public.membership_role[]))) then
    raise exception 'Seul l''admin d''agence peut rouvrir';
  end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Motif de réouverture obligatoire'; end if;
  delete from public.clotures_comptables where organization_id = p_org and mois = date_trunc('month', p_mois)::date;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'mois_reouvert', jsonb_build_object('mois', date_trunc('month', p_mois)::date, 'motif', p_motif));
end; $$;

create function public.ecrire_encaissement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_lot uuid; v_taux numeric; v_mandat uuid;
begin
  select lot_id into v_lot from public.baux where id = new.bail_id;
  insert into public.ecritures
    (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle)
  values (new.organization_id, new.bail_id, v_lot, 'loyer', 'recette', new.montant,
          new.date_paiement, new.date_paiement, 'Encaissement de loyer');
  select ml.taux_honoraires, ml.mandat_id into v_taux, v_mandat
  from public.mandat_lignes ml
  where ml.lot_id = v_lot and ml.date_debut <= new.date_paiement
    and (ml.date_fin is null or ml.date_fin >= new.date_paiement)
  order by ml.date_debut desc limit 1;
  if v_taux is not null and v_taux > 0 then
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme)
    values (new.organization_id, new.bail_id, v_lot, v_mandat, 'honoraires', 'depense',
            round(new.montant * v_taux / 100, 2), new.date_paiement, new.date_paiement,
            'Honoraires de gestion', true);
  end if;
  return new;
end; $$;
create trigger encaissement_ecritures after insert on public.encaissements
  for each row execute function public.ecrire_encaissement();

revoke execute on function public.contre_ecriture(uuid, text) from public, anon;
revoke execute on function public.cloturer_mois(uuid, date) from public, anon;
revoke execute on function public.rouvrir_mois(uuid, date, text) from public, anon;
