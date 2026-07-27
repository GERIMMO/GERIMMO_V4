---
type: process
tags: [intervention, cloture, rapport, incident]
status: in-progress
created: 2026-07-21
updated: 2026-07-22
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Intervention et clôture

**En une phrase :** exécuter l'[[Intervention]], produire le rapport officiel, clôturer
l'[[Incident]] et évaluer l'[[Artisan]].

## Déclencheur
- Rendez-vous validé ([[Planification d'intervention]]) → `createIntervention` (statut `planifiee`).

## Acteurs
- [[Artisan]] (exécute), gestionnaire (valide/clôture), [[Locataire]].

## Étapes
1. **Transitions** : `planifiee → confirmee → en_cours → terminee` (+ `suspendue`/`a_reprogrammer`/`annulee`).
   Par bot, l'artisan applique `confirmer`/`demarrer`/`terminer`.
2. **Matériaux** (`addInterventionMaterial`) + photos avant/pendant/après.
3. **Rapport** (`createInterventionReport`) : génère un [[Document]] PDF officiel (`rapport_incident`,
   `official_document = true`). Cycle : `previsualise → modifie → genere → valide` (+ download/print/email/archive).
4. **Clôture** (`createIncidentClosure`) : `validation` / `correction` / `nouvelle_intervention` /
   `cloture_reserve` / `cloture_normale`.
5. **Évaluation** (`createArtisanEvaluation`) : note multi-critères (qualité, respect RDV,
   communication, propreté, global) → `incident_artisan_rating_statistics`.

## Résultat / sorties
- Rapport PDF officiel archivé, incident clôturé, statistiques de notation de l'artisan mises à jour.

## Implications pour l'application
- La note artisan alimente le **score de recommandation** des futurs [[Devis]].

> [!warning] Notation : intention 3 niveaux vs code
> Précision humaine (2026-07-22) : la notation cible distingue **3 niveaux et 3 évaluateurs** —
> taux de réponse 24 h (automatique GERIMMO), qualité du travail ([[Locataire]]), prestation
> ([[Gérant]]). Le code actuel n'a qu'**une** évaluation multi-critères à la clôture, évaluateur
> non distingué, sans taux de réponse automatique. À spécifier/aligner — détail dans [[Artisan]].
