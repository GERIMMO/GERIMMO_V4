-- Revue Sprint 0 — durcissement et optimisation des politiques RLS.
-- Appliquée le 2026-07-28 sur « Gerimmo V4 » via l'outil MCP apply_migration.
-- 1) Perf : les politiques appelaient une fonction par LIGNE (vigilance du lot 0).
--    Remplacement par des fonctions stables SANS argument dépendant de la ligne
--    (user_org_ids / org_ids_avec_roles) => évaluées une fois par requête (InitPlan).
-- 2) Sécurité : persons_select était ouvert à tout membre actif (un locataire
--    aurait vu toutes les fiches de l'agence) => restreint aux rôles gérants.
-- 3) Privilèges : écriture sur accounts limitée à la colonne mfa_actif ;
--    audit_log en lecture seule côté client ; anon sans aucun privilège.

-- ============================================================
-- Fonctions d'appartenance « InitPlan-compatibles »
-- ============================================================
create function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.account_id = (select auth.uid())
    and m.status = 'active'
    and m.organization_id is not null;
$$;

create function public.org_ids_avec_roles(roles public.membership_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.account_id = (select auth.uid())
    and m.status = 'active'
    and m.organization_id is not null
    and m.role = any (roles);
$$;

revoke execute on function public.user_org_ids() from public, anon;
revoke execute on function public.org_ids_avec_roles(public.membership_role[]) from public, anon;

-- ============================================================
-- Réécriture des politiques
-- ============================================================
drop policy organizations_select on public.organizations;
drop policy organizations_insert on public.organizations;
drop policy organizations_update on public.organizations;
drop policy organizations_delete on public.organizations;
drop policy accounts_select on public.accounts;
drop policy accounts_update on public.accounts;
drop policy persons_select on public.persons;
drop policy persons_insert on public.persons;
drop policy persons_update on public.persons;
drop policy persons_delete on public.persons;
drop policy memberships_select on public.memberships;
drop policy memberships_insert on public.memberships;
drop policy memberships_update on public.memberships;
drop policy memberships_delete on public.memberships;
drop policy audit_log_select on public.audit_log;

create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select public.user_org_ids()) or (select public.is_super_admin()));
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check ((select public.is_super_admin()));
create policy organizations_update on public.organizations
  for update to authenticated
  using ((select public.is_super_admin()));
create policy organizations_delete on public.organizations
  for delete to authenticated
  using ((select public.is_super_admin()));

create policy accounts_select on public.accounts
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()));
create policy accounts_update on public.accounts
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()));

-- Les fiches personnes sont réservées aux gérants de l'agence (et au SA) :
-- un locataire ou un artisan membre ne parcourt pas l'annuaire de l'agence.
create policy persons_select on public.persons
  for select to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy persons_insert on public.persons
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy persons_update on public.persons
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy persons_delete on public.persons
  for delete to authenticated
  using ((select public.is_super_admin()));

create policy memberships_select on public.memberships
  for select to authenticated
  using (
    account_id = (select auth.uid())
    or organization_id in (select public.org_ids_avec_roles(
      array['admin_agence']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    organization_id in (select public.org_ids_avec_roles(
      array['admin_agence']::public.membership_role[]))
    or (select public.is_super_admin())
  );
create policy memberships_delete on public.memberships
  for delete to authenticated
  using ((select public.is_super_admin()));

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.is_super_admin()));

-- ============================================================
-- Privilèges de colonnes et durcissement
-- ============================================================
-- accounts : seul mfa_actif est modifiable par son titulaire (l'email est
-- géré par auth.users via trigger ; le désynchroniser serait une anomalie)
revoke insert, update, delete on public.accounts from authenticated;
grant update (mfa_actif) on public.accounts to authenticated;

-- audit_log : aucune écriture directe côté client (fonctions definer uniquement)
revoke insert, update, delete on public.audit_log from authenticated;

-- anon : aucun privilège sur les tables du socle
revoke all on public.organizations, public.accounts, public.persons,
  public.memberships, public.audit_log from anon;
