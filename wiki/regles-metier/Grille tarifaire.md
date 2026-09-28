---
type: business-rule
tags: [tarifs, stripe, abonnement]
status: stable
created: 2026-07-21
updated: 2026-09-28
sources: ["[[2026-09-28-decision-tarification]]", "[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]"]
---

# Grille tarifaire

## Grille en vigueur — décision du 28/09/2026 ([[2026-09-28-decision-tarification]])

**Plus aucune gratuité permanente** : l'essai de 14 jours sans carte est la seule
période sans paiement. Implémentation : `app/src/lib/tarifs.ts` (source unique, en
centimes) et tables `tarif_formules` / `tarif_tranches` (grille `2026-09-28`),
comparées unité par unité par les tests.

**Particuliers et SCI gérant leurs propres biens** (organisation « propriétaire
direct ») — prix TTC, fonctions identiques :

| Formule | Biens | Mensuel TTC | Annuel TTC |
|---|---:|---:|---:|
| Solo | 1 | 5,99 € | 59,90 € |
| Bailleur | jusqu'à 3 | 9,99 € | 99,90 € |
| Investisseur | jusqu'à 10 | 19,99 € | 199,90 € |
| Patrimoine | jusqu'à 20 | 29,99 € | 299,90 € |
| Au-delà de 20 | Patrimoine + | +1 €/bien/mois | +10 €/bien/an |

Annuel = dix mensualités (deux mois offerts), prélevé en une fois. 25 biens =
34,99 €/mois ou 349,90 €/an. La formule la moins chère qui couvre le parc est
proposée d'office ; une plus chère seulement si choisie, montant affiché.

**Agences** — mensuel HT, lots **distincts** sous mandat actif ou en préavis,
vacants compris, tranches **cumulatives** : socle 39 € jusqu'à 10 lots, +2 € du
11ᵉ au 50ᵉ, +1,50 € du 51ᵉ au 200ᵉ, +1 € à partir du 201ᵉ. Exemples : 20 lots
59 € · 50 lots 119 € · 100 lots 194 € · 200 lots 344 € · 300 lots 444 € · 500 lots
644 €. Plus de plafond « sur devis ».

**Unité comptée (particuliers)** : chaque lot non archivé d'un bien non retiré —
un logement et ses annexes louées au même bail forment un lot ; un parking loué à
part est son propre lot (interprétation retenue, cf. points à trancher).

**Règles d'application** : hausse (formule, bien au-delà de 20, lot sous mandat)
seulement après présentation du nouveau montant, de la date d'effet et du prorata
(aperçu Stripe) puis confirmation — une garde en base refuse sinon l'écriture ;
baisse appliquée à l'échéance, sans prorata ; changement de périodicité à
l'échéance seulement ; résiliation pour la prochaine échéance. Taxes selon le
régime déclaré de l'éditeur (`REGIME_TVA`) : **franchise en base** (art. 293 B
du CGI, décision du 28/09) — aucune TVA facturée, mention « TVA non applicable,
art. 293 B du CGI » sur les factures ; le prix affiché est le prix payé. Voir [[Cycle de vie de l'abonnement]].

**Organisations antérieures** (décision du porteur, 28/09) : plus de premier bien
offert pour personne — seuls les 14 jours d'essai sont offerts, puis **gel en
lecture seule** jusqu'au paiement. Toute organisation sans souscription en cours
bascule à la mise en production ; une organisation qui paie encore sur l'ancienne
grille bascule **dès son prochain ajout de bien**. **Pas de cumul** avec le
parrainage.

## Historique des grilles (supplantées le 28/09/2026)

**Énoncé :** **8 offres** d'[[Abonnement]] en base — dont **6 achetables en ligne** et **2 sur
devis** (`requires_quote = true` : `agency_301_600`, `agency_600_plus`) — segmentées par
**audience** (`owner`/`agency`) et par **tranche de nombre de biens**. Lancement **mensuel
uniquement**, essai **14 jours**, EUR.

## Fondement
- Migration `20260712110100_sprint10_official_pricing.sql` (source faisant foi) + `20260720160000`,
  `20260720170000` ; config publique `src/config/public-pricing.ts` ; décision `docs/08-tarifs-stripe.md`.

## Grille officielle
| Offre | Public | Mensuel | Mise en place | Gestion annuelle | Biens |
|---|---|---|---|---|---|
| owner_1_5 | Propriétaire 1–5 | 19 € | 49 € | 79 € | 1–5 |
| owner_6_20 | Propriétaire 6–20 | 39 € | 49 € | 79 € | 6–20 |
| owner_21_50 | Propriétaire 21–50 | 69 € | 99 € | 149 € | 21–50 |
| agency_1_50 | Agence 1–50 | 79 € | 199 € | 199 € | 1–50 |
| agency_51_150 | Agence 51–150 | 149 € | 399 € | 199 € | 51–150 |
| agency_151_300 | Agence 151–300 | 249 € | 399 € | 399 € | 151–300 |
| agency_301_600 | Agence 301–600 | 399 € | **599 €** | 399 € | 301–600 (**sur devis**) |
| agency_600_plus | Agence +600 | — (**sur devis**) | — | — | 601+ |

## Paramètres / valeurs
- 3 tarifs par offre : mensuel (`amount_cents`), mise en place one-time (`setup_fee_cents`),
  gestion annuelle récurrente (`annual_fee_cents`). `trial_days = 14`.
- Correction 2026-07-20 : mise en place `agency_301_600` passée de 0 € à **599 €**.

## Mécanique Stripe
- 3 `stripe_*_price_id` par offre. Setup = 2ᵉ ligne de la 1ʳᵉ facture ; **gestion annuelle = abonnement
  SÉPARÉ** (Stripe interdit de mélanger deux rythmes). Idempotency key `checkout:{org}:{plan}:{date}`.
- Codes promo : `percent` (≤100), `fixed`, `free_month` ; usage unique par organisation par défaut.

## Conséquences si non respectée
- Règle **R1** : offre achetable seulement si prix + `stripe_price_id` renseignés et non « sur devis ».

## Cible V3 (module 18.6, 2026-07-24) — la facturation entre au périmètre
« **Gerimmo compte, Stripe encaisse et facture** » (RM-18.6.9). **Trois flux** : mise
en route (une fois), **abonnement exclusivement mensuel** (RM-18.6.7), **redevance
annuelle** à la date anniversaire. **Deux modèles** : agences **par palier de lots**,
propriétaires directs **par bien**. **Comptage automatique : lot sous [[Mandat de
gestion|mandat]] actif au dernier jour du mois** (vacant compté, sans mandat non).
Essai **14 jours** sans restriction → alerte J-3 → **lecture seule** (données
conservées). Échec de prélèvement → relance puis suspension (module 18.4), **jamais
suppression**.

## Structure cible — tranchée (humain, 2026-07-25)

**Propriétaires bailleurs : par bien. Agences : par palier de lots.** Clôt la
réconciliation RM-18.6.3 — les paliers `owner_*` du code sont à remplacer.

**Grille PD — VALIDÉE (humain, 2026-07-25), prix RÉVISÉ (humain, 2026-09-05) :**
| Élément | Décision | Justification |
|---|---|---|
| **1ᵉʳ bien** | **Gratuit, à vie** | Neutralise le « Rentila gratuit 1 bien » ; porte d'entrée |
| **Par bien suivant** | **5,99 €/bien/mois** | Décision humain 2026-09-05 — remplace les 2,50 € du 25/07 ; 2 biens ≈ 72 €/an, 5 biens ≈ 24 €/mois |
| Mise en place / redevance | **Aucune pour les PD** | Friction fatale sur ce segment ; réservées aux agences |
| Essai | 14 jours sans carte | Inchangé |

> [!info] Révision de prix (2026-09-05)
> Le tarif par bien supplémentaire passe de 2,50 € à **5,99 €/bien/mois** (décision
> humain, session mobile). Le 1ᵉʳ bien reste offert à vie et l'absence de mise en
> place / redevance pour les PD est inchangée (non revues par l'humain — hypothèse
> conservée). Répercuté dans l'app : pages « Mon abonnement », accueil propriétaire,
> FAQ propriétaire. La justification « moins cher que Rentila » du 25/07 ne tient
> plus au même niveau (2 biens ≈ 72 €/an vs Rentila ~49 €/an) — positionnement
> assumé montée en gamme.

Points d'attention : (1) au-delà de ~20 biens le « par bien » dépasse les anciens
paliers (20 biens ≈ 47,50 €/mois vs 39 €) — assumable (la valeur suit le parc) ou
lisser par une dégressivité (2 €/bien au-delà de 20) ; (2) le comptage suit la
mécanique du module 18 (au dernier jour du mois).

**Agences : grille actuelle conservée — VALIDÉE (humain, 2026-07-25)**
(79/149/249/399 €/mois + mise en route + redevance — soit ~0,8 à 1,6 €/lot
dégressif), alignée sur le modèle V3 « mise en route + mensuel exclusif + redevance
annuelle » ; paliers exprimés en **lots sous mandat** (comptage automatique RM-18.6).
Les deux dernières tranches restent sur devis.

> [!warning] Points à trancher / contradictions
> - ~~Unité « bien »~~ — **tranché le 28/09 : 3 logements = 3 biens** (chaque lot
>   loué séparément).
> - ~~Régime de TVA de l'éditeur~~ — **tranché le 28/09 : franchise en base**
>   (art. 293 B du CGI) ; souscription en ligne ouverte.
> - ~~Clients existants~~ — **tranché le 28/09** : bascule, gel après les 14 jours
>   d'essai, bascule dès l'ajout de bien pour ceux qui paient encore l'ancienne
>   grille.
> - ~~Parrainage~~ — **tranché le 28/09 : pas de cumul** ([[Parrainage]]).
> - Préavis de révision tarifaire (conditions, art. 8.8) à fixer.
> - Les points qui suivent concernent les grilles supplantées :
>   `agency_301_600` sur devis ; prix annuels de V3.
> - Voir [[Cycle de vie de l'abonnement]], [[Analyse concurrentielle]].
