-- RETOUR ARRIÈRE de 20261014100000_cle_envoi_encaissement_loyer.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : l'index unique partiel `encaissements_cle_envoi_unique` et la colonne facultative `encaissements.cle_envoi`.
-- Aucune fonction n'était touchée par la migration : rien à restaurer. Aucune donnée financière n'est réécrite ni
-- supprimée : seule disparaît la clé d'envoi (une référence technique) des encaissements saisis depuis la migration.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014100000_cle_envoi_encaissement_loyer.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un encaissement de loyer peut de nouveau être rejoué après une réponse perdue
-- (PR178-B-06). ATTENTION, le code de l'application n'est pas défait par ce script : l'application candidate écrit
-- `cle_envoi` ; sur une base revenue en arrière, la saisie d'un encaissement échouerait. Revenir d'abord au code
-- précédent (ou accepter que l'encaissement soit indisponible) avant de jouer ce script.
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

-- Dit combien de clés vont disparaître (information, pas un refus : ce sont des références techniques).
do $retour_arriere$
declare v_cles bigint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'encaissements' and column_name = 'cle_envoi') then
    execute 'select count(*) from public.encaissements where cle_envoi is not null' into v_cles;
    raise notice 'Retour arrière 20261014100000 : % clé(s) d''envoi d''encaissement vont disparaître (les encaissements restent).', v_cles;
  else
    raise notice 'Retour arrière 20261014100000 : la colonne encaissements.cle_envoi est déjà absente, rien à faire.';
  end if;
end $retour_arriere$;

drop index if exists public.encaissements_cle_envoi_unique;
alter table public.encaissements drop column if exists cle_envoi;

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014100000';
  end if;
end $retour_arriere$;

commit;
