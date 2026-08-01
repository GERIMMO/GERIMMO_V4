-- Sprint 6 : rapport de gestion mensuel au mandant. Clôture obligatoire (RM-6.1.2),
-- « à valider » → envoyé (figé, RM-6.2.4) + alerte versement J+15 ; versement enregistré,
-- écart alerté. Net = recettes encaissées − dépenses (honoraires inclus) sur les lots du mandat.
create table public.rapports_gestion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  mandat_id uuid not null references public.mandats (id) on delete cascade,
  mois date not null,
  statut text not null default 'a_valider' check (statut in ('a_valider', 'envoye')),
  net numeric not null default 0,
  commentaire text,
  envoye_le timestamptz,
  versement_montant numeric,
  versement_date date,
  created_at timestamptz not null default now(),
  unique (mandat_id, mois)
);
create index rapports_gestion_mandat_idx on public.rapports_gestion (mandat_id);
alter table public.rapports_gestion enable row level security;
create policy rapports_select on public.rapports_gestion for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.generer_rapport(p_mandat uuid, p_mois date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_mois date; v_net numeric; v_rapport uuid;
begin
  select organization_id into v_org from public.mandats where id = p_mandat;
  if v_org is null then raise exception 'Mandat introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  v_mois := date_trunc('month', p_mois)::date;
  if not exists (select 1 from public.clotures_comptables c where c.organization_id = v_org and c.mois = v_mois) then
    raise exception 'Mois non clôturé : clôturez la comptabilité avant de générer le rapport (RM-6.1.2)';
  end if;

  select coalesce(sum(case when e.sens = 'recette' then e.montant else -e.montant end), 0) into v_net
  from public.ecritures e
  where e.organization_id = v_org
    and date_trunc('month', e.date_imputation)::date = v_mois
    and e.lot_id in (
      select ml.lot_id from public.mandat_lignes ml
      where ml.mandat_id = p_mandat
        and ml.date_debut <= (v_mois + interval '1 month' - interval '1 day')::date
        and (ml.date_fin is null or ml.date_fin >= v_mois)
    );

  insert into public.rapports_gestion (organization_id, mandat_id, mois, statut, net)
  values (v_org, p_mandat, v_mois, 'a_valider', v_net)
  on conflict (mandat_id, mois) do update set net = excluded.net
    where public.rapports_gestion.statut = 'a_valider'
  returning id into v_rapport;
  if v_rapport is null then
    raise exception 'Rapport déjà envoyé pour ce mois — passez par un rectificatif';
  end if;
  return v_rapport;
end $$;

create function public.envoyer_rapport(p_rapport uuid, p_commentaire text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from public.rapports_gestion where id = p_rapport;
  if v.id is null then raise exception 'Rapport introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'envoye' then raise exception 'Rapport déjà envoyé (figé)'; end if;
  update public.rapports_gestion
    set statut = 'envoye', envoye_le = now(), commentaire = coalesce(p_commentaire, commentaire)
    where id = p_rapport;
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id, 'versement_proprietaire', 'normale',
          'Versement au propriétaire à faire (J+15)',
          jsonb_build_object('rapport_id', p_rapport, 'mandat_id', v.mandat_id, 'net', v.net));
end $$;

create function public.enregistrer_versement(p_rapport uuid, p_montant numeric, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from public.rapports_gestion where id = p_rapport;
  if v.id is null then raise exception 'Rapport introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  update public.rapports_gestion set versement_montant = p_montant, versement_date = p_date where id = p_rapport;
  if abs(coalesce(p_montant, 0) - v.net) > 0.01 then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v.organization_id, 'ecart_versement', 'critique',
            'Écart entre le versement et le net du rapport',
            jsonb_build_object('rapport_id', p_rapport, 'net', v.net, 'verse', p_montant));
  end if;
end $$;

revoke execute on function public.generer_rapport(uuid, date) from public, anon;
revoke execute on function public.envoyer_rapport(uuid, text) from public, anon;
revoke execute on function public.enregistrer_versement(uuid, numeric, date) from public, anon;
