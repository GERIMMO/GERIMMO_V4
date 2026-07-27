---
type: synthesis
tags: [divergences, migration, code, referentiel-v3]
status: in-progress
created: 2026-07-25
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]"]
---

# Divergences code et référentiel V3

Les écarts entre **le code actuel** (dépôt Gerimmo-V3, ingéré le 2026-07-21) et **le
référentiel V3** (livrables A + modules, ingérés les 2026-07-24/25). Ce ne sont **pas
des décisions ouvertes** (voir [[État du projet et décisions ouvertes]]) mais la
**matière du futur plan de migration** : le référentiel fait foi, le code devra le
rejoindre.

## Identité et rôles

- **`profiles` global unique → scission `accounts` / `persons` (par agence) /
  `memberships`** ([[Compte, personne et adhésion]], [[Architecture du socle V3]]).
  L'email globalement unique du code anticipe déjà RM-A1.1.
- **6 rôles du code vs 3 rôles V3** (agent, admin agence, super admin) : le V3 traite
  locataire/artisan/PD comme des espaces, pas des rôles. `member_type` vs `roles.key`
  non liés en DB ; RBAC fin dormant (`permissions` non peuplées) ; docs
  `02-roles-permissions.md` fictive. → [[Modèle de rôles et permissions]]
- **Périmètre de l'agent** : V3 = ses mandats uniquement (RM-18.1.3) ; code = tout
  membre voit l'organisation entière. Restriction majeure à implémenter.
- **`artisan_validations`** (validation globale par le SA) n'existe plus en V3 —
  remplacée par SIRET vérifié (A1) + visibilité choisie par l'artisan + blacklist
  globale. → [[Artisan]]

## Objets métier absents ou à refondre

- **Pas de table Lot** : `biens` cumule bien physique et unité locative — le modèle
  bien/lot/détention (quote-parts datées) est une refonte. → [[Lot]]
- **Pas de table Bail** : approximé par `bien_occupants` + `rent_periods` + document
  `contrat`. Migration à cadrer (le bail crée-t-il l'occupation ?). → [[Bail]]
- **Pas d'objets** : Mandat (lignes à taux), État des lieux structuré, Appel de
  charges/ventilation, Dépôt de garantie, Écriture comptable (2 dates), Rapport,
  Solde de tout compte, Demande de signature, Conversation rattachée, Signalement/Idée.
- **Flux loyers** : `rent_periods` (confirmation en bloc, quittance à la confirmation)
  → appel de loyer envoyé / encaissement imputé du plus ancien / **reçu si partiel** /
  quittance après encaissement intégral. Relances : 2 codées en dur → **seuils
  paramétrables par agence**. → [[Quittancement des loyers]],
  [[Relances et mise en demeure]]
- **Notation** : `createArtisanEvaluation` (une évaluation multi-critères) → 3 sources
  25/50/25 + score de fiabilité à 5 indicateurs. → [[Artisan]]
- **Comparaison de devis** : formule de score (prix 45 %/note 35 %/docs 20 %) absente
  du V3 (affichage de la note composite). → [[Devis]]

## Vocabulaires d'états (A5 / modules vs code)

- Lot : `vacant/occupe/travaux/archive` vs disponible/loué/**préavis**/archivé
  (« préavis » manque au code, « travaux » manque au registre).
- Incident : `nouveau` → `cloture_normale/reserve` vs 7 états (déclaré…rouvert) +
  imputation obligatoire.
- Devis : `demande/recu/refuse/expire/retenu` vs demandé/déposé/validé/refusé/expiré/
  **facturé**.
- RDV : « rounds » (`demande_disponibilites`…`valide`) vs proposé/contre-proposé/
  arbitrage/confirmé/honoré/reporté/manqué.
- Organisation : `active/suspended/archived` vs **essai**/active/suspendue/archivée.
→ Tables de correspondance et migrations à définir. [[Machines à états et événements]]

## Infrastructure

- **Tâches planifiées** : Vercel Cron (code, après l'abandon de n8n dont des endpoints
  subsistent) vs **pg_cron** (V3) — deuxième changement d'outil.
- **Tables du socle sans équivalent** : `events` (idempotence webhooks),
  `retention_rules`, `alerts`, `tech_log`, `document_liens`. Aucune infrastructure de
  rejeu/file dans le code. → [[Architecture du socle V3]]
- **Durées de conservation** : valeurs du code (`docs/rgpd-production.md`, télémétrie
  90 j, audit indéfini) vs **matrice A2** en `retention_rules` (technique 6 mois,
  audit 3 ans, accès 1 an, 32 types) — **tranché le 2026-07-25 : A2 fait foi**, le
  code migre. → [[RGPD]]
- **Test de restauration** : trimestriel (code) vs annuel (RM-A4.12) — à harmoniser
  lors de la reprise du PRA. → [[Plan de reprise d'activité]]
- **GED** : `documents` à visibilité/versioning → rattachement multiple sans
  arborescence, le type pilote droits et conservation. → [[Document]]
- Double définition de `evaluate_subscription_lifecycle` (`expired` vs `suspended`) —
  `suspended` prévaut.

## Onboarding, canaux, tarifs

- **Onboarding** : auto-inscription `createOrganization` + essai 14 j + parcours
  10 étapes (Telegram) vs **création d'agence par le SA** après contrat + paramètres
  par défaut + enrôlement WhatsApp. Articulation essai/Stripe à clarifier.
  → [[Onboarding et abonnement]]
- **Canaux** : bot Telegram actif (liaison par jeton) vs WhatsApp par consentement —
  lié à l'arbitrage « sort de Telegram » (décision ouverte n° 3).
- **Tarifs** : prix annuels de `public-pricing.ts` à neutraliser (V3 : mensuel
  exclusif + redevance annuelle) ; owner par paliers vs **par bien**. → [[Grille tarifaire]]

## Travail de spécification restant (matrice)

**29 règles transverses « à rattacher »** dans les modules (références/champs à
ajouter — pas des corrections), dont les prioritaires : champ **date de première
présentation** (modules 1-2), **immutabilité avant clôture** + réouverture +
**primauté du relevé bancaire** (modules 3-4, à confirmer à l'ingest d'A6),
**analyse antivirus** (8 modules). → [[2026-07-24-gerimmo-v3-matrice-tracabilite]]

## Documentation du dépôt

`docs/` en grande partie vide (« A completer ») ou obsolète
(`04-architecture-supabase.md` décrit des tables inexistantes) — à réécrire depuis le
wiki une fois la migration cadrée.
