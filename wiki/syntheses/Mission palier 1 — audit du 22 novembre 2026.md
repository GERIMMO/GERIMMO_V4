---
type: synthesis
tags: [audit, palier-1, conformite, securite, ia, plan-de-correction]
status: in-progress
created: 2026-11-22
updated: 2026-11-22
sources: []
---

# Mission palier 1 — audit du 22 novembre 2026

**En une phrase :** à la demande du dirigeant, Gerimmo est audité puis corrigé en autonomie pour le palier 1
([[Propriétaire bailleur]], [[Locataire]], [[Artisan]], incidents, gestion administrative, [[Super Admin]]) ; la
production est gelée jusqu'à sa validation écrite ; l'audit complet est dans `AUDIT.md`, à la racine du dépôt.

## Où lire quoi

| Fichier (racine du dépôt) | Contenu |
|---|---|
| `AUDIT.md` | État de chaque module, conformité légale, écart avec les plateformes de référence, dépendance à l'IA, plan fermé P0 / P1 / P2 |
| `QUESTIONS.md` | Les choix qui appartiennent au dirigeant, avec l'option prudente prise en attendant |
| `JURISTE.md` | Les questions fermées à poser à un juriste ou à un expert-comptable ; aucun de ces points n'est présenté comme conforme |
| `JOURNAL.md` | Cinq lignes par lot de travail |
| `audit-palier-1/` | Huit relevés détaillés (fichiers, lignes, requêtes, sources) et les avis de sécurité de la production |

## Ce que l'audit établit (première version, 22/11/2026)

- **Version auditée** : `e1e442dc`, contrôle automatique complet vert. Rien n'a été modifié pendant l'audit.
- **Aucun module n'est une simple maquette** ; aucune fonction appelée par un écran n'est absente de la base.
- **Sécurité** : cloisonnement actif sur les 227 tables, prouvé par requête ; aucun défaut grave
  ([[Isolation multi-organisation]], [[Socle de sécurité]]). Restent : antivirus non relié, reprise d'activité non
  prouvée de bout en bout ([[Plan de reprise d'activité]]), 16 règles de conservation inactives sur 58
  ([[Durées de conservation]]).
- **Un risque d'argent compté deux fois** entre la [[Régularisation des charges]] et la
  [[Restitution du dépôt de garantie]], à confirmer en exécution.
- **IA** : un seul fournisseur ; le cœur du métier n'appelle jamais l'IA ; la déclaration d'incident est déjà un
  formulaire et le créneau se choisit déjà à la main ([[Cycle de vie d'un incident]],
  [[Planification d'intervention]]). Aucun réglage ne coupe aujourd'hui l'IA proprement : un interrupteur super admin
  est au plan.
- **Envois suspendus** : avis d'échéance, relances, rappels de rendez-vous sont codés mais fermés par la liste fermée
  du pilote ([[Quittancement des loyers]], [[Relances et mise en demeure]]).

> [!warning] Points à trancher / contradictions
> - **Les textes officiels n'ont pas été ouverts** : le réseau de l'environnement de travail refuse Légifrance,
>   service-public, l'ANIL, la CNIL et l'INSEE. Tout le volet juridique repose sur des extraits de recherche du
>   22/11/2026 ; **aucun point n'est noté conforme**. Les écarts relevés ([[Bail]], [[État des lieux]],
>   [[Mentions obligatoires du bail]], [[Vétusté et décote]], [[RGPD]]) sont « à confirmer à la source ».
> - **Deux textes signalés par les extraits et absents du wiki** : un décret n° 2026-596 du 6 juillet 2026 (contrat
>   type applicable aux baux conclus à partir du 1er octobre 2026) et un arrêté du 9 octobre 2026 sur la notice
>   d'information. Aucune source déposée dans `raw/` ne les porte : à lire avant toute affirmation.
> - **« Référentiel du palier 1 »** : aucun document de ce nom ; le cahier Gerimmo V3 (`raw/assets/`) et les décisions
>   du wiki en tiennent lieu, dans le périmètre donné par le dirigeant.
> - Les pages [[Planification d'intervention]] et [[Intervention et clôture]] sont en retard sur le code.

## Liens

[[État du projet et décisions ouvertes]] · [[Audit indépendant complet avant lancement — 341b770f — 19 novembre 2026]] ·
[[Équipes IA et automatismes — inventaire et propositions (14 octobre 2026)]] · [[Recette de production]]
