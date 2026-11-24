---
type: process
tags: [charges, regularisation, loyer]
status: draft
created: 2026-07-22
updated: 2026-11-24
sources: ["[[Analyse concurrentielle]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-module-0c-copropriete]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]", "[[Mission palier 1 — audit du 22 novembre 2026]]"]
---

# Régularisation des charges

**En une phrase :** comparer **une fois par an** les **provisions pour charges** versées par le
[[Locataire]] aux **charges réelles**, et solder la différence (remboursement ou complément) —
entre le locataire et le **[[Gérant]]** ([[Agent immobilier]] ou [[Propriétaire bailleur]]).

> [!note] Décision produit (humain, 2026-07-22) — non implémentée
> Fonctionnalité **actée au périmètre** suite à l'[[Analyse concurrentielle]] (standard du
> marché : Rentila, Smovin). **Aucune implémentation dans le code à ce jour** — page cible.

## Règles décidées (humain, 2026-07-22)
- **Périodicité annuelle**.
- **Justificatif obligatoire** : le décompte est accompagné d'un justificatif remis au locataire.
- **Départ en cours d'année** : régularisation au **prorata** de la période d'occupation.

## Déroulé cible
1. Le [[Bien]] porte un loyer + des **provisions de charges** (champ existant, voir [[Bien]]).
2. Une fois par an, le [[Gérant]] saisit les **charges réelles** et joint le **justificatif**.
3. Calcul de l'écart provisions ↔ réel ; production d'un **décompte** ([[Document]]) remis au
   locataire avec le justificatif.
4. Solde : complément demandé au locataire ou trop-perçu remboursé/déduit.
5. Si le locataire part en cours d'année ([[Occupation d'un bien]] clôturée) : même calcul au
   **prorata** de sa période d'occupation.

## Apports du module 0 (référentiel V3, 2026-07-24)
- Sur un bien multi-lots, la répartition d'une dépense commune passe par la
  **[[Clé de répartition]]** (somme = 100 % bloquante, **clé datée** : les décomptes
  émis la figent, aucun recalcul rétroactif — RM-0.4.2/4). Modification de clé
  **bloquée** pendant une régularisation en cours.
- En **copropriété** (module 0c) : la part **récupérable** de l'[[Appel de charges]]
  alimente directement la régularisation (RM-0c.3.8), justifiable **ligne à ligne**
  grâce à la saisie poste par poste. **La régularisation d'un lot en copropriété est
  bloquée tant qu'aucun appel de charges n'est saisi pour l'exercice** (RM-0c.6.4,
  décision actée — plutôt bloquer que régulariser partiellement) ; la relance du
  propriétaire est automatisée (0c.6, escalade à l'admin agence après 3 relances).
  La ventilation utilisée est **figée** dès l'émission (RM-0c.3.6) — toute correction
  passe par une **régularisation rectificative**. Le fonds travaux ALUR n'apparaît
  jamais dans le décompte du locataire.

## Relations
- Acteurs : [[Locataire]] ↔ gérant ([[Agent immobilier]] ou [[Propriétaire bailleur]]).
- S'appuie sur [[Bien]] (montant des charges), [[Période de loyer]] et
  [[Quittancement des loyers]] (la quittance sépare déjà loyer/charges, cf.
  [[Quittance conforme]]) ; produit un [[Document]] (décompte).
- Alimentera la [[Comptabilité]].

## Spécification complète (module 3, parcours 3.9/3.10)
Le module 3 confirme et précise les décisions du 2026-07-22 :
- **Année civile** (RM-3.9.1) ; quote-part au **prorata des jours d'occupation**
  (ex. entrée au 1er mars : 306/365 des 1 200 € = 1 006,03 €) ; **répartition entre
  locataires successifs** d'un même exercice (RM-3.9.4).
- **Justificatifs obligatoires à la validation** (bloquant, RM-3.9.5) ; pièces
  **communicables au locataire pendant 6 mois** (RM-3.9.6).
- **Bloquée sans [[Appel de charges|appel du syndic]]** en copropriété (RM-3.9.2) ;
  émise → correction par **rectificative** uniquement, jamais par modification
  (RM-3.9.7) ; solde intégré au [[Solde de tout compte]] si le locataire est parti.
- **Charges au forfait : aucune régularisation** (RM-3.9.8, le forfait est définitif).
  ⚠️ Pour un **bail vide, le forfait n'est possible qu'en colocation** — le formulaire
  officiel le dit en toutes lettres ([[2026-08-05-bailpdf-modele-bail-non-meuble]],
  section IV.B) ; en **meublé, le forfait est libre** et « révisé chaque année dans
  les mêmes conditions que le loyer » ([[2026-08-05-bailpdf-modele-bail-meuble]]).
  Le module 3 ne mentionne pas cette restriction. Le modèle 1.16 et la saisie des
  charges (3.1) devraient contraindre le choix « forfait » selon type de bail
  (+ colocation si bail vide).
- **Ajustement de la provision (3.10)** : proposé après le décompte (rapprochement des
  charges réelles), **jamais appliqué sans validation** — l'agent peut étaler une
  hausse mal reçue.

> [!warning] Points à trancher (résiduels)
> - ~~Périodicité~~ / ~~justificatifs~~ / ~~prorata au départ~~ → **tranchés le 2026-07-22**,
>   confirmés et détaillés par le module 3 (année civile, justificatifs bloquants,
>   prorata en jours).
> - ~~Le solde transite-t-il par une période ajustée ou un objet dédié ?~~ → **tranché
>   (module 3)** : appel complémentaire ou avoir, et intégration au [[Solde de tout compte]] en fin de bail.
> - Nature exacte du justificatif accepté (facture, décompte de copropriété, relevé…) —
>   toujours ouverte, probablement précisée au module 12.

## Audit de gestion du 29/09/2026 — colocation, prescription, régularisation tardive

- **Colocation à contrats individuels** : chaque contrat recevait les charges du
  **logement entier** (trois contrats × 1 200 € = 3 600 € réclamés). Désormais, un
  contrat de chambre ne porte que la **part de sa chambre** — surface de la chambre sur
  la surface cumulée des chambres du logement (parts égales si aucune surface n'est
  connue) — puis le prorata des jours d'occupation. La part d'une chambre vacante reste
  au bailleur. Trois chambres louées toute l'année : la somme des régularisations égale
  les charges du logement. La quote-part est conservée avec la régularisation et citée
  au décompte.
- **Prescription triennale** (art. 7-1 loi 89-462) : un **complément** n'est plus
  réclamable pour un exercice clos depuis plus de trois ans — refus. Un **trop-perçu**
  peut toujours être rendu au locataire.
- **Régularisation tardive** (art. 23 loi 89-462) : faite après le 31/12 de l'année
  suivant l'exercice, elle est marquée « tardive » et le locataire **peut demander un
  paiement par douzièmes**. Option « étalement sur 12 mois » : l'échéancier (12
  mensualités, la dernière absorbant l'arrondi) est conservé avec la régularisation et
  reproduit au décompte ; l'option est refusée hors régularisation tardive ou sans
  complément.

> [!warning] Limites connues (29/09/2026)
> - La régularisation n'écrit toujours pas au journal ni aux appels de loyer : les
>   mensualités d'étalement sont **tracées**, pas encore appelées automatiquement.
> - Point de départ de la prescription retenu : fin de l'exercice. La jurisprudence
>   (Cass. 3e civ.) fait courir le délai du jour où le bailleur connaît le montant réel
>   des charges — à confirmer avec une source avant d'assouplir.
> Source : [[Audit complet du 29 septembre 2026]].

> [!info] Jour de référence (depuis le 15/10/2026)
> L'exercice « commencé », la prescription, la régularisation « tardive », le premier mois
> de l'étalement et la date d'émission se comptent au **jour de Paris** (PR #189). Voir
> [[Le jour de référence est le jour de Paris]].

## État dans l'application au 24/11/2026 (préproduction, non publié) — étalement et courrier (mission palier 1, phase 3)

Relu dans le code après le lot 42 ([[Mission palier 1 — audit du 22 novembre 2026]] ; `QUESTIONS.md`, Q50 ;
`JURISTE.md`, partie 5, point 15).
- **Première mensualité au moins un mois après l'émission** (migration 20261123150000) : une régularisation tardive
  étalée sur douze mois fixait sa première mensualité au 1er du mois suivant (émise le 23/11, première mensualité le
  01/12, huit jours plus tard). C'est désormais le premier 1er du mois qui tombe au moins un mois après l'émission, au
  jour de Paris (émise le 23/11 : le 01/01 ; émise le 1er novembre : le 01/12), comme pour l'échéancier de charges. Les
  montants, l'arrondi et les refus ne changent pas.
- **Régularisations déjà émises** : non modifiées (une régularisation émise ne se modifie pas, RM-3.9.7) ; leur
  courrier n'annonce plus le délai d'un mois quand les dates le contredisent.
- **Le courrier** n'imprime « Le décompte par nature de charges et le mode de répartition sont communiqués un mois avant
  la régularisation. » que si les dates du dossier la rendent vraie. Chez un [[Propriétaire bailleur]] qui gère
  lui-même, il est émis par le bailleur (lot 37).

> [!warning] Points à trancher / contradictions (24/11/2026)
> - Le délai d'un mois est la règle que l'application appliquait déjà à l'échéancier, pas un délai confirmé : est-ce le
>   bon, et court-il jusqu'à l'enregistrement de la régularisation, jusqu'à l'exigibilité du solde ou jusqu'à la
>   première mensualité ? (juriste, point 15, qui complète le point 7 de la partie 2). Après la publication, lister en
>   lecture seule les régularisations déjà émises concernées ? (Q50).
