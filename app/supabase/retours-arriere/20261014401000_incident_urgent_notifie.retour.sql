-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014401000_incident_urgent_notifie.sql (décision X15, REP-02 : mémoriser l'envoi de l'e-mail d'urgence)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations
-- d'origine SANS cette migration, puis recopiée ici telle quelle — aucune n'est écrite à la main. Rejouable : sans la
-- marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Ce que le retour fait : rétablit `declarer_mon_incident_reprise` (qui ne dit plus `notifie`), supprime
-- `marquer_incident_urgent_notifie`, retire la colonne `commandes_incidents_locataire.notifie_le`. Aucune déclaration
-- n'est supprimée ni modifiée ; seule disparaît la mémoire de l'envoi de l'e-mail d'urgence (le script dit combien de
-- tentatives portaient cette mémoire).
--
-- ORDRE : sans importance pour le code. Le code de la décision X15 se comporte comme avant face à une base sans
-- `notifie` (aucun envoi à la reprise, aucun doublon) et consigne l'échec de `marquer_incident_urgent_notifie` sans
-- faire échouer la déclaration. On peut donc défaire la base d'abord, puis le code.
--
-- RÉINTRODUIT le défaut corrigé (REP-02) : si la première tentative d'une déclaration urgente s'arrête après
-- l'enregistrement et avant l'e-mail, la reprise de la même tentative ne l'envoie plus jamais (l'alerte « Incident urgent
-- à qualifier » reste dans l'espace du gestionnaire, mais le courriel immédiat est perdu).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014401000_incident_urgent_notifie.retour.sql

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE si, et seulement si, la définition en vigueur porte la marque du correctif.
-- Sans la marque, la fonction est déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
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

-- 1/3 La déclaration reprise ne dit plus `notifie`.
select pg_temp.restaurer_fonction('public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence)',
  $marque$Décision X15 (REP-02) du 14/10$marque$,
$definition_anterieure$
CREATE OR REPLACE FUNCTION public.declarer_mon_incident_reprise(p_org uuid, p_commande uuid, p_categorie text, p_description text, p_piece text, p_anciennete text, p_urgence incident_urgence)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.commandes_incidents_locataire; v_id uuid; v_requete jsonb;
begin
 if auth.uid() is null or p_commande is null or not(p_org in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 v_requete:=jsonb_build_array(p_categorie,nullif(trim(p_description),''),nullif(trim(p_piece),''),nullif(trim(p_anciennete),''),p_urgence);
 perform pg_advisory_xact_lock(hashtextextended(p_commande::text,131000));
 select * into v from public.commandes_incidents_locataire where id=p_commande;
 if found then
  if v.account_id<>auth.uid() or v.organization_id<>p_org then raise exception 'Accès refusé'; end if;
  if v.requete<>v_requete then raise exception 'Cette tentative est déjà enregistrée avec une autre saisie. Retrouvez le signalement dans vos demandes.'; end if;
  return jsonb_build_object('incident_id',v.incident_id,'rejoue',true);
 end if;
 v_id:=public.declarer_mon_incident(p_org,p_categorie,p_description,p_piece,p_anciennete,p_urgence);
 insert into public.commandes_incidents_locataire(id,organization_id,account_id,requete,incident_id) values(p_commande,p_org,auth.uid(),v_requete,v_id);
 return jsonb_build_object('incident_id',v_id,'rejoue',false);
end $function$
$definition_anterieure$);

-- 2/3 La fonction de mémorisation disparaît.
do $retour_arriere$
begin
  if to_regprocedure('public.marquer_incident_urgent_notifie(uuid,uuid)') is null then
    raise notice 'marquer_incident_urgent_notifie : absente, rien à faire';
  else
    drop function public.marquer_incident_urgent_notifie(uuid,uuid);
    raise notice 'marquer_incident_urgent_notifie : supprimée';
  end if;
end $retour_arriere$;

-- 3/3 La colonne ensuite. On dit combien de mémoires d'envoi disparaissent (information, pas une condition).
do $retour_arriere$
declare v_nb bigint := 0;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'commandes_incidents_locataire' and column_name = 'notifie_le') then
    execute 'select count(*) from public.commandes_incidents_locataire where notifie_le is not null' into v_nb;
    alter table public.commandes_incidents_locataire drop column notifie_le;
    raise notice 'commandes_incidents_locataire.notifie_le : supprimée (% mémoire(s) d''envoi retirée(s), aucune déclaration supprimée)', v_nb;
  else
    raise notice 'commandes_incidents_locataire.notifie_le : absente, rien à faire';
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014401000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'colonne commandes_incidents_locataire.notifie_le' as objet,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'commandes_incidents_locataire' and column_name = 'notifie_le')
            then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'fonction marquer_incident_urgent_notifie',
       case when to_regprocedure('public.marquer_incident_urgent_notifie(uuid,uuid)') is not null then 'migrée (B)' else 'antérieure (A)' end
union all
select 'declarer_mon_incident_reprise dit notifie',
       case when position('Décision X15 (REP-02) du 14/10' in pg_get_functiondef('public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence)'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end;
$instructions_retour$;
end $retour_atomique$;
