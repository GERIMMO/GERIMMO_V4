---
type: source
tags: [devis, facture, accord-proprietaire, imputation, module-9]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-9-Devis-et-facturation.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 9 : Devis et facturation

**En une phrase :** 8 parcours, 2 objets (**Devis**, **Facture**) — le module qui
« relie l'intervention à la comptabilité ». **Module clos.** Avec 7 et 8, le bloc
intervention avance ; restent RDV (10) et notation (11).

## Affirmations clés

1. **Deux devis au maximum** (RM-9.1.1, décision actée) : « trois allongent le délai
   sans améliorer la décision, et un artisan jamais retenu finit par ne plus
   répondre ». Seuls les artisans à décennale valide sont proposés. **Validité 30
   jours par défaut** (modifiable par l'artisan), **alerte à J-7**, expiré = plus
   validable (RM-9.2.3). Les non-retenus sont **notifiés automatiquement** (RM-9.4.1).
2. **La comparaison affiche la note à côté du prix** (score composite du module 11 +
   historique d'interventions) — « le moins cher n'est pas toujours le bon choix ».
3. **Accord du propriétaire (9.5) — le parcours le plus contraint, tranché** :
   sollicitation **entièrement hors application** (RM-9.5.1 — le mandant n'a aucun
   accès), l'agent **enregistre date, canal, sens de la réponse** (obligatoires,
   RM-9.5.2), preuve écrite recommandée ; **sans accord tracé, la validation reste
   bloquée** (RM-9.5.4) ; relance de l'agent tous les 5 jours. **Urgence absolue** :
   l'agent peut engager sans accord, motif obligatoire, **exception visible au
   rapport mensuel** (RM-9.5.6/7).
4. **Facture (9.7/9.8)** : pré-remplie du montant du devis, **écart alerté sans
   blocage** (travaux supplémentaires fréquents et légitimes — l'artisan justifie,
   l'agent tranche) ; **aucune facture sans intervention terminée + photo**
   (RM-9.8.1 = RM-7.5.2) ; la validation **crée l'écriture comptable selon
   l'imputation** (RM-9.8.2) — propriétaire → dépense au rapport ; locataire /
   dégradation → **créance ajoutée au solde du bail** (module 3).
5. **Le locataire garde la main quand l'incident lui est imputé** (décision actée) :
   il choisit — son artisan payé en direct (aucune facture dans Gerimmo, **preuve de
   résolution exigée** dans un délai, sinon **l'agence reprend la main et impute**,
   RM-9.8.5–7) ou passage par l'agence avec refacturation. L'incident reste ouvert
   dans les deux cas (« une fuite non réparée devient un dégât des eaux »).

## Décisions actées / reports

Actées : 2 devis max, 30 jours + J-7, écart en alerte, choix du locataire, incident
maintenu ouvert, preuve de résolution. **V2** : relance automatique des devis,
extraction des montants. **Hors périmètre** : paiement des artisans, accès du
propriétaire. 8 US, 14 critères.

## Ce que ce module impose ailleurs

Module 4 (facture → écriture), module 3 (créance locataire), module 6 (exceptions
d'urgence au rapport), module 7 (photo conditionne la facturation), module 14
(expiration devis, relances d'accord, délai locataire).

## Pages mises à jour par cet ingest

[[Devis]] (consolidée) · [[Locataire]] · [[État du projet et décisions ouvertes]]
