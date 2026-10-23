---
type: concept
tags: [abonnement, saas, stripe, facturation]
status: in-progress
created: 2026-07-21
updated: 2026-10-22
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
- ~~3 tarifs par offre : mensuel, frais de mise en place (one-time), gestion annuelle
  (récurrent)~~ — modèle hérité du code (`subscription_plans`), **supplanté le 28/09/2026** :
  une seule redevance, mensuelle ou annuelle (particuliers), sans frais de mise en place
  ([[2026-09-28-decision-tarification]]).
- Essai sans carte : **offre de lancement** (décision du porteur du 30/09/2026) : **2 mois** pour toute inscription ou ouverture jusqu'au **31/12/2026 inclus** (date de Paris), **1 mois** à compter du 1er janvier 2027 (14 jours jusqu'au 29/09/2026) ; puis **gel en lecture seule** (consultable, exportable)
  jusqu'au paiement ; **aucun bien offert**.

## Rôle dans le métier
- Modèle économique de GERIMMO, grille du 28/09/2026 ([[Grille tarifaire]]) :
  - **Particuliers et SCI** (TTC) : Solo 1 bien 5,99 €/mois ou 59,90 €/an ; Bailleur
    jusqu'à 3 biens 9,99 € / 99,90 € ; Investisseur jusqu'à 10 biens 19,99 € / 199,90 € ;
    Patrimoine jusqu'à 20 biens 29,99 € / 299,90 € ; au-delà de 20, +1 €/mois ou
    +10 €/an par bien. Annuel = deux mois offerts. 3 logements = 3 biens.
  - **Agences** (HT, mensuel, lots sous mandat actif) : socle 39 € jusqu'à 10 lots,
    +2 € par lot du 11ᵉ au 50ᵉ, +1,50 € du 51ᵉ au 200ᵉ, +1 € à partir du 201ᵉ
    (tranches cumulatives).
  - **TVA** : franchise en base (art. 293 B du CGI), aucune TVA facturée.
  - Organisations existantes : bascule sur la nouvelle grille dès l'ajout d'un bien.
  - Pas de cumul avec le [[Parrainage]], sauf depuis le 30/09 le **mois offert au
    parrain** à la conversion de son filleul : avoir de son mensuel courant (annuel
    ÷ 12) porté au solde client Stripe, ou un mois d'essai de plus.
  - Portail client Stripe imposé par le code : résiliation en fin de période,
    changement de formule désactivé ; préavis d'au moins un mois avant révision
    tarifaire (CGU art. 8.9) ; rétractation de 14 jours pour le consommateur (art. 8.10).

## Conditions d'ouverture du paiement (19/10/2026)
Garde de souscription (lot B3, entrée du journal `[2026-10-19] dev | Garde de
souscription`). En plus des clés Stripe et du régime de TVA, le paiement en ligne ne
s'ouvre que si deux conditions de contrat sont remplies, vérifiées par le serveur avant
tout appel à Stripe et dites par l'écran « Mon abonnement » avec les mêmes phrases :
- **l'identité de l'éditeur est complète** — les huit faits requis des mentions légales
  (dénomination, forme, siège, RCS, SIRET, directeur de publication, e-mail, médiateur),
  lus dans `supervision_identite` par-dessus le code. Tant qu'un fait manque, ni
  souscription ni hausse de capacité ; le détail des faits manquants n'est pas dit au
  client, il est affiché au dirigeant (/admin/sante, /admin/parametres) ;
- **le compte qui clique a accepté la version en vigueur des CGV** (`acceptations_cgu`,
  version 2026-09-30, source `compte` pour la case cochée depuis « Mon abonnement »).
  Exigée pour la souscription initiale seulement : une hausse porte sur un contrat déjà
  formé.

La phrase affichée tant que l'identité manque dépend de l'état du compte (correction du
19/10) : **en essai** (statut essai et écriture ouverte) « Le paiement en ligne n'est pas
encore ouvert : les mentions légales de l'éditeur sont en cours de publication. Votre essai
continue. » ; **gelé en lecture seule** (essai arrivé à son terme, le statut reste
« essai ») ou **déjà abonné** (hausse de capacité) : la même phrase sans « Votre essai
continue. ». Voir [[Conditions generales d'utilisation (projet)|Conditions générales d'utilisation]]
et, pour l'identité de l'éditeur encore à fournir, [[État du projet et décisions ouvertes]].

## Décision du dirigeant du 22 octobre 2026 — bouton de levée

À la demande explicite « Fais que cette règle puisse être annulée avec un bouton dans superadmin », le contrôle d’identité devient réversible par le superadmin permanent, depuis **Paramètres généraux → Blocage des abonnements**. La règle reste active par défaut. Le bouton « Lever le blocage » autorise le parcours malgré les faits manquants ; « Réactiver le blocage » rétablit le contrôle. L’acceptation des conditions, les prix, le consentement au paiement et les réglages Stripe/TVA restent contrôlés.

Chaque décision est datée et attribuée dans le registre de supervision. La lecture côté serveur reste obligatoire ; un compte client ne peut ni modifier le réglage ni le fournir dans son formulaire. Lever ce contrôle ne complète pas les mentions légales. **Préparé et testé localement, non publié** ; migration `20261022210326_reglage_blocage_souscription_identite.sql` à appliquer avant publication du code par le circuit habituel.

## Relations
- Souscrit par [[Administrateur d'agence]] ou [[Propriétaire bailleur]] ; administré par [[Super Admin]].
- Cycle de vie automatisé — voir [[Cycle de vie de l'abonnement]], [[Onboarding et abonnement]].

> [!warning] Points à trancher / contradictions
> - ~~La facturation annuelle n'est pas lancée (prix à refixer).~~ **Tranché le
>   28/09/2026** : annuel ouvert aux particuliers, deux mois offerts
>   ([[2026-09-28-decision-tarification]]).
> - Le schéma hérité (`subscription_plans` à trois tarifs, frais de mise en place)
>   subsiste dans les tables historiques ; la grille `2026-09-28` le remplace pour
>   toute nouvelle souscription.
> - Identité de l'éditeur encore à fournir (nécessaire au formulaire de
>   rétractation) — voir [[État du projet et décisions ouvertes]].
>