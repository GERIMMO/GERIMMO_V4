-- RETOUR ARRIÈRE de 20261018071556_supervision_index_relations.sql (lot « supervision et signatures », 17-18/10/2026 ;
-- PR #202 : index des clés étrangères des tables de supervision).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #202 : commit 4466ad4).
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018071556_supervision_index_relations.retour.sql
-- Ordre : après le retour de 20261018085521, avant celui de 20261018061548 (qui refuse tant que ces index existent).
--
-- CONSERVE : les cinq tables de supervision et leurs lignes (aucune donnée, aucun droit touché par la migration).
-- RETIRE : les sept index simples posés par la migration (un `drop index` prend un verrou exclusif bref ; l'attente
-- est bornée par lock_timeout). Aucune fonction touchée : pas d'appel à fermer_fonctions_a_anon(). Rejouable.
-- RÉINTRODUIT : les avertissements de performance (clés étrangères non indexées) sur ces tables.
--
-- Historique : en production (relevé en lecture seule du 19/10/2026), cette migration est inscrite sous la version
-- 20261018071811 (nom de fichier d'avant la fusion de la PR #202) ; le dépôt la nomme 20261018071556. Les deux versions
-- sont retirées, pour que l'historique ne dise plus « appliquée » sous aucun des deux noms.

set local lock_timeout = '10s';

drop index if exists
  public.supervision_couts_auteur_idx,
  public.supervision_executions_decisions_auteur_idx,
  public.supervision_identite_modifie_par_idx,
  public.supervision_prospects_auteur_idx,
  public.supervision_prospects_organisation_id_idx,
  public.supervision_prospects_responsable_idx,
  public.supervision_registre_auteur_idx;

-- Même transaction externe que le retour : la version n'est plus « appliquée » (version du fichier ET version
-- enregistrée en production), migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018071556', '20261018071811');
  end if;
end $historique$;
