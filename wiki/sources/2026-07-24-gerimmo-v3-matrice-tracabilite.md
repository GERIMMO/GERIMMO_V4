---
type: source
tags: [tracabilite, regles-transverses, phase-b, audit, pilotage]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Matrice-tracabilite.md
source-type: matrice de traçabilité (référentiel V3 — audit final, clôture de la phase B)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Matrice de traçabilité transverse

**En une phrase :** document de clôture de la phase B qui vérifie, règle par règle, où
chacune des **71 règles transverses** (livrables A1–A6) s'applique dans les 23 modules —
constat : **aucune contradiction, mais un défaut de rattachement** (29 règles appliquées
sans être citées). « Le référentiel peut être confié à une équipe technique. »

## Le constat

| Élément | Nombre |
|---|---|
| Règles transverses définies | **71** |
| Contradictions détectées | **Aucune** |
| Reflétées dans les modules (autre formulation) | 22 |
| **À rattacher** (référence/champ à ajouter) | **29** |
| Purement architecturales (lot 0 seulement) | 20 |

« Le problème n'est pas ce qu'on a écrit… le problème est qu'un développeur qui ouvre le
module 4 pour coder la comptabilité ne sait pas que douze règles du livrable A6 s'y
appliquent. » Trois natures de règle (universelle / ciblée / architecturale), trois états
de propagation (reflété / à rattacher / sans objet).

## Les rattachements prioritaires (rang 1 — les plus concrets)

| Règle | Module(s) | Ce qu'il faut ajouter |
|---|---|---|
| **RM-A3.5** | 1 et 2 | **Le champ « date de première présentation »** ([[Notification et valeur probante]]) |
| **RM-A6.3** | 4 | **Immutabilité des écritures avant clôture**, pas seulement après |
| **RM-A6.9** | 4 | Une réouverture ne rend pas les écritures modifiables |
| **RM-A6.2** | 3 et 4 | **La primauté du relevé bancaire** |
| **RM-A4.8** | 8 modules | **L'analyse antivirus au dépôt** (le rattachement le plus dispersé) |

Rang 2 : transaction unique des effets immédiats (RM-A5.3 — le module 1 décrit les
4 conséquences du bail signé « sans dire qu'elles forment une transaction unique ») ;
renvoi au registre des transitions (RM-A5.1/A5.2) ; **contestation de note = droit à
l'intervention humaine** (RM-A2.11, module 11 — impose une obligation d'information
envers l'[[Artisan]]) ; MFA par rôle (RM-A4.1/A4.2) ; l'adhésion porte le rôle
(RM-A1.3/A1.5). Rang 3 : confirmations (SIRET 3 états, finalités écrites, durées
artisan, canal légal, pas d'URL directe, contre-écritures).

## Vue par module — les plus contraints

| Module | Règles applicables |
|---|---|
| **18 — Administration** | **16** |
| **12 — Documents** | **15** |
| **4 — Comptabilité** | **14** (dont A6.1 à A6.12 au complet) |
| **3 — Loyers** | **12** |
| 1 — Bail | 11 |

« Ce sont les modules à coder avec la matrice sous les yeux. » À l'autre extrême :
module 17 (marque blanche) = 1 seule règle (RM-A1.6). **RM-A1.6 (`organization_id`
partout) est la seule règle littéralement universelle** — à faire vivre dans les
conventions de développement, pas dans un module ([[Architecture du socle V3]]).

## Bilan par livrable

| Livrable | Règles | Reflétées | À rattacher | Architecturales |
|---|---|---|---|---|
| A1 — Identité | 12 | 5 | 4 | 3 |
| A2 — RGPD | 11 | 4 | 4 | 3 |
| A3 — Preuve | 11 | 7 | 4 | 0 |
| A4 — Sécurité | 14 | 0 | 6 | 8 |
| A5 — États | 11 | 0 | 5 | 6 |
| A6 — Financier | 12 | 6 | 6 | 0 |
| **Total** | **71** | **22** | **29** | **20** |

## Usages prévus

Avant de coder un module (savoir ce qui s'applique) · construire les tests (**chaque
règle devient un cas de test**) · revue de code · audit externe · arbitrer un doute.

## Ce qui reste ouvert

| Point | Décision attendue |
|---|---|
| Le lien sécurisé ponctuel | Réutiliser le mécanisme Yousign pour d'autres usages ? |
| Le format d'export | Colonnes exactes, séparateur, encodage |
| Le service antivirus | Choix du prestataire — entre dans A4 |
| **Le calendrier du lot 0** | **Quand démarrer l'architecture** |

## Ce que la matrice révèle des livrables non ingérés

- **A6 — Doctrine financière** (12 règles, ciblées modules 3/4) : déclaratif assumé
  (RM-4.0.1), **immutabilité avant clôture**, primauté du relevé bancaire,
  contre-écritures, export — voir [[Comptabilité]].
- **A2 — RGPD** : finalités écrites (RM-A2.1/A2.3), durées des données artisan
  (RM-A2.9), **contestation de note = droit à l'intervention humaine** (RM-A2.11).
- **A4 — Sécurité** : MFA par rôle (RM-A4.1/A4.2), antivirus (RM-A4.8/A4.9),
  pas d'accès direct au stockage (RM-A4.10).

## Pages mises à jour par cet ingest

[[Architecture du socle V3]] · [[Notification et valeur probante]] ·
[[Machines à états et événements]] · [[Comptabilité]] · [[Artisan]] ·
[[État du projet et décisions ouvertes]]
