---
type: concept
tags: [dossier-locataire, pieces, assurance, garant, versioning]
status: draft
created: 2026-07-24
updated: 2026-07-25
sources: ["[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]"]
---

# Dossier locataire

**Définition :** l'ensemble des **pièces justificatives** d'un [[Locataire]] (et de son
garant), versionnées et datées. **Principe fondateur : le dossier appartient à la
personne, pas au bail** — un locataire qui change de lot dans la même agence garde son
dossier et ne redépose rien.
Source : [[2026-07-24-gerimmo-v3-module-0b-dossier-locataire|Module 0b]].

![Schéma — un seul dossier, réutilisé sur tous les baux successifs dans la même agence](../../raw/assets/GERIMMO-V3-Module-0b-Dossier-locataire/media/f429bf95031f73cfbadd3f426e9695464ef7dcb5.png)

**Hors périmètre (acté)** : la prospection et la sélection du locataire — le module
commence quand le locataire est déjà retenu.

## Portée et accès

- Le dossier **suit la personne au sein de l'agence** (RM-0b.7.2), quel que soit le
  propriétaire du lot ; il ne franchit **jamais** une frontière d'agence (RM-0b.7.3 =
  RM-A1.10 — [[Compte, personne et adhésion]]).
- **Le propriétaire mandant ne voit aucune pièce** (RM-0b.7.4, bloquant) —
  « le mandant reçoit, il ne consulte pas » ([[Propriétaire bailleur]]).
- Trois portes d'accès : fiche personne (tout), fiche lot (locataire en place),
  fiche bail (locataire + garant). Toute consultation est **tracée** (RM-0b.7.5).

## Les pièces

| Catégorie | Déposant | Expire |
|---|---|---|
| Identité, titre de séjour | Agent | Oui (seuils d'alerte, RM-0b.6.5) |
| Revenus, fiscalité, domicile | Agent | Non |
| **Assurance habitation** | **Locataire** | **Oui — annuelle** |
| Sur demande du gérant | Locataire (RM-0b.2.5) | Non |

Une catégorie peut contenir plusieurs pièces (trois bulletins de salaire) ; formats
PDF/JPG/PNG, 10 Mo. **Un dossier incomplet n'empêche pas le [[Bail]]** — il alerte
(RM-0b.2.3).

## Versioning intégral

Toutes les versions sont conservées, aucune écrasée (RM-0b.4.1) ; seule la courante
s'affiche, l'historique reste consultable ; chaque version porte sa date et son
déposant. Usages : litige sur sinistre (quelle assurance couvrait à la date des
faits), contestation de congé, contrôle, retour arrière. Une version antérieure ne se
supprime pas individuellement (RM-0b.4.5). Voir [[Document]].

## Le garant

**Une personne à part entière** (RM-0b.3.1) : sa fiche, ses pièces, réutilisables pour
couvrir plusieurs locataires sans duplication (RM-0b.3.2). Le **lien de garantie est
porté par le bail** (RM-0b.3.3, confirmé par RM-2.2.1) : la fin du bail l'éteint sans
effacer la fiche. L'engagement s'active par l'acte de cautionnement signé (Yousign) ;
garanties Visale/GLI sans garant personne : voir [[Garantie]] (module 2).

## L'attestation d'assurance — cycle annuel critique

Obligation légale annuelle ; seul parcours où le locataire agit seul (dépôt depuis son
espace, RM-0b.5.1 ; un dépôt notifie l'agence).

| Seuil | Destinataire | Effet |
|---|---|---|
| **J-30** | Locataire | Rappel de renouvellement |
| **J-15** | Agence | Relance à effectuer |
| **J+0** | Agence | **Défaut d'assurance constaté** |
| **J+15** | Agence (hebdomadaire) | Motif possible de résiliation |

**Chaque alerte est horodatée et conservée comme preuve** (RM-0b.6.2) — le bailleur ne
peut invoquer le défaut d'assurance que s'il prouve avoir réclamé le document
([[Notification et valeur probante]]). Le défaut **alerte mais ne verrouille rien**
(RM-0b.6.4). Aucune alerte si le bail se termine avant l'échéance. Plus de six mois
sans attestation : alerte critique à l'admin agence. Seuils intégrés au module 14
([[Agenda et échéances]]).

## Purge RGPD (parcours 0b.8 — V2, modèle conçu dès la V1)

**5 ans après la fin du dernier bail** dans l'agence (RM-0b.8.1), compteur relancé par
un nouveau bail. **Suspension automatique si procédure en cours** (impayé, contentieux —
RM-0b.8.3) ; blocage si la personne est encore garante (RM-0b.8.10) ; refus si bail
actif. Alerte agence à J-30 (prolongation possible, justifiée) → **corbeille 3 mois**
restaurable → suppression définitive, tracée au journal d'audit (**3 ans** — RM-A2.6).
**Purgé** : pièces d'identité, revenus, imposition, attestations (base légale
« contrat », bail + 5 ans — matrice A2 ; **supprimables sur demande même avant
terme**). **Conservés au-delà** : l'historique des baux, les quittances, les écritures
comptables (10 ans) — « sinon les rapports de gestion et les exercices passés seraient
cassés » (RM-0b.8.7).
**Correction A2** ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|livrable A2]]) : la
personne n'est plus « jamais supprimée » — identité et coordonnées sont
**anonymisées au terme de l'archivage** (bail + 5 ans), l'historique perdant son
caractère personnel (« Bail nº 1287, lot 47 »). Un contentieux gèle le cycle
(RM-A2.7). Déclenchable manuellement sur demande RGPD du locataire (RM-0b.8.9).
Voir [[RGPD]].

## Relations

Alimente le [[Bail]] (module 1) et les [[Garantie|garanties]] (module 2) ; s'appuie sur
[[Document]] (versioning, stockage) ; alerte via [[Agenda et échéances]] (module 14) ;
dépôt mobile (module 19).
