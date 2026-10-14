-- RETOUR ARRIÈRE de 20261014232000_effacement_instantanes_faits_direction.sql (D13, fiche SUP-05)
--
-- IL N'EXISTE AUCUN RETOUR ARRIÈRE POUR LES DONNÉES EFFACÉES.
--
-- La migration supprime définitivement les instantanés de faits de direction de version 1 (public.brief_direction_snapshots,
-- version_regles < 2). Aucun script ne peut les recréer : ils ne reviennent que de la sauvegarde faite avant l'étape
-- (« Sauvegarde quotidienne », puis la procédure de docs/sauvegarde-et-restauration.md, sur une base de restauration, jamais
-- sur la production en place).
--
-- Ce script ne fait donc qu'une chose : retirer la ligne d'historique de la migration, pour que migrations.yml accepte de la
-- rejouer (par exemple sur une base restaurée). Rejouée, l'étape efface de nouveau les instantanés de version 1 — avec la
-- même exigence de confirmation d'une sauvegarde. Il ne modifie AUCUNE donnée métier ; la ligne d'audit
-- « effacement_instantanes_faits_direction » reste.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014232000_effacement_instantanes_faits_direction.retour.sql

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

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014232000';
  end if;
end $retour_arriere$;

commit;
