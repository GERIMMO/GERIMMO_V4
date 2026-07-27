---
type: concept
tags: [intervention, incident, artisan]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Intervention

**Définition :** l'opération planifiée puis réalisée par un [[Artisan]] pour résoudre un
[[Incident]], après sélection d'un [[Devis]]. Table `incident_interventions`.

## Attributs métier notables
- `execution_mode` : `artisan_gerimmo` / `artisan_prive` / `interne`.
- Statuts : `planifiee` → `confirmee` → `en_cours` → `terminee` (+ `suspendue` / `a_reprogrammer` / `annulee`).
- `planned/actual_starts_at`, montants **prévu vs final**, `photos_before/during/after`.

## Objets liés
- **Matériaux** (`incident_intervention_materials`) : fournitures utilisées.
- **Rapport d'intervention** (`incident_intervention_reports`) : génère un [[Document]] PDF officiel
  (`rapport_incident`, `official_document = true`). Cycle : `brouillon`→`genere`→`valide`.
- **Revue de clôture** (`incident_closure_reviews`).
- **Évaluation artisan** (`incident_artisan_evaluations`) : note multi-critères → statistiques.

## Rôle dans le métier
- Matérialiser la résolution de l'incident, tracer coûts/photos, produire le rapport et clôturer.

## Relations
- Découle d'un [[Devis]] retenu et d'un créneau validé ([[Planification d'intervention]]).
- Voir [[Intervention et clôture]], [[Modèle de données]].
