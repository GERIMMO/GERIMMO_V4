---
type: process
tags: [incident, workflow]
status: in-progress
created: 2026-07-21
updated: 2026-08-21
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-7-incidents]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]"]
---

# Cycle de vie d'un incident

**En une phrase :** de la déclaration d'un problème sur un [[Bien]] jusqu'à la clôture et
l'évaluation de l'[[Artisan]] — le processus métier le plus riche de GERIMMO.

## Déclencheur
- Déclaration d'un [[Incident]] : dans le dashboard, ou via **bot** (un [[Locataire]] décrit
  son problème) — voir [[Canaux de communication]].

## Acteurs
- [[Locataire]] (déclarant), gestionnaire = « responsable » ([[Agent immobilier]] /
  [[Administrateur d'agence]] ou [[Propriétaire bailleur]]), [[Artisan]].

## Étapes (vue d'ensemble)
1. **Création** — `incidents` statut `nouveau`, priorité, numéro, photos. Par bot :
   description → catégorie auto → choix logement → photos → résumé → confirmation.
2. **[[Demande et sélection de devis]]** — mise en concurrence des artisans, choix du [[Devis]] retenu.
3. **[[Planification d'intervention]]** — négociation des créneaux avec le locataire.
4. **[[Intervention et clôture]]** — exécution, rapport PDF officiel, clôture, évaluation.

## Précisions du module 7 (2026-07-24)
Le module 7 confirme la machine A5 et ajoute : **qualification/imputation par l'agent**
(bloquante avant affectation — [[Incident]]) ; filtre artisan par métier **et
décennale selon la nature des travaux** ; devis obligatoire au-delà du seuil de
délégation du [[Mandat de gestion]] ; **compte rendu + photo du travail réalisé
obligatoires** pour terminer ; clôture possible **sans artisan** ; le mandant n'est
informé que par le [[Rapport de gestion]]. Urgence hors horaires : V2.

## Déclaration mobile-first (module 19)

La déclaration du [[Locataire]] est pensée d'abord pour le téléphone — « il
photographie sur le vif », et c'est cette photo prise au bon moment qui alimente la
qualification : **trois écrans maximum** (RM-19.2.1), **photo proposée avant la
description** (RM-19.2.2), statut visible depuis l'accueil (RM-19.2.3). Côté
[[Artisan]], le compte rendu se fait depuis le chantier en **deux écrans**, photo au
centre (RM-19.3.1/2). Aucune règle du module 7 n'est modifiée par le mobile
([[2026-07-24-gerimmo-v3-module-19-mobile|module 19]]).

## Machine à états cible (référentiel V3, Livrable A5 — module 7)
**déclaré** → qualifié ou clos (classement) · **qualifié** → affecté ou résolu directement ·
**affecté** → en cours (acceptation artisan) ou retour qualifié (refus) · **en cours** →
terminé (compte rendu déposé) · **terminé** → clos (validation de l'agent) · **clos** →
rouvert (le désordre réapparaît) · **rouvert** → qualifié. Interdits : déclaré → affecté
(imputation obligatoire, RM-7.2.7) ; en cours → clos (compte rendu obligatoire,
RM-7.5.1) ; clos → déclaré (la réouverture repasse par qualifié).
Chaîne critique « incident clos » : notation déclenchée + alerte fermée (RM-7.6.2).
Voir [[Machines à états et événements]].

## Résultat / sorties
- Incident tracé (`incident_events`), clôturé (`cloture_normale`/`cloture_reserve`),
  artisan évalué, rapport officiel archivé.

## Automatisations
- Déclaration et suivi possibles par **bot Telegram/WhatsApp** ; journalisation `bot_actions`.

## Implémentation (S7, 2026-08-21)

L'incrément 1 du sprint 7 (branche `sprint7-incidents`) implémente la **gestion
de l'incident** avec les 7 états du registre A5 : déclaration (espace locataire
à bail actif, ou saisie agence), qualification/imputation justifiée et
opposable, information immédiate du locataire, contestation tracée sans
bloquer, clôture (résolu / classé sans suite / transmis au syndic — RM-7.1.4),
réouverture par le gérant ou le déclarant, attribution des dossiers, photos via
la GED (`photo_incident`, plafond de dix), historique append-only
(`incident_evenements`), alertes chaînées (à qualifier / contestée / soldées à
la clôture, RM-7.6.2). Les états artisans (affecté → en cours → terminé)
attendent les incréments suivants ([[Demande et sélection de devis]],
[[Planification d'intervention]], [[Intervention et clôture]]).

> [!warning] Points à trancher / contradictions
> - ~~**États du code ≠ registre V3**~~ → **levé le 2026-08-21** : la nouvelle
>   application implémente les 7 états du registre
>   ([[Machines à états et événements]]) ; le vocabulaire `nouveau…cloture_*`
>   ne subsiste que dans l'ancien dépôt `raw/Gerimmo-V3`.
> - Détail des sous-processus dans leurs pages dédiées (liens ci-dessus).
> - **Intention produit v0** ([[2026-07-21-fonctionnalites-par-persona-v0]]) : à la déclaration, Gerimmo génère une **« fiche type »** envoyée au proprio/gestionnaire ; en cas d'absence d'accord sur la date, **escalade au propriétaire**. Non explicite dans le code.
>