---
type: source
tags: [loyer, quittance, encaissement, impayes, irl, regularisation, module-3]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-3-Loyers-et-charges.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 3 : Loyers et charges

**En une phrase :** le cycle financier locatif — 12 parcours, 5 objets (échéancier,
appel de loyer, encaissement, quittance, régularisation), **« module le plus dense en
calculs »**. Dépend du bail (échéancier) et de la copropriété (ventilation).
**Module clos.**

## Affirmations clés

1. **Pas de synchronisation bancaire — décision actée** (confirme le choix humain du
   2026-07-22) : encaissements **saisis manuellement**. **La quittance n'est jamais
   émise avant l'encaissement intégral** (RM-3.4.1) — l'émettre avant reviendrait à
   « attester d'un fait qui ne s'est pas produit ». **Paiement partiel = reçu, jamais
   quittance** (RM-3.4.2 — une quittance libère, un reçu constate).
   → [[Quittancement des loyers]]
2. **Imputation du plus ancien au plus récent** (RM-3.3.2, règle légale d'imputation,
   modifiable par l'agent) — c'est ce qui permet de suivre l'ancienneté de la dette.
   Excédent imputé sur l'appel suivant, jamais remboursé spontanément ; trop-perçu de
   fin de bail → [[Solde de tout compte]].
3. **Échéancier paramétré une fois par bail** (créé automatiquement à la signature) :
   périodicité, **à échoir / à terme échu (non modifiable en cours de bail)**, jours
   d'émission/échéance, provision ou forfait. Appels générés par tâche planifiée,
   prorata d'entrée/sortie, report du solde antérieur.
4. **Impayés (3.6)** : **seuil de déclenchement paramétré par agence** (montant
   plancher ~50 € + délais — relance 1 à ~5 j, relance 2 à +15 j, mise en demeure à
   +15 j), **garant informé dès la relance 2** (paramétrable). Chaque relance
   **horodatée, contenu figé** = preuve de diligence (RM-3.6.3). Plan d'apurement =
   relances suspendues tant que respecté ; trêve hivernale : pas d'expulsion mais les
   relances continuent ; **la dette survit au bail** (RM-3.6.8) ; un impayé **suspend
   la purge RGPD** (RM-3.6.7 = RM-0b.8.3). Escalade contentieux : V2 ; procédure
   judiciaire : hors périmètre. → [[Relances et mise en demeure]]
5. **Révision annuelle IRL (3.8)** — criticité maximale car **prescription à un an**
   (perdue définitivement au-delà, alerte forte avant). **Indice saisi manuellement
   par l'admin agence** (4 fois/an, historisé — la récupération auto introduirait une
   dépendance externe sur une donnée à valeur juridique ; V2). Formule :
   loyer × IRL nouveau / IRL de référence (figé au bail). **Proposée, jamais appliquée
   sans validation** (renonciation tracée) ; **interdite sur DPE F/G** (blocage,
   RM-3.8.6) ; ne modifie ni dépôt ni provisions. → [[Révision annuelle IRL]]
6. **Régularisation des charges (3.9)** : **année civile**, quote-part **au prorata
   des jours d'occupation** (répartition entre locataires successifs), **justificatifs
   obligatoires** (bloquant — pièces communicables 6 mois), **bloquée sans appel de
   charges du syndic** en copropriété (RM-3.9.2 = RM-0c.6.4), correction par
   **rectificative** uniquement. Ajustement de provision **proposé** (3.10), jamais
   automatique. → [[Régularisation des charges]]
7. **Solde de tout compte (3.11) — décision révisée : émis dans les deux sens**
   (restitution OU décompte de sortie) après l'EDL de sortie ; agrège loyers, impayés,
   régularisation, dépôt, retenues, trop-perçu ; une créance bascule vers le circuit
   des impayés. → [[Solde de tout compte]]
8. **Consultation locataire (3.12)** : échéancier, quittances/reçus sans limite de
   durée, solde, régularisations avec justificatifs, relances reçues — **jamais les
   commentaires internes** de l'agence.

## Décisions actées / reports

Actées : quittance après encaissement ; IRL manuel historisé ; révision validée ;
seuils de relance par agence ; année civile + prorata + répartition entre occupants
successifs. **Révisée** : décompte de sortie émis dans les deux sens. **V2** :
récupération auto de l'IRL, escalade contentieux. **Hors périmètre** : synchronisation
bancaire, procédure judiciaire. 12 US, 20 critères.

## Ce que ce module impose ailleurs

Module 4 (chaque encaissement produit une écriture), module 6 (loyers perçus et
impayés au rapport mensuel), module 14 (impayés, révision, prescription,
régularisation), module 18 (**indices IRL et seuils de relance paramétrés ici**).

## Pages mises à jour par cet ingest

[[Révision annuelle IRL]] · [[Solde de tout compte]] (créées) ·
[[Quittancement des loyers]] · [[Relances et mise en demeure]] ·
[[Régularisation des charges]] · [[Période de loyer]] · [[Locataire]] ·
[[Agenda et échéances]] · [[Administrateur d'agence]] · [[Comptabilité]] ·
[[État du projet et décisions ouvertes]]
