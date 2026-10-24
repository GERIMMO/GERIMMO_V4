---
type: business-rule
tags: [abonnement, essai, stripe]
status: in-progress
created: 2026-07-21
updated: 2026-10-24
sources: ["[[2026-09-28-decision-tarification]]", "[[Dépôt Gerimmo-V3]]", "[[Souscription de l'abonnement]]", "[[Rétractation en ligne]]", "[[Résiliation de l'abonnement]]", "[[Impayé de l'abonnement]]", "[[Fermeture de compte]]", "log.md — entrées « decision » des 23 et 24/10/2026, « deploy » du 24/10/2026 (PR #246, PR #247)"]
---

# Cycle de vie de l'abonnement

> [!info] Nouvelle grille (28/09/2026)
> - **Essai** sans carte : **2 mois** pour toute ouverture jusqu'au 31/12/2026
>   inclus (**offre de lancement**, décision du 30/09/2026), **1 mois** à compter
>   du 01/01/2027 — date de Paris, mois calendaires (14 jours jusqu'au 29/09 ;
>   essais en cours au 30/09 prolongés à 2 mois) ; à son terme, **lecture seule** tant qu'il n'y a
>   pas de souscription — même avec un seul bien (fin du « premier bien offert »).
> - **Souscription pendant l'essai** : les jours restants sont préservés, premier
>   prélèvement à la fin de l'essai (date affichée).
> - **Hausse** : montant, date d'effet et prorata (aperçu Stripe) présentés, puis
>   confirmation ; prorata prélevé aussitôt ; carte refusée → rien ne change.
> - **Baisse** : appliquée d'elle-même dans les trois jours qui précèdent
>   l'échéance, sans prorata. **Périodicité** : changée à l'échéance seulement.
> - **Résiliation** pour la prochaine échéance, accès payé conservé ; ensuite
>   lecture seule, données consultables et exportables ; **rien n'est supprimé du
>   seul fait de la résiliation** (24/10 : remplace « jamais supprimées », voir
>   ci-dessous la règle des 24 mois).
> - **Portail client Stripe** : configuration imposée par Gerimmo (pas le réglage
>   par défaut du tableau de bord) — aucun changement de formule ni de quantité
>   (ils passent par Gerimmo) ; carte, adresse, e-mail et factures accessibles.
>   **Depuis le 24/10, la résiliation n'y est plus proposée** (configuration
>   `portail-2026-10-24`) : elle passe par la page « Résilier votre contrat ».
> - **Révision tarifaire** : notifiée au moins un mois avant sa prise d'effet
>   (CGU art. 8.9) ; résiliation sans frais possible avant cette date.
> - **Reconduction de l'annuel** (CGU art. 8.7, C. consom. L. 215-1) : courriel
>   automatique **entre trois mois et un mois** avant la date limite de
>   non-reconduction (veille de l'échéance, jour de Paris ; 24/10 : remplace
>   « entre 90 et 30 jours »), avec un encadré « Date limite de
>   non-reconduction » et le montant de la période suivante ; sans cet avis,
>   résiliation gratuite à tout moment (outil prévu au lot 5).
> - **Gel et tiers** (29/09) : le gel ne bloque que les saisies des gérants ;
>   locataires, artisans et mandants continuent (incidents, documents, factures).
>   Premier prélèvement refusé après l'essai → gel immédiat, sans délai de grâce.
> - **Rétractation** (CGU art. 8.10) : 14 jours à compter de la souscription
>   payante (C. consom. L. 221-18 s.), remboursement intégral sous 14 jours,
>   formulaire type fourni ; l'essai gratuit ne réduit pas ce délai. **Depuis le
>   24/10 : en ligne (« Renoncer au contrat ici ») et ouverte à toutes les
>   formules**, sans chercher si le client est un consommateur (« non ouverte aux
>   professionnels » est supplanté). Modification des CGU : préavis d'un mois
>   (art. 16).
> - **Échec de paiement** (24/10, article 15) : courrier le jour même, valant mise
>   en demeure ; lecture seule à **J+15** (seulement si un courrier est parti) ;
>   résiliation manuelle au plus tôt à **J+30** ([[Impayé de l'abonnement]]).

> [!info] Conformité V1 du code — en production depuis le 24/10/2026 (PR #246, `f79674c`)
> Plan juriste/DPO du 23/10 (lots 1 et 2), décisions du dirigeant des 23 et 24/10.
> Textes contractuels inchangés (version du 30/09/2026) ; **publication des conditions
> V1 prévue le 24/10** ([[Conditions générales]]).
> - **Souscription** : récapitulatif avec le droit de rétractation, case de demande
>   expresse, page Stripe avec le texte d'obligation de paiement, **confirmation sur
>   support durable envoyée une fois**, même sans médiateur
>   ([[Souscription de l'abonnement]]).
> - **Rétractation en ligne** : toutes formules, remboursement intégral, accusé qui
>   reprend la déclaration ; le passage à l'annuel ouvre un nouveau délai
>   ([[Rétractation en ligne]]).
> - **Résiliation** : un seul chemin, page « Résilier votre contrat », un seul accusé
>   de réception ([[Résiliation de l'abonnement]]).
> - **Impayé (article 15)** : J+0 mise en demeure, rappels à J+7 et la veille,
>   **lecture seule à J+15 après courrier**, dès l'échec pour le premier prélèvement ;
>   statut Stripe « impayé » sans gel anticipé ; **résiliation au plus tôt à J+30**,
>   facture impayée annulée ([[Impayé de l'abonnement]]).
> - **Après la fin de l'abonnement** : lecture seule, rien n'est supprimé du seul
>   fait de la fin ; **le compte est supprimé 24 mois** après la plus tardive des
>   dates entre la dernière connexion d'un membre et la fin du dernier abonnement
>   payé, après deux avertissements (J-60, J-15). **Règle inactive jusqu'à la V1**
>   (`VERSION_MIN_INACTIVITE` nulle) ([[Fermeture de compte]]).
> - **Fermeture sur demande** : à la fin de la période payée, ou à J+14 avec
>   remboursement au prorata ([[Fermeture de compte]]).
> - **Nouvelle version substantielle des conditions** : sans accord exprès à la date
>   d'effet, l'abonnement n'est pas reconduit ; une période payée n'augmente jamais.


**Énoncé :** l'[[Abonnement]] suit des statuts contrôlés, avec expiration automatique de
l'essai et transitions réservées.

## Fondement
- Migrations `20260712110000_sprint10_business_engine.sql`, `20260712110100_sprint10_official_pricing.sql`.
- Services `business-service.ts`, `stripe-service.ts`, `automations/lifecycle-emails.ts`.

## Règles
- **R3 — Essai (14 jours dans le code hérité ; 2 mois du 30/09 au 31/12/2026 — offre de lancement —, 1 mois à compter du 01/01/2027), expiration automatique** : à l'échéance sans abonnement actif, la
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
> - **24/10 — règles de la conformité V1** (rétractation, avis de reconduction, résiliation en
>   ligne, impayé, accord exprès) : construites sans juriste, sources non ouvertes — à
>   confirmer sur Légifrance (source non ouverte le 23/10/2026) : C. conso L. 215-1,
>   L. 215-1-1, D. 215-1 à D. 215-3, L. 221-18 à L. 221-25, D. 221-5, L. 212-1, R. 212-1,
>   R. 212-2, R. 212-4, R. 212-5 ; C. civ. 1219, 1225.
> - **24/10 — règle des 24 mois** annoncée par la V1 et la page confidentialité V1, mais
>   **inactive** dans le code tant que la V1 n'est pas publiée ; à activer dans le même
>   déploiement (`VERSION_MIN_INACTIVITE` et règle `compte:inactif`).
> - **24/10 — réglage Stripe** « marquer l'abonnement comme impayé » (sans annulation
>   automatique avant J+30) : geste du dirigeant, non constaté.
>