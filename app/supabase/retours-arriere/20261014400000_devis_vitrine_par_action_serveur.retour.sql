-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014400000_devis_vitrine_par_action_serveur.sql (décision X02, AUD-A-06 : le formulaire de contact
-- du site vitrine n'écrit plus que par l'action serveur)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Ce que le retour fait : rend à `anon` et à `authenticated` le droit d'insérer dans `demandes_devis` (les six colonnes
-- du formulaire seulement : nom, email, agence, telephone, nb_lots, message — l'état d'après 20260929110000), recrée la
-- politique `demandes_devis_insert_public` (for insert to anon, authenticated with check (true)) et rétablit le
-- commentaire de la table. Aucune demande n'est lue, supprimée ni modifiée. Le déclencheur de limite
-- (`demandes_devis_limiter`) n'a jamais été touché : il reste en place dans les deux états.
--
-- ORDRE À RESPECTER si le code est aussi défait : la BASE d'abord (ce script), puis le CODE d'avant la décision X02.
-- Le code de la décision X02 écrit avec la clé de service, qui garde son droit dans les deux états : il fonctionne
-- donc avant comme après ce retour. Défaire le code AVANT la base casserait le formulaire (le code d'avant écrit avec
-- la clé publique, dont l'insertion est alors refusée).
--
-- RÉINTRODUIT le défaut corrigé (AUD-A-06) : un robot muni de la seule clé publique peut de nouveau insérer
-- directement dans `demandes_devis` par l'API, sans passer par le pot de miel ni la validation de l'action serveur
-- (les plafonds du déclencheur — 3 par adresse et par heure, 30 par heure — continuent de s'appliquer).
--
-- Rejouable : sur une base déjà revenue, chaque étape répond « rien à faire ».
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014400000_devis_vitrine_par_action_serveur.retour.sql

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- 1/3 Le droit d'insertion par colonne, tel que 20260929110000 l'avait posé.
do $retour_arriere$
begin
  if has_any_column_privilege('anon', 'public.demandes_devis', 'INSERT')
     and has_any_column_privilege('authenticated', 'public.demandes_devis', 'INSERT') then
    raise notice 'droit d''insertion anon / authenticated : déjà rétabli, rien à faire';
  else
    grant insert (nom, email, agence, telephone, nb_lots, message) on table public.demandes_devis to anon, authenticated;
    raise notice 'droit d''insertion anon / authenticated : rétabli sur les six colonnes du formulaire';
  end if;
end $retour_arriere$;

-- 2/3 La politique d'insertion publique d'origine (20260906130000).
do $retour_arriere$
begin
  if exists (select 1 from pg_policy where polrelid = 'public.demandes_devis'::regclass and polname = 'demandes_devis_insert_public') then
    raise notice 'demandes_devis_insert_public : déjà présente, rien à faire';
  else
    create policy demandes_devis_insert_public on public.demandes_devis
      for insert to anon, authenticated
      with check (true);
    raise notice 'demandes_devis_insert_public : recréée';
  end if;
end $retour_arriere$;

-- 3/3 Le commentaire d'avant la décision.
comment on table public.demandes_devis is
  'Demandes de devis du site vitrine. Seule table où le rôle anon conserve un privilège d''écriture (INSERT), pour le formulaire public — audit 2026-09-10.';

-- Convention de toute migration (aucune fonction n'est touchée ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014400000';
  end if;
end $retour_arriere$;


-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'insertion directe anon / authenticated' as objet,
       case when has_any_column_privilege('anon', 'public.demandes_devis', 'INSERT')
            then 'antérieure (A)' else 'migrée (B)' end as etat
union all
select 'politique demandes_devis_insert_public',
       case when exists (select 1 from pg_policy where polrelid = 'public.demandes_devis'::regclass and polname = 'demandes_devis_insert_public')
            then 'antérieure (A)' else 'migrée (B)' end;
$instructions_retour$;
end $retour_atomique$;
