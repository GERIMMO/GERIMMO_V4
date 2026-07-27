---
type: process
tags: [onboarding, abonnement, saas]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]"]
---

# Onboarding et abonnement

**En une phrase :** création d'une [[Organisation]], démarrage de l'essai et parcours de
prise en main.

## Déclencheur
- `createOrganization` (type `agency` ou `independent_owner`).

## Acteurs
- Nouvel utilisateur → devient [[Administrateur d'agence]] (`admin`) ou [[Propriétaire bailleur]] (`owner`).

## Étapes
1. Création organisation + membre + rôle (`administrateur_agence` / `proprietaire`).
2. Création d'un **[[Abonnement]] d'essai** (`trial`, 14 j) + historique + événement `trial.started`.
3. Initialisation `organization_onboarding_progress` (étapes `account`/`organization` complétées).
4. **Parcours en 10 étapes** : compte → plan → organisation → identité → import biens →
   utilisateurs → Telegram → 1ʳᵉ connexion → tutoriel → plateforme opérationnelle.
5. Suivi via `getOnboarding` (progression %), `updateOnboardingStep`.

## Résultat / sorties
- Organisation active en essai, parcours d'onboarding suivi.

## Cible V3 (module 16, 2026-07-24)
- **La création d'agence est réservée au super admin** (à la signature du contrat
  commercial — RM-16.1.1), avec un **jeu complet de paramètres par défaut** (modèles,
  grilles, plan comptable, équipements, seuils) : « elle peut travailler
  immédiatement ». Paramétrage initial : identité, agents, **indice IRL obligatoire**,
  seuil de délégation ; marque blanche et WhatsApp optionnels.
- **Invitations** depuis la fiche personne (module 0b) : relances J+3/J+10, expiration
  J+30 renvoyable, **refus tracé qui arrête les relances** ; une personne sans compte
  **reste gérable** ; le mandant n'est **jamais** invité. À la première connexion :
  mot de passe + CGU, puis proposition d'**enrôlement WhatsApp** (consentement daté,
  révocable, repli email — [[Canaux de communication]]).
- **Import courant 16.3** (admin agence, dizaines de lots, ligne par ligne, sans
  reprise du passé) — gabarit et contrôles **communs** avec l'import de migration
  0.12 du [[Super Admin]].

> [!warning] Divergence code ↔ V3
> Le code : auto-inscription `createOrganization` + essai 14 j + parcours 10 étapes
> (avec **Telegram**). Le V3 : création **par le super admin** après contrat, pas
> d'auto-inscription décrite, enrôlement **WhatsApp**. L'articulation essai/abonnement
> Stripe avec ce circuit commercial est à clarifier (module 18 ?).

## Cycle de vie ensuite
- Voir [[Cycle de vie de l'abonnement]] (essai → paiement/suspension via Stripe + Vercel Cron).

## Automatisations
- Événement `trial.started` → e-mail de bienvenue/essai (Resend). Voir [[Canaux de communication]].
