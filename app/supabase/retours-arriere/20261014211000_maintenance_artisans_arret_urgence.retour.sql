-- RETOUR ARRIÈRE de 20261014211000_maintenance_artisans_arret_urgence.sql (audit AUT-01, décision D42 option B point 5, avec D06)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations
-- d'origine SANS cette migration (donc avec 20261014210000), puis recopiée ici par un générateur — elle n'est pas
-- écrite à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée
-- telle quelle ; une fonction déjà supprimée (retour de 20261014210000 joué avant) ou une table de correspondance
-- absente ne font pas échouer le script.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014211000_maintenance_artisans_arret_urgence.retour.sql
--
-- CE QUE LE SCRIPT FAIT
--   1. rétablit `maintenance_artisans_interne()` d'avant : la caducité des devis SANS lecture de l'arrêt d'urgence ;
--   2. retire de `supervision_taches_arret` (lot « arrêt d'urgence », D06) la ou les lignes de la tâche
--      `maintenance-artisans`, si cette table existe : la fonction ne les lit plus, elles ne diraient plus vrai ;
--   3. retire la version `20261014211000` de l'historique des migrations.
-- La tâche pg_cron `maintenance-artisans` et la fonction publique `maintenance_artisans()` ne sont PAS touchées
-- (elles relèvent de 20261014210000 et de son propre retour).
--
-- RÉINTRODUIT le défaut corrigé : une fois le lot D06 intégré, l'arrêt d'urgence (global ou « rappels ») n'arrête
-- plus la caducité des devis ; la tâche continue de passer des devis à « expiré » pendant un arrêt. Sans le lot D06,
-- le retour ne change rien de visible (la fonction ne lisait rien).
--
-- CE QUE LE SCRIPT NE DÉFAIT PAS
--   Les devis passés à « expire » et les sollicitations passées à « expiree » (par la tâche) : voir le retour de
--   20261014210000 et `releve-devis-perimes.sql`. Cette migration ne réécrit aucune donnée.
--   Rien d'autre à signaler : le script supprime TOUTES les lignes de la tâche `maintenance-artisans` de la table de
--   correspondance, même inscrites à la main avec une autre clé que « rappels » (la fonction ne les lit plus).

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

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas. Fonction absente : rien à rétablir.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    return p_signature || ' : fonction absente (retour de 20261014210000 déjà joué ?), rien à faire';
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- 1. La caducité des devis sans lecture de l'arrêt d'urgence, telle qu'elle était avec 20261014210000.
select pg_temp.restaurer_fonction('public.maintenance_artisans_interne()',
  $marque$Audit du 14/10 (AUT-01, D06)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.maintenance_artisans_interne()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- Audit du 14/10 (AUT-01), D42 option B : la caducité des devis SEULE, pour pg_cron (aucune garde d'identité).
declare
  v_devis integer;
  -- Le jour de Paris, comme l'écran : un devis valable « jusqu'au » un jour l'est toute la journée.
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_systeme text := coalesce(current_setting('gerimmo.systeme', true), '');
begin
  -- Tâche de plateforme : sans identité (pg_cron), la garde d'abonnement refuse toute écriture sur une agence
  -- suspendue ; une seule agence dans ce cas ferait échouer le passage pour TOUTES. La caducité d'un devis ne
  -- dépend pas de la situation commerciale de l'agence (c'est l'usage prévu de tache_systeme(), « à appeler en tête
  -- d'une tâche planifiée »). Le drapeau ne vaut que pour la transaction en cours, et il est rendu à sa valeur
  -- d'avant avant de sortir (appel manuel inclus).
  perform public.tache_systeme();

  update public.incident_devis set statut = 'expire'
  where statut = 'depose' and valide_jusqu_au < v_jour;
  get diagnostics v_devis = row_count;

  update public.incident_sollicitations s set statut = 'expiree'
  where s.statut in ('envoyee', 'devis_depose')
    and exists (select 1 from public.incident_devis d
                where d.sollicitation_id = s.id and d.statut = 'expire');

  perform pg_catalog.set_config('gerimmo.systeme', v_systeme, true);
  return v_devis;
end;
$function$
$definition_anterieure$);

-- 2. La table de correspondance du lot « arrêt d'urgence » (D06), si elle existe : la fonction ne la lit plus.
-- Dynamique : l'instruction ne doit pas être analysée tant que la table n'existe pas.
do $retour_arriere$
begin
  if to_regclass('public.supervision_taches_arret') is not null then
    execute $ligne$delete from public.supervision_taches_arret where tache = 'maintenance-artisans'$ligne$;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014211000';
  end if;
end $retour_arriere$;

commit;
