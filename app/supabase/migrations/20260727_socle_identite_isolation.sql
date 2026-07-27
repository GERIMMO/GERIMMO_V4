-- Sprint 0 — Socle d'identité et d'isolation (livrable A1, lot 0)
-- Un compte global, des adhésions par agence. RLS sur toute table (RM-A1.6/7).
-- Identifiants UUID non séquentiels (RM-A1.12).
-- Appliquée le 2026-07-27 sur le projet « Gerimmo V4 » (rddlxunppddzpsaatdaz)
-- via l'outil MCP apply_migration. Copie de référence versionnée.

-- ============================================================
-- Types
-- ============================================================
create type public.organization_status as enum ('essai', 'active', 'suspendue', 'archivee');
create type public.membership_role as enum (
  'super_admin', 'admin_agence', 'agent',
  'proprietaire_direct', 'proprietaire_mandant', 'locataire', 'artisan', 'garant'
);
create type public.membership_status as enum ('active', 'inactive');

-- ============================================================
-- Tables
-- ============================================================

-- L'agence : racine de l'isolation (A1)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.organization_status not null default 'essai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compte global : moyen d'authentification, miroir de auth.users
create table public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  mfa_actif boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RM-A1.1 : email strictement unique sur toute la plateforme
create unique index accounts_email_unique on public.accounts (lower(email));

-- Identité métier, par agence ; peut exister sans compte (RM-A1.4)
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  account_id uuid references public.accounts (id),
  nom text not null,
  prenom text,
  email text,
  telephone text,
  date_naissance date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index persons_organization_idx on public.persons (organization_id);
create index persons_account_idx on public.persons (account_id) where account_id is not null;

-- Adhésion : compte + agence + rôle + état (RM-A1.5 : le rôle vit ici, jamais sur accounts)
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  organization_id uuid references public.organizations (id),
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Le super admin est une adhésion sans organisation ; tout autre rôle en exige une
  constraint memberships_super_admin_sans_org check (
    (role = 'super_admin' and organization_id is null)
    or (role <> 'super_admin' and organization_id is not null)
  ),
  -- RM-A1.3 : une seule adhésion par couple compte x agence
  constraint memberships_unique_compte_agence unique (account_id, organization_id)
);
-- Le unique ci-dessus ignore les NULL : au plus une adhésion super admin par compte
create unique index memberships_super_admin_unique
  on public.memberships (account_id) where organization_id is null;
create index memberships_organization_idx on public.memberships (organization_id);

-- Journal d'audit (3 ans — A2/A4) : dès le S0 pour la traversée super admin (RM-A1.11)
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id),
  organization_id uuid references public.organizations (id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at);

-- ============================================================
-- Triggers techniques
-- ============================================================
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger persons_updated_at before update on public.persons
  for each row execute function public.set_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- Miroir auth.users -> accounts (création + changement d'email)
create function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_change();
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_auth_user_change();

-- ============================================================
-- Fonctions d'autorisation (stables, security definer)
-- ============================================================
create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = (select auth.uid())
      and m.role = 'super_admin'
      and m.status = 'active'
  );
$$;

create function public.is_active_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = (select auth.uid())
      and m.organization_id = org
      and m.status = 'active'
  );
$$;

create function public.has_org_role(org uuid, roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = (select auth.uid())
      and m.organization_id = org
      and m.status = 'active'
      and m.role = any (roles)
  );
$$;

-- Traversée super admin journalisée (RM-A1.11) : appelée par l'application
create function public.log_sa_access(org uuid, sa_action text, sa_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'log_sa_access: reserve au super admin';
  end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), org, sa_action, sa_details);
end;
$$;

-- Durcissement : helpers exécutables par les seuls utilisateurs authentifiés
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.is_active_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.membership_role[]) from public, anon;
revoke execute on function public.log_sa_access(uuid, text, jsonb) from public, anon;

-- ============================================================
-- RLS : activée sur toute table (test « RLS actif partout »)
-- ============================================================
alter table public.organizations enable row level security;
alter table public.accounts enable row level security;
alter table public.persons enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

-- organizations : lecture par membre actif ; gestion réservée au super admin
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_active_member(id) or public.is_super_admin());
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (public.is_super_admin());
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_super_admin());
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.is_super_admin());

-- accounts : chacun voit et modifie le sien ; super admin voit tout
create policy accounts_select on public.accounts
  for select to authenticated
  using (id = (select auth.uid()) or public.is_super_admin());
create policy accounts_update on public.accounts
  for update to authenticated
  using (id = (select auth.uid()) or public.is_super_admin());

-- persons : données d'agence, cloisonnées strictement (RM-A1.6)
create policy persons_select on public.persons
  for select to authenticated
  using (public.is_active_member(organization_id) or public.is_super_admin());
create policy persons_insert on public.persons
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin_agence','agent']::public.membership_role[])
    or public.is_super_admin()
  );
create policy persons_update on public.persons
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['admin_agence','agent']::public.membership_role[])
    or public.is_super_admin()
  );
-- Pas de DELETE : une personne ne se supprime jamais, elle s'archive (RM-0b.1.4)
create policy persons_delete on public.persons
  for delete to authenticated
  using (public.is_super_admin());

-- memberships : chacun lit les siennes (sélecteur d'espace) ; l'AA gère celles de son agence
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    account_id = (select auth.uid())
    or public.has_org_role(organization_id, array['admin_agence']::public.membership_role[])
    or public.is_super_admin()
  );
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin_agence']::public.membership_role[])
    or public.is_super_admin()
  );
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['admin_agence']::public.membership_role[])
    or public.is_super_admin()
  );
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.is_super_admin());

-- audit_log : lecture super admin ; écriture par fonctions definer uniquement
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_super_admin());
