---
type: concept
tags: [multi-tenant, organisation, socle]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]"]
---

# Organisation

**Définition :** l'entité cliente de GERIMMO et la **racine de l'isolation des données**.
Table `organizations`. Chaque donnée métier porte un `organization_id` — c'est l'unité du
multi-tenant.

## Types d'organisation (`organization_type`)
- **`agency`** — agence immobilière professionnelle (gérée par [[Administrateur d'agence]] + [[Agent immobilier]]).
- **`independent_owner`** — [[Propriétaire bailleur]] indépendant, qui est sa propre organisation.
- **`internal`** — entité interne à GERIMMO.

## Attributs métier notables
- `name`, `slug` (unique, kebab-case), `status` (`active`/`suspended`/`archived`).
- **Cible V3 (lot 0)** : `raison_sociale` + états `essai`/`active`/`suspendue`/`archivée`
  — l'état **essai** s'ajoute au vocabulaire actuel ([[Architecture du socle V3]]).
- Identité légale (ajoutée le 2026-07-20 pour les courriers officiels) : `legal_name`,
  `siren`, adresse, contact — voir [[Quittance conforme]] et [[Relances et mise en demeure]].

## Fin de vie d'une agence (A2, 2026-07-24)
**Correction de RM-18.4.4** : une agence n'est plus « archivée, jamais supprimée » —
elle est **archivée 10 ans** (durée comptable) **puis anonymisée**
([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|livrable A2]]). L'agence est par
ailleurs **responsable de traitement** de ses données de gestion locative, Gerimmo
étant son **sous-traitant** (contrat de sous-traitance obligatoire, RM-A2.8) —
voir [[RGPD]].

## Rôle dans le métier
- Sépare hermétiquement les données de chaque client (voir [[Isolation multi-organisation]]).
- Conditionne **qui gère quoi** : agence → admin/agents ; propriétaire indépendant → le propriétaire.
- Porte l'[[Abonnement]] à GERIMMO.

## Relations
- `organizations` (1) ──< `organization_members` >── (1) `profiles` : rattache une personne à une
  organisation avec un `member_type` (`admin`/`agent`/`owner`/`contractor`/`tenant`).
  Dans le vocabulaire du référentiel V3, ce lien correspond à l'**adhésion** du
  [[Compte, personne et adhésion|modèle canonique d'identité]] : compte global + une adhésion
  (rôle + état) par agence, une seule par couple compte × agence (RM-A1.3).
- Un même profil **peut** techniquement être membre de plusieurs organisations (ex. un artisan
  multi-agences). En revanche, **un [[Bien]] relève d'une seule organisation** — propriétaire
  indépendant OU agence, pas les deux ([[Propriétaire bailleur]]).
- Contient : [[Patrimoine et résidences|patrimoines]], [[Bien|biens]], [[Incident|incidents]], [[Document|documents]], etc.
- Voir [[Modèle de rôles et permissions]], [[Modèle de données]].

## Implications pour l'application
- `organization_id` partout + RLS activée ; slug unique ; statut pilotant l'accès.
