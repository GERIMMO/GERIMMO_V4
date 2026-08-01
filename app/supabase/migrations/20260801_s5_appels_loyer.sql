-- Sprint 5A : appels de loyer (échéancier). Loyer + charges séparés (quittance
-- conforme). Prorata au premier mois si entrée en cours de mois (RM-3, module 3).
create table public.appels_loyer (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  periode date not null,
  loyer_hc numeric not null default 0,
  charges numeric not null default 0,
  montant_du numeric not null default 0,
  date_echeance date not null,
  prorata boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bail_id, periode)
);
create index appels_loyer_bail_idx on public.appels_loyer (bail_id, periode);
alter table public.appels_loyer enable row level security;

create policy appels_select on public.appels_loyer for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.generer_appels_loyer(p_bail uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_mois date;
  v_fin date;
  v_coeff numeric;
  v_jours_mois int;
  v_crees int := 0;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat not in ('actif', 'preavis', 'termine') then
    raise exception 'Les appels de loyer ne se génèrent que sur un bail actif';
  end if;
  if v.date_debut is null then raise exception 'Le bail n''a pas de date de début'; end if;

  v_mois := date_trunc('month', v.date_debut)::date;
  v_fin := least(
    date_trunc('month', current_date)::date,
    coalesce(date_trunc('month', v.date_fin)::date, date_trunc('month', current_date)::date)
  );

  while v_mois <= v_fin loop
    if not exists (select 1 from public.appels_loyer a where a.bail_id = p_bail and a.periode = v_mois) then
      v_jours_mois := extract(day from (v_mois + interval '1 month' - interval '1 day'))::int;
      if v_mois = date_trunc('month', v.date_debut)::date and extract(day from v.date_debut) > 1 then
        v_coeff := round((v_jours_mois - extract(day from v.date_debut)::int + 1)::numeric / v_jours_mois, 4);
      else
        v_coeff := 1;
      end if;
      insert into public.appels_loyer
        (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
      values (
        v.organization_id, p_bail, v_mois,
        round(coalesce(v.loyer_hc, 0) * v_coeff, 2),
        round(coalesce(v.charges, 0) * v_coeff, 2),
        round((coalesce(v.loyer_hc, 0) + coalesce(v.charges, 0)) * v_coeff, 2),
        (v_mois + (coalesce(v.jour_echeance, 1) - 1) * interval '1 day')::date,
        v_coeff < 1
      );
      v_crees := v_crees + 1;
    end if;
    v_mois := (v_mois + interval '1 month')::date;
  end loop;
  return v_crees;
end;
$$;
revoke execute on function public.generer_appels_loyer(uuid) from public, anon;
