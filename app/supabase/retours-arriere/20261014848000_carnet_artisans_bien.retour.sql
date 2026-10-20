-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014848000_carnet_artisans_bien.sql (relecture du 15/10/2026 du lot « invitation-artisan » :
-- le carnet vu pour un bien dit pourquoi un artisan ne peut pas y être sollicité).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : la fonction `carnet_artisans_bien` est supprimée (elle n'existait pas avant : rien à rétablir) — refus
-- si une autre fonction l'appelle. Aucune donnée touchée. Rejouable : sans la fonction, rien n'est fait.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014848000_carnet_artisans_bien.retour.sql
--
-- ORDRE : à jouer APRÈS avoir remis en production le code d'avant (la fiche d'un incident du propriétaire l'appelle ;
-- sans elle, l'écran dit que la liste de son carnet n'a pas pu être lue).
-- RÉINTRODUIT : un artisan du carnet qui ne peut pas être sollicité pour un bien (zone, décennale, validation) disparaît
-- de la fiche de l'incident sans explication.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare v_appelant text;
begin
  select p.proname into v_appelant
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname <> 'carnet_artisans_bien' and p.prosrc ~ '\mcarnet_artisans_bien\M'
   limit 1;
  if v_appelant is not null then
    raise exception 'Retour arrière refusé : la fonction % appelle carnet_artisans_bien. Défaire d''abord la migration qui l''a introduite.', v_appelant;
  end if;
  if to_regprocedure('public.carnet_artisans_bien(uuid,uuid)') is null then
    raise notice 'carnet_artisans_bien : déjà absente, rien à faire';
  end if;
end $retour_arriere$;

drop function if exists public.carnet_artisans_bien(uuid, uuid);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014848000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'carnet_artisans_bien' as objet,
       case when to_regprocedure('public.carnet_artisans_bien(uuid,uuid)') is null then 'antérieure (A)' else 'migrée (B)' end as etat;
$instructions_retour$;
end $retour_atomique$;
