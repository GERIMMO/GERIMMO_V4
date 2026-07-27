---
type: business-rule
tags: [abonnement, essai, stripe]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Cycle de vie de l'abonnement

**Énoncé :** l'[[Abonnement]] suit des statuts contrôlés, avec expiration automatique de
l'essai et transitions réservées.

## Fondement
- Migrations `20260712110000_sprint10_business_engine.sql`, `20260712110100_sprint10_official_pricing.sql`.
- Services `business-service.ts`, `stripe-service.ts`, `automations/lifecycle-emails.ts`.

## Règles
- **R3 — Essai 14 jours, expiration automatique** : à l'échéance sans abonnement actif, la
  souscription passe en **`suspended`** (« Essai terminé sans abonnement actif »), avec historique
  + événement `trial.expired` idempotent. `trial_days` borné 0–90.
- **R4 — Statuts contrôlés** : `status ∈ {trial, active, suspended, expired, cancelled}` ;
  `billing_interval ∈ {monthly, annual}` ; `trial_ends_at > trial_started_at`.
- **R5 — Démarrage d'essai réservé** : `start_organization_trial` exige [[Super Admin]] ou
  [[Administrateur d'agence]] ; refuse une offre inactive ; **une seule souscription par organisation**.
- **R6 — Transitions réservées** : `transition_subscription` réservé Super Admin / admin agence,
  statut cible validé, journalisation obligatoire.

## Automatisations
- Tâche quotidienne `evaluate_subscription_lifecycle` (suspensions, fins d'essai) + webhooks Stripe.
- Actions super admin `administerSubscription` : `extend_trial`, `offer_month`, `suspend`,
  `reactivate`, `cancel`, `apply_promotion_code`.

> [!warning] Points à trancher / contradictions
> - Deux définitions de `evaluate_subscription_lifecycle` (`expired` vs `suspended`) — la version
>   **officielle** (`suspended`) prévaut par ordre de migration.
> - Voir [[Grille tarifaire]], [[Onboarding et abonnement]].
>