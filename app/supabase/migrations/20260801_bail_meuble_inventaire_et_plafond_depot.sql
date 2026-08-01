-- Item ② : inventaire mobilier structuré (obligatoire meublé, décret 2015-981) +
-- plafond de dépôt de garantie dynamique (1 mois nu / 2 mois meublé) au bail.

create table public.inventaire_lignes (
  id uuid primary key default gen_random_uuid(),
  bail_id uuid not null references public.baux (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  piece text,
  designation text not null,
  quantite integer not null default 1 check (quantite >= 1),
  etat text check (etat in ('neuf', 'bon', 'usage', 'mauvais')),
  observation text,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index inventaire_lignes_bail_idx on public.inventaire_lignes (bail_id);
alter table public.inventaire_lignes enable row level security;

create policy inv_select on public.inventaire_lignes for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy inv_insert on public.inventaire_lignes for insert
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy inv_update on public.inventaire_lignes for update
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy inv_delete on public.inventaire_lignes for delete
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

-- Plafond de dépôt ajouté à l'activation (RM-2.1 : 1 mois nu / 2 mois meublé, hors charges)
create or replace function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;
  if v.locataire_principal is null then
    raise exception 'Le locataire principal est obligatoire';
  end if;
  if v.document_signe is null then
    raise exception 'Déposez le bail signé (PDF) avant activation (V0 : signature hors plateforme)';
  end if;

  -- Plafond de dépôt de garantie selon le type de bail
  if v.loyer_hc is not null and v.depot_garantie is not null then
    v_plafond := (case when v.type = 'meuble' then 2 else 1 end) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        (case when v.type = 'meuble' then 2 else 1 end), v_plafond;
    end if;
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;

  update public.baux set etat = 'actif', updated_at = now() where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v.organization_id, 'edl_entree', 'normale',
          'État des lieux d''entrée à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id));
end;
$$;
