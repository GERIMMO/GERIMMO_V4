---
type: business-rule
tags: [tarifs, stripe, abonnement]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]"]
---

# Grille tarifaire

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

**Grille PD — VALIDÉE (humain, 2026-07-25) :**
| Élément | Proposition | Justification |
|---|---|---|
| **1ᵉʳ bien** | **Gratuit** | Neutralise le « Rentila gratuit 1 bien » ; porte d'entrée |
| **Par bien suivant** | **2,50 €/bien/mois** | 2 biens = 30 €/an (vs Rentila ~49 €/an) ; 5 biens = 10 €/mois |
| Mise en place / redevance | **Aucune pour les PD** | Friction fatale sur ce segment ; réservées aux agences |
| Essai | 14 jours sans carte | Inchangé |

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
> - `agency_301_600` : `requires_quote = true` → doit rester non achetable en ligne (sinon R1 bloque).
> - Prix annuels de `public-pricing.ts` à neutraliser (RM-18.6.7 : mensuel exclusif).
> - Voir [[Cycle de vie de l'abonnement]], [[Analyse concurrentielle]].
>