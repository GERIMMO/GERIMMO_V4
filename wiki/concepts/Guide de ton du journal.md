---
type: concept
tags: [journal, marketing, redaction, ton]
status: stable
created: 2026-10-07
updated: 2026-10-24
sources: []
---

# Guide de ton du journal

Le journal public de Gerimmo et ses posts Facebook parlent comme **un gestionnaire
qui explique à un bailleur**. Ce guide est repris mot pour mot dans la consigne de
l'IA qui rédige les relais de veille (`src/lib/redaction-veille.ts`) et sert de
règle pour les seize sujets éditoriaux (`src/lib/contenu-marketing.ts`).

## La voix

- Phrases courtes, voix active, mots simples. « Le bailleur envoie la quittance »,
  pas « la quittance est susceptible d'être transmise par le bailleur ».
- On s'adresse à quelqu'un : « vous », « votre locataire », « votre logement ».
- Un fait, puis ce qu'on en fait. Jamais un fait sans suite pratique.
- **Un exemple concret** par article (un studio à 650 €, un dégât des eaux un
  samedi, un DPE de 2019…), et **une courte liste pratique** (trois à cinq points).
- **Une seule phrase de réserve**, en fin d'article, en italique. Pas de
  précautions en chaîne dans le corps.

## Ce qu'on retire

- Le jargon administratif : « il convient de », « est susceptible de », « dans le
  cadre de », « les parties prenantes », « dispositif ».
- Les tournures passives et impersonnelles : « il est recommandé », « doit être
  effectué ».
- Les formules creuses : « au bon endroit », « au bon moment », « de manière
  compréhensible », « plus lisible ».
- Les deux-points décoratifs dans les titres (« Thème : sous-thème »).
- Les promesses et les conseils juridiques individualisés.

## Ce qu'on garde

- Les faits produit exacts : Gerimmo ne décrit que ce qu'il fait déjà.
- Les règles sourcées : un relais de veille ne contient **aucun fait absent de
  la page officielle**, chaque point porte une citation-preuve retrouvée dans la
  source, et l'article se termine par le lien officiel.
- Le respect du lecteur : pas d'emoji, pas de majuscules d'insistance.

## Gabarit d'un relais de veille

1. Titre : une phrase, 90 caractères au plus.
2. Chapo : deux phrases.
3. « Ce qui change », « Qui est concerné », « À partir de quand ».
4. « En pratique » : trois à cinq points, une phrase chacun.
5. Source officielle, date de publication.
6. Une phrase de réserve en italique.

## Gabarit d'un sujet éditorial

1. Titre sans deux-points.
2. Chapo : la situation du lecteur en une phrase, ce que Gerimmo y fait en une autre.
3. Deux ou trois sections courtes, dont une qui part d'un exemple.
4. Une liste pratique.
5. Texte Facebook : deux phrases, sans lien (le lien est ajouté par l'envoi).

## Périmètre et volume (décision du dirigeant, 24 octobre 2026)

La veille et ses relais automatiques concernent le logement, la gestion locative
et les besoins directs des artisans du bâtiment. Un titre officiel doit permettre
de reconnaître ce lien : un résumé IA, une étiquette « artisan » ou un mot comme
« factures », « cotisations » ou « allocations » ne suffit pas. AAH, santé,
fiscalité générale des entreprises et actualités des autres métiers sont hors
périmètre. Le filtre reste volontairement prudent ; les sources officielles ne
constituent pas une couverture exhaustive de la réglementation.

Le bureau présente au maximum **5 veilles et 2 articles** en attente. Les autres
propositions restent accessibles en réserve, avec leur motif, sans accord, rejet
ni effacement automatique. Les problèmes clients ne sont jamais plafonnés par
cette règle. Les compteurs du bureau et de la navigation appliquent le même tri.

La collecte attend lorsqu'au moins 5 veilles pertinentes sont encore à examiner ;
les deux flux officiels partagent les places restantes. Les sources déjà traitées
ne sont pas rouvertes. Les études existantes utiles peuvent encore se terminer.
La préparation marketing attend dès que 2 propositions, brouillons, articles
planifiés ou programmés existent ; aucun nouveau texte ni visuel n'est alors créé.
Une préparation existante peut reprendre. Une panne de lecture bloque la création.
Avant diffusion d'un article issu de veille, la source est à nouveau contrôlée :
un ancien hors-sujet programmé ne passe pas automatiquement.

Ces limites sont appliquées par le code, sous le verrou habituel des missions,
sans changement de schéma ni des décisions déjà enregistrées. La création manuelle
et l'examen des anciennes propositions restent disponibles au superviseur.
