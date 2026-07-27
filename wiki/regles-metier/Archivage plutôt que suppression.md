---
type: business-rule
tags: [archivage, audit, gouvernance-donnees]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]"]
---

# Archivage plutôt que suppression

**Énoncé :** les données métier importantes sont **archivées/désactivées** plutôt que
supprimées à chaud ; les actions sensibles sont **journalisées**.

> [!warning] Principe corrigé par le livrable A2 (2026-07-24)
> La formulation d'origine — « jamais supprimé, seulement archivé » — **ne tient pas
> face au droit à l'effacement** ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|A2]],
> issu de l'audit P0.3). Correction actée : **l'archivage est une étape du cycle de
> vie, jamais un sort final** (RM-A2.4). Au terme de l'archivage intermédiaire, la
> donnée est **supprimée, anonymisée ou conservée pour un motif écrit** (RM-A2.3),
> selon la matrice de conservation — voir [[RGPD]]. Exemples de « jamais » abrogés :
> journal d'audit (→ 3 ans), motifs de blacklist (→ 3/5 ans), agence archivée
> (→ 10 ans puis anonymisée), personne du dossier locataire (→ anonymisée).
> Le principe reste valable **en base active** : dans l'UI, on archive, on ne
> supprime pas — mais la purge programmée existe désormais au bout du cycle.

## Fondement
- Principe directeur `docs/00-principes-gerimmo.md`.
- Implémentation : colonnes `archived_at`/`archived_by` généralisées ; `DELETE` réservé au [[Super Admin]] ;
  table centrale `audit_logs` (append-only, trigger `audit_table_changes()`).

## Portée
- S'applique à quasiment toutes les tables métier ([[Bien]], [[Incident]], [[Document]], [[Organisation]]…).

## Paramètres / valeurs
- Index uniques conditionnés sur `where archived_at is null` (unicité valable pour les actifs).
- Tables `*_events` / `*_history` par module + `audit_logs` global (old/new en jsonb).

## Conséquences si non respectée
- Perte de traçabilité et de réversibilité ; risque juridique (conservation des preuves).

## Implications pour l'application
- Statut « archivé » plutôt que suppression dans toutes les UI ; audit systématique des actions sensibles.
- Voir [[Isolation multi-organisation]], [[Plan de reprise d'activité]].
