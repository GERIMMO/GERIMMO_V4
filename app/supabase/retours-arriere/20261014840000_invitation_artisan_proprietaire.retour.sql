-- RETOUR ARRIÈRE de 20261014840000_invitation_artisan_proprietaire.sql (décision du dirigeant du 15/10/2026 : invitation
-- d'un artisan par un propriétaire direct, inscription par l'artisan, validation par Gerimmo).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- La migration n'avait modifié AUCUNE fonction existante : elle n'avait qu'ajouté une table et douze fonctions. Il n'y a
-- donc aucune définition antérieure à rétablir ; le retour supprime ce qu'elle avait créé, et rien d'autre.
--
-- Ce que le retour fait : supprime les douze fonctions (`preparer_`, `renvoyer_`, `annuler_`, `noter_envoi_`,
-- `repondre_invitation_artisan`, `mon_invitation_artisan`, `carnet_artisans_proprietaire`,
-- `invitations_des_artisans_a_valider`, et les fonctions internes `invitation_artisan_par_proprietaire`,
-- `limiter_envoi_invitation_artisan`, `autoriser_invitation_artisan_cle`, `adresse_canonique_invitation_artisan`),
-- puis la table `invitations_artisans`
-- (ses index et ses deux déclencheurs partent avec elle). Le script dit combien d'invitations disparaissent, et combien
-- avaient été acceptées.
--
-- Ce que le retour CONSERVE : les rattachements déjà faits par une acceptation (lignes de `artisan_agences`) — l'artisan
-- reste dans le carnet du propriétaire, comme s'il y avait été ajouté autrement ; les lignes du journal d'audit
-- (`invitation_artisan*`) ; les comptes et fiches que les artisans ont créés eux-mêmes ; les décomptes de la limite
-- anti-abus (`demandes_lien_mot_de_passe`, purgés d'eux-mêmes après une journée).
--
-- ORDRE : remettre en production le code d'AVANT la décision du 15/10 PUIS jouer ce script. Le code de la décision
-- appelle ces fonctions (carnet du propriétaire, page d'invitation, console de validation) : sur une base revenue en
-- arrière, ces écrans afficheraient une erreur de lecture.
--
-- RÉINTRODUIT : un propriétaire direct n'a plus aucun moyen de faire entrer un artisan dans son carnet ; dans une
-- commune fermée au réseau, il revient à la voie de sortie de la décision D17 (option A : clôturer, appeler lui-même
-- un artisan, signaler son intérêt).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014840000_invitation_artisan_proprietaire.retour.sql

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

-- 1/2 Les fonctions d'abord (aucune autre fonction ne les appelle ; les fonctions internes en dernier).
do $retour_arriere$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)',
    'public.renvoyer_invitation_artisan(uuid)',
    'public.annuler_invitation_artisan(uuid)',
    'public.noter_envoi_invitation_artisan(uuid,boolean)',
    'public.carnet_artisans_proprietaire(uuid)',
    'public.mon_invitation_artisan(uuid)',
    'public.repondre_invitation_artisan(uuid,boolean)',
    'public.invitations_des_artisans_a_valider()',
    'public.invitation_artisan_par_proprietaire(uuid)',
    'public.limiter_envoi_invitation_artisan(uuid,text)',
    'public.autoriser_invitation_artisan_cle(text,integer,integer)',
    'public.adresse_canonique_invitation_artisan(text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise notice '% : absente, rien à faire', v_signature;
    else
      execute 'drop function ' || v_signature;
      raise notice '% : supprimée', v_signature;
    end if;
  end loop;
end $retour_arriere$;

-- 2/2 La table ensuite. On dit ce qui disparaît (information, pas une condition).
do $retour_arriere$
declare v_nb bigint := 0; v_acceptees bigint := 0;
begin
  if to_regclass('public.invitations_artisans') is null then
    raise notice 'invitations_artisans : absente, rien à faire';
  else
    execute 'select count(*), count(*) filter (where etat = ''acceptee'') from public.invitations_artisans' into v_nb, v_acceptees;
    drop table public.invitations_artisans;
    raise notice 'invitations_artisans : supprimée (% invitation(s), dont % acceptée(s) ; les rattachements au carnet sont conservés)', v_nb, v_acceptees;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014840000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'table invitations_artisans' as objet,
       case when to_regclass('public.invitations_artisans') is not null then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'fonctions de l''invitation d''artisan (' || count(*) || ' présente(s) sur 12)',
       case when count(*) > 0 then 'migrée (B)' else 'antérieure (A)' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('preparer_invitation_artisan', 'renvoyer_invitation_artisan', 'annuler_invitation_artisan',
                    'noter_envoi_invitation_artisan', 'carnet_artisans_proprietaire', 'mon_invitation_artisan',
                    'repondre_invitation_artisan', 'invitations_des_artisans_a_valider', 'invitation_artisan_par_proprietaire',
                    'limiter_envoi_invitation_artisan', 'autoriser_invitation_artisan_cle', 'adresse_canonique_invitation_artisan');
