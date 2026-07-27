---
type: synthesis
tags: [architecture, socle, lot-0, rls, pg-cron, supabase]
status: draft
created: 2026-07-24
updated: 2026-07-25
sources: ["[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Architecture du socle V3

Le **lot 0** traduit les livrables transverses A1–A6 en socle technique : identité,
isolation, documents, événements, alertes et audit — **aucun écran ni donnée métier**.
Pile : **Next.js / Supabase / Vercel**.
Source : [[2026-07-24-gerimmo-v3-architecture-lot-0]].

![Schéma — neuf tables, aucune donnée métier](../../raw/assets/GERIMMO-V3-Architecture-lot-0/media/6b286b6c84e9dcc7d8693c1c9ec08580d3f0ded0.png)

## Les neuf tables

| Table | Rôle | Livrable |
|---|---|---|
| `organizations` | L'agence — racine de l'isolation (états : essai, active, suspendue, archivée) | A1 |
| `accounts` | Compte global, email unique, `mfa_actif` | A1 |
| `persons` | Identité métier, **par agence** ; aucune référence obligatoire vers `accounts` (RM-A1.4) | A1 |
| `memberships` | Compte + agence + rôle + état ; `unique (account_id, organization_id)` | A1 |
| `documents` + `document_liens` | Fichiers ; rattachement multiple sans arborescence | A3 |
| `events` | Webhooks ; `unique (source, identifiant_ext)` = idempotence | A5 |
| `audit_log` | Actions sensibles, **3 ans** | A2, A4 |
| `tech_log` | Connexions et erreurs, **6 mois** | A2, A4 |
| `alerts` | Échéances et escalades | A5 |
| `retention_rules` | Les 32 durées de conservation et sorts finaux, en table | A2 |

Correspondance avec le modèle métier : voir [[Compte, personne et adhésion]] et
[[Modèle de données]].

## Isolation : RLS Postgres (décision actée)

La garantie est **dans la base, pas dans le code** : une requête sans filtre ne renvoie
rien. Voir [[Isolation multi-organisation]] pour la politique type, le test d'isolation
par table et le test « RLS actif partout ». Super admin : politique dédiée, traversée
journalisée (RM-A1.11) ; MFA obligatoire (RM-A4.1). Point de vigilance performance :
la sous-requête `memberships` s'exécute à chaque ligne — fonction `stable` ou agence
dans le jeton de session, **à mesurer dès le lot 1B**.

## Documents et stockage

Pas de dossiers : le **type** du document pilote droits et conservation ;
`document_liens` rattache un même document à plusieurs entités (lot, bail, personne,
mandat, incident). Supabase Storage, **jamais d'URL directe** — lien signé à expiration
courte (RM-A4.10) ; chiffrement au repos (RM-A4.6) ; **antivirus à l'upload** avant
disponibilité (RM-A4.8, champ `analyse_av`, service à choisir) ; formats PDF/JPG/PNG
avec vérification du type réel (RM-A4.9). Voir [[Document]].

## Tâches planifiées : pg_cron (pas n8n)

Six tâches idempotentes (« deux exécutions, un seul effet ») : détection d'échéances,
escalade des alertes (RM-14.4.1), purge des journaux (selon `retention_rules`), purge
des événements (> 30 j), application des sorts RGPD, relance de la file (horaire).

La [[2026-07-24-gerimmo-v3-matrice-tracabilite|matrice de traçabilité]] confirme le
partage : sur les 71 règles transverses, **20 sont purement architecturales** et vivent
dans le lot 0 uniquement ; RM-A1.6 (`organization_id` partout), seule règle
universelle, vit dans les conventions ci-dessous.

## Conventions de développement (extraites de la matrice de traçabilité)

`organization_id` + politique RLS sur chaque table métier (test d'isolation) · UUID en
clé primaire · deux dates sur les écritures comptables (RM-4.1.2, contrainte) · aucune
suppression physique d'écriture (RM-A6.3) · transaction sur les effets immédiats
(RM-A5.3) · antivirus avant disponibilité · aucun accès direct au stockage ·
journalisation des actions sensibles (RM-18.5.1).

## Séquence de construction

| Étape | Contenu | Critère de fin (démontré par test) |
|---|---|---|
| 1 — Identité | accounts, organizations, memberships, RLS | **Deux agences isolées** |
| 2 — Accès | Authentification, MFA, sessions, rôles (exigences [[Socle de sécurité|A4]] : mots de passe 12 car. vérifiés contre les fuites, sessions par rôle) | Un agent voit ses données |
| 3 — Documents | documents, liens, stockage, antivirus | Un fichier déposé et relu |
| 4 — Événements | events, file, webhooks | Un doublon ignoré |
| 5 — Exploitation | alerts, audit_log, pg_cron, conservation | Une alerte créée et purgée |

**Bloquent le lot 1A** : étapes 1–3 + authentification. Étapes 4–5 parallélisables.
Antivirus et sorts RGPD : avant le pilote.

Le [[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] fixe le cadre non
négociable de l'infrastructure : **hébergement en région UE** (RM-A4.7), chiffrement
transit + repos + sauvegardes (RM-A4.6), base non exposée, **tableau des
sous-traitants** déclaré aux agences (hébergeur UE · Yousign FR · Stripe IE · Meta
hors UE · antivirus à choisir) — voir [[Socle de sécurité]].

> [!warning] Points à trancher / divergences
> - **Restent à choisir** : service antivirus (avant l'étape 3 — impact contractuel,
>   tableau des sous-traitants A4) ; configuration d'hébergement (avant
>   développement) ; format d'export du journal (lot 1B) ; lien
>   sécurisé pour le devis (lot 3).
> - **pg_cron vs code actuel** : le code Gerimmo-V3 utilise **Vercel Cron** (qui avait
>   remplacé n8n le 2026-07-20) ; le lot 0 acte **pg_cron**. Migration des
>   automatisations à prévoir. → [[Canaux de communication]]
> - **Schéma cible ≠ schéma actuel** : `accounts`/`persons`/`memberships` vs
>   `profiles`/`organization_members` ; vocabulaire des rôles du lot 0 (`agent`,
>   `admin_agence`, `super_admin`) ne cite pas proprietaire/artisan/locataire —
>   liste vraisemblablement non exhaustive, à confirmer aux ingests des modules.
