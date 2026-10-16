---
type: process
tags: [intervention, cloture, rapport, incident]
status: in-progress
created: 2026-07-21
updated: 2026-10-16
sources: ["[[Dépôt Gerimmo-V3]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Propositions de fonctions majeures — version candidate du 13 octobre 2026]]"]
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

## Ce que fait le code aujourd'hui : règlement déclaratif de la facture (depuis le 15/10/2026)
Décision D23 du dirigeant (14/10/2026, option A, fiches PRO2-21 et CHN-02, point X06),
**en production depuis le 15/10/2026** (PR #188, fusion `98f3fd7`, migration
`20261014610000_reglement_facture_intervention.sql`). Avant : la facture validée restait
« validée » sans date de règlement, l'écriture saisie à part au journal n'était liée ni à la
facture ni à l'incident, et l'artisan ne voyait rien.
- **Déclarer un règlement** sur une facture **validée**, depuis l'incident (gérant ou
  propriétaire) : montant, date, moyen, référence facultative. **Gerimmo n'effectue aucun
  paiement** (ni virement ni prélèvement) : le règlement est déclaratif, et l'écran le dit.
- Dans la même transaction, la base écrit l'**écriture de dépense** (catégorie « travaux »,
  lot de l'incident, pièce datée du règlement, imputée au jour de Paris) et le règlement ;
  un même envoi n'écrit qu'une fois (clé d'envoi).
- **Règlement partiel admis** ; le total ne dépasse jamais le montant de la facture ; une
  date future est refusée. États de la facture : déposée → validée → partiellement réglée →
  réglée (date du dernier règlement quand elle est réglée en totalité).
- **Imputation « locataire » admise** : le propriétaire règle l'artisan, **aucune créance
  sur le bail n'est créée**, l'écran le dit.
- **Retrait motivé** par contre-écriture, jamais par suppression ; l'écriture née d'un
  règlement ne s'annule pas depuis le journal (l'écran dit où agir).
- **Côté artisan** : pour ses factures seulement, l'état et la **date et le moyen** de chaque
  règlement, jamais la référence bancaire ni le détail des montants.
- La validation d'une facture est désormais écrite au journal d'audit (X06).

> [!warning] Points à trancher / contradictions (D23-A)
> - **Code ≠ spécification V3 sur l'imputation locataire** : le module 9 prévoit que la
>   validation d'une facture imputée au locataire crée une **créance sur le bail** (voir
>   [[Devis]]) ; D23-A, ratifiée, n'en crée aucune (réponse 2 de la fiche B.15). La
>   refacturation au locataire reste donc hors de ce geste.
> - **Non vérifié** : le parcours complet dans un navigateur (règlement noté par le gérant)
>   n'a pas été joué ; la recette de production ne le couvre pas (journal `log.md`, entrées
>   du 15/10).
