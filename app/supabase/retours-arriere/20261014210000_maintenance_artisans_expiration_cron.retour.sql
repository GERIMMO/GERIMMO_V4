-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014210000_maintenance_artisans_expiration_cron.sql (audit AUT-01, décision D42, option B)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations
-- d'origine SANS cette migration, puis recopiée ici par un générateur — elle n'est pas écrite à la main.
-- Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle ;
-- une tâche déjà retirée ou une fonction déjà supprimée ne fait pas échouer le script.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014210000_maintenance_artisans_expiration_cron.retour.sql
--
-- CE QUE LE SCRIPT FAIT
--   1. retire la tâche pg_cron `maintenance-artisans` (cron.unschedule) ;
--   2. rétablit `maintenance_artisans()` d'origine (garde de super-administrateur, caducité ET purge dans la même
--      fonction, jour du serveur au lieu du jour de Paris) ;
--   3. supprime `maintenance_artisans_interne()` (sans cascade : une dépendance inattendue arrête tout) ;
--   4. retire la version `20261014210000` de l'historique des migrations.
--
-- RÉINTRODUIT le défaut corrigé : plus rien ne passe les devis périmés à « expiré » ; leur sollicitation reste
-- « vivante » et occupe l'une des deux places de la mise en concurrence (RM-9.1.1) tant qu'un super-administrateur
-- ne lance pas la fonction à la main.
--
-- CE QUE LE SCRIPT NE DÉFAIT PAS — À LIRE AVANT DE DÉCIDER
--   Les devis passés à « expire » et les sollicitations passées à « expiree » par la tâche NE SE RESTAURENT PAS
--   automatiquement : rien dans la base ne garde l'état d'avant (pas d'historique de statut, pas de colonne
--   « ancien statut »). Le retour arrière ne les touche pas : ils restent « expirés », ce qui est exact (leur validité
--   est dépassée). Si l'on veut malgré tout les remettre « déposés » (par exemple parce que la date de validité a été
--   mal saisie), il faut le relevé pris AVANT la première exécution de la tâche :
--   voir `releve-devis-perimes.sql` (lecture seule) et la section « Avant la première exécution » de LISEZ-MOI.md.
--   Une restauration à la main (devis « depose », sollicitation « devis_depose ») est une décision humaine, par
--   identifiant, jamais en masse : un incident a pu être traité entre-temps (autre artisan sollicité grâce à la
--   place libérée, devis d'un autre artisan retenu).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- 1. La tâche planifiée. Une tâche déjà retirée n'est pas une erreur (cron.unschedule en lèverait une).
do $retour_arriere$
begin
  if exists (select from cron.job where jobname = 'maintenance-artisans') then
    perform cron.unschedule('maintenance-artisans');
  end if;
end $retour_arriere$;

-- 2. La fonction publique, telle qu'elle était : caducité et purge ensemble, derrière la garde de super-administrateur.
select pg_temp.restaurer_fonction('public.maintenance_artisans()',
  $marque$maintenance_artisans_interne$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.maintenance_artisans()
 RETURNS TABLE(devis_expires integer, motifs_purges integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_devis integer; v_motifs integer; v_n integer;
begin
  if not public.is_super_admin() then raise exception 'Accès refusé'; end if;

  update public.incident_devis set statut = 'expire'
  where statut = 'depose' and valide_jusqu_au < current_date;
  get diagnostics v_devis = row_count;

  update public.incident_sollicitations s set statut = 'expiree'
  where s.statut in ('envoyee', 'devis_depose')
    and exists (select 1 from public.incident_devis d
                where d.sollicitation_id = s.id and d.statut = 'expire');

  -- A2 : « au-delà, un artisan doit pouvoir repartir sans que son passé le
  -- suive ». Purger le seul motif laisserait une liste noire sans motif — ce
  -- que la contrainte interdit, et à juste titre : une sanction sans motif
  -- n'est plus opposable. La purge LÈVE donc la mesure. Localement, la
  -- relation retombe sur « désactivée » (neutre, sans motif) : l'agence
  -- décide de la réactiver ou non, mais elle ne le sanctionne plus.
  update public.artisan_agences
  set blacklist_le = null, blacklist_motif = null, blacklist_par = null,
      purge_motif_le = null
  where purge_motif_le is not null and purge_motif_le <= current_date;
  get diagnostics v_motifs = row_count;

  update public.artisans
  set blacklist_globale_le = null, blacklist_globale_motif = null,
      blacklist_globale_par = null, purge_motif_le = null
  where purge_motif_le is not null and purge_motif_le <= current_date
    and blacklist_globale_le is not null;
  get diagnostics v_n = row_count;

  return query select v_devis, v_motifs + v_n;
end;
$function$
$definition_anterieure$);

-- 3. La version interne n'est plus appelée par personne : on la retire, SANS cascade (une dépendance inattendue arrête tout).
drop function if exists public.maintenance_artisans_interne();

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014210000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
