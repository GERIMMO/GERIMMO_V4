---
type: process
tags: [incident, workflow, devis, intervention, facture]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-7-incidents]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "app/supabase/migrations/20260821093624_s7_incidents_fondation.sql", "app/supabase/migrations/20260911180000_module8_artisans_socle.sql", "app/supabase/migrations/20260927123000_facture_artisan_depot.sql", "app/supabase/migrations/20261014610000_reglement_facture_intervention.sql", "app/supabase/migrations/20261122170000_facture_artisan_refus.sql", "app/src/lib/incidents.ts", "app/src/app/actions/incidents.ts"]
---

# Cycle de vie d'un incident

**En une phrase :** du signalement d'un problème sur un logement jusqu'à la clôture du dossier. Le parcours passe par
le devis, le rendez-vous, l'intervention, le compte rendu de l'artisan, sa facture et le règlement déclaré par le
gestionnaire.

Cette page donne la vue d'ensemble et l'ordre des gestes. Chaque étape a sa page détaillée :
[[Demande et sélection de devis]], [[Planification d'intervention]], [[Intervention et clôture]]. L'objet lui-même
(table, états, imputation) est décrit dans [[Incident]].

## Déclencheur

- Le [[Locataire]] signale un problème depuis son espace, ou le gestionnaire le saisit (écran « Incidents » ou fiche
  du bien). Détail des trois portes : [[Incident]], section « Les portes de déclaration ».
- Il n'y a pas de robot de messagerie. Le bot Telegram est abandonné (25/07) et WhatsApp n'est pas construit
  ([[Canaux de communication]]).

## Acteurs

- [[Locataire]] : il déclare, choisit un créneau et peut noter l'artisan.
- Le gestionnaire du dossier : [[Agent immobilier]] ou [[Administrateur d'agence]] en agence, [[Propriétaire bailleur]]
  en gestion directe. Il qualifie, met en concurrence, valide, règle et clôture.
- [[Artisan]] : il chiffre, accepte la mission, propose des créneaux, intervient, rend compte et facture.

## Les étapes dans l'application (relues dans le code le 26/11/2026)

Deux machines avancent ensemble : l'**incident** (sept états, [[Incident]]) et la **mission** d'intervention
(`proposee → acceptee → planifiee → en_cours → terminee`, plus `refusee` et `annulee`). Sauf mention contraire, les
fonctions citées sont dans `app/supabase/migrations/20260911180000_module8_artisans_socle.sql`.

| # | Étape | Geste et fonction de la base | Incident | Mission | Détail |
|---|---|---|---|---|---|
| 1 | Déclaration | `incident_creer`, appelée par la porte du locataire ou du gestionnaire ; alerte « à qualifier » | `declare` | — | [[Incident]] |
| 2 | Qualification | `qualifier_incident` : imputation et justification opposable. Ou clôture directe : sans suite, transmis au syndic, ou résolu sans artisan | `qualifie` | — | [[Incident]] |
| 3 | Devis | `ouvrir_consultation` (incident qualifié), `solliciter_artisan` (deux au plus en parallèle), dépôt du devis par l'artisan, puis `retenir_devis`, `refuser_devis` ou `demander_revision_devis` | `qualifie` → `affecte` au devis retenu | `proposee` | [[Demande et sélection de devis]] |
| 4 | Mission | `accepter_mission` ou `refuser_mission` (retour à « qualifié ») ; `annuler_mission` par le gestionnaire, avec un motif | `en_cours` à l'acceptation | `acceptee` | [[Intervention et clôture]] |
| 5 | Créneaux | `proposer_creneaux` (artisan), `choisir_creneau` ou `contre_proposer_creneaux` (locataire), `accepter_creneau_locataire` (artisan), `fixer_creneau_arbitrage_motive` (gestionnaire) ; report, annulation, rendez-vous manqué | `en_cours` | `planifiee` | [[Planification d'intervention]] |
| 6 | Intervention | `demarrer_intervention` ; photos avant, pendant, après (`deposer_photo_intervention`) ; discussion partagée (`envoyer_message_intervention`) | `en_cours` | `en_cours` | [[Intervention et clôture]] |
| 7 | Compte rendu | `deposer_compte_rendu` : travaux réalisés, cause constatée, imputation suggérée, montant final. La photo « après » est obligatoire (RM-7.5.2). Si la cause diffère, l'alerte de révision d'imputation s'ouvre (RM-7.5.3) | `termine` | `terminee` | [[Intervention et clôture]] |
| 8 | Facture | `deposer_facture_artisan` (`20260927123000`) : mission terminée, compte rendu et photo exigés. Puis `valider_facture_artisan`, ou `refuser_facture_artisan` avec un motif ; l'artisan en dépose alors une autre (`20261122170000`) | `termine` | `terminee` | [[Intervention et clôture]] |
| 9 | Règlement déclaré | `enregistrer_reglement_facture` (`20261014610000`) sur une facture validée : écriture de dépense et règlement dans la même transaction, règlement partiel admis. Retrait motivé par contre-écriture (`retirer_reglement_facture`). **Gerimmo ne paie rien** | `termine` ou `clos` | `terminee` | [[Intervention et clôture]] |
| 10 | Clôture et évaluation | `cloturer_incident` (motif « résolu » ou « transmis au syndic »). Évaluations facultatives : `evaluer_artisan_gerant` (trois critères) et `noter_artisan_locataire` (une note). Réouverture possible : `rouvrir_incident` | `clos` | — | [[Intervention et clôture]] |

Chaque geste écrit un événement dans `incident_evenements`. Le fil d'activité du dossier se lit dans l'ordre réel
(libellés : `TYPES_EVENEMENT_INCIDENT`, `app/src/lib/incidents.ts`).

## Règles qui bornent le parcours

- **Pas d'artisan sans imputation** (RM-7.2.7) : retenir un devis exige un incident qualifié, et la base refuse un
  état au-delà de « qualifié » sans imputation justifiée.
- **Pas de clôture pendant l'intervention** (RM-7.5.1) : `cloturer_incident` refuse l'état `en_cours`.
- **Pas de fin d'intervention sans photo du travail réalisé** (RM-7.5.2).
- **La réouverture repasse par la qualification** : `clos → rouvert → qualifie`, jamais `clos → declare`.
- **Devis obligatoire pour confier une mission** : la mission naît du devis retenu (`retenir_devis` est la seule
  fonction qui crée `incident_interventions`). Le seuil de délégation du [[Mandat de gestion]] prévu par le module 7
  n'a pas été retrouvé dans ce geste (à vérifier).
- **Filtre des artisans** : métier, zone, validation de la plateforme, listes noires, et décennale selon la nature des
  travaux (RM-8.2.9). La base le calcule ; voir [[Demande et sélection de devis]].
- **Le locataire informé avant l'intervention**, sa contestation tracée sans bloquer (RM-7.2.4/5) : [[Incident]].

## Déclaration au téléphone (module 19)

La déclaration du [[Locataire]] est pensée d'abord pour le téléphone : il photographie sur le vif. Le module 19
demande trois écrans au plus (RM-19.2.1), la photo avant la description (RM-19.2.2) et un statut visible depuis
l'accueil (RM-19.2.3). La base accepte depuis le 11/09 une déclaration sans description (`20260911122000`).

Côté [[Artisan]], le compte rendu se fait depuis le chantier, photo au centre (RM-19.3.1/2).

## Résultat / sorties

- Un incident clos, motivé, avec son historique complet (`incident_evenements`).
- Le compte rendu de l'artisan ; la facture validée et ses règlements déclarés ; l'écriture de dépense au journal.
- Les évaluations de l'artisan, s'il y en a.
- Les documents du dossier : ordre d'intervention, compte rendu d'intervention, récapitulatif d'incident
  ([[Intervention et clôture]]).

## Automatisations et avis

- **E-mails** : un e-mail court, avec un seul lien vers l'écran du geste, à la personne qui doit agir. Le circuit est
  `app/src/lib/notifications.ts`, puis `app/src/lib/notifications-transactionnelles.ts`. Les événements admis sont
  listés dans `circuitAdmisPilote` (`app/src/lib/perimetre-pilote.ts`) : incident urgent, demande de devis, devis
  reçu, mission confiée, acceptée ou refusée, créneaux proposés, rendez-vous fixé, report demandé ou accepté.
- **Rappel de rendez-vous** (sept jours avant, puis la veille) : un envoi automatique fermé par défaut, que seul le
  superviseur ouvre (`app/src/lib/envois-suspendus.ts`) ; voir [[Planification d'intervention]].
- **Dans l'espace** : alertes du gestionnaire, file « À traiter », messages non lus de la discussion d'intervention
  (`20261122180000`).

> [!warning] Points à trancher / contradictions
> - **Ordre facture / clôture non imposé.** `cloturer_incident` n'examine ni la facture ni son règlement, et
>   `deposer_facture_artisan` ne regarde que l'état de la mission (`terminee`), pas celui de l'incident. Un incident
>   peut donc être clos avant le dépôt ou le règlement de la facture. Constat tiré de la lecture du code. Ordre voulu
>   par le métier : à vérifier.
> - **Annulation d'une mission en cours** : la base ramène l'incident à « qualifié », alors que la table des
>   transitions de l'écran ne le prévoit pas ([[Incident]], encadré).
> - **Seuil de délégation du mandat** (module 7 : devis obligatoire au-delà du seuil) : non retrouvé dans le code ; en
>   pratique, toute mission passe par un devis retenu. À vérifier.
> - **Intention produit v0** ([[2026-07-21-fonctionnalites-par-persona-v0]]) : escalade au propriétaire en l'absence
>   d'accord sur la date. Non retrouvée dans le code. L'arbitrage du rendez-vous revient au gestionnaire
>   ([[Planification d'intervention]]).
> - **Urgence hors horaires** : renvoyée à la V2 par le module 7 ; aucun circuit d'astreinte dans le code (à vérifier).
