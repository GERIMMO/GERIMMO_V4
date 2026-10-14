-- D48 (fiche IA-11) et volet « purge » de D13 (fiche SUP-05), décisions du dirigeant du 14/10/2026, option A : une durée unique de
-- SIX MOIS (celle du journal technique, RM-A2.6), une ligne de `retention_rules` par registre d'exécution des automatismes et
-- du pilotage, appliquée par `appliquer_retention` (nettoyage de 03 h chaque nuit et bouton « Nettoyer » de la supervision).
--
-- Les cinq registres, jusqu'ici sans fin de vie :
--   · agent_passages              — passages des équipes IA            (âge : début du passage)
--   · supervision_operations      — gestes de la supervision           (âge : date de l'opération)
--   · points_du_matin             — points du matin                    (âge : date de génération)
--   · decisions_du_matin          — décisions proposées dans le point  (âge : date de création)
--   · brief_direction_snapshots   — faits de direction (D13)           (âge : date de génération)
--
-- ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ LES LIGNES PURGÉES SONT IRRÉCUPÉRABLES. Les règles naissent ACTIVES : le premier passage de `appliquer_retention`    │
-- │ qui suit cette migration (la nuit même, ou le bouton de la supervision) supprime TOUT ce qui a plus de six mois dans │
-- │ ces cinq registres. À faire AVANT d'appliquer cette migration en production : lancer « Sauvegarde quotidienne » à    │
-- │ la main (Actions, workflow_dispatch) et attendre son succès. Pour différer la purge sans retirer la règle :          │
-- │   update public.retention_rules set actif = false where data_type like 'journal:%' and data_type in (...).           │
-- └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- Durées : la recommandation de la CNIL sur la journalisation (novembre 2021) parle de 6 mois à 1 an, jusqu'à 3 ans sous
-- conditions documentées ; la source officielle n'a pas été consultée. Validation spécialisée (DPO) recommandée.
--
-- Cette migration ne touche aucune ligne existante d'un registre : seule la purge, quand elle tourne, les supprime.
-- Retour arrière : app/supabase/retours-arriere/20261014231000_retention_registres_execution.retour.sql (retire les règles et
-- l'appel ; les lignes déjà purgées ne reviennent que d'une sauvegarde).
-- Rejouable : règles `on conflict do nothing`, fonction `create or replace`, injection repérée par sa marque.

-- ── 1. Une règle par registre ──────────────────────────────────────────────────────────────────────────────────────────
insert into public.retention_rules(data_type, libelle, finalite, declencheur, duree_mois, sort)
values
  ('journal:agent_passages', 'Passages des équipes IA', 'Suivre l’exécution des automatismes et diagnostiquer leurs échecs', 'Début du passage', 6, 'suppression'),
  ('journal:supervision_operations', 'Gestes de la supervision', 'Retrouver l’historique des consignes, des vacances et des arrêts d’urgence', 'Date de l’opération', 6, 'suppression'),
  ('journal:points_du_matin', 'Points du matin', 'Présenter chaque matin à la direction l’état des équipes IA', 'Génération du point', 6, 'suppression'),
  ('journal:decisions_du_matin', 'Décisions proposées dans le point du matin', 'Proposer à la direction les décisions qui l’attendent et garder la trace de sa réponse', 'Création de la décision', 6, 'suppression'),
  ('journal:brief_direction_snapshots', 'Faits de direction', 'Réunir à la demande les chiffres et liens de pilotage, sans nom de personne', 'Génération des faits', 6, 'suppression')
on conflict (data_type) do nothing;

-- ── 2. La purge des cinq registres ─────────────────────────────────────────────────────────────────────────────────────
-- Chaque registre n'est purgé que si SA règle est active. Les décisions partent avant les points, et un point n'est supprimé que
-- s'il ne lui reste aucune décision : la suppression en cascade ne retire jamais une décision encore dans sa durée (ni celle d'un
-- registre dont la règle est désactivée).
create or replace function public.purger_registres_execution()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_mois integer; v_n bigint; v_bilan jsonb := '{}'::jsonb; v_total bigint := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then raise exception 'Purge réservée à la supervision'; end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:agent_passages' and actif and sort = 'suppression';
  if found then
    delete from public.agent_passages where debut < now() - make_interval(months => v_mois);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('agent_passages', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:supervision_operations' and actif and sort = 'suppression';
  if found then
    delete from public.supervision_operations where cree_le < now() - make_interval(months => v_mois);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('supervision_operations', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:decisions_du_matin' and actif and sort = 'suppression';
  if found then
    delete from public.decisions_du_matin where cree_le < now() - make_interval(months => v_mois);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('decisions_du_matin', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:points_du_matin' and actif and sort = 'suppression';
  if found then
    delete from public.points_du_matin p
     where p.genere_le < now() - make_interval(months => v_mois)
       and not exists (select 1 from public.decisions_du_matin d where d.point_id = p.id);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('points_du_matin', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:brief_direction_snapshots' and actif and sort = 'suppression';
  if found then
    delete from public.brief_direction_snapshots where genere_le < now() - make_interval(months => v_mois);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('brief_direction_snapshots', v_n); v_total := v_total + v_n;
  end if;

  -- Le journal technique ne garde que des nombres, jamais le contenu supprimé.
  if v_total > 0 then
    insert into public.tech_log(evenement, details) values ('purge_registres_execution', v_bilan);
  end if;
  return v_bilan;
end;
$$;
revoke all on function public.purger_registres_execution() from public, anon, authenticated;
grant execute on function public.purger_registres_execution() to authenticated, service_role;

-- ── 3. Le branchement dans `appliquer_retention` ───────────────────────────────────────────────────────────────────────
-- La définition en vigueur est RELUE (pg_get_functiondef) et complétée d'une ligne, comme le fait 20260914130000 pour les
-- signalements du support : une réécriture de mémoire écraserait les ajouts des migrations voisines. Si la définition n'est pas
-- celle attendue, la migration s'arrête. Rejeu : la marque `purger_registres_execution` est déjà là, il n'y a rien à refaire.
do $correctif$
declare
  v_def text;
  v_ancre text := $ancre$  v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());$ancre$;
begin
  v_def := pg_get_functiondef('public.appliquer_retention()'::regprocedure);
  if position('purger_registres_execution' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif D48 : définition de appliquer_retention inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, v_ancre || $nouveau$

  -- D48 / D13 (IA-11, SUP-05) : les registres d'exécution ont une fin de vie (six mois, retention_rules « journal:… »).
  v_journaux := v_journaux || public.purger_registres_execution();$nouveau$);
  execute v_def;
end $correctif$;

-- Convention de toute migration qui touche une fonction : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
