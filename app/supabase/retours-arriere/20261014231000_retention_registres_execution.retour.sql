-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014231000_retention_registres_execution.sql (D48, fiche IA-11, et volet purge de D13)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- CHIRURGICAL, pas une réécriture. Ce script ne rétablit PAS une ancienne définition d'`appliquer_retention` : il relit la
-- définition en vigueur et en retire, par son texte exact, le seul bloc que la migration y a injecté (le commentaire « D48 / D13 »
-- et l'appel `v_journaux := v_journaux || public.purger_registres_execution();`), comme l'aller l'y a posé. Tout ce que d'autres
-- migrations ont ajouté à la fonction reste en place : en particulier la garde de l'arrêt d'urgence sur le nettoyage nocturne
-- (« Audit du 14/10 (SUP-01) », migration 20261014200000, branche lot-arret-taches). Une version précédente de ce script
-- recopiait la définition d'avant la migration et supprimait cette garde en silence si les deux migrations étaient en place.
-- Rejouable : sans la marque « purger_registres_execution » dans la définition en vigueur, la fonction est laissée telle quelle.
-- Prudent : si la marque est là mais que le bloc n'y figure pas exactement une fois (fonction réécrite à la main depuis), le
-- script s'arrête par une erreur AVANT de supprimer quoi que ce soit : la fonction de purge n'est jamais retirée sous un appel
-- qui la nomme encore.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014231000_retention_registres_execution.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (IA-11) : les cinq registres (agent_passages, supervision_operations, points_du_matin,
-- decisions_du_matin, brief_direction_snapshots) n'ont plus de règle de conservation ni de purge.
--
-- NE RAMÈNE PAS les lignes déjà purgées : elles sont irrécupérables, sauf par restauration d'une sauvegarde
-- (docs/sauvegarde-et-restauration.md). Les lignes du journal technique « purge_registres_execution » (des nombres) restent.
-- ATTENTION : les cinq lignes de retention_rules sont supprimées telles qu'elles sont ; une durée modifiée à la main depuis
-- la migration serait perdue.
-- Si seul l'effet de la purge gêne, préférer de suspendre les règles :
--   update public.retention_rules set actif = false where data_type in ('journal:agent_passages','journal:supervision_operations',
--     'journal:points_du_matin','journal:decisions_du_matin','journal:brief_direction_snapshots');

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Retire de la définition EN VIGUEUR d'une fonction un bloc de texte exact, si, et seulement si, la définition porte la marque
-- du correctif. Sans la marque, la fonction est déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas. Avec la
-- marque mais sans que le bloc figure exactement une fois, erreur : rien n'est modifié (la transaction entière est annulée).
create or replace function pg_temp.retirer_bloc(p_signature text, p_marque text, p_bloc text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text; v_occurrences integer;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  v_occurrences := (length(v_courante) - length(replace(v_courante, p_bloc, ''))) / length(p_bloc);
  if v_occurrences <> 1 then
    raise exception 'Retour arrière : le bloc ajouté par la migration figure % fois (attendu : une) dans la définition en vigueur de % ; la fonction a été réécrite depuis, rien n''a été modifié. Voir LISEZ-MOI.md.', v_occurrences, p_signature;
  end if;
  execute replace(v_courante, p_bloc, '');
  return p_signature || ' : bloc de la migration retiré, le reste de la fonction est intact';
end $retour_arriere$;

-- nettoyage nocturne : retire l'appel à la purge des registres, et lui seul
select pg_temp.retirer_bloc('public.appliquer_retention()',
  $marque$purger_registres_execution$marque$,
$bloc$

  -- D48 / D13 (IA-11, SUP-05) : les registres d'exécution ont une fin de vie (six mois, retention_rules « journal:… »).
  v_journaux := v_journaux || public.purger_registres_execution();$bloc$);

-- La fonction de purge, retirée SANS cascade.
drop function if exists public.purger_registres_execution();

-- Les cinq règles posées par la migration.
delete from public.retention_rules
 where data_type in ('journal:agent_passages', 'journal:supervision_operations', 'journal:points_du_matin',
                     'journal:decisions_du_matin', 'journal:brief_direction_snapshots');

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014231000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
