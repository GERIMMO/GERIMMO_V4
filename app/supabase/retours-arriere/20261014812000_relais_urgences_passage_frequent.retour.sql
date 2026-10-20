-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014812000_relais_urgences_passage_frequent.sql (D46-B, passage fréquent des urgences du relais,
-- décision du 15/10/2026 « envoi immédiat pour les urgences »)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il se
-- joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout.
--
-- Méthode : CHIRURGICALE, comme 20261014610000_reglement_facture_intervention.retour.sql. La migration a :
--   (a) planifié la tâche pg_cron `relais-urgences` (toutes les 10 minutes) ;
--   (b) créé la table `declencheur_relais_urgences` (le JETON du passage, l'adresse du site, les heures du dernier appel et du
--       dernier passage) et ses trois fonctions (`declencher_relais_urgences`, `jeton_declencheur_relais_urgences`,
--       `consigner_passage_urgences_relais`) ;
--   (c) créé le recensement `supervision_taches_hors_arret` (une ligne : `relais-urgences`) ;
--   (d) créé `urgence_constatee_par_le_relais` et `clore_envoi_urgences_vide` ;
--   (e) AJOUTÉ des blocs balisés dans trois fonctions du même lot : `relais_urgence_a_envoyer` (« clé imitée »),
--       `urgences_relais_recentes` (« rappel exact ») et `sentinelle_relais` (« tâches hors arrêt », « passage reçu »).
-- Ce script retire la tâche (a) EN PREMIER (plus aucun appel ne part avec le jeton), relit les définitions d'AUJOURD'HUI
-- (pg_get_functiondef) et en retire exactement les blocs (e) — il n'efface aucune modification apportée depuis par une autre
-- migration, aucune définition n'est écrite de mémoire —, puis supprime (d), (b) avec le jeton, et (c), sans cascade.
-- Il se rejoue sans effet. S'il trouve une marque sans bloc intact, il s'arrête sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014812000_relais_urgences_passage_frequent.retour.sql
--
-- RÉINTRODUIT ce que la migration corrigeait : une urgence n'est de nouveau constatée qu'au passage d'une mission (chaque
-- matin) ou dans la console, son e-mail immédiat pouvant partir jusqu'à environ 18 h après l'événement ; une clé saisie à la
-- main qui imite une clé du système change de nouveau le texte de l'e-mail ; le rappel de 5 h peut redire « en cours d'envoi »
-- un e-mail immédiat en échec ; la sentinelle ne connaît plus la tâche. ATTENTION : l'application candidate appelle
-- `jeton_declencheur_relais_urgences`, `consigner_passage_urgences_relais` (route /api/cron/relais?mode=urgences) et
-- `clore_envoi_urgences_vide` (envoi immédiat). Sans elles, la route répond « non configuré » et ne fait rien ; un envoi sans
-- urgence lisible n'est plus clos (il est repris, puis abandonné). À retirer AVEC le code, de préférence.
-- À jouer AVANT les retours de 20261014811000 et 20261014810000 si tout le lot est défait (il modifie leurs fonctions).
--
-- NE DÉFAIT PAS : les e-mails déjà envoyés ; les natures « signalement_manuel » déjà écrites dans la file pour des alertes
-- posées à la main avec une clé imitée (c'est leur vraie nature) ; les envois déjà clos « abandonné » sans urgence.
-- PERD : le jeton (il n'a pas à survivre : il ne sert qu'à cette tâche) et les heures du dernier appel et du dernier passage.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp) : retire d'une fonction le bloc compris entre deux marques, si et seulement si
-- chacune est présente exactement une fois et dans le bon ordre. Sans marque de début : rien à faire (rejeu).
-- Nom propre à ce script : le retour de 20261014610000, joué plus loin dans la même chaîne, pose son propre
-- `pg_temp.retirer_bloc(text, text, text)` par un « create » simple, qui échouerait dans une session où celui-ci existe.
create or replace function pg_temp.retirer_bloc_relais(p_signature text, p_debut text, p_fin text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_def text; p_d int; p_f int;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  p_d := position(p_debut in v_def);
  if p_d = 0 then
    return p_signature || ' : marque absente, rien à faire';
  end if;
  p_f := position(p_fin in v_def);
  if p_f = 0 or p_f < p_d
     or (length(v_def) - length(replace(v_def, p_debut, ''))) <> length(p_debut)
     or (length(v_def) - length(replace(v_def, p_fin, ''))) <> length(p_fin) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : le bloc de % n''est plus intact (marques retouchées ou répétées). Le retirer à la main.', p_signature;
  end if;
  execute left(v_def, p_d - 1) || substr(v_def, p_f + length(p_fin));
  return p_signature || ' : bloc retiré';
end $retour_arriere$;

-- 1. La tâche pg_cron d'abord : plus aucun appel ne part. Une tâche déjà retirée n'est pas une erreur.
do $retour_arriere$
begin
  if to_regclass('cron.job') is not null and exists (select from cron.job where jobname = 'relais-urgences') then
    perform cron.unschedule('relais-urgences');
  end if;
end $retour_arriere$;

-- 2. Les blocs ajoutés aux fonctions du lot, retirés de la définition en vigueur.
select pg_temp.retirer_bloc_relais('public.sentinelle_relais()',
  '      -- >> Relais 15/10 (passage reçu)', E'-- << Relais 15/10 (passage reçu)\n');
select pg_temp.retirer_bloc_relais('public.sentinelle_relais()',
  ' /* >> Relais 15/10 (tâches hors arrêt) */', '/* << Relais 15/10 (tâches hors arrêt) */');
revoke all on function public.sentinelle_relais() from public, anon, authenticated;
grant execute on function public.sentinelle_relais() to service_role;

select pg_temp.retirer_bloc_relais('public.urgences_relais_recentes()',
  '  -- >> Relais 15/10 (rappel exact)', E'-- << Relais 15/10 (rappel exact)\n');
revoke all on function public.urgences_relais_recentes() from public, anon, authenticated;
grant execute on function public.urgences_relais_recentes() to service_role;

select pg_temp.retirer_bloc_relais('public.relais_urgence_a_envoyer()',
  '    -- >> Relais 15/10 (clé imitée)', E'-- << Relais 15/10 (clé imitée)\n');
revoke all on function public.relais_urgence_a_envoyer() from public, anon, authenticated, service_role;

-- 3. Les fonctions nouvelles, SANS cascade (une dépendance inattendue arrête tout), puis le jeton et le recensement.
drop function if exists public.declencher_relais_urgences();
drop function if exists public.jeton_declencheur_relais_urgences();
drop function if exists public.consigner_passage_urgences_relais();
drop function if exists public.clore_envoi_urgences_vide(uuid);
drop function if exists public.urgence_constatee_par_le_relais();
drop table if exists public.declencheur_relais_urgences;
drop table if exists public.supervision_taches_hors_arret;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- 4. La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014812000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'tâche pg_cron relais-urgences' as objet,
       case when to_regclass('cron.job') is not null and exists (select from cron.job where jobname = 'relais-urgences')
            then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'jeton du passage (declencheur_relais_urgences)',
       case when to_regclass('public.declencheur_relais_urgences') is not null then 'migrée (B)' else 'antérieure (A)' end
union all
select 'sentinelle_relais attend les tâches hors arrêt',
       case when position('Relais 15/10' in pg_get_functiondef('public.sentinelle_relais()'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end;
$instructions_retour$;
end $retour_atomique$;
