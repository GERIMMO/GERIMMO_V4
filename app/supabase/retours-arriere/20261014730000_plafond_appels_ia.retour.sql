-- RETOUR ARRIÈRE de 20261014730000_plafond_appels_ia.sql (décision X19, fiche SA-10 : limite quotidienne des appels payants
-- à l'IA et arrêt d'urgence consulté avant chaque appel payant)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une migration, il
-- se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Une seule transaction : la moindre erreur annule tout,
-- la base reste alors telle qu'elle était.
--
-- La migration n'a modifié AUCUNE fonction existante ni aucune ligne existante : elle a seulement créé deux tables et deux
-- fonctions. Le retour les supprime, rien d'autre. Aucune donnée métier ni financière n'est touchée.
--
-- Ce que le retour fait : supprime `reserver_appel_ia(text)` et `regler_plafond_ia(integer)`, puis les tables
-- `ia_appels_jour` (compteurs par jour : il dit combien de jours disparaissent) et `ia_plafond_reglage` (il dit la limite
-- qui était réglée). Les lignes « plafond_ia » du journal des gestes de supervision (supervision_operations) sont CONSERVÉES :
-- elles disent qui a réglé quoi, et quand.
--
-- ORDRE : remettre d'abord en production le code d'avant la décision X19. Le code X19 réserve chaque appel payant auprès de
-- `reserver_appel_ia` ; sans elle, il ne sait pas vérifier l'arrêt ni la limite et, par prudence, n'appelle plus l'IA du tout
-- (brief, article, veille, posts, devis assisté, atelier : « Le contrôle des appels à l'IA est indisponible »). Rien n'est
-- cassé, mais plus aucun appel à l'IA ne part tant que le code n'est pas revenu.
--
-- RÉINTRODUIT le défaut corrigé (SA-10) : plus aucune limite propre à Gerimmo (seule reste celle du compte chez le
-- fournisseur), et les appels lancés à la main (brief, article, devis assisté, atelier) partent même sous un arrêt d'urgence.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014730000_plafond_appels_ia.retour.sql

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

-- 1/3 Les deux fonctions (nouvelles : rien d'antérieur à rétablir).
do $retour_arriere$
begin
  if to_regprocedure('public.reserver_appel_ia(text)') is null then
    raise notice 'reserver_appel_ia : absente, rien à faire';
  else
    drop function public.reserver_appel_ia(text);
    raise notice 'reserver_appel_ia : supprimée';
  end if;
  if to_regprocedure('public.regler_plafond_ia(integer)') is null then
    raise notice 'regler_plafond_ia : absente, rien à faire';
  else
    drop function public.regler_plafond_ia(integer);
    raise notice 'regler_plafond_ia : supprimée';
  end if;
end $retour_arriere$;

-- 2/3 Les deux tables. On dit ce qui disparaît (information, pas une condition).
do $retour_arriere$
declare v_jours bigint := 0; v_appels bigint := 0; v_limite integer;
begin
  if to_regclass('public.ia_appels_jour') is null then
    raise notice 'ia_appels_jour : absente, rien à faire';
  else
    execute 'select count(*), coalesce(sum(appels), 0) from public.ia_appels_jour' into v_jours, v_appels;
    drop table public.ia_appels_jour;
    raise notice 'ia_appels_jour : supprimée (% jour(s) de compteur, % appel(s) comptés au total)', v_jours, v_appels;
  end if;
  if to_regclass('public.ia_plafond_reglage') is null then
    raise notice 'ia_plafond_reglage : absente, rien à faire';
  else
    execute 'select plafond_jour from public.ia_plafond_reglage where singleton' into v_limite;
    drop table public.ia_plafond_reglage;
    raise notice 'ia_plafond_reglage : supprimée (la limite réglée était de % appel(s) par jour)', coalesce(v_limite::text, 'inconnue');
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- 3/3 La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014730000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'fonction reserver_appel_ia' as objet,
       case when to_regprocedure('public.reserver_appel_ia(text)') is not null then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'fonction regler_plafond_ia',
       case when to_regprocedure('public.regler_plafond_ia(integer)') is not null then 'migrée (B)' else 'antérieure (A)' end
union all
select 'table ia_appels_jour',
       case when to_regclass('public.ia_appels_jour') is not null then 'migrée (B)' else 'antérieure (A)' end
union all
select 'table ia_plafond_reglage',
       case when to_regclass('public.ia_plafond_reglage') is not null then 'migrée (B)' else 'antérieure (A)' end;
