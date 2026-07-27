---
type: source
tags: [comptabilite, doctrine-financiere, immutabilite, contre-ecriture, export, livrable-a6]
status: stable
created: 2026-07-25
updated: 2026-07-25
source-file: raw/assets/GERIMMO-V3-A6-Doctrine-financiere.md
source-type: livrable transverse du référentiel V3 — dernier point bloquant P0 de l'audit
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Livrable A6 : Doctrine financière

**En une phrase :** le **dernier blocage P0 de l'audit** reçoit son livrable —
position : « **journal de gestion, jamais comptabilité de gérance** » (RM-A6.1), avec
ce qui fait foi où (« en cas d'écart, le relevé bancaire prime » — RM-A6.2),
l'**immutabilité des écritures dès leur création** (RM-A6.3) et la **réversibilité
comme argument de vente** (RM-A6.10). **Réserve : à faire valider par un
expert-comptable — aucun identifié à ce jour ; préalable à la commercialisation.**

## Affirmations clés

1. **Le risque n'est pas technique, il est commercial et réglementaire** : « une
   agence croit remplacer sa comptabilité de gérance » et « manque à ses obligations
   sans le savoir ». Gerimmo n'est **ni** un logiciel de comptabilité (pas de plan
   comptable, pas de balance), **ni** une comptabilité de gérance (pas de comptes
   mandants, pas de séquestre), **ni** un système bancaire, **ni** un tiers de
   confiance, **ni** un outil de rapprochement (manuel, assumé — RM-A6.8).
2. **Ce qui fait foi, et où** : Gerimmo fait foi sur ce qu'il a **calculé et décidé**
   (montant appelé, imputation, honoraires, net dû) ; la banque fait foi sur ce qui a
   **réellement circulé** (montants et dates reçus, versements, soldes — Gerimmo n'en
   tient que des saisies déclaratives, et **rien** pour le solde). « En cas d'écart,
   le relevé bancaire prime. Gerimmo se corrige, jamais l'inverse » (RM-A6.2).
3. **Immutabilité dès la création** (RM-A6.3, bloquant — étend RM-4.4.1 qui ne
   verrouillait qu'après clôture) : une erreur constatée le jour même se corrige par
   **contre-écriture** (RM-A6.4 — montant identique sens inversé, **date d'imputation
   du jour** RM-A6.5, date de pièce d'origine, **motif obligatoire** RM-A6.6, lien
   vers l'annulée, les deux visibles). Suppression : **impossible**. « L'historique
   se lit, il ne se réécrit pas » — un rapport envoyé engage l'agence,
   « l'immutabilité protège l'agence autant que le propriétaire ». Une **réouverture
   ne rend jamais les écritures modifiables** (RM-A6.9) : elle permet seulement
   d'ajouter les manquantes (admin agence, motif, impossible si rapport envoyé —
   RM-4.4.5/6).
4. **Allocation des paiements** (RM-A6.7, précise le module 3) : montant exact → son
   appel ; partiel → **du plus ancien au plus récent** (RM-3.3.2, règle d'imputation
   légale — et suivi de l'ancienneté de la dette pour les relances) ; **la précision
   du débiteur prime** (règle légale) ; correction d'agent tracée ; excédent reporté
   (RM-3.5.1). **Écarts** : montant différent → écriture au réel ; encaissement non
   saisi → saisie rétroactive ; saisi non reçu → contre-écriture ; frais bancaires →
   dépense. Le journal doit **faciliter le rapprochement manuel** (export par
   période, tris, totaux).
5. **Réversibilité totale** (RM-A6.10, bloquant) : **trois exports disponibles à tout
   moment, sans négociation** — journal comptable (toutes écritures, toutes
   colonnes, pour l'expert-comptable), documents (archive avec index), référentiel
   (biens, lots, baux, personnes, mandats — migration). Format du journal spécifié
   (2 dates, sens, montant, famille/catégorie, bien/lot/mandat, propriétaire,
   locataire, référence de pièce, **écriture liée** RM-A6.11, auteur/horodatage).
   « Une agence qui sait pouvoir partir hésite moins à venir » — généralise
   RM-18.4.2.
6. **Les limites annoncées sur cinq supports** (RM-A6.12, bloquant — étend les trois
   du module 4) : doc commerciale, CGU (article explicite), **écran d'information à
   la première connexion**, **bandeau permanent dans le module comptabilité**,
   **mention en en-tête du fichier d'export**. Formulation retenue en cinq
   fait / ne fait pas (« Suit vos loyers » / « Ne tient pas votre comptabilité de
   gérance »…). « La transparence est la seule protection. »

## Décisions actées / reports

Actées : les 12 règles (dont 6 bloquantes), positionnement journal de gestion,
primauté du relevé, contre-écriture systématique, rapprochement manuel, exports.
**Reste à faire** : **validation de la doctrine par un expert-comptable** (avant
commercialisation — préparer une **note de synthèse de 2-3 pages** avec les cinq
questions plutôt que les 470 pages du référentiel), article des CGU (conseil
juridique), format d'export définitif (lot 1), écran d'information au paramétrage
(lot 1).

## Ce que ce livrable impose ailleurs

Module 3 : allocation et traitement des écarts · module 4 : immutabilité au-delà de
la clôture · module 6 : ce qui fait foi dans un rapport envoyé · module 18 : contenu
et format des exports. Clôt la série des livrables transverses : **les six points
bloquants P0 de l'audit ont chacun leur livrable** (identité A1, RGPD A2, preuve A3,
sécurité A4, événements A5, doctrine financière A6).

## Pages mises à jour par cet ingest

[[Comptabilité]] (consolidation) · [[Quittancement des loyers]] ·
[[Rapport de gestion]] · [[État du projet et décisions ouvertes]]
