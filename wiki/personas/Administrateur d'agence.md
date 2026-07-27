---
type: persona
tags: [role, agence]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-0c-copropriete]]", "[[2026-07-24-gerimmo-v3-module-17-marque-blanche]]"]
---

# Administrateur d'agence

**En une phrase :** dirigeant/gérant d'une agence immobilière cliente (une
[[Organisation]] de type `agency`).

Nom technique : rôle `administrateur_agence` (scope `organization`), `member_type = admin`,
portail **AGENCE**.

## Rôle et objectifs
- **Agent immobilier ++** : il **hérite de toutes les capacités** de l'[[Agent immobilier]]
  (gestion opérationnelle : biens, loyers, incidents, devis, documents) **et y ajoute** les droits
  d'administration ci-dessous. Tout ce que l'agent peut faire, l'admin le peut aussi.
- Administrer son organisation, ses membres et ses paramètres.
- Piloter l'activité de gérance (patrimoine, loyers, incidents, documents).

## Responsabilités / activités
- Inviter/gérer les membres, attribuer rôles et statuts.
- **(note produit v0)** Ajouter/supprimer des [[Agent immobilier|agents]], **affecter un [[Bien]] à un agent**, et consulter des **rapports sur les agents** ([[2026-07-21-fonctionnalites-par-persona-v0]]).
- Gérer le patrimoine : [[Patrimoine et résidences|patrimoines/résidences]] et [[Bien|biens]].
- Suivre loyers ([[Période de loyer]]), incidents, documents ; gérer l'[[Abonnement]] de l'agence.
- **Référentiel V3 (socle)** : paramètre la **grille de récupérables** de l'agence
  (module 0c → module 18), la **liste fermée d'équipements** des lots (module 0),
  les **modèles de bail datés** (module 1.16 — mentions légales non retirables),
  les **indices IRL** (saisis 4 fois/an et historisés, [[Révision annuelle IRL]]) et
  les **seuils de relance d'impayés** (montant plancher + délais,
  [[Relances et mise en demeure]]) et la **[[Marque blanche|charte de marque blanche]]**
  (logo + couleurs, si l'option est activée par le SA) ;
  paramètre les **seuils de confort des alertes** (module 14 — les seuils légaux
  restent figés) et dispose de la **vue retards** nominative (escalade à 7/15 jours,
  il traite/réaffecte/renvoie) ; diffuse des **annonces** à ses agents, locataires et
  artisans ; réactive un [[Lot|lot/bien]] archivé (RM-0.9.4) ; destinataire des **escalades**
  (relance d'[[Appel de charges]] restée sans effet — avec pouvoir de renonciation
  motivée et tracée —, purge RGPD du [[Dossier locataire]], défaut d'assurance > 6 mois).

## Permissions clés
- **Socle hérité** : toutes les permissions de l'[[Agent immobilier]] (INSERT/UPDATE sur
  `patrimoines`/`residences`/`biens`, accès aux profils membres, gestion des incidents/devis…).
- **Droits ajoutés (le « ++ ») :**
- `can_manage_users()` = vrai → invitations, gestion des membres et historiques de statut.
- `can_manage_organization()` = vrai → renommer l'org, inviter/suspendre/archiver, assigner rôles.
- Création/modification de patrimoines, résidences, biens ; gestion des loyers (`can_manage_rent`).
- **Non** : ne valide pas les artisans ([[Super Admin]] uniquement) ; pas de `DELETE` (archivage).

## Relations
- Encadre les [[Agent immobilier|agents immobiliers]] de son agence.
- Gère les [[Propriétaire bailleur|propriétaires]], [[Locataire|locataires]] et [[Artisan|artisans]] rattachés.
- Voir [[Modèle de rôles et permissions]].

> [!warning] Points à trancher / contradictions
> - Périmètre exact admin vs [[Agent immobilier|agent]] sur les loyers à confirmer (`can_manage_rent`).
>