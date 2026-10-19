-- RETOUR ARRIÈRE de 20261019120000_liste_attente_bornee.sql (lot M2, audit du 19 octobre 2026 : la table
-- public.liste_attente, créée hors dépôt le 29/09/2026 — version 20260929200141 sans fichier au dépôt —, intégrée et bornée)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration,
-- il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Transaction EXTERNE, comme 20261018231827_abonnement_jour_paris.retour.sql (aucun begin/commit ici) :
--   psql "$URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261019120000_liste_attente_bornee.retour.sql
-- La moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Ce que le retour fait : retire ce que la migration a AJOUTÉ — les trois contraintes de borne (liste_attente_email_borne,
-- liste_attente_biens_borne, liste_attente_source_borne), l'index unique liste_attente_email_lower_idx et le commentaire de
-- table — et rend à `authenticated` les droits de table hérités des privilèges par défaut qu'il avait avant (relevé du
-- 19/10 : select, insert, update, delete, references, trigger ; maintain sur PostgreSQL 17), sans aucune politique, donc
-- sans effet sous RLS. Il retire sa version de l'historique dans la même transaction.
--
-- Ce que le retour NE FAIT PAS : il ne supprime ni la table ni ses lignes (la table précède la migration en production) ;
-- il conserve la clé primaire, la contrainte d'unicité d'origine (liste_attente_email_key), la contrainte de format
-- d'origine (liste_attente_email_format), la RLS, la politique « inscription anonyme », le droit d'insertion par colonne de
-- `anon` (email, biens, source) et le déclencheur diagnostic_artisan_lecture : tous présents avant la migration. Aucune
-- ligne lue, supprimée ni modifiée. Aucune fonction touchée.
--
-- RÉINTRODUIT : insertion anonyme sans borne de longueur sur email, biens et source (seul le format d'origine subsiste),
-- et deux inscriptions de la même adresse à casse différente acceptées.
--
-- Rejouable : sur une base déjà revenue, chaque étape répond « rien à faire ».

do $verrou$ begin perform set_config('lock_timeout', '10s', true); end $verrou$;

do $retour$
declare
  nom text;
begin
  if to_regclass('public.liste_attente') is null then
    raise notice 'liste_attente : table absente, rien à faire';
    return;
  end if;

  -- 1/4 Les trois contraintes de borne.
  foreach nom in array array['liste_attente_email_borne', 'liste_attente_biens_borne', 'liste_attente_source_borne'] loop
    if exists (select 1 from pg_constraint where conrelid = 'public.liste_attente'::regclass and conname = nom) then
      execute format('alter table public.liste_attente drop constraint %I', nom);
      raise notice '% : retirée', nom;
    else
      raise notice '% : déjà absente, rien à faire', nom;
    end if;
  end loop;

  -- 2/4 L'index unique sur lower(email).
  if to_regclass('public.liste_attente_email_lower_idx') is not null then
    drop index public.liste_attente_email_lower_idx;
    raise notice 'liste_attente_email_lower_idx : retiré';
  else
    raise notice 'liste_attente_email_lower_idx : déjà absent, rien à faire';
  end if;

  -- 3/4 Le commentaire de table.
  if obj_description('public.liste_attente'::regclass, 'pg_class') is not null then
    comment on table public.liste_attente is null;
    raise notice 'commentaire de table : retiré';
  else
    raise notice 'commentaire de table : déjà absent, rien à faire';
  end if;

  -- 4/4 Les droits de table de authenticated, tels que relevés avant la migration (sans politique : inopérants sous RLS).
  if has_table_privilege('authenticated', 'public.liste_attente', 'SELECT') then
    raise notice 'droits de authenticated : déjà rétablis, rien à faire';
  else
    grant select, insert, update, delete, references, trigger on table public.liste_attente to authenticated;
    if current_setting('server_version_num')::integer >= 170000 then
      execute 'grant maintain on table public.liste_attente to authenticated';
    end if;
    raise notice 'droits de authenticated : rétablis';
  end if;
end $retour$;

-- Convention de toute migration (aucune fonction n'est touchée ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();

-- Même transaction externe que le retour : la version n'est plus « appliquée », migrations.yml pourra rejouer le fichier.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261019120000';
  end if;
end $historique$;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'bornes (trois contraintes)' as objet,
       case when exists (select 1 from pg_constraint where conrelid = to_regclass('public.liste_attente') and conname = 'liste_attente_email_borne')
            then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'index unique sur lower(email)',
       case when to_regclass('public.liste_attente_email_lower_idx') is not null then 'migrée (B)' else 'antérieure (A)' end
union all
select 'commentaire de table',
       case when obj_description(to_regclass('public.liste_attente'), 'pg_class') is not null then 'migrée (B)' else 'antérieure (A)' end;
