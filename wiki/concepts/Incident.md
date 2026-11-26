---
type: concept
tags: [incident, sinistre, imputation]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[2026-07-24-gerimmo-v3-module-7-incidents]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "app/supabase/migrations/20260821093624_s7_incidents_fondation.sql et migrations suivantes citées dans la page", "app/src/lib/incidents.ts", "app/src/app/actions/incidents.ts"]
---

# Incident

**Définition :** un problème signalé sur un logement ([[Lot]]) ou sur les parties communes d'un [[Bien]] : panne,
sinistre, désordre. Il appelle une décision du gestionnaire et souvent l'intervention d'un [[Artisan]].

Table `incidents`, créée par `app/supabase/migrations/20260821093624_s7_incidents_fondation.sql` puis complétée.
Les libellés, catégories et transitions affichés à l'écran sont dans `app/src/lib/incidents.ts`. Les gestes du
gestionnaire sont dans `app/src/app/actions/incidents.ts`.

**Toutes les écritures passent par des fonctions de la base** (`security definer`). La table n'a aucune règle
d'insertion ni de modification directe. Une transition non prévue est donc refusée par construction (commentaire
d'en-tête de la migration du 21/08).

## La table `incidents` (relue le 26/11/2026)

| Groupe | Colonnes | Migration |
|---|---|---|
| Identité | `id`, `organization_id`, `numero` : unique par organisation, de la forme `INC-AAAA-0001` (fonction `incident_prochain_numero`) | `20260821093624` |
| Où | `lot_id` (facultatif depuis le 01/11), `bien_id` (ajouté le 01/11, rempli d'office depuis le lot), `bail_id`, `piece` | `20260821093624`, `20261101161444` |
| Qui | `declarant_person_id`, `canal` (`espace_locataire` ou `agence`), `responsable_account_id`, `created_by` | `20260821093624` |
| Quoi | `categorie` (liste fermée de 13 valeurs), `description`, `anciennete`, `urgence` (`normale` ou `urgente`) | `20260821093624`, `20260821135221` |
| Saisie depuis la fiche du bien | `titre` (150 caractères au plus), `date_signalement`, `commande_declaration` (un second envoi du formulaire est sans effet) | `20261101154004` |
| Imputation | `imputation` (`locataire`, `proprietaire` ou `degradation_fautive`), `imputation_justification`, `imputation_contestee_le`, `imputation_contestation` | `20260821093624` |
| Clôture | `cloture_motif` (`resolu`, `sans_suite` ou `transmis_syndic`), `cloture_commentaire`, `clos_le`, `clos_par` | `20260821093624` |
| Disponibilités du locataire | `disponibilites_locataire` (300 caractères au plus), `disponibilites_locataire_le` | `20261122233000` |
| État | `etat` : les sept états ci-dessous | `20260821093624` |

**Ce qui n'est pas une colonne.**
- **Les photos** sont des pièces de la GED, liées à l'incident par `document_liens` (entité `incident`). Dix au plus
  par incident (`20260821135221`).
- **L'historique** est la table `incident_evenements`, en ajout seul. Sa liste de types est fermée. Elle s'allonge à
  chaque lot : déclaration, qualification, contestation, devis, mission, créneaux, compte rendu, facture, règlement,
  report de rendez-vous, urgence corrigée, etc. Les libellés sont dans `TYPES_EVENEMENT_INCIDENT`
  (`app/src/lib/incidents.ts`).

**Contraintes qui portent une règle métier.**
- `incidents_qualifie_impute` : au-delà de « déclaré » et « rouvert », l'imputation et sa justification sont
  obligatoires. Seule exception : un incident clos « sans suite » ou « transmis au syndic ». Affecter un artisan sans
  imputation est donc impossible (RM-7.2.7).
- `incidents_clos_motive` : un incident est clos si et seulement s'il porte un motif et une date de clôture.
- `incidents_contexte_requis` : un incident porte un lot ou un bien. Sans lot (parties communes), il ne s'attribue ni
  à un bail ni à un locataire (déclencheur `verifier_contexte_incident_bien`, `20261101161444`).
- `incidents_categorie_connue` : la catégorie appartient à la liste fermée (`20260821135221`), la même que
  `CATEGORIES_INCIDENT` dans `app/src/lib/incidents.ts`.
- `incidents_description_non_vide` : la description est facultative, mais une description saisie n'est jamais vide
  (`20260911122000`).

## Les sept états

Le vocabulaire est celui du registre A5 (`declare` à `rouvert`). L'ancien vocabulaire (`nouveau`, `en_cours`,
`cloture`, `archive`) et l'ancienne échelle de priorité (basse, normale, haute, urgente) n'existent plus. L'urgence n'a
que deux valeurs.

| État | Libellé du gestionnaire | Comment on y entre (fonction de la base) |
|---|---|---|
| `declare` | À qualifier | `incident_creer`, appelée par chaque porte de déclaration (voir plus bas) |
| `qualifie` | Qualifié | `qualifier_incident`, depuis `declare`, `rouvert` ou `qualifie` (requalification). Retour depuis `affecte` si l'artisan refuse la mission (`refuser_mission`), ou depuis `affecte` et `en_cours` si la mission est annulée (`annuler_mission`) |
| `affecte` | Affecté | `retenir_devis` : le devis retenu crée la mission (`incident_interventions`, statut `proposee`) |
| `en_cours` | En cours | `accepter_mission` (l'artisan accepte) ou `demarrer_intervention` |
| `termine` | Terminé — à clôturer | `deposer_compte_rendu` : compte rendu et photo « après » obligatoires (RM-7.5.2) |
| `clos` | Clos | `cloturer_incident`, depuis `declare`, `qualifie` ou `termine` ; jamais depuis `en_cours` (RM-7.5.1) |
| `rouvert` | Rouvert — à requalifier | `rouvrir_incident`, depuis `clos` ; l'imputation est remise à zéro (`20260821141744`) |

Sources : `20260821093624`, `20260823113000`, `20260911180000_module8_artisans_socle.sql`,
`20260911240000_module8_correctifs_bloquants.sql` ; libellés : `ETATS_INCIDENT`.

**L'état de l'incident n'est pas celui de la mission.** La mission a sa propre machine : `proposee → acceptee →
planifiee → en_cours → terminee`, plus `refusee` et `annulee` (type `intervention_statut`, `20260911180000`). Un
incident passe « en cours » dès que l'artisan accepte, avant même le rendez-vous.

**Motifs de clôture selon l'état** (`cloturer_incident`, `20260821135221` ; miroir `MOTIFS_CLOTURE_PAR_ETAT`) :
- un incident déclaré se classe « sans suite » ou « transmis au syndic », jamais « résolu » ;
- un incident qualifié ou terminé se clôture « résolu » ou « transmis au syndic », jamais « sans suite ».

La clôture ferme toutes les alertes ouvertes de l'incident.

**La file « À traiter »** du gestionnaire regroupe les états `declare`, `rouvert` et `termine`. S'y ajoute tout
incident non clos qui a un devis reçu en attente de décision (`incidentsATraiter`, décision D19).

**Le locataire lit son statut dans ses mots** (`libelleEtatLocataire`) : « Reçu — votre gestionnaire l'examine »,
« Pris en charge par le propriétaire », « À votre charge », « Un artisan s'en occupe », etc. En gestion directe, le
mot « gestionnaire » devient « bailleur ».

## Les portes de déclaration

- **Le locataire, depuis son espace** : réservé au locataire d'un bail actif ou en préavis, principal ou colocataire
  (RM-7.1, `declarer_mon_incident`). L'application appelle `declarer_mon_incident_reprise`, qui rend un second envoi
  sans effet (`20261013100000`).
  - La photo vient en premier ; sans description, la déclaration passe (RM-19.2.2, `20260911122000`).
  - Il peut dire ses disponibilités dès le signalement, puis les corriger tant que le dossier n'est pas clos
    (`indiquer_mes_disponibilites_incident`, `20261122233000`). C'est une indication, qui ne réserve aucun créneau.
  - Un incident **urgent** part aussitôt par e-mail au gestionnaire. L'envoi est mémorisé : une reprise le renvoie
    tant qu'il n'est pas parti (`20261014401000`).
- **Le gestionnaire, depuis l'écran « Incidents »** (`ouvrir_incident_agence`). Un bail n'est rattaché que s'il est
  choisi ou s'il est le seul bail en cours du lot. Sinon l'incident reste sur le lot et aucun locataire ne le voit.
  Pour le canal « agence », le déclarant reste vide (`20261027100100`).
- **Le gestionnaire, depuis la fiche du bien** (`declarer_incident_bien_simple`) : titre, date, note, catégorie et
  urgence (`20261122220000`). Pour tout le bien (parties communes), seul le propriétaire en gestion directe peut
  déclarer (`20261101161444`).

**À la création**, la base ouvre l'alerte « Incident à qualifier », critique si l'incident est urgent. Elle signale
un doublon possible sans bloquer : même lot, même catégorie, incident non clos (`incident_creer`). Cette alerte tient
lieu de la « fiche type » envoyée au gestionnaire (intention produit v0, commentaire de `incident_creer`).

**Après la création :**
- le gestionnaire corrige l'urgence, avec un motif, tant que l'incident n'est pas clos (`corriger_urgence_incident`,
  `20261122140000`) ;
- l'attribution du dossier remplit `responsable_account_id` (`attribuer_incident`). Un agent ne prend qu'un dossier
  libre ou rend le sien. L'administrateur de l'agence ou le propriétaire réattribue.

## L'imputation : « qui paie »

Règles du module 7 ([[2026-07-24-gerimmo-v3-module-7-incidents]]), avec ce que fait le code :
- **Trois imputations** : locataire (réparations locatives du décret 87-712) ; propriétaire (vétusté, malfaçon, force
  majeure, gros œuvre, remplacement) ; dégradation fautive. Type `incident_imputation`.
- **Décidée par le gestionnaire, sans proposition automatique** (RM-7.2.1). La cause ne se déduit pas de la
  catégorie : une canalisation bouchée par négligence est locative, par vétusté elle ne l'est pas.
- **Justification obligatoire et opposable** (RM-7.2.3) : contrainte `incidents_qualifie_impute`, et refus dans
  `qualifier_incident`.
- **Le locataire est informé immédiatement**, avant l'intervention et non à la facture (RM-7.2.4). **Sa contestation
  est tracée sans bloquer** (RM-7.2.5, `contester_imputation`, alerte « incident contesté »).
- **Aucune affectation d'artisan sans imputation** (RM-7.2.7) : impossible par construction (voir plus haut).
- **Requalification** (revue du 23/08, `20260823113000`) : la qualification reste ouverte aux états `declare`,
  `rouvert` et `qualifie`, et refusée au-delà (« Cet incident ne se qualifie plus »). Requalifier, ou maintenir
  l'imputation, répond à une contestation. Cela solde les alertes « à qualifier » et « contestée » sans clôturer.
- **Révision après diagnostic** (RM-7.5.3), tranchée le 11/09 (`20260911180000`) :
  - dans son compte rendu, l'artisan signale une cause différente (`cause_reelle`, `imputation_suggeree`) ;
  - si l'imputation qu'il suggère diffère de celle posée, l'alerte critique « Imputation à réviser avant
    facturation » s'ouvre ;
  - le gestionnaire révise alors par `reviser_imputation_apres_diagnostic`, aux seuls états `en_cours` et `termine`,
    et seulement après ce signalement.

  La contradiction relevée le 10/09 (RM-7.5.3 inapplicable) est ainsi levée.
- **Parties communes** : elles ne s'imputent pas. Elles se clôturent « transmis au syndic » (RM-7.1.4).
- **Photo du travail réalisé obligatoire** pour terminer (RM-7.5.2), dans `deposer_compte_rendu`.
- **Clôture possible sans artisan** (RM-7.6.1) : un incident qualifié se clôture « résolu ».

Autres règles du module 7, non vérifiées dans le code :
- le [[Propriétaire bailleur|mandant]] n'est informé que par le [[Rapport de gestion]] (RM-7.8.1) ;
- l'urgence hors horaires relève de la V2 (numéro d'astreinte en V1).

## Relations

- Cible un [[Lot]], ou les parties communes d'un [[Bien]]. Rattaché au [[Bail]] quand il y en a un. Déclaré par un
  [[Locataire]] ou saisi par le gestionnaire.
- Responsable : [[Agent immobilier]] ou [[Administrateur d'agence]] en agence, [[Propriétaire bailleur]] en gestion
  directe.
- Donne lieu à : consultation et [[Devis]], mission d'intervention, compte rendu, facture et règlement déclaré
  ([[Intervention et clôture]]), et des [[Document|documents]] (ordre d'intervention, compte rendu d'intervention,
  récapitulatif d'incident).
- Déroulé complet : [[Cycle de vie d'un incident]]. Machines à états : [[Machines à états et événements]]. Schéma :
  [[Modèle de données]].
- Aucun robot de messagerie : la déclaration se fait dans l'espace, les avis partent par e-mail
  ([[Canaux de communication]]).

> [!warning] Points à trancher / contradictions
> - **Écran ≠ base sur une transition.** `annuler_mission` ramène un incident `en_cours` à `qualifie`
>   (`20260911240000_module8_correctifs_bloquants.sql`, lignes 177-178). Or `TRANSITIONS_INCIDENT`
>   (`app/src/lib/incidents.ts`) n'autorise depuis `en_cours` que `termine`. La base décide de l'écriture ; la table
>   TypeScript sert à l'affichage et aux formulaires. Écart à vérifier, puis à aligner.
> - **Requalification du 23/08** : règle constatée dans le code, toujours sans identifiant RM. Aucune confirmation
>   écrite du dirigeant n'a été retrouvée (à vérifier). Elle amende de fait RM-A5.1.
> - **Incident « scindable en deux imputations »** (module 7) : le schéma ne porte qu'une imputation par incident. La
>   scission n'est pas construite (à vérifier qu'aucun autre geste ne la remplace).
