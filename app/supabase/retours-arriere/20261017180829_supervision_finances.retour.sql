-- RETOUR ARRIÈRE de 20261017180829_supervision_finances.sql (lot « supervision et signatures », 17-18/10/2026 ;
-- PR #202 : vue financière de la supervision, lecture seule du miroir Stripe).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #202 : commit 4466ad4) : src/app/admin/page.tsx appelle supervision_finances.
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261017180829_supervision_finances.retour.sql
-- Ordre : dernier retour du lot, après celui de 20261018061548, avant celui de 20261016210000.
--
-- La migration ne fait que CRÉER une fonction (aucune table, aucune donnée, aucun droit existant modifié) : le retour la
-- supprime. Rejouable (`drop function if exists`). Seule migration du lot réellement réapplicable telle quelle après
-- retour (`create or replace`).
-- RÉINTRODUIT : la vue financière de /admin tombe tant que le code de la PR #202 n'est pas retiré.
--
-- Historique : en production (relevé en lecture seule du 19/10/2026), cette migration est inscrite sous la version
-- 20261018071151 (nom de fichier d'avant la fusion de la PR #202) ; le dépôt la nomme 20261017180829. Les deux versions
-- sont retirées, pour que l'historique ne dise plus « appliquée » sous aucun des deux noms.

set local lock_timeout = '10s';

drop function if exists public.supervision_finances();

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- Même transaction externe que le retour : la version n'est plus « appliquée » (version du fichier ET version
-- enregistrée en production), migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261017180829', '20261018071151');
  end if;
end $historique$;
