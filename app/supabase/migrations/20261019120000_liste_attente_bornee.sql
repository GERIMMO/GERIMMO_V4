-- Lot M2 (audit du 19 octobre 2026) : la table public.liste_attente, créée HORS DÉPÔT, entre au dépôt et se borne.
--
-- Constat (relevé en production le 19/10, lecture seule). La table a été créée le 29/09/2026 par une migration passée à la
-- main (version 20260929200141, nom « creer_liste_attente_site » dans supabase_migrations.schema_migrations), sans aucun
-- fichier dans le dépôt : id uuid (clé primaire, gen_random_uuid()), email text not null unique (contrainte
-- liste_attente_email_key, sur l'adresse brute), biens text, source text, created_at timestamptz not null default now(),
-- contrainte liste_attente_email_format (une arobase, un point, aucun blanc), RLS activée, une seule politique
-- « inscription anonyme » (for insert to anon with check (true)), droit d'insertion de `anon` par COLONNE (email, biens,
-- source), aucune lecture pour `anon`, droits de table hérités pour `authenticated` (sans politique : inopérants), le
-- déclencheur diagnostic_artisan_lecture posé le 12/10 sur toutes les tables de public ; 0 ligne, une seule insertion
-- d'essai depuis la création. C'est la seule table de public où `anon` détient encore une écriture — par colonne, donc
-- invisible des tests d'invariant qui ne regardaient que has_table_privilege (corrigés le 19/10 : ils regardent aussi
-- has_any_column_privilege et attendent nommément l'exception liste_attente/INSERT).
--
-- Décision du 19/10 : CONSERVER la table (le dirigeant tranchera son usage), l'intégrer au dépôt et la BORNER :
--   · la définition relevée est reprise telle quelle (create table if not exists : sans effet en production, où la table
--     existe ; crée la table sur une base reconstruite depuis le manifeste) ;
--   · trois contraintes CHECK, posées une seule fois (if not exists) : email ≤ 254 caractères, une seule arobase, ni blanc
--     ASCII ni caractère de contrôle, ni blanc Unicode (espace insécable U+00A0, espaces typographiques U+1680 et
--     U+2000–U+200B, séparateurs U+2028/U+2029, U+202F, U+205F, U+3000, marque d'ordre des octets U+FEFF — la classe
--     [[:space:]] ne couvre que les blancs ASCII en C.UTF-8) ; biens ≤ 120 et source ≤ 80 caractères, sans caractère de
--     contrôle et non vides une fois les blancs retirés (length(btrim(…)) between 1 and …) — la valeur absente reste null ;
--   · un index unique sur lower(email) : le doublon à casse différente est refusé (la contrainte d'unicité d'origine sur
--     l'adresse brute est conservée) ;
--   · un PLAFOND D'INSERTION tenu par la base, sur le modèle de demandes_devis_limiter (20260927124000) : la clé publiable
--     étant dans le navigateur, un robot écrit directement par PostgREST ; le déclencheur liste_attente_limiter refuse
--     au-delà de 30 inscriptions par heure glissante, toutes adresses confondues, sous verrou transactionnel. Seuil
--     technique, pas règle métier (aucune page du wiki ne fixe de volume d'inscriptions) ; il se relève ici sans autre
--     effet. Fonction NOUVELLE : relevé en production du 19/10, to_regprocedure('public.liste_attente_limiter()') est nul,
--     aucune définition à comparer ;
--   · la politique d'insertion anonyme est conservée (même nom, même définition) ; aucune lecture, modification ni
--     suppression pour `anon` et `authenticated` (revoke explicite) : la liste n'est lisible que par la clé de service et
--     le tableau de bord ;
--   · le déclencheur diagnostic_artisan_lecture, présent en production, est posé de la même façon sur une base reconstruite ;
--   · le commentaire de table date l'origine et la reprise.
--
-- Aucune ligne lue ni réécrite. Les contraintes sont VALIDÉES à la pose (choix du 19/10 : la table est vide, le NOT VALID
-- de demandes_devis_longueurs n'a pas d'objet) : une ligne hors borne arrêterait la migration en nommant la contrainte,
-- sans rien modifier ; l'index unique sur lower(email), lui, ne peut pas être posé « not valid ». VÉRIFICATION PRÉALABLE
-- à faire en production (lecture seule) avant la simulation puis l'application, et à consigner dans la PR :
--   select count(*) from public.liste_attente ;
--   select lower(email), count(*) from public.liste_attente group by 1 having count(*) > 1 ;
-- Attendu : 0 ligne et aucun doublon (relevé du 19/10 : 0 et 0). Toute autre réponse : traiter les lignes avec le dirigeant
-- avant d'appliquer. Une seule fonction, nouvelle (liste_attente_limiter). Rejouable : `if not exists`,
-- `drop … if exists`, `create or replace`, revoke/grant sans effet la seconde fois.
-- Retour : supabase/retours-arriere/20261019120000_liste_attente_bornee.retour.sql

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

-- ── 1. La table, telle que relevée en production (sans effet là où elle existe déjà) ──────────────────────────────────
create table if not exists public.liste_attente (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  biens text,
  source text,
  created_at timestamptz not null default now(),
  constraint liste_attente_email_format check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
);

alter table public.liste_attente enable row level security;

-- ── 2. Les bornes, posées une seule fois ─────────────────────────────────────────────────────────────────────────────
-- Les échappements \uXXXX sont ceux du moteur d'expressions rationnelles de PostgreSQL (ARE) ; la chaîne SQL les lui
-- transmet tels quels (standard_conforming_strings). Vérifié sur PostgreSQL 16 en C.UTF-8 : U+00A0, U+200B et U+FEFF sont
-- reconnus, et aucun d'eux n'est couvert par [[:space:]].
do $bornes$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = 'liste_attente_email_borne') then
    alter table public.liste_attente add constraint liste_attente_email_borne check (
      length(email) <= 254
      and email ~ '^[^@]+@[^@]+$'
      and email !~ '[[:space:][:cntrl:]]'
      and email !~ '[   -​    　﻿]'
    );
  end if;
  -- Longueur totale ≤ 120 et, blancs retirés, entre 1 et 120 caractères : « » et «    » sont refusés, null reste permis.
  if not exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = 'liste_attente_biens_borne') then
    alter table public.liste_attente add constraint liste_attente_biens_borne check (
      biens is null or (length(biens) <= 120 and length(btrim(biens)) between 1 and 120 and biens !~ '[[:cntrl:]]')
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = 'liste_attente_source_borne') then
    alter table public.liste_attente add constraint liste_attente_source_borne check (
      source is null or (length(source) <= 80 and length(btrim(source)) between 1 and 80 and source !~ '[[:cntrl:]]')
    );
  end if;
end $bornes$;

-- Le doublon à casse différente est refusé ; l'unicité d'origine sur l'adresse brute (liste_attente_email_key) reste.
create unique index if not exists liste_attente_email_lower_idx on public.liste_attente (lower(email));

-- ── 3. Le plafond d'insertion, tenu par la base (modèle : demandes_devis_limiter, 20260927124000) ─────────────────────
-- Le déclencheur n'est pas une RPC : une fonction `returns trigger` ne s'appelle pas par /rest/v1/rpc, et son droit
-- d'exécution n'est vérifié qu'à la création du déclencheur — on le retire donc à tous les rôles.
create or replace function public.liste_attente_limiter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_total integer;
begin
  -- Une seule insertion compte à la fois : sans ce verrou, cent envois simultanés liraient tous « zéro inscription dans l'heure ».
  perform pg_advisory_xact_lock(hashtext('public.liste_attente'));

  select count(*) into v_total from public.liste_attente l
  where l.created_at > now() - interval '1 hour';
  if v_total >= 30 then
    raise exception 'Le formulaire reçoit beaucoup d''inscriptions en ce moment : réessayez dans une heure.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.liste_attente_limiter() from public, anon, authenticated;

drop trigger if exists liste_attente_limiter on public.liste_attente;
create trigger liste_attente_limiter
  before insert on public.liste_attente
  for each row execute function public.liste_attente_limiter();

-- Le comptage de l'heure glissante lit cet index plutôt que la table entière.
create index if not exists liste_attente_recent_idx on public.liste_attente (created_at desc);

-- ── 4. Le déclencheur de diagnostic, comme sur toute table de public depuis le 12/10 (présent en production) ──────────
drop trigger if exists diagnostic_artisan_lecture on public.liste_attente;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.liste_attente
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- ── 5. Droits et politique ───────────────────────────────────────────────────────────────────────────────────────────
-- Aucun select, update, delete (ni truncate, references, trigger) pour anon et authenticated : la liste se lit par la clé
-- de service et le tableau de bord. `revoke all` retire aussi les droits par colonne ; celui d'anon est reposé juste après,
-- sur les trois colonnes du formulaire seulement (ni id ni created_at : défauts de la base).
revoke all on table public.liste_attente from public, anon, authenticated;
grant insert (email, biens, source) on table public.liste_attente to anon;
grant select, insert, update, delete on table public.liste_attente to service_role;

-- La politique d'insertion anonyme, conservée : même nom, même définition que celle relevée en production.
drop policy if exists "inscription anonyme" on public.liste_attente;
create policy "inscription anonyme" on public.liste_attente
  for insert to anon
  with check (true);

comment on table public.liste_attente is
  'Liste d''attente du site vitrine (créée hors dépôt le 29/09/2026, intégrée et bornée le 19/10/2026)';

-- ── 6. Contrôle : on s'arrête plutôt que de taire un droit de trop ou de moins ───────────────────────────────────────
do $controle$
begin
  if has_table_privilege('anon', 'public.liste_attente', 'INSERT')
     or has_column_privilege('anon', 'public.liste_attente', 'id', 'INSERT')
     or has_column_privilege('anon', 'public.liste_attente', 'created_at', 'INSERT') then
    raise exception 'liste_attente : anon doit insérer par colonne (email, biens, source) seulement';
  end if;
  if not has_any_column_privilege('anon', 'public.liste_attente', 'INSERT') then
    raise exception 'liste_attente : le droit d''insertion anonyme (email, biens, source) manque';
  end if;
  if has_any_column_privilege('anon', 'public.liste_attente', 'SELECT')
     or has_any_column_privilege('anon', 'public.liste_attente', 'UPDATE')
     or has_table_privilege('anon', 'public.liste_attente', 'SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
    raise exception 'liste_attente : anon garde un droit autre que l''insertion';
  end if;
  if has_any_column_privilege('authenticated', 'public.liste_attente', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.liste_attente', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.liste_attente', 'UPDATE')
     or has_table_privilege('authenticated', 'public.liste_attente', 'DELETE, TRUNCATE, REFERENCES, TRIGGER') then
    raise exception 'liste_attente : authenticated garde un droit';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.liste_attente'::regclass) <> 1 then
    raise exception 'liste_attente : une seule politique attendue (« inscription anonyme »)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.liste_attente'::regclass) then
    raise exception 'liste_attente : la sécurité par ligne doit être activée';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.liste_attente'::regclass and tgname = 'liste_attente_limiter' and not tgisinternal) then
    raise exception 'liste_attente : le déclencheur de plafond liste_attente_limiter manque';
  end if;
  if has_function_privilege('anon', 'public.liste_attente_limiter()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.liste_attente_limiter()', 'EXECUTE') then
    raise exception 'liste_attente : la fonction de plafond ne doit pas être exécutable par anon ni authenticated';
  end if;
end $controle$;

-- Convention de toute migration : les fonctions de public sont fermées à anon (liste_attente_limiter comprise).
select public.fermer_fonctions_a_anon();
