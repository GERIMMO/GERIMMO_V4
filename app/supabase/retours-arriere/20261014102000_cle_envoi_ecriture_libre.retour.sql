-- RETOUR ARRIÈRE de 20261014102000_cle_envoi_ecriture_libre.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : le droit d'insertion de la colonne `cle_envoi` pour les comptes connectés, l'index unique partiel
-- `ecritures_cle_envoi_unique` et la colonne facultative `ecritures.cle_envoi`. Aucune fonction n'était touchée.
-- Aucune écriture comptable n'est réécrite ni supprimée : seule disparaît la clé d'envoi (une référence technique).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014102000_cle_envoi_ecriture_libre.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : une écriture libre peut de nouveau être rejouée après une réponse perdue.
-- ATTENTION, le code de l'application n'est pas défait par ce script : l'application candidate écrit `cle_envoi` ;
-- sur une base revenue en arrière, la saisie d'une écriture libre échouerait. Revenir d'abord au code précédent.
--
-- Rejouable : sans la colonne ni l'index, chaque instruction ne fait rien.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

do $retour_arriere$
declare v_cles bigint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ecritures' and column_name = 'cle_envoi') then
    execute 'select count(*) from public.ecritures where cle_envoi is not null' into v_cles;
    raise notice 'Retour arrière 20261014102000 : % clé(s) d''envoi d''écriture vont disparaître (les écritures restent).', v_cles;
  else
    raise notice 'Retour arrière 20261014102000 : la colonne ecritures.cle_envoi est déjà absente, rien à faire.';
  end if;
end $retour_arriere$;

-- Le droit d'insertion de la colonne part avec elle ; on le retire d'abord, nommément, quand la colonne existe.
do $retour_arriere$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ecritures' and column_name = 'cle_envoi') then
    revoke insert (cle_envoi) on table public.ecritures from authenticated;
  end if;
end $retour_arriere$;

drop index if exists public.ecritures_cle_envoi_unique;
alter table public.ecritures drop column if exists cle_envoi;

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014102000';
  end if;
end $retour_arriere$;

commit;
