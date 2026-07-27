---
type: synthesis
tags: [modele-donnees, schema, supabase]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]"]
---

# Modèle de données

Synthèse du schéma relationnel métier (Postgres/Supabase). Source : les ~60 migrations
`supabase/migrations/`. Voir chaque [[Organisation|concept]] pour le détail.

## Schéma relationnel simplifié
```
organizations (agency/independent_owner/internal)
   │  ──< organization_members >── profiles   (member_type: admin/agent/owner/contractor/tenant)
   │
   ├──< patrimoines ──< residences ──< biens
   │                                    ├──< bien_occupants   (locataire/proprietaire)
   │                                    ├──< bien_echeances
   │                                    ├──< rent_periods ──> documents (quittance)
   │                                    └──< incidents (bien_id obligatoire, responsible_profile_id)
   │                                            ├── quote_requests ──< recipients (artisan) ──< quotes
   │                                            │        └──< quote_comparisons
   │                                            ├── schedule_requests ──< slot_batches ──< slots
   │                                            └── interventions ──< materials / reports(→documents) / evaluations
   │
   ├──< documents (rattachable patrimoine/résidence/bien/propriétaire/locataire)
   ├──< communication_conversations ──< messages
   ├──< organization_subscriptions ──> subscription_plans ──> billing_invoices
   └──< audit_logs (toute table via table_name + record_id)
```
Artisan = `profiles` + `member_type='contractor'` + `artisan_validations` (validation globale [[Super Admin]]).

## Notions transverses
- **Multi-tenant strict** : `organization_id` + RLS partout (voir [[Isolation multi-organisation]]).
- **Archivage, jamais suppression** : `archived_at`/`archived_by` (voir [[Archivage plutôt que suppression]]).
- **Audit systématique** : `audit_logs` + tables `*_events`/`*_history`.
- **Statuts explicites** (CHECK) sur bien, incident, intervention, devis, loyer, abonnement.
- **Montants en centimes** (`*_cents`), devise EUR.

## Deux « facturations » à ne pas confondre
- **Loyers locataires** → `rent_periods` ([[Période de loyer]]).
- **Abonnement SaaS de l'org à GERIMMO** → `billing_invoices`/`subscription_plans` ([[Abonnement]]).

## Absences notables (à décider)
- Pas de tables `tenants`/`owners`/`contractors` dédiées → ce sont des `profiles` + `member_type`.
- **Pas de vraie table « bail »** → approximé par [[Occupation d'un bien]] + [[Période de loyer]] + document `contrat`.
- Voir [[État du projet et décisions ouvertes]].

## Cible V3 : le socle du lot 0 (2026-07-24)
Le [[2026-07-24-gerimmo-v3-architecture-lot-0|lot 0]] définit **neuf tables de socle**
sans donnée métier : `organizations`, `accounts`, `persons`, `memberships` (identité —
[[Compte, personne et adhésion]]), `documents` + `document_liens`, `events`
(idempotence), `audit_log` (3 ans), `tech_log` (6 mois), `alerts`, `retention_rules`.
Voir [[Architecture du socle V3]].

> [!warning] Écart schéma actuel ↔ schéma cible
> Le schéma ci-dessus (celui du code) devra migrer vers le socle V3 :
> - `profiles` (fiche unique globale) → scission **`accounts`** (authentification,
>   global) / **`persons`** (identité métier, par agence) ;
> - `organization_members` → **`memberships`** (rôle + état, contrainte d'unicité
>   compte × agence) ;
> - `documents` avec visibilité/versioning → `documents` + **`document_liens`**
>   (rattachement multiple, le type pilote droits et conservation) ;
> - tables nouvelles sans équivalent : `events`, `retention_rules`, `alerts`, `tech_log`.
