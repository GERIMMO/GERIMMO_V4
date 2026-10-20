-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014844000_invitation_artisan_budget_distinct.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : le budget horaire des invitations d'artisans est distinct de celui des locataires).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : la définition EN VIGUEUR de `limiter_envoi_invitation_artisan` est relue, et la seule ligne posée par la
-- migration (l'appel sur la clé distincte, avec sa marque) redevient l'appel sur la clé commune `organisation:<uuid>`.
-- Rejouable : sans la ligne de la migration, la fonction est laissée telle quelle. Droits inchangés (fonction interne).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014844000_invitation_artisan_budget_distinct.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : les invitations d'artisans comptent de nouveau dans les 30 liens par heure des
-- invitations de locataires de l'organisation. Ordre indifférent avec le code. À jouer AVANT le retour de
-- 20261014840000 (qui supprime la fonction).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$  if not public.autoriser_lien_mot_de_passe_cle('invitation-artisan-organisation-heure:' || p_org::text, 30) then -- Relecture du 15/10 (budget distinct des locataires), voir 20261014844000.$nouveau$;
  c_ancre constant text := $ancre$  if not public.autoriser_lien_mot_de_passe_cle('organisation:' || p_org::text, 30) then$ancre$;
begin
  if to_regprocedure('public.limiter_envoi_invitation_artisan(uuid,text)') is null then
    raise notice 'limiter_envoi_invitation_artisan : fonction absente (retour de 20261014840000 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.limiter_envoi_invitation_artisan(uuid,text)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'limiter_envoi_invitation_artisan : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'limiter_envoi_invitation_artisan : clé commune avec les locataires rétablie';
end $retour_arriere$;

do $retour_arriere$
begin
  if to_regprocedure('public.limiter_envoi_invitation_artisan(uuid,text)') is not null then
    revoke all on function public.limiter_envoi_invitation_artisan(uuid, text) from public, anon, authenticated;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014844000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'limiter_envoi_invitation_artisan' as objet,
       case when to_regprocedure('public.limiter_envoi_invitation_artisan(uuid,text)') is null then 'absente'
            when position('Relecture du 15/10 (budget distinct des locataires)'
                          in pg_get_functiondef('public.limiter_envoi_invitation_artisan(uuid,text)'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat;
$instructions_retour$;
end $retour_atomique$;
