---
type: source
tags: [decisions, dirigeant, registre, mot-pour-mot]
status: stable
created: 2026-11-26
updated: 2026-11-26
sources: []
source-file: DECISIONS-2026-11-24.md
source-type: registre des réponses du dirigeant (texte reçu, mot pour mot)
source-date: 2026-11-24
---

# Décisions du dirigeant

**Ce que c'est.** Le fichier `DECISIONS-2026-11-24.md`, à la racine du dépôt, recopie **mot pour mot** les réponses
écrites du dirigeant depuis le 24/11/2026, puis indique en une ligne ce que l'agent en a fait. Il commence par ses
réponses aux questions Q1 à Q53 du registre `QUESTIONS.md`, et reçoit depuis chacune de ses nouvelles décisions. Sa
date (24/11) n'est que celle de sa création.

**Comment il s'articule avec le reste.**
- **`QUESTIONS.md`** est le registre unique des questions ouvertes et des décisions (Q1 et suivantes) : il dit l'état
  de chaque question.
- **Ce fichier** garde la preuve : le texte exact reçu du dirigeant. Une publication, une ouverture de la vente ou un
  geste sensible ne se fait que sur une phrase recopiée ici (règle « accord écrit », [[Passation — état du 26 novembre 2026]], section e).
- Les décisions antérieures au 24/11 sont dans `log.md` (entrées « decision » et « query ») et dans l'archive
  [[État du projet et décisions ouvertes — archive (juillet à octobre 2026)]].

**Ce qu'il contient** (sections du fichier) :
- les **règles générales** du 24/11 : « Tout doit respecter les textes de loi. Rien n'est noté « conforme » sans texte
  officiel lu. » ; un projet simple à reprendre par un informaticien humain ; l'option la plus prudente et réversible
  en cas de nouvelle question ; publication seulement après « je valide la publication » ;
- les réponses aux questions Q1 à Q53 et les compléments des 24, 25 et 26/11 (vendeur, périmètre, textes officiels,
  plan de publication, retours arrière de la base) ;
- les réponses du 26/11 : parcours de vérification, correctifs Q125 et Q126, **ouverture de la vente le 30/11 en
  entrepreneur individuel et sans médiateur**, et l'ambition « plateforme principale de gestion immobilière de France
  et potentiellement d'Europe » ([[Vision de l'écosystème Gerimmo]]).

> [!warning] Points à trancher / contradictions
> - Le plan de ménage du 26/11 prévoyait de verser ce fichier dans `raw/`. Il y est resté à la racine : `raw/` est
>   immuable, alors que ce registre reçoit encore de nouvelles décisions. Son renommage en `DECISIONS.md` (nom sans
>   date trompeuse) est prévu quand l'ancienne session aura cessé d'y écrire, pour éviter un conflit de fusion.
