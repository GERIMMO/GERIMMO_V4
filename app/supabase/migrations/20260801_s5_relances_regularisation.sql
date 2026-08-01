-- Sprint 5D : relances d'impayé + mise en demeure (LRAR hors plateforme, date de
-- première présentation saisie). Chaque relance horodatée = preuve des diligences.
create table public.relances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  niveau text not null check (niveau in ('relance_1', 'relance_2', 'mise_en_demeure')),
  date_envoi date not null default current_date,
  date_premiere_presentation date,
  numero_recommande text,
  note text,
  created_at timestamptz not null default now()
);
create index relances_bail_idx on public.relances (bail_id);
alter table public.relances enable row level security;
create policy relances_select on public.relances for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy relances_insert on public.relances for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy relances_delete on public.relances for delete
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

-- Sprint 5F : régularisation annuelle des charges (provisions vs réel, justificatif
-- obligatoire, prorata via les appels de la période).
create table public.regularisations_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null references public.baux (id) on delete cascade,
  annee integer not null,
  provisions numeric not null default 0,
  charges_reelles numeric not null,
  ecart numeric not null,
  justificatif_document uuid references public.documents (id),
  note text,
  date_emission date not null default current_date,
  created_at timestamptz not null default now(),
  unique (bail_id, annee)
);
create index regul_charges_bail_idx on public.regularisations_charges (bail_id);
alter table public.regularisations_charges enable row level security;
create policy regul_select on public.regularisations_charges for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create function public.provisions_charges_annee(p_bail uuid, p_annee integer)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(charges), 0)
  from public.appels_loyer
  where bail_id = p_bail and extract(year from periode) = p_annee;
$$;

create function public.regulariser_charges(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text default null
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_prov numeric; v_ecart numeric;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_justificatif is null then
    raise exception 'Un justificatif est obligatoire pour la régularisation (décompte remis au locataire)';
  end if;
  if p_charges_reelles is null or p_charges_reelles < 0 then raise exception 'Charges réelles invalides'; end if;
  v_prov := public.provisions_charges_annee(p_bail, p_annee);
  v_ecart := round(v_prov - p_charges_reelles, 2);
  insert into public.regularisations_charges
    (organization_id, bail_id, annee, provisions, charges_reelles, ecart, justificatif_document, note)
  values (v_org, p_bail, p_annee, v_prov, p_charges_reelles, v_ecart, p_justificatif, p_note)
  on conflict (bail_id, annee) do update
    set charges_reelles = excluded.charges_reelles, provisions = excluded.provisions,
        ecart = excluded.ecart, justificatif_document = excluded.justificatif_document,
        note = excluded.note, date_emission = current_date;
  return v_ecart;
end;
$$;
revoke execute on function public.regulariser_charges(uuid, integer, numeric, uuid, text) from public, anon;
