-- RETOUR ARRIÈRE de 20261014850000_retention_registres_relais_ia.sql (D48, tour final du 16/10/2026 : règles de conservation des
-- registres du relais et du compteur des appels à l'IA)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- CHIRURGICAL, comme le retour de 20261014231000 : il relit la définition EN VIGUEUR d'`appliquer_retention` et en retire, par son
-- texte exact, le seul bloc que la migration y a posé (le commentaire « D48 (tour final du 16/10) » et l'appel
-- `v_journaux := v_journaux || public.purger_registres_relais_ia();`). Tout ce que d'autres migrations ont ajouté à la fonction reste
-- en place (garde de l'arrêt d'urgence de 20261014200000, purge des registres de 20261014231000).
-- Rejouable : sans la marque « purger_registres_relais_ia » dans la définition en vigueur, la fonction est laissée telle quelle.
-- Prudent : si la marque est là mais que le bloc n'y figure pas exactement une fois (fonction réécrite à la main depuis), le script
-- s'arrête AVANT de supprimer quoi que ce soit : la fonction de purge n'est jamais retirée sous un appel qui la nomme encore.
-- Indépendant du retour de 20261014231000 : les deux se jouent dans n'importe quel ordre (blocs distincts, fonctions distinctes).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014850000_retention_registres_relais_ia.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : les quatre registres (relais_alertes_envois, relais_urgences, relais_urgences_envois,
-- ia_appels_jour) ne figurent plus au catalogue des durées de conservation ; le compteur des appels à l'IA n'a plus aucune purge
-- (les trois registres du relais gardent celle de leurs propres fonctions, six mois, qui n'a jamais été modifiée).
--
-- NE RAMÈNE PAS les lignes déjà purgées : elles sont irrécupérables, sauf par restauration d'une sauvegarde
-- (docs/sauvegarde-et-restauration.md). Les lignes du journal technique « purge_registres_relais_ia » (des nombres) restent.
-- ATTENTION : les quatre lignes de retention_rules sont supprimées telles qu'elles sont ; une durée modifiée à la main depuis la
-- migration serait perdue. Si seul l'effet de la purge gêne, préférer de suspendre les règles :
--   update public.retention_rules set actif = false where data_type in ('journal:relais_alertes_envois','journal:relais_urgences',
--     'journal:relais_urgences_envois','journal:ia_appels_jour');
--
-- `purger_registres_relais_ia` cite `public.aujourdhui_paris()` : ce retour se joue AVANT celui de 20261014500000 (voir l'ordre
-- complet des retours dans la section « Lot « fuseau-suite » » du LISEZ-MOI).

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

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public), même logique que celui
-- du retour de 20261014231000. Nom propre à ce script : le retour de 20261014610000, joué plus loin dans la même chaîne, pose son
-- propre `pg_temp.retirer_bloc(text, text, text)` (autre logique) par un « create » simple, qui échouerait dans une session où un
-- outil de ce nom et de ces types existe déjà.
-- Retire de la définition EN VIGUEUR d'une fonction un bloc de texte exact, si, et seulement si, la définition porte la marque
-- du correctif. Sans la marque, on n'y touche pas. Avec la marque mais sans que le bloc figure exactement une fois, erreur : rien
-- n'est modifié (la transaction entière est annulée).
create or replace function pg_temp.retirer_bloc_registres_relais(p_signature text, p_marque text, p_bloc text)
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

-- nettoyage nocturne : retire l'appel à la purge des registres du relais et du compteur de l'IA, et lui seul
select pg_temp.retirer_bloc_registres_relais('public.appliquer_retention()',
  $marque$purger_registres_relais_ia$marque$,
$bloc$-- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).
  v_journaux := v_journaux || public.purger_registres_relais_ia();

  $bloc$);

-- La fonction de purge, retirée SANS cascade.
drop function if exists public.purger_registres_relais_ia();

-- Les quatre règles posées par la migration.
delete from public.retention_rules
 where data_type in ('journal:relais_alertes_envois', 'journal:relais_urgences', 'journal:relais_urgences_envois', 'journal:ia_appels_jour');

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014850000';
  end if;
end $retour_arriere$;

commit;
