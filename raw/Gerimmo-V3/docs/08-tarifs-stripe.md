# 08 — Tarifs & lancement Stripe

> Décision 2026-07-18 : lancer **le mensuel uniquement** (7 offres), 600+ « sur devis », annuel plus tard.

## Offres à créer dans Stripe (mode test d'abord) — mensuel, essai 14 j, EUR

| code (DB) | Offre | Prix/mois |
|---|---|---|
| owner_1_5 | Propriétaire 1 à 5 biens | 19 € |
| owner_6_20 | Propriétaire 6 à 20 biens | 39 € |
| owner_21_50 | Propriétaire 21 à 50 biens | 69 € |
| agency_1_50 | Agence 1 à 50 biens | 79 € |
| agency_51_150 | Agence 51 à 150 biens | 149 € |
| agency_151_300 | Agence 151 à 300 biens | 249 € |
| agency_301_600 | Agence 301 à 600 biens | 399 € |

## Non lancés pour l'instant
- `agency_600_plus` : entreprise → **sur devis** (bouton « Nous contacter », pas de prix Stripe).
- `gerimmo_monthly`, `gerimmo_annual` : offres **orphelines** (non référencées dans le code) → ignorer.
- **Annuel** : les valeurs « annual » de `src/config/public-pricing.ts` sont incohérentes (< mensuel) → à refixer avant de lancer l'annuel (ex. 2 mois offerts = mensuel × 10).
- **Frais d'installation (setup)** : reportés (compliquent Stripe : one-time + récurrent).

## Étapes de branchement (config, le code existe déjà)
1. Créer un compte Stripe, rester en **mode test**.
2. Créer les 7 produits + prix mensuels ci-dessus (via dashboard, ou script `src/scripts` avec la clé test).
3. En base V3 : renseigner `subscription_plans.stripe_price_id` pour les 7 codes + `is_purchasable = true`.
4. Variables Vercel : `STRIPE_SECRET_KEY` (test), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test), `STRIPE_WEBHOOK_SECRET`.
5. Webhook Stripe → `https://<app>/api/stripe/webhook` (événements checkout/subscription/invoice) → récupérer le signing secret.
6. Tester un abonnement de bout en bout avec une carte de test Stripe (4242 4242 4242 4242).
7. Passage en **mode live** plus tard (mêmes étapes avec les clés live + vraie vérification d'identité Stripe).

Le code lit `subscription_plans.stripe_price_id` par offre (pas les env `STRIPE_*_PRICE_ID`). Voir `src/services/stripe-service.ts`.
