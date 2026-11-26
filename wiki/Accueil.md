---
type: synthesis
tags: [accueil, vue-ensemble]
status: in-progress
created: 2026-07-20
updated: 2026-11-26
sources: ["[[Vision de l'écosystème Gerimmo]]", "[[Passation — état du 26 novembre 2026]]", "[[Feuille de route — plateforme de référence, 26 novembre 2026]]", "[[Référentiel du palier 1]]", "livrables/OUVERTURE-VENTE-30-NOVEMBRE.md"]
---

# Accueil — Wiki métier Gerimmo

Point d'entrée du wiki : la **connaissance métier** du projet Gerimmo.

## Ce qu'est Gerimmo

Gerimmo est une application de gestion locative en ligne : son cœur de cible est le propriétaire bailleur, en nom
propre ou en SCI, qui gère lui-même ses biens, ses locataires et ses artisans. Son énoncé fondateur (10/09/2026) :
« Faire le travail d'une agence de gestion locative — en mieux, plus rapide, et moins cher » ; Gerimmo exécute le
travail, mais reste un logiciel et ne détient jamais l'argent des autres. L'ambition fixée par le dirigeant le
26/11/2026 : en faire la plateforme principale de gestion immobilière de France, puis potentiellement d'Europe
([[Vision de l'écosystème Gerimmo]]).

## L'état au 26/11/2026

- Le **palier 1** (propriétaire qui gère lui-même, locataire, artisan, incidents, gestion administrative, super admin)
  est **en production depuis le 25/11/2026** ([[Passation — état du 26 novembre 2026]], section a).
- Le **lot 1 de corrections** (sessions et écrans) est **en cours de publication** par la PR #361 (Passation, section c).
- La **vente aux particuliers et aux SCI ouvre le 30/11/2026** (décision du dirigeant du 26/11,
  `livrables/OUVERTURE-VENTE-30-NOVEMBRE.md`) ; d'ici là, les souscriptions payantes restent fermées.
- **Aucun client réel** à ce jour : les comptes inscrits sont des comptes de test, et aucun paiement réel n'est connu
  ([[Feuille de route — plateforme de référence, 26 novembre 2026]], section 1).
- Les **agences** sont sur [[Liste d'attente des agences|liste d'attente]].

## Quoi lire d'abord

1. [[Vision de l'écosystème Gerimmo]] — ce que Gerimmo veut devenir, et ce qui vaut aujourd'hui.
2. [[Passation — état du 26 novembre 2026]] — l'état de la production, ce qui est ouvert, ce qui attend le dirigeant.
3. [[Référentiel du palier 1]] — les règles métier du palier 1, chacune avec sa source et son statut.
4. `QUESTIONS.md` (racine du dépôt) — le registre unique des questions et décisions.
5. [[Décisions du dirigeant]] — ses réponses écrites, mot pour mot.
6. [[Feuille de route — plateforme de référence, 26 novembre 2026]] — le marché, la concurrence et la stratégie.

## Comment le wiki est rangé

- **Les dossiers de `wiki/`** : `personas/` (qui), `processus/` (comment ça se passe), `concepts/` (les objets du
  domaine), `regles-metier/` (règles et réglementation), `sources/` (une page par source ingérée), `syntheses/`
  (analyses transverses vivantes). Les sources brutes, immuables, sont dans `raw/`.
- **Les archives** : une page qui ne décrit plus l'état actuel (audit, point d'étape, passation dépassée, page
  remplacée) n'est jamais supprimée ; elle est rangée dans `wiki/archives/AAAA-MM/` et recensée par
  [[Historique des audits]]. Une page fusionnée dans une autre devient une page de renvoi.
- **Le catalogue** [[index]] (`index.md`) : une ligne par page vivante. **Le journal** `log.md` : les nouvelles
  datées, dans l'ordre chronologique. Les conventions du wiki sont dans `CLAUDE.md`.
