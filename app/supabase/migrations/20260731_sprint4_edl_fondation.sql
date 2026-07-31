-- Sprint 4 (incrément 2) — État des lieux (EDL) : fondation
-- Source : wiki/concepts/État des lieux (module 1). Grille générée depuis le lot
-- (éléments standard + équipements), saisie pièce par pièce, AUCUNE ligne sans
-- état, figé dès signature (RM). Un EDL d'entrée et un de sortie par bail.

create type public.edl_type as enum ('entree', 'sortie');
create type public.edl_etat as enum ('brouillon', 'signe');
create type public.etat_element as enum ('neuf', 'bon', 'usage', 'mauvais', 'absent');

create table public.etats_des_lieux (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null,
  type public.edl_type not null,
  etat public.edl_etat not null default 'brouillon',
  date_edl date not null default current_date,
  signe_le timestamptz,
  created_at timestamptz not null default now(),
  constraint edl_id_org_unique unique (id, organization_id),
  constraint edl_bail_meme_org_fk
    foreign key (bail_id, organization_id) references public.baux (id, organization_id) on delete cascade,
  constraint edl_type_unique unique (bail_id, type)
);

create table public.edl_lignes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  edl_id uuid not null,
  categorie text not null default 'general',
  libelle text not null,
  etat public.etat_element,
  commentaire text,
  photo_document_id uuid,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  constraint edl_lignes_edl_meme_org_fk
    foreign key (edl_id, organization_id) references public.etats_des_lieux (id, organization_id) on delete cascade
);

create index etats_des_lieux_org_idx on public.etats_des_lieux (organization_id);
create index etats_des_lieux_bail_idx on public.etats_des_lieux (bail_id);
create index edl_lignes_edl_idx on public.edl_lignes (edl_id);
create index edl_lignes_org_idx on public.edl_lignes (organization_id);

-- Générer la grille depuis le lot : éléments standard + équipements cochés
create function public.generer_grille_edl(p_edl uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_crees int := 0;
  v_ordre int := 0;
  v_element text;
  v_equip record;
begin
  select e.organization_id, e.etat, b.lot_id
    into v
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

  foreach v_element in array
    array['Sols','Murs','Plafonds','Portes','Fenêtres','Électricité','Plomberie']
  loop
    insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
    values (v.organization_id, p_edl, 'general', v_element, v_ordre);
    v_ordre := v_ordre + 1; v_crees := v_crees + 1;
  end loop;

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

-- Signer : aucune ligne sans état (RM), grille non vide, puis figer
create function public.signer_edl(p_edl uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_manquantes int;
  v_total int;
begin
  select * into v from public.etats_des_lieux where id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'signe' then raise exception 'EDL déjà signé'; end if;

  select count(*) filter (where etat is null), count(*)
    into v_manquantes, v_total
  from public.edl_lignes where edl_id = p_edl;
  if v_total = 0 then
    raise exception 'Grille vide : générez la grille avant de signer';
  end if;
  if v_manquantes > 0 then
    raise exception 'Aucune ligne ne peut rester sans état (% à compléter)', v_manquantes;
  end if;

  update public.etats_des_lieux set etat = 'signe', signe_le = now() where id = p_edl;
end;
$$;
revoke execute on function public.signer_edl(uuid) from public, anon;

-- Figé dès signature : les lignes d'un EDL signé ne se modifient plus (RM)
create function public.edl_lignes_fige()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat public.edl_etat;
begin
  select etat into v_etat from public.etats_des_lieux
  where id = coalesce(new.edl_id, old.edl_id);
  if v_etat = 'signe' then
    raise exception 'EDL signé : les lignes sont figées';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger edl_lignes_fige_trg
  before insert or update or delete on public.edl_lignes
  for each row execute function public.edl_lignes_fige();

-- ============================================================
-- RLS — étanchéité par agence (rôles gestion)
-- ============================================================
alter table public.etats_des_lieux enable row level security;
alter table public.edl_lignes enable row level security;

create policy edl_select on public.etats_des_lieux
  for select to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin()));
create policy edl_insert on public.etats_des_lieux
  for insert to authenticated
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy edl_update on public.etats_des_lieux
  for update to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

create policy edl_lignes_select on public.edl_lignes
  for select to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin()));
create policy edl_lignes_insert on public.edl_lignes
  for insert to authenticated
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy edl_lignes_update on public.edl_lignes
  for update to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy edl_lignes_delete on public.edl_lignes
  for delete to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));

revoke delete on public.etats_des_lieux from authenticated;
revoke all on public.etats_des_lieux, public.edl_lignes from anon;
