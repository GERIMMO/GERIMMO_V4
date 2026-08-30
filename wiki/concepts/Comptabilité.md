---
type: concept
tags: [comptabilite, finances, gerant]
status: draft
created: 2026-07-22
updated: 2026-08-30
sources: ["[[Analyse concurrentielle]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-07-24-gerimmo-v3-module-4-comptabilite]]", "[[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]"]
---

# Comptabilité

**Définition :** module de suivi comptable destiné au **gérant** — l'[[Agent immobilier]] /
l'[[Administrateur d'agence]] (compta de gérance) ou le [[Propriétaire bailleur]]
(recettes/dépenses locatives).

> [!note] Décision produit (humain, 2026-07-22) — non implémentée
> Fonctionnalité **actée au périmètre** suite à l'[[Analyse concurrentielle]] (standard du
> marché : Oskar en compta de gérance, Rentila/GérerSeul côté bailleur). **Aucune
> implémentation dans le code à ce jour** — page cible. Aujourd'hui le suivi financier se
> limite au déclaratif « loyer reçu ? » ([[Quittancement des loyers]]).

## Spécification complète (module 4, 2026-07-24 — module clos)
**Comptabilité déclarative de caisse, assumée et annoncée** (RM-4.0.1/2, répond au
point P0.1 de l'audit — dernier point bloquant) : pas de gérance réglementée, comptes
mandants, séquestre, FEC ni sync bancaire ; mention obligatoire en doc commerciale,
CGU et paramétrage.
- **Écriture** = catégorie + [[Lot]] + mandat + **deux dates** (pièce / imputation —
  RM-4.1.2 : une facture en retard s'impute au mois ouvert sans fausser la fiscalité).
- **Ventilation multi-propriétaires** : dépense au niveau bien répartie via la
  [[Clé de répartition]] → une écriture **par lot** (une saisie, trois rapports).
- **Honoraires = écritures automatiques** à chaque encaissement, au taux du mandat
  (brut / honoraires / net reversé) ; catégorie système non supprimable.
- **Caisse, pas engagement** : un loyer non encaissé = créance, jamais recette
  (RM-4.3.2/3) ; suivi de gérance par mandat (recettes, dépenses, honoraires, net,
  impayés, écarts).
- **Clôture mensuelle verrouillante** (RM-4.4.1, criticité maximale) : écritures non
  catégorisées bloquantes ; après clôture, **correction par contre-écriture visible**
  (RM-4.4.3) ; réouverture admin agence avec motif, **impossible si rapport envoyé**
  (RM-4.4.6) ; conditionne le rapport propriétaire (module 6).
- **Propriétaire direct** : livre recettes-dépenses (4.5), sans honoraires, clôture
  recommandée. **Plan de catégories** famille → catégorie, défauts fournis,
  paramétré au module 18. **Export CSV** (pas de FEC).

## Périmètre cible (à spécifier)
- **Alimentation déclarative — tranché (humain, 2026-07-22)** : **pas de synchronisation
  bancaire**. La comptabilité s'appuie sur le déclaratif (« loyer reçu ? »,
  [[Quittancement des loyers]]) et les saisies du [[Gérant]]. Choix assumé face au standard
  marché (Rentila/Smovin/Oskar font du rapprochement bancaire, cf. [[Analyse concurrentielle]]).
- Suivi des **recettes** (loyers, charges, régularisations) et **dépenses**
  (interventions/[[Devis]], travaux, frais) par [[Bien]] et par [[Organisation]].
- Deux visages selon le gérant :
  - **Agence** : comptabilité de gérance (comptes propriétaires-mandants — dépendra de
    l'activation du « propriétaire client d'agence », point 12).
  - **Propriétaire indépendant** : livre simple recettes/dépenses, base du reporting
    financier déjà promis par la note v0.
- Alimente la [[Fiscalité]] du propriétaire.

## Doctrine financière (livrable A6, 2026-07-24 — dernier blocage P0 clos)
Le [[2026-07-24-gerimmo-v3-a6-doctrine-financiere|livrable A6]] fixe la doctrine
(12 règles) : **« journal de gestion, jamais comptabilité de gérance »** (RM-A6.1).

> [!note] Validation expert-comptable — écartée (humain, 2026-07-25)
> Décision : **pas de validation externe de la doctrine**. Position assumée :
> « Gerimmo ne gère pas la comptabilité » — l'outil fournit un **export des
> écritures déclarées** (encaissements : loyers… ; décaissements : incidents,
> charges…) que chaque agence transmet à son propre expert-comptable. La protection
> repose sur les **mentions des cinq supports** (RM-A6.12) et la réversibilité
> (RM-A6.10). La réserve d'A6 reste documentée dans la source pour mémoire. Gerimmo n'est ni un logiciel comptable, ni une gérance réglementée, ni un
système bancaire, ni un tiers de confiance, ni un outil de rapprochement.
- **Ce qui fait foi, et où** : Gerimmo fait foi sur ce qu'il **calcule et décide**
  (montant appelé, imputation, honoraires, net dû) ; **la banque fait foi sur ce qui
  a circulé** (reçus, versements, soldes — saisies déclaratives côté Gerimmo). « En
  cas d'écart, le relevé bancaire prime. Gerimmo se corrige, jamais l'inverse »
  (RM-A6.2) — une **règle de preuve**, pas un retour de la synchronisation.
- **Immutabilité dès la création** (RM-A6.3, bloquant — étend RM-4.4.1) : jamais de
  modification ni de suppression, même avant clôture ; correction par
  **contre-écriture** (RM-A6.4 : sens inversé, **imputée au jour** RM-A6.5, date de
  pièce d'origine, **motif obligatoire** RM-A6.6, lien tracé, les deux visibles —
  une erreur = trois lignes). « L'historique se lit, il ne se réécrit pas » : un
  rapport envoyé engage l'agence. Une **réouverture n'y change rien** (RM-A6.9) :
  elle ne sert qu'à ajouter les écritures manquantes.
- **Rapprochement bancaire manuel, assumé** (RM-A6.8) : l'agent compare son relevé
  au journal ; le journal doit **faciliter la comparaison** (export par période,
  tris, totaux). Écarts types : montant différent → écriture au réel ; non saisi →
  saisie rétroactive ; saisi non reçu → contre-écriture ; frais bancaires → dépense.
- **Réversibilité = argument de vente** (RM-A6.10, bloquant) : trois exports **à
  tout moment, sans négociation** — journal comptable complet (exploitable par
  l'expert-comptable, avec les liens entre écritures RM-A6.11), archive documents
  indexée, référentiel (biens, lots, baux, personnes, mandats). Généralise
  RM-18.4.2. « Une agence qui sait pouvoir partir hésite moins à venir. »
- **Les limites annoncées sur cinq supports** (RM-A6.12, bloquant — étend les trois
  du module 4) : doc commerciale, CGU, **écran à la première connexion**, **bandeau
  permanent dans le module**, **mention en en-tête de l'export**. « La transparence
  est la seule protection. »
La [[2026-07-24-gerimmo-v3-matrice-tracabilite|matrice]] soumet le module 4 à
14 règles transverses (3ᵉ module le plus contraint) ; deux dates par écriture
(RM-4.1.2) et immutabilité (RM-A6.3) sont des contraintes de base du
[[Architecture du socle V3|lot 0]].

Première application concrète (module 2, 2026-07-24) : **le [[Dépôt de garantie]] n'est
pas un solde comptable** (RM-2.1.3) — pas de compte mandant ni de séquestre ;
encaissement (4.2) et restitution (4.1) produisent simplement **deux écritures**,
« cohérent avec la comptabilité déclarative retenue au module 4 ».

## Relations
- **Amont module 3 (2026-07-24)** : « chaque encaissement produit une écriture » ; le
  module 3 confirme l'absence de synchronisation bancaire (saisie manuelle, décision
  actée — cohérent avec le choix humain du 2026-07-22). Voir [[Quittancement des
  loyers]] et [[Solde de tout compte]].
- Consomme : [[Période de loyer]], [[Régularisation des charges]], [[Intervention]] (coûts).
- Sert : reporting financier du [[Propriétaire bailleur]] ([[2026-07-21-fonctionnalites-par-persona-v0]]),
  [[Fiscalité]].
- Standard marché : [[Analyse concurrentielle]].

> [!warning] Points à trancher (résiduels)
> - ~~Synchronisation bancaire~~ → **tranché le 2026-07-22 : non, on reste sur le
>   déclaratif** ; A6 le confirme (rapprochement manuel assumé, RM-A6.8) et clarifie
>   la nuance : RM-A6.2 est bien une **règle de preuve** (le relevé prime en cas
>   d'écart), pas un retour de la synchronisation.
> - ~~Périmètre agence~~ → **tranché par A6 : jamais de compta de gérance réglementée**
>   (RM-A6.1 — pas de comptes mandants ni séquestre), sous réserve de la **validation
>   par un expert-comptable** (suffisance pour une agence à carte professionnelle —
>   aucun expert identifié à ce jour).
> - ~~Export~~ → **tranché par A6 : trois exports à tout moment** (journal complet,
>   documents, référentiel), CSV sans FEC ; format définitif au lot 1.

## Livre du propriétaire direct — livré (2026-08-30, S9a)

Le journal est commun ; pour une organisation `proprietaire_direct`, l'écran
s'appelle « Livre recettes-dépenses », ne montre ni rapports de gestion ni
mention d'honoraires, et donne accès au [[Fiscalité|récapitulatif fiscal]].
`cloturer_mois` / `rouvrir_mois` acceptent le PD ; aucune écriture d'honoraires
ne se crée sans ligne de mandat. Voir [[Propriétaire bailleur]].
