---
type: persona
tags: [role, locataire]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-07-24-gerimmo-v3-module-9-devis-et-facturation]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]"]
---

# Locataire

**En une phrase :** occupant d'un logement géré dans GERIMMO.

Nom technique : rôle `locataire` (scope `organization`), `member_type = tenant`,
portail **LOCATAIRE** (le plus restreint). Aussi `bien_occupants.occupant_type = 'locataire'`.

## Rôle et objectifs
- Suivre son logement, **signaler et suivre des [[Incident|incidents]]**, consulter ses
  [[Document|documents]] (dont les [[Quittancement des loyers|quittances]]), échanger.

## Responsabilités / activités
- Déclarer un incident (dashboard ou **bot** Telegram/WhatsApp).
- **Déposer son attestation d'assurance habitation chaque année** depuis son espace
  (module 0b, RM-0b.5.1 — obligation légale, alerte J-30 ; seul parcours du
  [[Dossier locataire]] où il agit de lui-même). Peut aussi déposer tout document
  réclamé par le gérant (RM-0b.2.5). Un dépôt notifie l'agence.
- Choisir un créneau d'intervention ([[Planification d'intervention]]).
- **Quand un incident lui est imputé** (module 9) : il **choisit** — faire intervenir
  son propre artisan et payer en direct (preuve de résolution exigée dans un délai,
  sinon l'agence reprend la main), ou passer par l'agence et être refacturé (créance
  sur son bail). L'incident reste ouvert dans les deux cas.
- **Autour du [[Bail]]** (module 1) : signer électroniquement (Yousign, en premier
  dans l'ordre séquentiel), signer les [[État des lieux|états des lieux]] en tactile
  sur place, **consulter son bail signé** et ses annexes (1.14 — jamais le PDF non
  signé ni le dossier des autres colocataires), donner congé (LRAR hors plateforme ;
  préavis réduit à 1 mois sur justificatif obligatoire).
- **Autour du [[Dépôt de garantie]]** (module 2) : suivre son dépôt depuis son espace
  (montant, date d'encaissement, délai de restitution en cours — mais **jamais les
  retenues en cours de calcul**, RM-2.6.2), voir l'identité de son garant, puis
  **recevoir le décompte de restitution** (2.7 : détail de chaque retenue avec coût,
  âge et décote, justificatifs consultables) et le contester via la messagerie
  (module 15). Voir [[Restitution du dépôt de garantie]].
- **Noter la « qualité du travail » de l'[[Artisan]]** après intervention (précision humaine,
  2026-07-22 — l'un des 3 niveaux de notation, voir [[Artisan]]).
- Consulter les documents de son logement, communiquer. **Côté loyers** (module 3.12) :
  échéancier à venir, quittances et reçus **sur toute la durée de conservation**
  (10 ans — matrice A2 ; reformule le « sans limite de durée » du 3.12, décision du
  2026-07-25), solde en cours,
  régularisations **avec justificatifs**, relances reçues — jamais les commentaires
  internes de l'agence (RM-3.12.2).

## Permissions clés
- Portail le plus restreint : `view:dashboard/incidents/documents/communication` uniquement.
- **Aucune** capacité de gestion (`manage:*`) ni de supervision.
- Accès « limité à son logement et ses demandes autorisées ».
- Ne voit que ses propres quittances.

## Usage mobile (module 19)

Contexte : « chez lui, souvent au moment du problème ». **Le parcours qui compte est
la déclaration d'incident** (7.1) : il photographie sur le vif — s'il devait ouvrir
un ordinateur, il appellerait et l'agence perdrait la photo prise au bon moment.
Contraintes actées : **trois écrans maximum** (RM-19.2.1), **la photo est le premier
champ, avant la description** (RM-19.2.2 — deux photos + la pièce suffisent, aucune
autre saisie obligatoire), **statut de l'incident visible depuis l'accueil**
(RM-19.2.3). Il ne connaît pas l'application et écrit peu : catégorie en liste,
description courte. 7 autres parcours déclinés en mobile : attestation d'assurance
(0b.5), quittances (3.12), créneaux (10.2), notation (11.1), messagerie (15.1),
signature du bail (13.2, circuit Yousign externe). Aucune règle métier modifiée
(RM-19.2.4).

## Locataire dans plusieurs agences (Livrable A1, 2026-07-24)
Cas tranché par le [[Compte, personne et adhésion|modèle canonique d'identité]] :
- **Un seul compte** (email unique plateforme), **une adhésion par agence** ; à la connexion,
  sélecteur d'espace si plusieurs adhésions actives.
- **Une fiche Personne par agence** : les pièces du dossier **ne circulent jamais** entre
  agences (RM-A1.10, confirme RM-0b.7.3) — il refournit ses pièces à chaque agence.
- Fin de bail : l'adhésion passe en **inactive** (l'historique reste accessible via les autres
  espaces actifs) — c'est le cas du déménagement inter-agences qui a motivé le compte global :
  ne pas perdre l'accès aux quittances au moment du solde de tout compte.

## Relations
- Rattaché à un [[Bien]] via [[Occupation d'un bien|bien_occupants]].
- Visible par son [[Propriétaire bailleur|propriétaire]] et les gestionnaires de l'agence.
- Interagit avec l'[[Artisan]] lors du choix des créneaux. Voir [[Modèle de rôles et permissions]].

> [!warning] Points à trancher / contradictions
> - Points de douleur métier non explicités dans les sources — à recueillir (entretiens).
>