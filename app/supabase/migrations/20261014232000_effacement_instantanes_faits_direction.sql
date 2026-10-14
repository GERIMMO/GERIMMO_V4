-- D13 (fiche SUP-05), décision du dirigeant du 14/10/2026, option A — ÉTAPE SÉPARÉE ET IRRÉVERSIBLE :
-- effacement des instantanés de faits de direction déjà enregistrés.
--
-- ╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║  ATTENTION : CETTE ÉTAPE SUPPRIME DÉFINITIVEMENT DES LIGNES DE public.brief_direction_snapshots.                    ║
-- ║  Aucun retour arrière n'existe pour ces données : seule une SAUVEGARDE les ramène.                                  ║
-- ╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Pourquoi : les instantanés écrits avant 20261014230000 (version_regles = 1) copient le titre brut des alertes de toutes les
-- organisations, donc parfois des noms de locataires. Les nouveaux (version 2) n'en contiennent plus. Cette étape retire les
-- anciens ; elle ne touche JAMAIS un instantané de version 2.
--
-- Ce qui est effacé : toutes les lignes de public.brief_direction_snapshots où version_regles < 2 (rien d'autre : ni les décisions
-- ni les points du matin, qui ne copient pas ces titres). L'écran /admin/brief affichera « Aucun relevé préparé » pour les jours
-- concernés jusqu'à ce que « Préparer le point maintenant » soit relancé.
--
-- COMMENT L'APPLIQUER (production) :
--   1. Appliquer d'abord 20261014230000 (sans lui, de nouveaux instantanés avec des noms continueraient d'être écrits) ; cette
--      étape refuse de se jouer sans lui.
--   2. Lancer « Sauvegarde quotidienne » à la main (GitHub, Actions, workflow_dispatch) et attendre son SUCCÈS ; vérifier la
--      copie distante (docs/sauvegarde-et-restauration.md).
--   3. Jouer le fichier dans UNE SESSION qui commence par la confirmation de cette sauvegarde, dans la même transaction :
--          begin;
--          set local gerimmo.sauvegarde_confirmee = 'oui';
--          \i 20261014232000_effacement_instantanes_faits_direction.sql
--          -- vérifier le nombre annoncé, puis commit; (ou rollback; pour tout annuler)
--      Simulation d'abord : terminer par rollback; au lieu de commit;.
--   Sans la confirmation, et tant qu'il existe au moins un instantané de version 1, l'étape S'ARRÊTE par une erreur (dans le chantier
--   `migrations.yml`, tout le lot est alors annulé : rien n'est effacé). Sur une base sans instantané ancien (base neuve,
--   banc local, base déjà nettoyée), elle ne fait rien et passe sans confirmation.
--
-- Trace : une ligne `effacement_instantanes_faits_direction` dans audit_log (nombre de lignes effacées, jamais leur contenu).
-- Retour arrière : AUCUN pour les données effacées. app/supabase/retours-arriere/20261014232000_effacement_instantanes_faits_direction.retour.sql
-- le dit et ne retire que la ligne d'historique de la migration.
-- Rejouable : sans instantané de version 1, l'étape ne fait rien.

do $effacement$
declare
  v_nombre bigint;
begin
  -- L'étape suppose la migration qui écrit des instantanés sans nom.
  if to_regprocedure('public.libelle_generique_alerte(text)') is null then
    raise exception 'ÉTAPE IRRÉVERSIBLE REFUSÉE : appliquez d''abord 20261014230000_faits_direction_sans_noms.sql (sans elle, de nouveaux instantanés avec des noms seraient encore écrits).';
  end if;

  select count(*) into v_nombre from public.brief_direction_snapshots where version_regles < 2;
  if v_nombre = 0 then
    raise notice 'Effacement des instantanés de faits de direction : aucun instantané ancien (version 1), rien à effacer.';
    return;
  end if;

  if coalesce(current_setting('gerimmo.sauvegarde_confirmee', true), '') <> 'oui' then
    raise exception 'ÉTAPE IRRÉVERSIBLE REFUSÉE : % instantané(s) de faits de direction (version 1, avec des noms possibles) seraient EFFACÉS DÉFINITIVEMENT. Lancez d''abord la sauvegarde quotidienne et attendez son succès, puis rejouez cette étape dans la même transaction que : set local gerimmo.sauvegarde_confirmee = ''oui''; (voir l''en-tête du fichier). Rien n''a été effacé.', v_nombre;
  end if;

  delete from public.brief_direction_snapshots where version_regles < 2;
  get diagnostics v_nombre = row_count;

  insert into public.audit_log(account_id, organization_id, action, details)
  values (null, null, 'effacement_instantanes_faits_direction',
          jsonb_build_object('nombre', v_nombre, 'decision', 'D13', 'fiche', 'SUP-05', 'raison', 'instantanés de version 1 pouvant contenir des noms', 'sauvegarde_confirmee', true));
  raise notice 'Effacement des instantanés de faits de direction : % instantané(s) de version 1 effacé(s) définitivement.', v_nombre;
end $effacement$;
