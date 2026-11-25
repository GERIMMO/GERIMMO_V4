-- RETOUR ARRIÈRE de 20261122150000_evaluation_contestee.sql (audit palier 1, P1-07).
--
-- Supprime les deux fonctions de la contestation (lecture tracée du détail, retrait motivé) et rend à l'ancienne
-- `retirer_evaluation(uuid, text)` son droit d'exécution d'avant. Rien n'est effacé : les évaluations déjà retirées
-- restent retirées (avec leur motif), les alertes « evaluation_retiree » déjà posées restent lisibles et se ferment
-- à la main, les lignes du journal et du suivi des contestations restent en place.
--
-- À SAVOIR : après ce retour, plus aucun chemin ne permet de retirer une évaluation — l'ancienne fonction est
-- refusée par le garde de traversée (D08-C, 20261016172453) pour un super admin qui n'est pas membre de
-- l'organisation. C'était déjà l'état d'avant cette migration.
--
-- À JOUER APRÈS le retour du code de l'application à la version précédente. Rejouable.
do $retour$
begin
  drop function if exists public.retirer_evaluation_contestee(uuid, uuid, text);
  drop function if exists public.evaluations_contestation(uuid);
  if to_regprocedure('public.retirer_evaluation(uuid,text)') is not null then
    grant execute on function public.retirer_evaluation(uuid, text) to authenticated;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261122150000';
end $retour$;
notify pgrst, 'reload schema';
