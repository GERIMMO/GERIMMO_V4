-- Sprint 8 : restitution du dépôt de garantie. Délai depuis la remise des clés
-- (1 mois conforme / 2 mois écarts), retenues avec décote de vétusté linéaire,
-- impayés imputés d'abord (RM-2.4.7), sans EDL d'entrée = restitution intégrale (RM-2.4.3).
create table public.restitutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade unique,
  date_remise_cles date not null,
  delai_mois integer not null check (delai_mois in (1, 2)),
  depot numeric not null default 0,
  impayes numeric not null default 0,
  sans_edl_entree boolean not null default false,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'finalise')),
  solde numeric,
  date_emission date,
  created_at timestamptz not null default now()
);
alter table public.restitutions enable row level security;
create policy restitutions_select on public.restitutions for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create table public.retenues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  restitution_id uuid not null references public.restitutions (id) on delete cascade,
  libelle text not null,
  cout numeric not null check (cout > 0),
  duree_vie_ans numeric,
  age_ans numeric,
  montant_retenu numeric not null,
  justificatif_document uuid references public.documents (id),
  created_at timestamptz not null default now()
);
create index retenues_restitution_idx on public.retenues (restitution_id);
alter table public.retenues enable row level security;
create policy retenues_select on public.retenues for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.demarrer_restitution(p_bail uuid, p_date_remise date, p_conforme boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_impayes numeric; v_sans_edl boolean; v_id uuid;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  v_sans_edl := not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe');
  v_impayes := greatest(0,
    coalesce((select sum(montant_du) from public.appels_loyer where bail_id = p_bail), 0)
    - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0));
  insert into public.restitutions
    (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, sans_edl_entree)
  values (v.organization_id, p_bail, p_date_remise, case when p_conforme then 1 else 2 end,
          coalesce(v.depot_garantie, 0), v_impayes, v_sans_edl)
  on conflict (bail_id) do update
    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        impayes = excluded.impayes, sans_edl_entree = excluded.sans_edl_entree
    where public.restitutions.statut = 'en_cours'
  returning id into v_id;
  if v_id is null then raise exception 'Restitution déjà finalisée pour ce bail'; end if;
  return v_id;
end $$;

create function public.ajouter_retenue(
  p_restitution uuid, p_libelle text, p_cout numeric,
  p_duree_vie numeric, p_age numeric, p_justificatif uuid default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_montant numeric;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte finalisé — plus de retenue possible'; end if;
  if v.sans_edl_entree then
    raise exception 'Sans état des lieux d''entrée, aucune retenue n''est possible : restitution intégrale (RM-2.4.3)';
  end if;
  if p_cout is null or p_cout <= 0 then raise exception 'Coût de remise en état invalide'; end if;
  if p_duree_vie is null or p_duree_vie <= 0 or p_age is null then
    v_montant := round(p_cout, 2);
  else
    v_montant := round(p_cout * greatest(0, (p_duree_vie - p_age) / p_duree_vie), 2);
  end if;
  insert into public.retenues
    (organization_id, restitution_id, libelle, cout, duree_vie_ans, age_ans, montant_retenu, justificatif_document)
  values (v.organization_id, p_restitution, p_libelle, p_cout, p_duree_vie, p_age, v_montant, p_justificatif);
  return v_montant;
end $$;

create function public.finaliser_decompte(p_restitution uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_retenues numeric; v_solde numeric;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte déjà finalisé'; end if;
  select coalesce(sum(montant_retenu), 0) into v_retenues from public.retenues where restitution_id = p_restitution;
  v_solde := round(v.depot - v.impayes - v_retenues, 2);
  update public.restitutions set statut = 'finalise', solde = v_solde, date_emission = current_date where id = p_restitution;
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id,
          case when v_retenues > 0 then 'decompte_lrar' else 'decompte' end, 'normale',
          case when v_solde < 0 then 'Solde de tout compte : créance sur le locataire'
               else 'Décompte de restitution à envoyer' end,
          jsonb_build_object('restitution_id', p_restitution, 'bail_id', v.bail_id, 'solde', v_solde));
  return v_solde;
end $$;

revoke execute on function public.demarrer_restitution(uuid, date, boolean) from public, anon;
revoke execute on function public.ajouter_retenue(uuid, text, numeric, numeric, numeric, uuid) from public, anon;
revoke execute on function public.finaliser_decompte(uuid) from public, anon;
