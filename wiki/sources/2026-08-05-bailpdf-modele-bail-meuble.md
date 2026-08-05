---
type: source
tags: [bail, modele-type, bail-meuble, formulaire, inventaire-mobilier, template]
status: stable
created: 2026-08-05
updated: 2026-08-05
source-file: raw/assets/contrat-bail-meuble-1.pdf
source-type: réglementation (modèle de contrat)
source-date: 2026 (téléchargé le 2026-08-05 depuis bailpdf.com)
---

# BailPDF — Modèle de contrat de bail meublé (PDF)

**Fichier :** `raw/assets/contrat-bail-meuble-1.pdf` (formulaire vierge, 283 Ko)
**Origine :** https://bailpdf.com/sites/bailpdf.com/files/pdf/contrat-bail-meuble.pdf
— même éditeur (Selectra) que [[2026-08-05-bailpdf-contrat-de-bail]] et
[[2026-08-05-bailpdf-modele-bail-non-meuble]].

> [!note] Fiabilité
> Comme le modèle vide : le **modèle-type réglementaire quasi brut** (loi n° 89-462
> citée en tête) rempli à blanc, hors deux encarts publicitaires Selectra. À lire en
> **diff** du modèle vide — les deux partagent le même squelette.

## Résumé

Formulaire complet de contrat de location/colocation d'un **logement meublé**,
structuré dans les **mêmes 11 sections** que le modèle vide
([[Structure du modèle-type de bail]]). Les différences se concentrent sur la durée
(1 an / 9 mois étudiant, reconduction), les charges (forfait libre), le dépôt de
garantie (2 mois HC) et les annexes (**inventaire et état détaillé du mobilier**).
Tout le reste — identifiant fiscal, rappel de décence énergétique, zone tendue et
complément de loyer, loyer du dernier locataire, réévaluation au renouvellement,
section travaux, clause de solidarité, clause résolutoire, honoraires — est
**identique mot pour mot** au modèle vide.

## Points clés

- **Un seul squelette pour les deux types de bail** : les 11 sections sont
  identiques ; le générateur 1.16 de Gerimmo peut être un gabarit unique avec
  **variantes par type** — voir le tableau des variantes dans
  [[Structure du modèle-type de bail]].
- **Durée (section III)** : champ libre, minimum **1 an, ou 9 mois si étudiant** ;
  reconduction tacite **d'1 an** dans les mêmes conditions — **sauf bail étudiant,
  jamais reconduit tacitement**. Pas de règle « 6 ans personne morale » ni de durée
  réduite dérogatoire (spécificités du bail vide). Cohérent avec [[Bail]] et
  [[Types de baux]].
- **Charges (IV.B)** : forfait de charges **sans restriction** (en vide : colocation
  uniquement) ; forfait révisé chaque année comme le loyer
  ([[Régularisation des charges]]).
- **Dépôt de garantie (VI)** : « il est prévu un dépôt de garantie » (quasi
  systématique, là où le vide dit « le cas échéant »), plafond **2 mois de loyer hors
  charges**, montant en chiffres et en toutes lettres ([[Dépôt de garantie]]).
- **Annexes (XI)** : s'ajoutent à l'[[État des lieux]] « **un inventaire et un état
  détaillé du mobilier** », établis lors de la remise des clés, à une date au plus
  tard celle de la conclusion du contrat. **La liste des meubles du décret 2015 n'est
  pas imprimée dans le formulaire** — la conformité repose sur l'inventaire annexé ;
  l'inventaire structuré de Gerimmo (module 1.2) est plus exigeant que le formulaire.
- **Absent du meublé** : la « contribution pour le partage des économies de charges »
  (travaux d'énergie) n'existe que dans le modèle vide.

## Ce que cette source apporte au wiki

- **Pages mises à jour** : [[Structure du modèle-type de bail]] (tableau des
  variantes vide/meublé), [[Bail]], [[État des lieux]],
  [[Régularisation des charges]], [[Types de baux]], [[Dépôt de garantie]].
- Aucune page créée — la source est un **diff** du modèle vide.

## Citations utiles

> « (minimum 1 an, ou 9 mois si la location est consentie à un étudiant). […] Les
> contrats de locations meublées consenties à un étudiant pour une durée de 9 mois ne
> sont pas reconduits tacitement à leur terme. » (section III)

> « Un état des lieux, un inventaire et un état détaillé du mobilier (établis lors de
> la remise des clés, dont la date ne peut être ultérieure à celle de la conclusion du
> contrat). » (section XI)

> « Pour la garantie de l'exécution des obligations du locataire, il est prévu un
> dépôt de garantie d'un montant de … * / *deux mois de loyer hors charges. »
> (section VI)

> [!warning] Contradictions avec l'existant
> - Aucune. Le modèle confirme les plafonds et durées déjà documentés et **valide le
>   choix d'un gabarit unique à variantes** pour le générateur 1.16.
