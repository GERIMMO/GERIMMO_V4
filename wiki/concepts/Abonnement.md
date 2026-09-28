---
type: concept
tags: [abonnement, saas, stripe, facturation]
status: in-progress
created: 2026-07-21
updated: 2026-09-28
sources: ["[[2026-09-28-decision-tarification]]", "[[Dépôt Gerimmo-V3]]"]
---

# Abonnement

> [!info] Modèle en vigueur (28/09/2026)
> Une organisation porte sa **grille** (`historique` ou `2026-09-28`). Dans la
> nouvelle : **formule** (particuliers) ou **lots facturés** (agences),
> **périodicité** (mensuelle, ou annuelle pour les particuliers), **capacité
> souscrite** (unités payées et confirmées) et **montant réel d'une période**, lu
> chez Stripe par le webhook. Toute hausse de capacité exige une confirmation ; les
> accès locataires, propriétaires invités et collaborateurs n'ajoutent rien. Voir
> [[Grille tarifaire]].


**Définition :** la souscription d'une [[Organisation]] à GERIMMO (facturation **SaaS**, via
Stripe). À **ne pas confondre** avec les [[Période de loyer|loyers]] des locataires
(facturation locative).

## Objets liés
- `subscription_plans` (offres), `organization_subscriptions` (souscription d'une org),
  `subscription_history`, `billing_invoices`, `billing_payments`, `billing_refunds`,
  `promotion_codes` / `promotion_redemptions`, `stripe_webhook_events`.

## Attributs métier notables
- `status` : `trial` / `active` / `suspended` / `expired` / `cancelled`.
- `billing_interval` : `monthly` / `annual` ; essai `trial_days` (14 j).
- 3 tarifs par offre : mensuel, **frais de mise en place** (one-time), **gestion annuelle** (récurrent).

## Rôle dans le métier
- Modèle économique de GERIMMO. Offres segmentées par **audience** (`owner`/`agency`) et par
  **tranche de nombre de biens**. Voir [[Grille tarifaire]].

## Relations
- Souscrit par [[Administrateur d'agence]] ou [[Propriétaire bailleur]] ; administré par [[Super Admin]].
- Cycle de vie automatisé — voir [[Cycle de vie de l'abonnement]], [[Onboarding et abonnement]].

> [!warning] Points à trancher / contradictions
> - La **facturation annuelle** n'est pas lancée (prix à refixer). Voir [[Grille tarifaire]].
>