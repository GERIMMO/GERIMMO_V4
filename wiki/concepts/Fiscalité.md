---
type: concept
tags: [fiscalite, revenus-fonciers, proprietaire]
status: draft
created: 2026-07-22
updated: 2026-10-28
sources: ["[[Analyse concurrentielle]]", "[[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite]]"]
---

# Fiscalité

**Définition :** aide à la déclaration fiscale des revenus locatifs, destinée au
**[[Propriétaire bailleur]]** (et à lui seul — pas aux agences).

> [!note] Décision produit (humain, 2026-07-22) — implémentée en partie (mise à jour du 14/10/2026)
> Fonctionnalité **actée au périmètre** suite à l'[[Analyse concurrentielle]] (Rentila et
> GérerSeul en font un argument fort côté bailleur). L'inventaire de l'audit du 14/10 (lecture du code de la version candidate) relève, pour la
> **location nue**, un récapitulatif fiscal (déclaration 2044) avec captures fiscales des paiements, qualification des pièces (versionnée), exercice par
> lot, ligne 230, export CSV et document PDF. Les régimes **meublé (LMNP), SCI et micro-foncier** n'y sont pas calculés. Détail et jeu de référence :
> [[Charges et fiscalité — jeu de référence et sources officielles (audit du 13 octobre 2026)]].

> [!warning] Sources non officielles — à reconfirmer
> La matrice ci-dessous vient de recherches sur des sites **commerciaux** (Finalib, Maslow, jedeclaremonmeuble, Manda), pas des textes officiels. L'audit du 14/10
> n'a pas pu consulter service-public.fr, impots.gouv.fr ni legifrance.gouv.fr (accès réseau bloqué dans l'environnement de l'audit) : **aucune règle n'est confrontée à une
> source officielle**, et le traitement exact des lignes 229/230 et des cotisations de fonds de travaux reste à trancher avec le dirigeant, avec validation spécialisée
> (FIN-07, FIN-10, CHF-05 au [[Registre des anomalies — audit du 13 octobre 2026]]).

## Périmètre décidé (humain, 2026-07-22) : tous les cas de figure
- Bénéficiaire : le **propriétaire bailleur indépendant** uniquement (audience `owner`).
- S'appuie sur la [[Comptabilité]] (recettes/dépenses par [[Bien]], alimentation déclarative).
- **Couvrir tous les régimes existants**, selon la situation du propriétaire : particulier
  détenant un bien en direct **ou** gestion via une **SCI**, location **meublée ou non meublée**.

### Matrice des régimes (droit fiscal FR, état 2026 — recherche web, seuils à re-vérifier chaque loi de finances)
| Situation | Régime(s) | Repères 2026 |
|---|---|---|
| Particulier, location **nue** | **Micro-foncier** ou **réel** | Micro : recettes ≤ 15 000 €/an, abattement 30 % ; réel au-delà ou sur option (charges déductibles, déficit foncier) |
| Particulier, location **meublée** (LMNP) | **Micro-BIC** ou **réel BIC** | Micro-BIC : abattement 50 %, plafond 77 700 € (meublé classique) ; réel BIC : amortissements ; ⚠️ meublés de tourisme **non classés** : plafond abaissé à 15 000 € et abattement à 30 % |
| **LMP** (loueur meublé professionnel) | Réel BIC + cotisations sociales | Bascule si recettes meublées > 23 000 € **et** > autres revenus du foyer ; URSSAF |
| **SCI à l'IR** | Translucide : revenus fonciers chez les associés | Déclaration 2072 ; chaque associé déclare sa quote-part (micro-foncier impossible en direct via SCI sauf cas particuliers) |
| **SCI à l'IS** | Impôt sur les sociétés | Comptabilité commerciale complète, amortissements, imposition à la revente différente — **quasi compta d'entreprise** |
| Prélèvements sociaux | — | Relèvement 17,2 % → 18,6 % sur les revenus LMNP (LF 2026) |

## Relations
- Consomme : [[Comptabilité]], [[Période de loyer]], [[Régularisation des charges]],
  coûts d'[[Intervention]].
- Persona : [[Propriétaire bailleur]] (complète son « reporting financier et locatif »,
  [[2026-07-21-fonctionnalites-par-persona-v0]]).
- Standard marché : [[Analyse concurrentielle]].

## Sources web (matrice des régimes, consultées le 2026-07-22)
- [Déclaration revenus locatifs 2026 (Finalib)](https://finalib.fr/blog/fiscalite/declaration-revenus-locatifs-2026-lmnp-microfoncier-reel) ·
  [LMNP 2026 : ce qui change (Maslow)](https://blog.maslow.immo/lmnp-2026/) ·
  [Micro-BIC LMNP seuils (jedeclaremonmeuble)](https://www.jedeclaremonmeuble.com/le-regime-micro-bic/) ·
  [Fiscalité meublé vs nu (Manda)](https://www.manda.fr/ressources/articles/location-meuble-ou-non-meublee-fiscalite)

## Modalités décidées (humain, 2026-07-22)
- **Régime fiscal = attribut** du propriétaire/de l'organisation, modélisé dès le départ ;
  **implémentation par phases** : d'abord les régimes micro (récapitulatifs simples avec
  abattement), puis le réel (charges/amortissements). *(Proposition agent validée.)*
- **SCI à l'IS** : pas de compta IS native — la plateforme proposera un **export propre**
  (à destination de l'expert-comptable), en prenant en compte ses besoins (formats/contenus
  à spécifier avec un expert-comptable).
- **Table de paramètres fiscaux par année** (seuils, abattements — pas de constantes en dur) :
  - mise à jour par un **agent IA** en **V2** ;
  - accessible en **lecture/écriture au [[Super Admin]]** au besoin (correction manuelle).

## Ce que le référentiel V3 spécifie (module 6, 2026-07-24)
Le **[[Rapport de gestion|récapitulatif fiscal annuel]]** (parcours 6.4) : **calé sur
les rubriques de la déclaration 2044** (revenus fonciers), agrégé sur la **date de
pièce**, fonds travaux ALUR signalé à part, intérêts d'emprunt non suivis (rubrique
vide), seule la part non récupérable des charges de copro déductible. **Aide à la
déclaration, pas déclaration** : télétransmission, calcul d'impôt et conseil fiscal
**hors périmètre** (RM-6.4.7). Utile aussi en micro-foncier (donne le revenu brut) et
au propriétaire en gestion directe.

> [!warning] Points à trancher (résiduels)
> - ~~Forme de l'aide~~ → **tranché (module 6)** : récapitulatif annuel par rubrique
>   2044, à recopier — pas de pré-remplissage guidé ni de télédéclaration.
> - ~~Écart de périmètre~~ → **tranché (humain, 2026-07-25) : phasage assumé** —
>   **2044 (location nue) en V1**, les autres régimes (LMNP micro-BIC/réel, LMP,
>   SCI IR/IS) **en V2**. Le meublé reste possible au bail dès la V1 ; son
>   récapitulatif fiscal arrive en V2.
> - Fiscalité française uniquement, ou aussi belge (cf. cible FR/BE de l'analyse) ?
> - Contenu exact de l'export SCI-IS : à définir avec un expert-comptable (FEC ? grand livre ?).
> - Garde-fous de l'agent IA de mise à jour (V2) : validation humaine avant application ?

## Phase 1 livrée (2026-08-30, S9a)

Le récapitulatif 2044 (location nue) existe pour le propriétaire direct :
`src/lib/fiscal.ts` (rangement par mots-clés des catégories libres du livre,
date de pièce, ALUR à part, intérêts d'emprunt vides) et la page
`/comptabilite/fiscal`. Pas de table de paramètres fiscaux par année pour
l'instant (les seuils micro-foncier ne sont qu'un rappel à l'écran) ; meublé,
LMP et SCI restent en V2. Voir [[Propriétaire bailleur]].

> [!note] Décision 2026-09-04 — la ventilation par quote-part reste de la 2044
> Carte blanche de Tahir sur le point 4 de la
> [[2026-09-04-maquette-v3-prototype|maquette v3]]. Arbitrage : le phasage du
> 25/07 (« 2044 en V1, autres régimes V2 ») **tient**. La **ventilation par
> quote-part** (indivision, SCI translucide à l'IR — un feuillet par associé)
> n'est pas un autre régime : c'est une présentation de la 2044 → elle
> **rejoint la tranche T6** avec le multi-organisations du propriétaire
> direct. Le **simulateur micro-BIC / réel (LMNP)** et tout le champ BIC
> restent **V2** ; d'ici là, un lot meublé est simplement signalé « hors
> récapitulatif (BIC) », la gestion restant complète.

## Correction du récapitulatif 2044 (audit de gestion du 29/09/2026)

- **Charges récupérables hors 2044** : la part « provision de charges » des
  encaissements de loyer (reconstituée au prorata du bail), les régularisations de
  charges encaissées et la **TEOM** ne sont ni des revenus ni des charges déductibles.
  Elles sortent des lignes (la ligne 211 = loyers **hors charges**) et sont affichées à
  part (« Charges récupérables — hors déclaration »).
- **Ligne 212** : c'est la ligne des **dépenses du bailleur mises par convention à la
  charge du locataire**, pas celle des charges récupérées (libellé corrigé) — le livre
  ne la distingue pas, elle reste à compléter.
- **Ligne 227** : taxe foncière **hors TEOM**.
- **Ligne 229** : seule la **part non récupérable** des charges de copropriété se
  déduit quand le décompte du syndic est ventilé (postes « récupérable » retirés, lot par
  lot) ; sinon, la réintégration de la part récupérable passe par la ligne 230 l'année
  suivante.

## Ligne 211 et trop-perçu rendu au locataire (décision du 28/10/2026, migration `20261028100100`)

- La 211 retient le loyer **hors charges encaissé et dû** : à l'encaissement, chaque règlement est ventilé sur le montant
  **dû** du terme (un terme appelé après la fin du bail compte pour 0 ; le dernier terme compte pour son prorata
  recalculé) ; l'excédent reste « non ventilé », comme tout trop-perçu.
- Quand le dû baisse **après** la ventilation (congé saisi après le paiement du dernier terme), la correction est
  portée par l'écriture de **restitution du trop-perçu** au [[Solde de tout compte]] : la part de loyer hors charges
  rendue se retranche de la 211 (et la part de charges, des charges récupérées) **l'année de la restitution** — logique
  de trésorerie, cohérente avec « 211 = loyers encaissés, par année d'encaissement ». Les années déjà déclarées ne sont
  pas réécrites.
- Exemples : octobre payé 500 € le 01/10, congé avec fin au 25/10 → 96,78 € rendus, dont 87,10 € de loyer hors charges
  retranchés de la 211 ; terme d'octobre non dû payé après une fin au 25/09 → 500 € non ventilés, 75 € de loyer de
  septembre retranchés à la restitution.
- Limite : un trop-perçu rendu **hors** décompte de sortie, sans écriture de restitution rattachée au bail, n'est pas
  corrigé automatiquement (qualification manuelle de la pièce).

> [!warning] Correction du 29/09/2026
> Le récapitulatif comptait jusqu'ici les provisions de charges en recette (ligne 212
> « charges récupérées ») et la TEOM en charge déductible (ligne 227) : revenu foncier
> surévalué d'un côté, charges gonflées de l'autre. Source : [[Audit complet du 29 septembre 2026]].
