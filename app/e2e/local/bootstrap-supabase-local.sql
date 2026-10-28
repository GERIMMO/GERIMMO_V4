-- Prépare une base Postgres locale « façon Supabase » pour l'E2E hors ligne :
-- rôles, schémas auth/extensions/storage et fonctions attendues par les
-- migrations du dossier supabase/migrations. Aucune donnée applicative ici.
-- Usage : psql -d gerimmo_local -f bootstrap-supabase-local.sql

-- ── Rôles PostgREST ────────────────────────────────────────────────────────
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to current_user;
grant usage on schema public to anon, authenticated, service_role;

-- Registre local de versions pour éprouver les sauvegardes comme en production.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
revoke all on schema supabase_migrations from public, anon, authenticated;
revoke all on supabase_migrations.schema_migrations from public, anon, authenticated;

-- ── Extensions ─────────────────────────────────────────────────────────────
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ── Schéma auth (sous-ensemble Supabase utilisé par les migrations) ────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text,
  recovery_token text,
  email_change text,
  email_change_token_new text,
  email_change_token_current text,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sign_in_at timestamptz,
  phone text,
  banned_until timestamptz,
  deleted_at timestamptz
);

-- Début immuable et échéance de chaque session du banc.
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  not_after timestamptz
);
revoke all on auth.sessions from anon, authenticated;

-- Les seconds facteurs, comme sur Supabase (sous-ensemble). L'émulateur y reflète son magasin en mémoire (mfa-local.mjs) :
-- public.niveau_assurance_suffisant() les lit pour exiger aal2 d'un compte qui en a un (audit final du 27/10, PUB-01).
create table if not exists auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  friendly_name text,
  factor_type text not null default 'totp',
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on auth.mfa_factors from anon, authenticated;

-- Sous-ensemble des jetons utilisé par le bouton de confirmation du banc UI.
create table if not exists auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_type text not null,
  token_hash text not null,
  relates_to text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token_type)
);

-- Identique à Supabase : lit le claim `sub` posé par la couche d'accès
-- (set_config('request.jwt.claims', …)).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), ''
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.email', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  )
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

grant select on auth.users to authenticated, service_role;

-- ── Schéma storage (sous-ensemble : buckets + objects + helpers) ───────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb default '{}'::jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

create or replace function storage.filename(name text) returns text
language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

create or replace function storage.extension(name text) returns text
language sql immutable as $$
  select reverse(split_part(reverse(storage.filename(name)), '.', 1))
$$;

grant all on storage.buckets, storage.objects to authenticated, service_role;
grant select on storage.buckets, storage.objects to anon;

-- ── Privilèges par défaut du schéma public ─────────────────────────────────
-- Fidèles à Supabase : anon reçoit AUSSI les privilèges de table — en prod la
-- seule barrière est le qual RLS, le banc local doit reproduire ce risque
-- (constat de l'audit du 10/09), pas le masquer.
alter default privileges in schema public
  grant select, insert, update, delete, truncate on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
