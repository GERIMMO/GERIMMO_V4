---
type: business-rule
tags: [abonnement, essai, stripe]
status: in-progress
created: 2026-07-21
updated: 2026-09-29
sources: ["[[2026-09-28-decision-tarification]]", "[[Dépôt Gerimmo-V3]]"]
---

# Cycle de vie de l'abonnement

> [!info] Nouvelle grille (28/09/2026)
> - **Essai** 14 jours sans carte ; à son terme, **lecture seule** tant qu'il n'y a
>   pas de souscription — même avec un seul bien (fin du « premier bien offert »).
> - **Souscription pendant l'essai** : les jours restants sont préservés, premier
>   prélèvement à la fin de l'essai (date affichée).
> - **Hausse** : montant, date d'effet et prorata (aperçu Stripe) présentés, puis
>   confirmation ; prorata prélevé aussitôt ; carte refusée → rien ne change.
> - **Baisse** : appliquée d'elle-même dans les trois jours qui précèdent
>   l'échéance, sans prorata. **Périodicité** : changée à l'échéance seulement.
> - **Résiliation** pour la prochaine échéance, accès payé conservé ; ensuite
>   lecture seule, données consultables et exportables, jamais supprimées.
> - **Portail client Stripe** : configuration imposée par Gerimmo (pas le réglage
>   par défaut du tableau de bord) — résiliation en fin de période sans prorata,
>   aucun changement de formule ni de quantité (ils passent par Gerimmo) ; carte,
>   adresse, e-mail et factures accessibles.
> - **Révision tarifaire** : notifiée au moins un mois avant sa prise d'effet
>   (CGU art. 8.8) ; résiliation sans frais possible avant cette date.
> - **Rétractation** (consommateurs, CGU art. 8.9) : 14 jours à compter de la
>   souscription payante (C. consom. L. 221-18 s.), remboursement intégral sous
>   14 jours, formulaire type fourni ; l'essai gratuit ne réduit pas ce délai.
>   Non ouverte aux professionnels. Modification des CGU : préavis d'un mois (art. 16).
> - **Échec de paiement** : inchangé (15 jours, puis lecture seule).


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