---
type: source
tags: [mandat, honoraires, seuil-delegation, resiliation, module-5]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-5-Mandat-de-gestion.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 5 : Mandat de gestion

**En une phrase :** 6 parcours, 2 objets (**Mandat**, **Ligne de mandat**) — le
contrat-pivot entre le propriétaire et l'agence : « sans mandat, l'agence n'a aucun
droit d'agir sur un lot ». **Module clos.**

## Affirmations clés

1. **Un mandat porte sur des lots, jamais sur des biens** (RM-5.1.1, conséquence du
   module 0) : un propriétaire avec deux appartements dans deux immeubles = **un seul
   mandat**, deux lignes. Un immeuble à trois propriétaires = trois mandats, trois
   rapports. **Un lot n'a qu'un mandat actif à la fois** (RM-5.1.3) ; seuls les lots
   dont la personne est propriétaire (détention 0.2) sont intégrables.
2. **Le taux d'honoraires est par ligne (par lot)** (RM-5.1.4, décision actée) —
   permet le dégressif multi-lots (8 % / 7 % / 5 %). Taux obligatoire (pilote le net
   reversé, RM-4.2.3) ; > 15 % = alerte. Variante : honoraires forfaitaires mensuels.
3. **Trois paramètres décident du comportement de l'application** (5.3, criticité
   maximale) : le **taux** (→ module 4), la **date de rapport** propre au mandat
   (→ module 6, défaut le 10), le **seuil de délégation** sur devis (→ module 9,
   défaut agence 500 €, **surchargeable par mandat**, zéro = tout remonte). Durée
   1 an par défaut (plafond 10 ans), préavis de résiliation 3 mois ; toute
   modification par **avenant sans rétroactivité** (RM-5.3.5).
4. **Honoraires de location portés par le mandat** : part locataire **plafonnée au
   m² selon la zone** (visite/dossier, rédaction du bail, EDL 3 €/m²) — contrôle en
   **alerte non bloquante** (RM-5.3.7) ; autres prestations : bailleur seul.
5. **Cycle de vie** : renouvellement alerté **4 mois avant terme** (3 mois de préavis
   + 1 mois de discussion, RM-5.4.1), reconduction tacite même durée ; résiliation à
   3 mois — **les baux continuent** (RM-5.5.2) mais **un lot sans mandat n'alimente
   plus aucun rapport** (RM-5.5.3), d'où l'émission du **dernier rapport + récap
   fiscal avant extinction** (RM-5.5.4). Décès/succession : hors périmètre.
6. **Signature électronique en V1** (5.6) : le mandat transite par le module 13 —
   **le propriétaire mandant signe par email via Yousign sans jamais entrer dans
   l'application** (RM-5.6.2 = RM-13.1.4), propriétaire avant l'agence (RM-5.6.3).
   **C'est l'enregistrement du mandat signé qui active la gestion** (RM-5.6.1, chaîne
   critique A5). En indivision : signé par tous les indivisaires, un seul rapport.
7. **Seuil de délégation appliqué hors app** : le mandant n'ayant aucun accès, la
   sollicitation sur devis au-dessus du seuil se fait **hors plateforme, accord tracé
   par l'agent** (précise le point ouvert du module 0 ; à confirmer au module 9).

## Décisions actées / reports

Actées : multi-lots, taux par lot, seuil agence surchargeable, honoraires de location
au périmètre, plafond en alerte, mandant sans accès, **signature électronique V1**.
Hors périmètre : décès/succession. 7 US, 9 critères.

## Ce que ce module impose ailleurs

Module 1 (pas de bail sans mandat actif — alerte), module 4 (taux → honoraires),
module 6 (un rapport par mandat à sa date), module 9 (seuil de sollicitation),
module 13 (signature), module 14 (renouvellement à 4 mois).

## Pages mises à jour par cet ingest

[[Mandat de gestion]] (créée) · [[Propriétaire bailleur]] · [[Agenda et échéances]] ·
[[Comptabilité]] · [[État du projet et décisions ouvertes]]
