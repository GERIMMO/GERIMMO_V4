---
type: source
tags: [architecture, socle, rls, supabase, pg-cron, lot-0]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Architecture-lot-0.md
source-type: document d'architecture (référentiel V3 — démarrage du développement)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Architecture du lot 0 (socle)

**En une phrase :** traduction des six livrables transverses (A1–A6) en architecture
technique — un **socle invisible** (aucun écran métier, aucune donnée métier) sur pile
**Next.js / Supabase / Vercel**, dont la réussite se mesure à ce que le lot 1A démarre
sans y revenir.

## Affirmations clés

1. **Neuf tables, aucune donnée métier** : `organizations`, `accounts`, `persons`,
   `memberships` (A1) ; `documents` (+ `document_liens`, A3) ; `events` (A5) ;
   `audit_log` (3 ans) et `tech_log` (6 mois) (A2/A4) ; `alerts` (A5) ;
   `retention_rules` (A2 — les 32 durées de conservation en table, évolutives sans
   déploiement). → [[Architecture du socle V3]]
2. **Isolation par Row Level Security — décision actée** : la garantie est dans
   Postgres, pas dans la discipline du code (« même si le code se trompe, la base
   refuse »). Politique type : lecture filtrée par les `memberships` actifs de
   l'utilisateur. **Test d'isolation par table** (2 agences, chacune ne voit que sa
   ligne) + test « RLS actif sur chaque table » (parcourt le catalogue Postgres) —
   à chaque livraison. → [[Isolation multi-organisation]]
3. **Trois règles A1 portées par des contraintes de base**, pas du code : email unique
   (RM-A1.1), adhésion unique par couple (RM-A1.3), rôle sur `memberships` jamais sur
   `accounts` (RM-A1.5). Apparition de **RM-A1.4** : `persons` n'a aucune référence
   obligatoire vers `accounts`. → [[Compte, personne et adhésion]]
4. **Documents : rattachement multiple sans arborescence** (`document_liens` — un
   document apparaît sur toutes les fiches qu'il concerne ; pas de dossiers, le **type**
   pilote droits et conservation). Stockage **Supabase Storage** : jamais d'URL directe,
   liens signés à expiration courte (RM-A4.10), chiffrement au repos (RM-A4.6),
   **antivirus à l'upload avant disponibilité** (RM-A4.8, service à choisir), formats
   PDF/JPG/PNG à type réel vérifié (RM-A4.9). → [[Document]]
5. **Idempotence par contrainte, pas par code** : `events` avec
   `unique (source, identifiant_ext)` — une seconde insertion échoue et s'ignore
   (RM-A5.6/A5.7). Réponse immédiate au prestataire, traitement asynchrone en file.
   → [[Machines à états et événements]]
6. **pg_cron remplace n8n — décision actée** : un sous-traitant de moins (tableau A4),
   la logique reste avec les données. Six tâches du socle (échéances, escalade,
   purges, sorts RGPD, relance de file), toutes **idempotentes** (« deux exécutions,
   un seul effet »).
7. **Vingt règles architecturales deviennent des conventions de développement**
   (matrice de traçabilité) : `organization_id` + RLS partout, UUID, deux dates sur les
   écritures (RM-4.1.2), aucun DELETE d'écriture (RM-A6.3), transaction sur les effets
   immédiats, antivirus, journalisation des actions sensibles (RM-18.5.1).
8. **Séquence en cinq étapes** avec un critère de fin démontrable chacune :
   1 Identité (deux agences isolées) → 2 Accès (MFA, sessions) → 3 Documents →
   4 Événements → 5 Exploitation. **Bloquent le lot 1A** : identité, RLS + test,
   `documents`, authentification ; les étapes 4–5 peuvent suivre en parallèle.

## Décisions techniques actées

| Décision | Choix | Motif |
|---|---|---|
| Isolation | **RLS Postgres** | La base garantit, pas le code |
| Stockage | **Supabase Storage** | Intégré, cohérent |
| Tâches planifiées | **pg_cron** (pas n8n) | Un sous-traitant de moins |
| Identifiants | UUID | Non énumérables (RM-A1.12) |
| Conservation | Table `retention_rules` | Évolutive sans déploiement |
| Idempotence | Contrainte d'unicité | Garantie par la base |

## Ce qui reste à choisir

| Point | Échéance |
|---|---|
| **Service antivirus** (localisation → tableau des sous-traitants A4) | Avant l'étape 3 |
| Format d'export du journal | Lot 1B |
| Lien sécurisé pour le devis | Lot 3 |

## Point de départ

Étape 1 : trois tables (`accounts`, `organizations`, `memberships`), leurs politiques
RLS et le test d'isolation. « Une fois que deux agences coexistent sans se voir, le
lot 1A peut démarrer sans crainte de revenir en arrière. »

## Pages mises à jour par cet ingest

[[Architecture du socle V3]] (créée) · [[Compte, personne et adhésion]] ·
[[Isolation multi-organisation]] · [[Modèle de données]] · [[Document]] ·
[[Machines à états et événements]] · [[Canaux de communication]] · [[RGPD]] ·
[[Organisation]] · [[État du projet et décisions ouvertes]]
