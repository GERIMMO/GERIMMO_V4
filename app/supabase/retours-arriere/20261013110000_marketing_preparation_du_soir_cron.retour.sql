-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261013110000_marketing_preparation_du_soir_cron.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261013110000_marketing_preparation_du_soir_cron.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : la préparation du soir de la publication marketing ne se déclenche
-- plus depuis pg_cron (cible_preparation_marketing() filtre sur auth.role() = 'service_role', nul sans jeton).
-- Seule la diffusion des posts programmés part ; la préparation n'est plus faite que par le rattrapage du
-- cron Vercel de la matinée, sans fenêtre de veto la veille.

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

-- préparation du soir (2/3)
select pg_temp.restaurer_fonction('public.preparation_marketing_due()',
  $marque$cible_preparation_marketing_interne$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.preparation_marketing_due()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select from public.cible_preparation_marketing());
$function$
$definition_anterieure$);

-- préparation du soir (1/3)
select pg_temp.restaurer_fonction('public.cible_preparation_marketing()',
  $marque$cible_preparation_marketing_interne$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.cible_preparation_marketing()
 RETURNS TABLE(jour date, rang integer, parution timestamp with time zone, rattrapage boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with r as (select * from public.marketing_reglages where singleton and actif and (select auth.role()) = 'service_role'),
       j as (select (now() at time zone 'Europe/Paris')::date as aujourdhui),
       libre as (select d.jour from (values ((select aujourdhui from j)), ((select aujourdhui + 1 from j))) as d(jour)
                 where not exists (select from public.publications p where p.marketing_jour = d.jour and p.statut not in ('brouillon', 'planifiee')))
  select l.jour, array_position(r.jours_semaine, extract(isodow from l.jour)::smallint) - 1 as rang,
         case when l.jour = j.aujourdhui then greatest(public.instant_paris(l.jour, r.heure_paris), now() + interval '1 hour')
              else public.instant_paris(l.jour, r.heure_paris) end as parution,
         l.jour = j.aujourdhui as rattrapage
    from r, j, libre l
   where extract(isodow from l.jour)::smallint = any(r.jours_semaine)
     and ((l.jour = j.aujourdhui + 1 and now() >= public.instant_paris(j.aujourdhui, r.heure_preparation_paris))
       or (l.jour = j.aujourdhui and now() between public.instant_paris(l.jour, r.heure_paris) - interval '12 hours'
                                               and public.instant_paris(l.jour, r.heure_paris) + interval '3 hours'))
   order by l.jour limit 1;
$function$
$definition_anterieure$);

-- La fonction interne n'est plus appelée par personne : on la retire, SANS cascade (une dépendance inattendue arrête tout).
drop function if exists public.cible_preparation_marketing_interne();

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261013110000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
