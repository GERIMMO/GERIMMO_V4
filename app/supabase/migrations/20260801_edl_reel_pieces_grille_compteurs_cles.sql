-- Item ⑤ (Option A) : EDL réel web — pièces du lot, grille par pièce, compteurs, clés.
-- (Photos + signature tactile 2 parties + mobile = Sprint 13.)

-- Pièces du lot (le champ lots.pieces reste le simple compteur ; ici la liste réelle)
create table public.lot_pieces (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  nom text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index lot_pieces_lot_idx on public.lot_pieces (lot_id);
alter table public.lot_pieces enable row level security;

-- Rattachement d'une ligne d'EDL à une pièce
alter table public.edl_lignes add column piece text;

-- Relevés de compteurs (entrée ET sortie via l'EDL correspondant)
create table public.edl_compteurs (
  id uuid primary key default gen_random_uuid(),
  edl_id uuid not null references public.etats_des_lieux (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  type text not null,
  numero text,
  releve numeric,
  created_at timestamptz not null default now()
);
create index edl_compteurs_edl_idx on public.edl_compteurs (edl_id);
alter table public.edl_compteurs enable row level security;

-- Clés / badges remis (et restitution en sortie)
create table public.edl_cles (
  id uuid primary key default gen_random_uuid(),
  edl_id uuid not null references public.etats_des_lieux (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  libelle text not null,
  nombre integer not null default 1 check (nombre >= 0),
  reference text,
  created_at timestamptz not null default now()
);
create index edl_cles_edl_idx on public.edl_cles (edl_id);
alter table public.edl_cles enable row level security;

-- Politiques RLS (gérants de l'agence) pour les trois tables
do $$
declare t text;
begin
  foreach t in array array['lot_pieces','edl_compteurs','edl_cles'] loop
    execute format($f$create policy %1$s_select on public.%1$s for select
      using (organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert
      with check (organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$s for update
      using (organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
      with check (organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$s for delete
      using (organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))$f$, t);
  end loop;
end $$;

-- Grille générée PIÈCE PAR PIÈCE depuis lot_pieces (repli liste plate si aucune pièce)
create or replace function public.generer_grille_edl(p_edl uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_crees int := 0;
  v_ordre int := 0;
  v_piece record;
  v_element text;
  v_equip record;
  v_a_pieces boolean;
  v_elements text[] := array['Sols','Murs','Plafonds','Fenêtres et volets','Portes','Prises électriques','Éclairage et interrupteurs'];
begin
  select e.organization_id, e.etat, b.lot_id into v
  from public.etats_des_lieux e
  join public.baux b on b.id = e.bail_id
  where e.id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'La grille ne se régénère pas sur un EDL signé';
  end if;

  delete from public.edl_lignes where edl_id = p_edl;

  select exists (select 1 from public.lot_pieces lp where lp.lot_id = v.lot_id) into v_a_pieces;

  if v_a_pieces then
    for v_piece in select nom from public.lot_pieces where lot_id = v.lot_id order by ordre, nom loop
      foreach v_element in array v_elements loop
        insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
        values (v.organization_id, p_edl, 'piece', v_piece.nom, v_element, v_ordre);
        v_ordre := v_ordre + 1; v_crees := v_crees + 1;
      end loop;
    end loop;
  else
    foreach v_element in array v_elements loop
      insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
      values (v.organization_id, p_edl, 'general', v_element, v_ordre);
      v_ordre := v_ordre + 1; v_crees := v_crees + 1;
    end loop;
  end if;

  for v_equip in
    select ec.nom from public.lot_equipements le
    join public.equipements_catalogue ec on ec.id = le.equipement_id
    where le.lot_id = v.lot_id order by ec.nom
  loop
    insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
    values (v.organization_id, p_edl, 'equipement', v_equip.nom, v_ordre);
    v_ordre := v_ordre + 1; v_crees := v_crees + 1;
  end loop;

  return v_crees;
end;
$$;
revoke execute on function public.generer_grille_edl(uuid) from public, anon;
