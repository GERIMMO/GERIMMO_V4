---
type: source
tags: [comptabilite, ecriture, cloture, honoraires, categories, module-4]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-4-Comptabilite.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 4 : Comptabilité

**En une phrase :** 8 parcours, 3 objets (**écriture**, catégorie, période comptable) —
une **comptabilité déclarative de caisse** où tous les flux (loyers, dépenses, factures
artisans) convergent avant le rapport propriétaire et le récapitulatif fiscal.
**Module clos.**

## Affirmations clés

1. **Positionnement assumé et annoncé (RM-4.0.1/2 — répond au point P0.1 de
   l'audit)** : pas de comptabilité de gérance réglementée, pas de comptes mandants,
   pas de séquestre loi Hoguet, pas de FEC, pas de sync bancaire. « Le risque n'est
   pas de faire du déclaratif — c'est de laisser croire qu'on fait autre chose. »
   Formulation commerciale imposée (documentation, CGU, écran de paramétrage) :
   « produit votre suivi de gestion / ne tient pas votre comptabilité de gérance ».
2. **Toute écriture porte catégorie + lot + mandat** (RM-4.1.1) et **deux dates**
   (RM-4.1.2) : date de pièce (fiscalité) et date d'imputation (rapport mensuel) —
   une facture de décembre reçue en janvier, décembre clos, s'impute sur janvier sans
   fausser la déclaration.
3. **Ventilation multi-propriétaires** : une facture au niveau bien se répartit via la
   [[Clé de répartition]] → **une écriture par lot** (RM-4.1.3/4), chaque part
   rejoignant le mandat de son propriétaire (3 propriétaires = 3 rapports, une seule
   saisie). Blocage si la clé n'est pas validée.
4. **Les honoraires sont des écritures** : générées automatiquement à chaque
   encaissement, au taux du mandat (RM-4.2.2/3) — brut / honoraires / net reversé,
   déductibles pour le propriétaire, CA de l'agence. Catégorie « Honoraires de
   gestion » = système, non supprimable (RM-4.7.4).
5. **Comptabilité de caisse** : un loyer appelé non encaissé ne produit **aucune
   recette** — il figure en créance (RM-4.3.2/3).
6. **Clôture mensuelle = criticité maximale** (RM-4.4.1) : contrôles préalables
   (écritures non catégorisées **bloquantes**), verrouillage définitif, **correction
   par contre-écriture** sur le mois ouvert (visible, jamais silencieuse — RM-4.4.3),
   réouverture par l'admin agence seul avec motif tracé, **impossible une fois le
   rapport envoyé** (RM-4.4.6). La clôture conditionne le rapport (RM-4.4.7).
7. **Propriétaire direct (4.5)** : livre recettes-dépenses sans mandat ni honoraires
   (net = brut), clôture recommandée non imposée.
8. **Plan de catégories à deux niveaux** (famille → catégorie, RM-4.7.1), fourni par
   défaut, modifiable par l'admin agence ; catégorie utilisée = désactivable, jamais
   supprimée. **Export CSV** (décision actée — pas de FEC : un bailleur particulier
   n'y est pas soumis). Récapitulatif annuel de l'agence : **V2**.

## Décisions actées / reports

Actées : déclaratif assumé (audit P0.1), plan à 2 niveaux, honoraires en écritures,
clôture verrouillante, deux dates, CSV. **V2** : récapitulatif annuel agence.
**Hors périmètre** : FEC, comptes mandants/séquestre, sync bancaire. 7 US, 10 critères.

## Ce que ce module impose ailleurs

Module 5 (taux d'honoraires au mandat), module 6 (clôture → génération du rapport),
module 9 (facture artisan validée → écriture), module 14 (alerte de clôture),
module 18 (plan de catégories).

## À rapprocher d'A6

Le module applique déjà RM-A6.1 (déclaratif), RM-4.4.3 ≈ contre-écritures. La matrice
demande d'y rattacher RM-A6.2 (primauté du relevé bancaire), RM-A6.3 (immutabilité
**avant** clôture) et RM-A6.9 (réouverture sans modification) — à consolider à
l'ingest d'A6. → [[Comptabilité]]

## Pages mises à jour par cet ingest

[[Comptabilité]] (consolidée) · [[Administrateur d'agence]] ·
[[État du projet et décisions ouvertes]]
