---
type: business-rule
tags: [multi-tenant, securite, rls]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Isolation multi-organisation

**Énoncé :** les données d'une [[Organisation]] ne doivent **jamais** être visibles ou
accessibles par une autre organisation.

## Fondement
- Principe directeur `docs/00-principes-gerimmo.md`.
- Implémentation : `organization_id` sur presque toutes les tables + **RLS activée partout** ;
  autorisation via fonctions SQL `SECURITY DEFINER`.

## Fonctions d'autorisation clés
- `is_super_admin()` — bypass global ([[Super Admin]]).
- `has_organization_role(org, keys[])` — cœur du contrôle par organisation.
- `is_active_organization_member(org)` — appartenance active.
- `can_manage_users()`, `can_manage_organization()`, `can_manage_incidents()`, `can_manage_rent()`,
  `is_agency_organization()`.

## Garde-fous notables
- Un même profil peut appartenir à **plusieurs** organisations → droits évalués **par organisation**
  (ex. un [[Propriétaire bailleur]] membre d'une agence n'administre pas l'org de l'agence).
- Durcissement (migrations 2026-07-16/19) : `execute` des helpers révoqué à `anon`/`public` ;
  `DELETE` réservé au super admin.

## Trois niveaux de données (Livrable A1, 2026-07-24)
Le [[2026-07-24-gerimmo-v3-a1-modele-identite|modèle canonique d'identité]] précise la frontière :

| Niveau | Exemples | Règle d'accès |
|---|---|---|
| **Données d'agence** | Biens, lots, baux, écritures, mandats | **Cloisonnées strictement** |
| **Données partagées** | Profil [[Artisan|artisan]] public, modèles Gerimmo | Lisibles selon la visibilité choisie |
| **Données globales** | Comptes, personnes, indices IRL | Lisibles par les agences concernées |

Exigences associées (bloquantes pour la V3) :
- **RM-A1.6** — `organization_id` obligatoire sur toute table de données d'agence.
- **RM-A1.7** — **un test d'isolation automatisé par table** (une agence ne lit jamais les
  données d'une autre). C'est la **contrepartie du compte global** : le compte unique
  simplifie l'expérience mais concentre le risque ([[Compte, personne et adhésion]]).
- **RM-A1.10** — les pièces d'un dossier ne franchissent jamais une frontière d'agence.
- **RM-A1.11** — la traversée par le [[Super Admin]] est autorisée mais **journalisée**
  (au journal d'audit, 3 ans — A4).
- **RM-A1.12** — identifiants techniques jamais séquentiels (non devinables).

Le [[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] reprend ces quatre règles
comme volet « cloisonnement applicatif » du [[Socle de sécurité]] — avec en plus la
base **non exposée publiquement** et le chiffrement au repos (RM-A4.6).

## Implémentation cible : RLS, décision actée (lot 0)
Le [[2026-07-24-gerimmo-v3-architecture-lot-0|lot 0]] confirme et justifie le choix RLS :
« le filtrage applicatif fait reposer l'isolation sur la discipline du code… RLS déplace
la garantie dans Postgres : même si le code se trompe, la base refuse de renvoyer les
lignes. » Politique type : lecture des lignes dont `organization_id` figure dans les
`memberships` **actifs** du compte connecté ; écriture = même filtre + contrôle du rôle ;
super admin en politique dédiée avec traversée journalisée.

Deux tests non négociables, exécutés **à chaque livraison** :
1. **Test d'isolation par table** (RM-A1.7) — créer deux agences, une ligne chacune,
   vérifier que chacune n'en voit qu'une.
2. **Test « RLS actif partout »** — parcourir le catalogue Postgres et échouer si une
   seule table de données d'agence n'a pas de politique (« une table créée sans
   politique est lisible par tout le monde »).

Vigilance performance : la sous-requête `memberships` s'exécute à chaque ligne — à
remplacer par une fonction `stable` ou l'agence dans le jeton de session si besoin,
**à mesurer dès le lot 1B**.

## Conséquences si non respectée
- Fuite de données entre clients — faille critique.

## Implications pour l'application
- Toute nouvelle table métier doit porter `organization_id` + policies RLS. Voir [[Modèle de rôles et permissions]].
- Écrire le test d'isolation **en même temps** que chaque nouvelle table (RM-A1.7).
