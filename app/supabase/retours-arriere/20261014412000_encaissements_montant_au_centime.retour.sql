-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014412000_encaissements_montant_au_centime.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : la contrainte `encaissements_montant_centime_check` (CHECK (montant = round(montant, 2)), posée NOT VALID).
-- Aucune fonction n'était touchée par la migration : rien à restaurer. Aucune donnée n'est réécrite ni supprimée : la contrainte
-- ne relisait pas les lignes existantes, elle ne fait que disparaître.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014412000_encaissements_montant_au_centime.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (FIN-03) : la base accepte de nouveau un encaissement à trois décimales écrit par un client qui
-- contourne le formulaire et l'action serveur (qui, eux, refusent toujours au-delà du centime).
-- Rejouable : sans la contrainte, l'instruction ne fait rien.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Dit combien d'encaissements sont hors centime aujourd'hui (information, pas un refus : rien n'est modifié).
do $retour_arriere$
declare v_hors bigint;
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.encaissements'::regclass and conname = 'encaissements_montant_centime_check') then
    select count(*) into v_hors from public.encaissements where montant <> round(montant, 2);
    raise notice 'Retour arrière 20261014412000 : % encaissement(s) au-delà du centime (ils restent tels quels).', v_hors;
  else
    raise notice 'Retour arrière 20261014412000 : la contrainte est déjà absente, rien à faire.';
  end if;
end $retour_arriere$;

alter table public.encaissements drop constraint if exists encaissements_montant_centime_check;


-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014412000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
