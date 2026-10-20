-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014842000_artisans_colonnes_internes.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : les colonnes de décision internes de la fiche artisan ne sont plus lisibles par les clients).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : les droits par colonne posés par la migration sont retirés et le droit SELECT de `authenticated` sur
-- TOUTE la table est rétabli (état d'avant) ; les deux fonctions de la supervision sont supprimées (aucune n'existait
-- avant : rien à rétablir) — refus si une autre fonction les appelle. Aucune ligne n'est touchée. Rejouable : sans les
-- fonctions et avec le droit de table déjà rétabli, le script ne change rien et le dit.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014842000_artisans_colonnes_internes.retour.sql
--
-- ORDRE : à jouer APRÈS avoir remis en production le code d'avant la migration (/admin/artisans et la fiche d'un artisan
-- de la console appellent les deux fonctions supprimées ; l'ancien code lit la table directement, ce que ce retour
-- rouvre).
-- RÉINTRODUIT le défaut corrigé : toute organisation qui a l'artisan dans son carnet (propriétaire direct après une
-- invitation acceptée, agence) lit de nouveau par requête directe les motifs de refus et d'exclusion, les auteurs et dates
-- des décisions de Gerimmo, les échéances de purge et l'organisation qui a créé la fiche. Le texte de consentement de la
-- page d'invitation (VISIBLE_APRES_ACCEPTATION) ne le dit plus : le remettre aussi.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare
  v_fonction text;
  v_appelant text;
begin
  foreach v_fonction in array array['decisions_artisans_supervision', 'decisions_artisan_supervision'] loop
    select p.proname into v_appelant
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname not in ('decisions_artisans_supervision', 'decisions_artisan_supervision')
       and p.prosrc ~ ('\m' || v_fonction || '\M')
     limit 1;
    if v_appelant is not null then
      raise exception 'Retour arrière refusé : la fonction % appelle %. Défaire d''abord la migration qui l''a introduite.',
        v_appelant, v_fonction;
    end if;
  end loop;
  if to_regprocedure('public.decisions_artisans_supervision(integer,integer)') is null
     and to_regprocedure('public.decisions_artisan_supervision(uuid)') is null
     and has_table_privilege('authenticated', 'public.artisans', 'SELECT') then
    raise notice 'artisans : droit de table déjà rétabli et fonctions absentes, rien à faire';
  end if;
end $retour_arriere$;

drop function if exists public.decisions_artisans_supervision(integer, integer);
drop function if exists public.decisions_artisan_supervision(uuid);

-- Les droits par colonne de la migration, puis le droit de table d'avant (SELECT seul, comme avant la migration).
revoke select (id, account_id, raison_sociale, siret, siret_etat, email, telephone, visibilite, statut_plateforme,
               blacklist_globale_le, created_at, updated_at)
  on public.artisans from authenticated;
grant select on public.artisans to authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014842000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'artisans (droit de lecture des clients)' as objet,
       case when has_table_privilege('authenticated', 'public.artisans', 'SELECT') then 'antérieure (A)' else 'migrée (B)' end as etat
union all
select 'decisions_artisans_supervision / decisions_artisan_supervision',
       case when to_regprocedure('public.decisions_artisans_supervision(integer,integer)') is null
             and to_regprocedure('public.decisions_artisan_supervision(uuid)') is null
            then 'antérieure (A)' else 'migrée (B)' end;
$instructions_retour$;
end $retour_atomique$;
