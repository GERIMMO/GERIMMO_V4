-- Décision X02 (AUD-A-06, relevé du 13 octobre 2026) : le formulaire de contact du site vitrine n'écrit plus
-- que par l'action serveur.
--
-- Constat de l'audit : l'insertion anonyme DIRECTE dans `demandes_devis` (clé publique + PostgREST, sans passer par
-- l'action serveur) « n'a pas de limite de débit : 30 insertions sur 30 acceptées ». Relu avec la base : la limite
-- existe bien (déclencheur `demandes_devis_limiter`, migrations 20260927124000 et 20260929110000 : doublon exact
-- ignoré, 3 demandes par adresse et par heure, 30 par heure en tout) ; les 30 de l'audit étaient exactement le
-- plafond, la 31e est refusée. Ce que la porte directe permettait réellement : contourner le pot de miel et la
-- validation de l'action serveur, et saturer le plafond horaire sans aucun filtre — les prospects suivants
-- voyaient « réessayez dans une heure ».
--
-- Correction décidée (option « insertion par l'action serveur ») :
--   · `anon` et `authenticated` perdent le droit d'insérer dans `demandes_devis` (table ET colonnes) ; la
--     politique `demandes_devis_insert_public` (with check true) est supprimée. La base n'accorde plus AUCUNE
--     écriture à `anon` : l'invariant « anon n'écrit nulle part » n'a plus d'exception.
--   · l'action serveur `demanderDevis` insère avec le client de service (src/lib/supabase/service.ts), APRÈS le pot de
--     miel et la validation de ses champs. Le déclencheur de limite reste en place : il s'applique à tous les
--     rôles, `service_role` compris (doublon, 3 par adresse et par heure, 30 par heure), et son refus arrive à
--     l'écran en français.
--   · la lecture et le traitement restent réservés au super-administrateur (politiques `_select_sa`, `_update_sa`).
--
-- Migration SANS donnée touchée : aucune ligne n'est lue ni réécrite. Rejouable (`revoke` et `drop policy if
-- exists` sont sans effet la seconde fois). Ordre de mise en production : le code de la décision X02 d'abord ou en
-- même temps — sans lui, le formulaire échouerait (plus d'insertion directe) ; la clé de service doit être posée
-- dans l'environnement du site (elle l'est déjà pour les tâches planifiées).
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

revoke insert on table public.demandes_devis from anon, authenticated;
-- Les droits par colonne (accordés par 20260929110000) sont retirés par la ligne ci-dessus ; la ligne suivante
-- les nomme quand même, pour qu'une base où ils auraient été posés autrement soit nettoyée de la même façon.
revoke insert (nom, email, agence, telephone, nb_lots, message) on table public.demandes_devis from anon, authenticated;

drop policy if exists demandes_devis_insert_public on public.demandes_devis;

-- Le geste d'écriture passe désormais par la clé de service (déjà titulaire du droit ; rendu explicite).
grant insert on table public.demandes_devis to service_role;

comment on table public.demandes_devis is
  'Demandes de contact du site vitrine. Écrites par l''action serveur (clé de service) après le pot de miel et la validation ; aucun rôle de l''application n''y insère directement. Plafonds par le déclencheur demandes_devis_limiter. Décision X02 (AUD-A-06).';

-- Rejeu : si un droit d'insertion direct subsistait malgré tout (autre migration, réglage manuel), on s'arrête
-- plutôt que de le taire.
do $controle$
begin
  if has_any_column_privilege('anon', 'public.demandes_devis', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.demandes_devis', 'INSERT') then
    raise exception 'demandes_devis : un droit d''insertion direct subsiste pour anon ou authenticated';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.demandes_devis'::regclass and polcmd = 'a') then
    raise exception 'demandes_devis : une politique d''insertion subsiste';
  end if;
end $controle$;

-- Convention de toute migration (aucune fonction n'est touchée ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();
