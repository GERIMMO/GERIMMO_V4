---
type: source
aliases: ["Dépôt Gerimmo-V3"]
tags: [code, depot, github]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
source-file: raw/Gerimmo-V3/
source-type: dépôt de code
source-date: 2026-07-20
---

# Dépôt Gerimmo-V3 (code source)

**Source :** <https://github.com/GERIMMO/Gerimmo-V3> — branche `main`, ingérée le 2026-07-21.
**Trace locale :** instantané léger (docs + migrations SQL + seed) dans `raw/Gerimmo-V3/`
(72 fichiers, ~444 Ko) — voir `raw/Gerimmo-V3/LISEZ-MOI.md`.
Stack : Next.js 16 / React 19 / TypeScript / Tailwind v4 / shadcn-ui + Supabase (Postgres, RLS) ; automatisations Vercel Cron + Resend (e-mail) ; bot Telegram (WhatsApp en préparation).

## Résumé
Application SaaS de **gérance immobilière** multi-organisations. Le dépôt contient un
socle applicatif, mais surtout **~60 migrations SQL** et une couche de **services métier**
(`src/services/*`) qui portent l'essentiel de la logique : patrimoine, incidents (cycle
complet devis → intervention → clôture), loyers/quittances, documents officiels,
communication multicanale, facturation SaaS (Stripe).

## Point de méthode important
Le dossier `docs/` est en grande partie constitué de **squelettes non renseignés**
(« A completer ») : spécification fonctionnelle, rôles-permissions, tests d'acceptation.
La **connaissance métier réelle** a été extraite du **SQL** (`supabase/migrations/`) et
des **services** (`src/services/`), pas de la doc. Les docs `04-architecture-supabase.md`
décrivent une cible (tables `properties`/`tenants`/…) qui **ne correspond pas** aux noms
réellement implémentés (`biens`, `patrimoines`, `incidents`, `rent_periods`…). **Se fier
au code.**

## Ce que cette source apporte au wiki
- **Personas :** [[Super Admin]], [[Administrateur d'agence]], [[Agent immobilier]], [[Propriétaire bailleur]], [[Artisan]], [[Locataire]] → voir [[Modèle de rôles et permissions]].
- **Concepts :** [[Organisation]], [[Patrimoine et résidences]], [[Bien]], [[Occupation d'un bien]], [[Incident]], [[Devis]], [[Intervention]], [[Document]], [[Période de loyer]], [[Abonnement]] → voir [[Modèle de données]].
- **Processus :** [[Cycle de vie d'un incident]], [[Demande et sélection de devis]], [[Planification d'intervention]], [[Intervention et clôture]], [[Quittancement des loyers]], [[Relances et mise en demeure]], [[Onboarding et abonnement]].
- **Règles métier :** [[Grille tarifaire]], [[Quittance conforme]], [[Cycle de vie de l'abonnement]], [[Archivage plutôt que suppression]], [[Isolation multi-organisation]], [[RGPD]], [[Plan de reprise d'activité]].
- **Synthèses transverses :** [[Canaux de communication]], [[État du projet et décisions ouvertes]].

## Citations utiles
> « GERIMMO V3 doit etre concu pour supporter plusieurs organisations distinctes des le depart. » — `docs/00-principes-gerimmo.md`
> « Les donnees metier importantes doivent etre archivees ou desactivees plutot que supprimees definitivement. » — `docs/00-principes-gerimmo.md`

> [!warning] Contradictions avec l'existant
> - Doc vs implémentation (voir « Point de méthode »). Détaillé dans [[État du projet et décisions ouvertes]].
>