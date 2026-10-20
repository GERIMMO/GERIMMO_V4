-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014845000_invitation_artisan_soi_meme.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : on ne s'invite pas soi-même).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : les définitions EN VIGUEUR de `preparer_invitation_artisan` et `repondre_invitation_artisan` sont
-- relues, et le seul morceau posé par la migration dans chacune (le bloc du correctif, avec sa marque, devant sa ligne
-- d'ancre) est retiré. Un correctif posé depuis par une autre migration ailleurs dans ces fonctions est conservé.
-- Rejouable : sans le morceau de la migration (ou sans la fonction), rien n'est fait. Droits inchangés.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014845000_invitation_artisan_soi_meme.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un propriétaire peut s'inviter lui-même (sa propre adresse, ou celle de sa propre fiche
-- d'artisan) et accepter sa propre invitation. Ordre indifférent avec le code. À jouer AVANT le retour de
-- 20261014840000 (qui supprime ces fonctions ; joué après, ce script ne trouve rien à faire et le dit).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- 1. preparer_invitation_artisan
do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (s'inviter soi-même, à l'envoi) : ni sa propre adresse, ni celle de sa fiche d'artisan, voir 20261014845000.
  if exists (select 1 from auth.users u where u.id = (select auth.uid())
               and public.adresse_canonique_invitation_artisan(u.email) = public.adresse_canonique_invitation_artisan(v_email))
     or exists (select 1 from public.artisans a where a.account_id = (select auth.uid()) and a.email is not null
               and public.adresse_canonique_invitation_artisan(a.email) = public.adresse_canonique_invitation_artisan(v_email)) then
    raise exception 'Vous ne pouvez pas vous inviter vous-même : indiquez l’adresse e-mail de l’artisan';
  end if;
  -- Deux envois simultanés vers la même adresse ne créent pas deux invitations.$nouveau$;
  c_ancre constant text := $ancre$  -- Deux envois simultanés vers la même adresse ne créent pas deux invitations.$ancre$;
begin
  if to_regprocedure('public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)') is null then
    raise notice 'preparer_invitation_artisan : fonction absente (retour de 20261014840000 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'preparer_invitation_artisan : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'preparer_invitation_artisan : bloc « s''inviter soi-même » retiré';
end $retour_arriere$;

-- 2. repondre_invitation_artisan
do $retour_arriere$
declare
  v_def text;
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (s'inviter soi-même, à l'acceptation) : jamais l'invitation qu'on a envoyée, voir 20261014845000.
  if i.cree_par = (select auth.uid()) then
    return jsonb_build_object('etat', 'en_attente',
      'erreur', 'Vous ne pouvez pas accepter une invitation que vous avez vous-même envoyée.');
  end if;
  select * into a from public.artisans where account_id = (select auth.uid()) for share;$nouveau$;
  c_ancre constant text := $ancre$  select * into a from public.artisans where account_id = (select auth.uid()) for share;$ancre$;
begin
  if to_regprocedure('public.repondre_invitation_artisan(uuid,boolean)') is null then
    raise notice 'repondre_invitation_artisan : fonction absente (retour de 20261014840000 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.repondre_invitation_artisan(uuid,boolean)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'repondre_invitation_artisan : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'repondre_invitation_artisan : bloc « s''inviter soi-même » retiré';
end $retour_arriere$;

do $retour_arriere$
begin
  if to_regprocedure('public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)') is not null then
    revoke all on function public.preparer_invitation_artisan(uuid, text, text, public.artisan_metier) from public, anon;
    grant execute on function public.preparer_invitation_artisan(uuid, text, text, public.artisan_metier) to authenticated;
  end if;
  if to_regprocedure('public.repondre_invitation_artisan(uuid,boolean)') is not null then
    revoke all on function public.repondre_invitation_artisan(uuid, boolean) from public, anon;
    grant execute on function public.repondre_invitation_artisan(uuid, boolean) to authenticated;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014845000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select f.objet,
       case when to_regprocedure(f.signature) is null then 'absente'
            when position(f.marque in pg_get_functiondef(to_regprocedure(f.signature))) > 0 then 'migrée (B)'
            else 'antérieure (A)' end as etat
from (values
  ('preparer_invitation_artisan', 'public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)',
   'Relecture du 15/10 (s''inviter soi-même, à l''envoi)'),
  ('repondre_invitation_artisan', 'public.repondre_invitation_artisan(uuid,boolean)',
   'Relecture du 15/10 (s''inviter soi-même, à l''acceptation)')) as f(objet, signature, marque);
$instructions_retour$;
end $retour_atomique$;
