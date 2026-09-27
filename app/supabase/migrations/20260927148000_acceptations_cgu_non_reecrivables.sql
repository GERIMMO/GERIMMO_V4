-- AUDIT SÉCURITÉ DU 27/09 — MINEUR : L'ACCEPTATION DES CGU ÉTAIT RÉÉCRIVABLE.
--
-- La version et la date d'acceptation des conditions (`cgu_version`,
-- `cgu_acceptee_le`) vivaient seulement dans `user_metadata`, que le titulaire
-- du compte peut modifier à tout moment avec la seule clé publique
-- (`supabase.auth.updateUser`). La preuve du contenu accepté le jour de la
-- formation du contrat n'était donc pas opposable.
--
-- LA CORRECTION. Une table `acceptations_cgu` en AJOUT SEUL :
--  · aucune mise à jour, aucune suppression (déclencheur qui refuse, même pour
--    le propriétaire de la table ; seule la suppression du compte l'emporte,
--    par cascade) ;
--  · alimentée à la création du compte (inscription) par un déclencheur sur
--    `auth.users`, avec l'heure du SERVEUR ;
--  · et par `accepter_cgu(version)` quand un compte déjà connecté accepte
--    (ouverture d'un espace propriétaire) — heure du serveur, jamais celle
--    que déclare l'appelant.
-- Lecture : le titulaire (ses propres lignes) et la supervision.
--
-- Idempotent : IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS.

create table if not exists public.acceptations_cgu (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  version text not null check (length(version) between 1 and 40),
  acceptee_le timestamptz not null default now(),
  source text not null check (source in ('inscription', 'espace_proprietaire', 'compte')),
  created_at timestamptz not null default now()
);
create index if not exists acceptations_cgu_compte_idx on public.acceptations_cgu (account_id, acceptee_le desc);
alter table public.acceptations_cgu enable row level security;

drop policy if exists acceptations_cgu_lecture on public.acceptations_cgu;
create policy acceptations_cgu_lecture on public.acceptations_cgu
  for select to authenticated
  using (account_id = (select auth.uid()) or (select public.is_super_admin()));

revoke all on public.acceptations_cgu from public, anon, authenticated;
grant select on public.acceptations_cgu to authenticated;
grant select, insert on public.acceptations_cgu to service_role;

create or replace function public.acceptations_cgu_ajout_seul()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- La cascade de suppression du compte reste possible (droit à l'effacement).
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Une acceptation des conditions ne se modifie ni ne se supprime' using errcode = '42501';
end $$;

revoke execute on function public.acceptations_cgu_ajout_seul() from public, anon, authenticated;

drop trigger if exists acceptations_cgu_immuables on public.acceptations_cgu;
create trigger acceptations_cgu_immuables
  before update or delete on public.acceptations_cgu
  for each row execute function public.acceptations_cgu_ajout_seul();

-- À la création du compte : ce que l'inscription a déclaré accepter, à
-- l'heure du serveur. Nommé pour s'exécuter APRÈS `on_auth_user_created`
-- (ordre alphabétique des déclencheurs), qui crée la ligne `accounts`.
create or replace function public.consigner_cgu_inscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_version text := left(btrim(coalesce(new.raw_user_meta_data->>'cgu_version', '')), 40);
begin
  if v_version <> '' and exists (select 1 from public.accounts a where a.id = new.id) then
    insert into public.acceptations_cgu (account_id, version, source)
    values (new.id, v_version, 'inscription');
  end if;
  return new;
end $$;

revoke execute on function public.consigner_cgu_inscription() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_cgu on auth.users;
create trigger on_auth_user_created_cgu
  after insert on auth.users
  for each row execute function public.consigner_cgu_inscription();

create or replace function public.accepter_cgu(p_version text, p_source text default 'compte')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  insert into public.acceptations_cgu (account_id, version, source)
  values (v_uid, btrim(p_version),
          case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end);
end $$;

revoke execute on function public.accepter_cgu(text, text) from public, anon;
grant execute on function public.accepter_cgu(text, text) to authenticated;

comment on table public.acceptations_cgu is
  'Preuve des acceptations des CGU (version, heure serveur). Ajout seul : ni mise à jour ni suppression (audit 27/09).';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
