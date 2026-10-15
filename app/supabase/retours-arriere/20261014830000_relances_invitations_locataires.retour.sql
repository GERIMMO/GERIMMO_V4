-- RETOUR ARRIÈRE de 20261014830000_relances_invitations_locataires.sql (décision X16 du 15/10/2026, fiche REP-05 :
-- relances automatiques des invitations de locataire à J+3 et J+10)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- La migration n'a réécrit aucune fonction existante : elle a AJOUTÉ deux colonnes à `invitations_locataires`
-- (`premier_envoi_le`, `relances_prevues`), un déclencheur et sa fonction (`premier_envoi_invitation_locataire`), la
-- table `relances_invitations_locataires` et quatre fonctions. Le retour les retire, rien d'autre : aucune invitation
-- n'est supprimée ni modifiée ; les lignes du journal d'audit (« invitation_locataire_relancee », « …_relance_echec »,
-- « …_relance_incertaine ») sont CONSERVÉES ; seule disparaît la mémoire des relances (le script dit combien).
--
-- ORDRE À RESPECTER : remettre d'abord en production le CODE d'avant la décision X16. Le code de X16 appelle
-- `invitations_locataires_relances_dues` (mission « rappels ») et lit `relances_invitations_locataires` (fiche
-- personne) : sur une base revenue en arrière, la mission noterait « lecture impossible » chaque matin et la fiche
-- afficherait « L'historique des invitations n'a pas pu être chargé ».
--
-- RÉINTRODUIT l'écart REP-05 : plus aucune relance automatique ; un locataire qui n'ouvre pas le premier e-mail n'est
-- plus jamais relancé (le renvoi manuel depuis la fiche reste possible).
--
-- Rejouable : sur une base déjà revenue, chaque étape répond « rien à faire ».
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014830000_relances_invitations_locataires.retour.sql

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

-- 1/4 Les quatre fonctions des relances (aucun autre objet ne les appelle).
do $retour_arriere$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.noter_relance_invitation_locataire(uuid,smallint,text)',
    'public.reserver_relance_invitation_locataire(uuid,smallint)',
    'public.invitations_locataires_relances_dues(integer)',
    'public.relance_invitation_locataire_due(uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise notice '% : absente, rien à faire', v_signature;
    else
      execute format('drop function %s', to_regprocedure(v_signature)::text);
      raise notice '% : supprimée', v_signature;
    end if;
  end loop;
end $retour_arriere$;

-- 2/4 La table des relances. On dit combien de relances mémorisées disparaissent (information, pas une condition).
do $retour_arriere$
declare v_nb bigint := 0;
begin
  if to_regclass('public.relances_invitations_locataires') is null then
    raise notice 'relances_invitations_locataires : absente, rien à faire';
  else
    execute 'select count(*) from public.relances_invitations_locataires' into v_nb;
    drop table public.relances_invitations_locataires;
    raise notice 'relances_invitations_locataires : supprimée (% relance(s) mémorisée(s) ; le journal d''audit les garde)', v_nb;
  end if;
end $retour_arriere$;

-- 3/4 Le déclencheur du premier envoi, puis sa fonction.
do $retour_arriere$
begin
  if exists (select 1 from pg_trigger where tgname = 'premier_envoi_invitation_locataire'
                and tgrelid = 'public.invitations_locataires'::regclass and not tgisinternal) then
    drop trigger premier_envoi_invitation_locataire on public.invitations_locataires;
    raise notice 'déclencheur premier_envoi_invitation_locataire : supprimé';
  else
    raise notice 'déclencheur premier_envoi_invitation_locataire : absent, rien à faire';
  end if;
  if to_regprocedure('public.poser_premier_envoi_invitation_locataire()') is null then
    raise notice 'poser_premier_envoi_invitation_locataire : absente, rien à faire';
  else
    drop function public.poser_premier_envoi_invitation_locataire();
    raise notice 'poser_premier_envoi_invitation_locataire : supprimée';
  end if;
end $retour_arriere$;

-- 4/4 Les deux colonnes de l'invitation.
do $retour_arriere$
declare
  v_colonne text;
begin
  foreach v_colonne in array array['relances_prevues', 'premier_envoi_le'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'invitations_locataires' and column_name = v_colonne) then
      execute format('alter table public.invitations_locataires drop column %I', v_colonne);
      raise notice 'invitations_locataires.% : supprimée (aucune invitation supprimée)', v_colonne;
    else
      raise notice 'invitations_locataires.% : absente, rien à faire', v_colonne;
    end if;
  end loop;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014830000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'table relances_invitations_locataires' as objet,
       case when to_regclass('public.relances_invitations_locataires') is not null then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'colonnes invitations_locataires.premier_envoi_le / relances_prevues',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'invitations_locataires'
                            and column_name in ('premier_envoi_le', 'relances_prevues'))
            then 'migrée (B)' else 'antérieure (A)' end
union all
select 'fonctions des relances',
       case when to_regprocedure('public.reserver_relance_invitation_locataire(uuid,smallint)') is not null
              or to_regprocedure('public.relance_invitation_locataire_due(uuid)') is not null
            then 'migrée (B)' else 'antérieure (A)' end
union all
select 'déclencheur premier_envoi_invitation_locataire',
       case when exists (select 1 from pg_trigger where tgname = 'premier_envoi_invitation_locataire' and not tgisinternal)
            then 'migrée (B)' else 'antérieure (A)' end;
