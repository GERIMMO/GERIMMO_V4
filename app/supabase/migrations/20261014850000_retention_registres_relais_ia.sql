-- D48 (fiche IA-11 : « chaque nouveau registre d'équipe IA naît avec sa règle »), décision du dirigeant du 14/10/2026, option A,
-- et constat du tour final de vérification du 16/10/2026 : les quatre registres créés le 15/10 n'étaient pas déclarés au catalogue
-- `retention_rules`. Ils le sont ici, et `appliquer_retention` (nettoyage de 03 h chaque nuit et bouton « Nettoyer » de la
-- supervision) les purge, sur le modèle de 20261014231000 (les cinq premiers registres d'exécution).
--
--   registre                  âge (déclencheur)                          déjà purgé à six mois par
--   relais_alertes_envois     jour du passage (jour de Paris)            reserver_alerte_relais (20261014810000)
--   relais_urgences           traitement de l'urgence (traitee_le)       prendre_urgences_relais (20261014811000)
--   relais_urgences_envois    début de l'envoi (commence_le)             prendre_urgences_relais (20261014811000)
--   ia_appels_jour            jour des appels (jour de Paris)            rien jusqu'ici (20261014730000)
--
-- DURÉE : SIX MOIS partout. Pour les trois registres du relais, c'est la durée déjà codée dans leurs propres fonctions : elle n'est
-- pas changée et ces fonctions ne sont pas modifiées. Pour ia_appels_jour, six mois comme les autres registres d'exécution (D48, D13).
-- MÊMES CRITÈRES que les fonctions du relais : une urgence encore à envoyer ou en cours d'envoi, un envoi en cours ou à reprendre,
-- et un envoi encore cité par une urgence ne sont jamais effacés. Les registres datés au jour (passages du relais, compteur de l'IA)
-- vieillissent au jour de Paris (`public.aujourdhui_paris()`, migration 20261014500000), comme leurs lignes sont datées.
-- Un registre absent (retour arrière de son lot joué seul) est sauté : le nettoyage de la nuit n'échoue pas pour autant.
--
-- LIMITE, ASSUMÉE (consigne : aligner sur la durée existante sans la changer) : les purges propres au relais lisent leur durée en
-- dur. Désactiver ou allonger une règle du relais au catalogue n'arrête pas leur purge à six mois, faite à chaque passage du relais.
-- Les rattacher au catalogue demanderait de réécrire reserver_alerte_relais et prendre_urgences_relais : hors de cette migration.
--
-- ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ LES LIGNES PURGÉES SONT IRRÉCUPÉRABLES. Les règles naissent ACTIVES : le premier passage d'`appliquer_retention` qui suit │
-- │ supprime ce qui a plus de six mois dans ces quatre registres (pour les trois du relais, leurs fonctions le font déjà à   │
-- │ chaque passage ; pour ia_appels_jour, c'est la première purge). À faire AVANT d'appliquer en production : lancer         │
-- │ « Sauvegarde quotidienne » à la main (Actions, workflow_dispatch) et attendre son succès. Pour différer la purge sans     │
-- │ retirer la règle : update public.retention_rules set actif = false where data_type = 'journal:ia_appels_jour';          │
-- └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- Durées : la recommandation de la CNIL sur la journalisation (novembre 2021) parle de 6 mois à 1 an ; la source officielle n'a pas
-- été consultée. Validation spécialisée (DPO) recommandée, comme pour 20261014231000.
--
-- Cette migration ne réécrit aucune ligne existante d'un registre : seule la purge, quand elle tourne, les supprime.
-- Rejouable : règles `on conflict do nothing` (une durée réglée à la main n'est jamais écrasée), fonction `create or replace`,
-- branchement repéré par sa marque (`purger_registres_relais_ia`).
-- Retour arrière : app/supabase/retours-arriere/20261014850000_retention_registres_relais_ia.retour.sql (retire les règles, la
-- fonction et le branchement ; les lignes déjà purgées ne reviennent que d'une sauvegarde).

-- ── 1. Une règle par registre ──────────────────────────────────────────────────────────────────────────────────────────
insert into public.retention_rules(data_type, libelle, finalite, declencheur, duree_mois, sort)
values
  ('journal:relais_alertes_envois', 'Passages de l’alerte e-mail du relais', 'Envoyer au plus un e-mail du relais par jour et suivre ses échecs', 'Jour du passage', 6, 'suppression'),
  ('journal:relais_urgences', 'File des urgences du relais', 'Envoyer sur le moment les urgences du mode vacances et garder la trace de leur envoi', 'Traitement de l’urgence', 6, 'suppression'),
  ('journal:relais_urgences_envois', 'E-mails immédiats des urgences du relais', 'Limiter les envois en rafale et reprendre un envoi interrompu', 'Début de l’envoi', 6, 'suppression'),
  ('journal:ia_appels_jour', 'Compteur quotidien des appels payants à l’IA', 'Appliquer la limite quotidienne des appels payants à l’IA et en suivre l’usage', 'Jour des appels', 6, 'suppression')
on conflict (data_type) do nothing;

-- ── 2. La purge des quatre registres ───────────────────────────────────────────────────────────────────────────────────
-- Chaque registre n'est purgé que si SA règle est active. Les urgences partent avant les envois : un envoi n'est effacé que si plus
-- aucune urgence ne le cite (la clé étrangère `relais_urgences.envoi_id` l'exige).
create or replace function public.purger_registres_relais_ia()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_mois integer; v_n bigint; v_bilan jsonb := '{}'::jsonb; v_total bigint := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then raise exception 'Purge réservée à la supervision'; end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:relais_urgences' and actif and sort = 'suppression';
  if found and to_regclass('public.relais_urgences') is not null then
    delete from public.relais_urgences
     where statut in ('envoyee', 'quotidien', 'non_envoyee') and traitee_le < now() - make_interval(months => v_mois);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('relais_urgences', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:relais_urgences_envois' and actif and sort = 'suppression';
  if found and to_regclass('public.relais_urgences_envois') is not null then
    delete from public.relais_urgences_envois e
     where e.statut in ('envoye', 'abandonne') and e.commence_le < now() - make_interval(months => v_mois)
       and not exists (select 1 from public.relais_urgences u where u.envoi_id = e.id);
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('relais_urgences_envois', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:relais_alertes_envois' and actif and sort = 'suppression';
  if found and to_regclass('public.relais_alertes_envois') is not null then
    delete from public.relais_alertes_envois where jour < (public.aujourdhui_paris() - make_interval(months => v_mois))::date;
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('relais_alertes_envois', v_n); v_total := v_total + v_n;
  end if;

  select duree_mois into v_mois from public.retention_rules where data_type = 'journal:ia_appels_jour' and actif and sort = 'suppression';
  if found and to_regclass('public.ia_appels_jour') is not null then
    delete from public.ia_appels_jour where jour < (public.aujourdhui_paris() - make_interval(months => v_mois))::date;
    get diagnostics v_n = row_count; v_bilan := v_bilan || jsonb_build_object('ia_appels_jour', v_n); v_total := v_total + v_n;
  end if;

  -- Le journal technique ne garde que des nombres, jamais le contenu supprimé.
  if v_total > 0 then
    insert into public.tech_log(evenement, details) values ('purge_registres_relais_ia', v_bilan);
  end if;
  return v_bilan;
end;
$$;
comment on function public.purger_registres_relais_ia() is
  'D48 (16/10/2026) : purge à six mois (retention_rules « journal:… ») des passages du relais, de la file et des envois de ses urgences, et du compteur des appels à l''IA. Appelée par appliquer_retention.';
revoke all on function public.purger_registres_relais_ia() from public, anon, authenticated;
grant execute on function public.purger_registres_relais_ia() to authenticated, service_role;

-- ── 3. Le branchement dans `appliquer_retention` ───────────────────────────────────────────────────────────────────────
-- La définition en vigueur est RELUE (pg_get_functiondef) et complétée, jamais réécrite de mémoire (elle porte les ajouts de
-- 20260914130000, 20261014200000 et 20261014231000). Ancre d'UNE ligne, sans son indentation (la mise en forme de la production
-- peut différer de celle du banc), exigée EXACTEMENT une fois ; sinon la migration s'arrête sans rien modifier. L'appel est posé
-- juste AVANT la purge des signalements du support : le bloc de 20261014231000 reste le dernier de la fonction, comme son retour
-- arrière l'attend. Rejeu : la marque `purger_registres_relais_ia` est déjà là, il n'y a rien à refaire.
do $correctif$
declare
  v_def text;
  v_ancre constant text := $ancre$v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());$ancre$;
  v_bloc constant text := $bloc$-- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).
  v_journaux := v_journaux || public.purger_registres_relais_ia();

  $bloc$;
  v_occurrences integer;
begin
  v_def := pg_get_functiondef('public.appliquer_retention()'::regprocedure);
  if position('purger_registres_relais_ia' in v_def) > 0 then
    raise notice 'D48 : appliquer_retention appelle déjà purger_registres_relais_ia, rien à faire.';
    return;
  end if;
  v_occurrences := (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre);
  if v_occurrences <> 1 then
    raise exception 'D48 : la ligne de purge des signalements du support figure % fois dans appliquer_retention au lieu d''une : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.', v_occurrences;
  end if;
  execute replace(v_def, v_ancre, v_bloc || v_ancre);
end $correctif$;

-- Convention de toute migration qui touche une fonction : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();
