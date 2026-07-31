-- Sprint 4 (incrément 3) — Comparatif EDL entrée/sortie + congés (module 1)

-- Comparatif : mêmes lignes (par libellé), écart d'état mis en évidence.
-- SECURITY INVOKER = respecte la RLS agence.
create function public.comparatif_edl(p_bail uuid)
returns table (
  libelle text, categorie text,
  etat_entree public.etat_element, etat_sortie public.etat_element, ecart boolean
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    coalesce(e.libelle, s.libelle) as libelle,
    coalesce(e.categorie, s.categorie) as categorie,
    e.etat as etat_entree, s.etat as etat_sortie,
    (e.etat is distinct from s.etat) as ecart
  from (
    select l.libelle, l.categorie, l.etat
    from public.edl_lignes l
    join public.etats_des_lieux ed on ed.id = l.edl_id
    where ed.bail_id = p_bail and ed.type = 'entree'
  ) e
  full outer join (
    select l.libelle, l.categorie, l.etat
    from public.edl_lignes l
    join public.etats_des_lieux ed on ed.id = l.edl_id
    where ed.bail_id = p_bail and ed.type = 'sortie'
  ) s on e.libelle = s.libelle
  order by 2, 1;
$$;

-- Congés : locataire ou bailleur. LRAR hors plateforme → on saisit la date de
-- première présentation ; préavis réduit (< 3 mois) sur justificatif obligatoire.
create type public.conge_par as enum ('locataire', 'bailleur');

create table public.conges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bail_id uuid not null,
  par public.conge_par not null,
  date_premiere_presentation date not null,
  preavis_mois smallint not null default 3 check (preavis_mois between 1 and 3),
  date_effet date not null,
  motif text,
  justificatif_document uuid,
  created_at timestamptz not null default now(),
  constraint conges_bail_meme_org_fk
    foreign key (bail_id, organization_id) references public.baux (id, organization_id) on delete cascade
);
create index conges_bail_idx on public.conges (bail_id);
create index conges_org_idx on public.conges (organization_id);

create function public.enregistrer_conge(
  p_bail uuid, p_par public.conge_par, p_date_presentation date,
  p_preavis_mois smallint, p_motif text default null, p_justificatif uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_etat public.bail_etat;
  v_effet date;
  v_conge uuid;
begin
  select organization_id, etat into v_org, v_etat from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;
  if p_preavis_mois < 3 and p_justificatif is null then
    raise exception 'Préavis réduit : un justificatif est obligatoire (RM-1.x)';
  end if;

  v_effet := (p_date_presentation + (p_preavis_mois || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet, motif, justificatif_document)
  values
    (v_org, p_bail, p_par, p_date_presentation, p_preavis_mois, v_effet, p_motif, p_justificatif)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  return v_conge;
end;
$$;
revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid)
  from public, anon;

alter table public.conges enable row level security;
create policy conges_select on public.conges
  for select to authenticated
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin()));
-- Écriture uniquement via enregistrer_conge (definer)
revoke insert, update, delete on public.conges from authenticated;
revoke all on public.conges from anon;
