-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014220000_traversee_trace_precise.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014220000_traversee_trace_precise.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (SA-01, décision D08) : log_sa_access ne dédoublonne de nouveau que les consultations
-- (consultation_*). Chaque rendu d'une page d'un espace client réécrit une ligne traversee_espace (jusqu'à 15 en une minute).
-- Aucune donnée n'est défaite : les lignes d'audit déjà écrites (avec leurs détails) restent telles quelles.

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

-- log_sa_access (SA-01)
select pg_temp.restaurer_fonction('public.log_sa_access(uuid,text,jsonb)',
  $marque$Audit du 14/10 (SA-01)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.log_sa_access(org uuid, sa_action text, sa_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_super_admin() then
    raise exception 'log_sa_access: reserve au super admin';
  end if;
  if sa_action like 'consultation\_%' and exists (
    select 1 from public.audit_log l
    where l.account_id = (select auth.uid()) and l.action = sa_action
      and l.organization_id is not distinct from org
      and l.details = coalesce(sa_details, '{}'::jsonb)
      and l.created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()), org, sa_action, coalesce(sa_details, '{}'::jsonb));
end;
$function$
$definition_anterieure$);

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014220000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
