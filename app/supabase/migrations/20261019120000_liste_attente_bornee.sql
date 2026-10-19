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
-- invisible des tests d'invariant qui ne regardent que has_table_privilege.
--
-- Décision du 19/10 : CONSERVER la table (le dirigeant tranchera son usage), l'intégrer au dépôt et la BORNER :
--   · la définition relevée est reprise telle quelle (create table if not exists : sans effet en production, où la table
--     existe ; crée la table sur une base reconstruite depuis le manifeste) ;
--   · trois contraintes CHECK, posées une seule fois (if not exists) : email ≤ 254 caractères, une seule arobase, ni blanc
--     ni caractère de contrôle ; biens ≤ 120 et source ≤ 80 caractères, sans caractère de contrôle ;
--   · un index unique sur lower(email) : le doublon à casse différente est refusé (la contrainte d'unicité d'origine sur
--     l'adresse brute est conservée) ;
--   · la politique d'insertion anonyme est conservée (même nom, même définition) ; aucune lecture, modification ni
--     suppression pour `anon` et `authenticated` (revoke explicite) : la liste n'est lisible que par la clé de service et
--     le tableau de bord ;
--   · le déclencheur diagnostic_artisan_lecture, présent en production, est posé de la même façon sur une base reconstruite ;
--   · le commentaire de table date l'origine et la reprise.
--
-- Aucune ligne lue ni réécrite. Les contraintes sont validées à la pose : une ligne hors borne (il n'y en a aucune au relevé
-- du 19/10) arrêterait la migration en nommant la contrainte, sans rien modifier. Aucune fonction redéfinie. Rejouable :
-- `if not exists`, `drop … if exists`, revoke/grant sans effet la seconde fois.
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
do $bornes$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = 'liste_attente_email_borne') then
    alter table public.liste_attente add constraint liste_attente_email_borne check (
      length(email) <= 254
      and email ~ '^[^@]+@[^@]+$'
      and email !~ '[[:space:][:cntrl:]]'
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = 'liste_attente_biens_borne') then
    alter table public.liste_attente add constraint liste_attente_biens_borne check (
      biens is null or (length(biens) <= 120 and biens !~ '[[:cntrl:]]')
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = 'liste_attente_source_borne') then
    alter table public.liste_attente add constraint liste_attente_source_borne check (
      source is null or (length(source) <= 80 and source !~ '[[:cntrl:]]')
    );
  end if;
end $bornes$;

-- Le doublon à casse différente est refusé ; l'unicité d'origine sur l'adresse brute (liste_attente_email_key) reste.
create unique index if not exists liste_attente_email_lower_idx on public.liste_attente (lower(email));

-- ── 3. Le déclencheur de diagnostic, comme sur toute table de public depuis le 12/10 (présent en production) ──────────
drop trigger if exists diagnostic_artisan_lecture on public.liste_attente;
create trigger diagnostic_artisan_lecture before insert or update or delete on public.liste_attente
  for each row execute function public.refuser_mutation_diagnostic_artisan();

-- ── 4. Droits et politique ───────────────────────────────────────────────────────────────────────────────────────────
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

-- ── 5. Contrôle : on s'arrête plutôt que de taire un droit de trop ou de moins ───────────────────────────────────────
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
end $controle$;

-- Convention de toute migration (aucune fonction n'est touchée ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();
