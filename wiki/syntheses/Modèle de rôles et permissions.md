---
type: synthesis
tags: [roles, permissions, rbac, multi-tenant]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]"]
---

# Modèle de rôles et permissions

Synthèse transverse des [[Super Admin|personas]] et de leur autorisation. Voir aussi
[[Isolation multi-organisation]].

## Principe directeur V3 : le rôle est porté par l'adhésion
Le [[2026-07-24-gerimmo-v3-a1-modele-identite|Livrable A1]] (2026-07-24) pose que le **rôle
applicatif est porté par l'adhésion** (compte + agence + rôle + état), **pas par la
personne** (RM-A1.5) — voir [[Compte, personne et adhésion]]. Une même personne peut donc
avoir des rôles différents selon l'agence. Conséquences : l'invitation (module 16) **crée
une adhésion, pas un compte** ; l'administration des rôles (module 18) opère sur les adhésions.
`organization_members` (ci-dessous) est l'implémentation actuelle de cette adhésion.

## Cible V3 (module 18, 2026-07-24) : trois rôles figés
- **Trois rôles seulement : agent, admin agence, super admin** (RM-18.1.1) — « aucun
  rôle personnalisé ni permission fine en V1 » (RM-18.1.2, personnalisation en V2).
  Locataire, artisan et propriétaire direct ont des **espaces** (module 16), pas des
  rôles d'administration ; le mandant n'a rien.
- **Un agent ne voit que les dossiers de ses mandats** (RM-18.1.3 — restriction
  majeure vs le code où tout membre voit l'organisation) ; l'admin = agent ++ +
  réouverture de période, vue retards, grilles, invitations, blacklist locale ;
  le SA = agences, modèles, blacklist globale, contestations.
- **Désactivation d'un agent bloquée** tant que ses mandats ne sont pas réaffectés
  (RM-18.1.4) ; **transfert temporaire** (absence) sans changer le titulaire,
  restitution en un clic (RM-18.1.6/7 — répond à P1.1) ; équipes : hors périmètre.
- Le **journal d'audit** (18.5) trace ~10 actions sensibles — conservé **3 ans**
  (RM-A2.6/18.5.2 corrigée : plus « jamais purgé »,
  [[2026-07-24-gerimmo-v3-a2-conservation-rgpd|A2]]).

## Deux axes qui se recoupent (code actuel)
- **`roles.key`** (rôle applicatif) → utilisé par les policies RLS via `has_organization_role(...)`.
- **`organization_members.member_type`** → route vers un « portail » côté produit.

| member_type | roles.key | Portail | Persona |
|---|---|---|---|
| admin | administrateur_agence | AGENCE | [[Administrateur d'agence]] |
| agent | agent_immobilier | AGENCE | [[Agent immobilier]] |
| owner | proprietaire | PROPRIÉTAIRE | [[Propriétaire bailleur]] |
| contractor | artisan | ARTISAN | [[Artisan]] |
| tenant | locataire | LOCATAIRE | [[Locataire]] |
| (—) | super_admin | /admin | [[Super Admin]] |

## Hiérarchie effective
`super_admin` (plateforme) > `administrateur_agence` (agence) > `agent_immobilier` (opérationnel) ;
en parallèle `proprietaire` (autonome s'il est indépendant) ; `artisan` et `locataire` = accès
périmétrés à ce qui leur est partagé.

- **Héritage admin → agent** : l'`administrateur_agence` est un **« agent immobilier ++ »** : il
  possède **toutes** les capacités de l'`agent_immobilier` **plus** la gestion des utilisateurs
  (`can_manage_users`) et de l'organisation (`can_manage_organization`).
- **Artisan, deux approbations distinctes** : le `super_admin` **valide l'artisan globalement**
  (droit d'exister sur la plateforme) ; l'**approbation par intervention** — la sélection de son
  devis — revient au `proprietaire` **ou** à l'`agent_immobilier`/`administrateur_agence`, jamais au
  `locataire`. Voir [[Artisan]] et [[Demande et sélection de devis]].

## Fonctions d'autorisation (SQL, SECURITY DEFINER)
`is_super_admin()`, `has_organization_role()`, `is_active_organization_member()`,
`can_manage_users()` (super_admin + admin agence), `can_manage_organization()` (+ propriétaire sur
sa propre org), `can_access_profile()` (+ agent), `can_manage_rent()`.

## Types d'organisation
`agency` / `independent_owner` / `internal` (voir [[Organisation]]). Les offres d'[[Abonnement]] ont
une `audience` (`owner` vs `agency`).

> [!warning] Incohérences à trancher
> 0. **6 rôles du code vs 3 rôles V3** (module 18) : le référentiel réserve « rôle »
>    au staff (agent/admin/SA) et traite locataire/artisan/PD comme des espaces.
>    Migration de vocabulaire et de `roles.key` à cadrer. Le **périmètre par mandat**
>    de l'agent (RM-18.1.3) n'existe pas dans le code (visibilité org entière).
> 1. **Doc obsolète** : `docs/02-roles-permissions.md` liste des rôles fictifs (Gestionnaire,
>    Collaborateur, Lecteur…) absents du code. À réconcilier avec les 6 rôles réels du `seed.sql`.
> 2. **Deux vocabulaires parallèles** (`roles.key` vs `member_type`) sans contrainte DB les liant —
>    cohérence portée par la convention applicative `memberTypeToPortalType`.
> 3. **RBAC fin dormant** : tables `permissions`/`role_permissions` existent mais **non peuplées** ;
>    tout le contrôle réel est codé en dur dans les fonctions SQL.
> 4. **Portail `user`** : fallback front sans rôle correspondant dans le seed.
>