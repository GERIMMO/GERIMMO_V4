---
type: business-rule
tags: [bail, mentions-obligatoires, alur, dpe, identifiant-fiscal, modele-type]
status: draft
created: 2026-08-05
updated: 2026-11-23
sources: ["[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[Mission palier 1 — audit du 22 novembre 2026]]"]
---

# Mentions obligatoires du bail

**Énoncé :** tout bail d'habitation (vide ou meublé) signé depuis le 1er août 2015 doit
reprendre le **modèle-type du décret n° 2015-587** (loi ALUR) ; depuis le
**1er janvier 2024**, le **décret n° 2023-796** y ajoute trois mentions liées au fisc
et à l'énergie. Un bail non conforme reste valable mais est fragilisé : le locataire
peut exiger les mentions manquantes, voire contester le contrat.
Source : [[2026-08-05-bailpdf-contrat-de-bail|BailPDF]].

> [!note] Structure exacte du formulaire
> Le formulaire officiel compte en réalité **11 sections** — relevé champ par champ
> dans [[Structure du modèle-type de bail]] (d'après le
> [[2026-08-05-bailpdf-modele-bail-non-meuble|modèle PDF officiel]]). Les 8 rubriques
> ci-dessous sont la vue synthétique de l'article BailPDF.

## Les 8 rubriques du modèle-type (décret 2015-587)

1. **Désignation des parties** — bailleur, locataire(s), mandataire éventuel (carte
   professionnelle + numéro de mandat). Date de prise d'effet distincte de la signature.
2. **Description du logement** — adresse, surface loi Boutin (au m² près), pièces,
   équipements, annexes. Erreur de surface **> 5 %** en défaveur du locataire →
   diminution proportionnelle du loyer exigible.
3. **Destination du bien** — habitation principale, mixte ou professionnel.
4. **Durée** — durée initiale, reconduction tacite, date d'effet.
5. **Loyer et charges** — montant HC, [[Révision annuelle IRL|révision IRL]],
   provision ou forfait de charges, **dernier loyer si relocation < 18 mois**.
6. **[[Dépôt de garantie]]** — plafonds 1 mois HC (nu) / 2 mois HC (meublé).
7. **Frais d'agence** — plafonnés par zone (12 €/m² très tendue, 10 €/m² tendue,
   8 €/m² ailleurs) + 3 €/m² pour l'[[État des lieux]] ; part locataire ≤ part bailleur ;
   montant TTC à mentionner explicitement sous peine d'inexigibilité.
8. **Annexes** — [[Diagnostic]]s (DDT), notice d'information, [[État des lieux]]
   d'entrée, attestation d'assurance, grille de vétusté éventuelle, extraits du
   règlement de copropriété.

## Ajouts du décret 2023-796 (baux conclus depuis le 1/1/2024)

| Mention | Détail |
|---|---|
| **Identifiant fiscal du logement** | 13 chiffres, sur l'avis de taxe foncière, affiché sous l'adresse du bien |
| **Classe énergétique DPE** | Lettre A–G + dépenses théoriques annuelles d'énergie |
| **Calendrier passoires thermiques** | Bloc rappelant l'interdiction de location G (2025), F (2028), E (2034) — voir [[Diagnostic]] |

## Implications pour l'application

- Le modèle de bail Gerimmo (parcours 1.16, [[Bail]]) doit intégrer ces mentions,
  **non retirables** par l'admin agence (RM-1.16 : mentions légales verrouillées).
- L'identifiant fiscal suppose un **champ sur le [[Lot]]** (ou le [[Bien]]) saisi à la
  création — à défaut, la génération du bail devrait au minimum alerter.
- La classe DPE et les dépenses d'énergie proviennent du [[Diagnostic]] DPE déjà
  rattaché au lot — donnée disponible, à injecter dans le gabarit.

> [!warning] Points à trancher / contradictions
> - **L'identifiant fiscal du logement ne figure pas** dans les mentions obligatoires
>   listées par le module 1 ([[Bail]] : parties, logement, loyer/IRL, charges, dépôt,
>   diagnostics, notice, zone tendue, dernier loyer). Ni champ ni contrôle prévus au
>   module 0. **Confirmé par le formulaire officiel**
>   ([[2026-08-05-bailpdf-modele-bail-non-meuble]], section II : champ à 13 positions
>   sous l'adresse) — reste à ajouter au modèle 1.16 et au [[Lot]].
> - Le bloc « calendrier passoires » et l'affichage des dépenses théoriques d'énergie
>   ne sont pas non plus mentionnés par le module 1 — même traitement.

## État dans l'application au 23/11/2026 — notice d'information et congé du bailleur (mission palier 1, lot 33)
En préproduction, **non publié** ([[Mission palier 1 — audit du 22 novembre 2026]], points P0-07 et P0-08).
- **Notice d'information.** Le document que Gerimmo prépare est un **résumé** : il le dit en tête (« Ce document est un
  résumé établi par Gerimmo. Il ne remplace pas la notice d'information officielle, dont le texte complet est fixé par
  arrêté : le bailleur la remet au locataire avec le bail. »). L'écran du bail parle de « résumé » et demande de
  remettre la notice officielle complète. Le texte officiel lui-même n'est pas dans Gerimmo.
- **Congé pour vente ou pour reprise.** L'écran dit « À faire relire avant de notifier » : un congé incomplet peut être
  annulé, et Gerimmo n'a pas pu comparer son modèle au texte officiel. La lettre de reprise imprime désormais
  l'adresse du bénéficiaire et les raisons de la reprise ; Gerimmo ne la prépare pas tant que le nom du bénéficiaire,
  son lien avec le bailleur, son adresse et les raisons ne sont pas saisis (choix de prudence de l'agent, pas une règle
  citée). Le motif « légitime et sérieux » n'a pas ce rappel.

> [!warning] Textes non relus (23/11/2026)
> Ni la notice officielle, ni les textes à reproduire dans un congé n'ont pu être relus par l'agent. Les questions
> (le résumé peut-il rester joint à la signature électronique ? quels textes reproduire mot pour mot ? les quatre
> mentions de la reprise suffisent-elles ?) sont posées au juriste (`JURISTE.md`, partie 1, points 37 et 38).
