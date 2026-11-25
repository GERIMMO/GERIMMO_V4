---
type: business-rule
tags: [bail, mentions-obligatoires, alur, dpe, identifiant-fiscal, modele-type, notice, contrat-type]
status: draft
created: 2026-08-05
updated: 2026-11-25
sources: ["[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-07-24-gerimmo-v3-module-1-bail]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "[[Recueil des textes officiels (v6)]]", "DECISIONS-2026-11-24.md (Q46)", "QUESTIONS.md (Q40, Q46, Q77, Q102, Q107 à Q111)", "JURISTE.md (partie 9, points 15 à 19)", "JOURNAL.md (entrées du 24-25/11/2026)", "livrables/notes-banc/ (notes-T1, notes-T2, relecture-T2R, notes-mariage, fusion/relecture-contrats)", "livrables/recueil/analyse-refs-01-09.md (réf. 05 à 09)"]
---

# Mentions obligatoires du bail

**Énoncé :** tout bail d'habitation (vide ou meublé) signé depuis le 1er août 2015 doit
reprendre le **modèle-type du décret n° 2015-587** (loi ALUR) ; depuis le
**1er janvier 2024**, le **décret n° 2023-796** y ajoute trois mentions liées au fisc
et à l'énergie. Un bail non conforme reste valable mais est fragilisé : le locataire
peut exiger les mentions manquantes, voire contester le contrat.
Source : [[2026-08-05-bailpdf-contrat-de-bail|BailPDF]].

> [!note] Version du contrat type en vigueur (texte fourni, 25/11/2026)
> D'après le [[Recueil des textes officiels (v6)]] (fourni par le dirigeant, non recontrôlé sur Légifrance), le décret
> n° 2015-587 est en vigueur dans sa version du **1er octobre 2026** (décret n° 2026-596, art. 3 : il « s'applique aux
> contrats conclus ou renouvelés à compter de cette même date ») : téléphone portable facultatif, servitude de
> résidence principale, clause résolutoire à six semaines. Le code les reprenait déjà. Le texte fourni dit aussi : « Le
> bailleur ne peut pas se prévaloir de la violation du présent article » (loi de 1989, art. 3, version de 2022 dans le
> recueil). Détail du relevé : `livrables/recueil/analyse-refs-01-09.md`, réf. 05, 08 et 09.

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
> - *Mise à jour du 25/11 :* la lecture du code (branche de travail, 24/11) face au contrat type fourni constate que le
>   bail imprime déjà l'identifiant fiscal, la période de construction, la classe du DPE, les dépenses d'énergie et
>   l'année des prix, et le rappel des classes et de l'outre-mer (`livrables/recueil/analyse-refs-01-09.md`, réf. 08, B).
>   Les deux points ci-dessus valent donc pour le référentiel (module 1), pas pour le code ; la date de leur mise en
>   production n'est pas établie ici.

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
- *Version préparée (lot T1, `89cb87ff`, non publiée) :* le congé pour vendre d'un logement nu reproduit mot pour
  mot les cinq alinéas de l'article 15 II du texte fourni (« Les termes des cinq alinéas précédents sont reproduits à
  peine de nullité dans chaque notification ») et exige les conditions de la vente ; la lettre annonce la notice de
  l'arrêté du 13 décembre 2017, que le bailleur joint lui-même (Q102) ; le rappel « à faire relire » est gardé. Détail :
  [[Bail]], § « Version préparée ».

> [!warning] Textes non relus (23/11/2026)
> Ni la notice officielle, ni les textes à reproduire dans un congé n'ont pu être relus par l'agent. Les questions
> (le résumé peut-il rester joint à la signature électronique ? quels textes reproduire mot pour mot ? les quatre
> mentions de la reprise suffisent-elles ?) sont posées au juriste (`JURISTE.md`, partie 1, points 37 et 38).
> *25/11 : le recueil fourni contient l'article 15 II (reproduit depuis, lot T1), la notice de congé de 2017 (texte
> douteux : « 30 0000 € », adresses coupées — non imprimée) et la notice du bail entière (site miroir — non imprimée,
> Q77). Aucun de ces textes n'est recontrôlé sur Légifrance.*

## État dans l'application au 24/11/2026 (préproduction, non publié) — notice, travaux, durée, colocation (mission palier 1, phase 3)

Relu dans le code après les lots 40, 45 et 48 ([[Mission palier 1 — audit du 22 novembre 2026]] ; `QUESTIONS.md`, Q46
et Q53 ; `JURISTE.md`, partie 5, points 9 à 12).
- **Notice = résumé joint à part dans la signature électronique.** Le résumé établi par Gerimmo est joint à l'enveloppe
  sous le nom « resume-notice-information.pdf » ; la page de garde le liste à part comme « Document d'information
  joint », qui « n'est pas une annexe du contrat » ; les autres pièces restent « annexe-N.pdf ». Le texte officiel n'est
  pas joint. La fiche du bail, le récapitulatif et la signature retiennent tous le même résumé, le plus récent (lot 45).
  Voir [[Signature électronique]].
- **Travaux d'une première location** : le contrat imprime « Sans objet — première location. » dans la rubrique des
  travaux effectués depuis la fin du dernier contrat ; les contrats préparés avant cette mise à jour impriment « Néant »
  quand rien n'est saisi. La vue en lecture seule d'un bail signé renvoie au contrat signé, en citant les deux
  formulations (Q53 ; juriste, point 11).
- **Bail étudiant** : il n'est plus décrit avec une « durée de droit commun ». La rubrique « durée réduite justifiée par
  un événement précis », prévue pour le bail nu, reste imprimée au meublé : question au juriste (point 12).
- **Colocation à contrats individuels** : le montant saisi pour le logement entier s'appelle « Loyer maximal applicable
  au logement entier », à l'écran, dans le contrat et dans le message de la base (migration 20261123170000). Règle
  légale en toute zone, ou plafond retenu par le bailleur ? (juriste, point 10). Voir [[Bail]].

> [!warning] Points à trancher / contradictions (24/11/2026)
> - Le bail nu et le bail meublé déclarent la notice « annexée au présent contrat et en faisant partie », alors que
>   l'enveloppe de signature ne contient qu'un résumé présenté comme « pas une annexe du contrat », et que l'écran
>   demande au bailleur de remettre lui-même la notice officielle. Remise séparée suffisante, ou faut-il bloquer l'envoi
>   tant qu'elle n'est pas jointe ? (Q46 ; juriste, point 9). L'avertissement du 23/11 ci-dessus (« le résumé peut-il
>   rester joint à la signature électronique ? ») est précisé, pas tranché.
>   *Décision du 24/11 (Q46) : « joins la notice officielle entière, dans la version en vigueur à la signature. En
>   attendant, le bailleur la dépose lui-même, et l'envoi en signature électronique est bloqué sans elle. » Solution
>   d'attente appliquée en préproduction (lot D3) : voir ci-dessous. Reste ouvert : Gerimmo ne joint pas lui-même le
>   texte officiel ; la signature sur papier n'est pas bloquée.*

## Version préparée, à publier — contrat type et notice relus sur le texte fourni (au 25/11/2026)

**En production aujourd'hui** (version du 21/11, `81740dec`) : rien de ce qui suit. **Version préparée** : lot D3, en
préproduction depuis le 24/11 (`fde4cbb4`) ; lots T1 et T2 et case « mariés ou pacsés », réunis avec lui dans la branche
`claude/palier-1-fusion` (`89cb87ff`), vérifiée en entier sur le banc et poussée le 25/11 sur la branche de
préproduction `claude/palier-1-preproduction` (`JOURNAL.md`, entrée du 25/11) ; non publiée en production. Référence :
le [[Recueil des textes officiels (v6)]], **fourni par le dirigeant, non recontrôlé sur Légifrance** — « suit le texte
fourni » n'équivaut pas à « conforme ».

### Notice d'information (D3, puis T2)
- Le bailleur **dépose la notice** (PDF) à l'étape Documents du bail ; sans elle, préparation et envoi en signature
  électronique sont bloqués ; déposée, elle est jointe comme annexe. Exigée pour un bien d'habitation seulement ; le
  papier n'est pas bloqué (rappel d'annexer la notice). Les anciennes versions déposées restent visibles sur la fiche.
- L'écran dit la **version à déposer** : « l'annexe de l'arrêté du 29 mai 2015 dans sa rédaction issue de l'arrêté du
  9 octobre 2026 », pour un contrat conclu ou renouvelé depuis le 18 octobre 2026 (texte fourni : l'arrêté
  « s'applique aux contrats conclus ou renouvelés à compter de son entrée en vigueur »). Gerimmo ne vérifie ni le
  fichier ni sa version, et n'imprime pas la notice du recueil (site miroir, trois adresses coupées, deux tableaux à
  reconstruire : Q77).
- **Résumé** (« Document d'information joint », pas une annexe) corrigé : le dépôt rendu en retard n'« produit » plus
  « intérêt » — il est majoré de 10 % du loyer mensuel hors charges par période mensuelle commencée en retard, sauf
  adresse non communiquée, et « ne porte pas intérêt » (art. 22 fourni) ; trois ans aussi pour une SCI familiale ; état
  des lieux d'entrée et ses deux exceptions ; préavis d'un mois en meublé ; « tribunal judiciaire » ; version citée.
  Les résumés rangés avant le lot T2 gardent l'ancienne phrase, sans signalement à l'écran (Q109).

### Contrat type (lot T2)
- **Mandataire** (agence) : « activité exercée : gestion immobilière » et « garant (nom et adresse) » pris dans le champ
  « garantie financière » du profil, compté « à renseigner » s'il est vide — supposé, faux pour une agence de seule
  transaction (Q108).
- **Honoraires** : les trois alinéas du I de l'article 5 rappelés mot pour mot, plafonds et détail par partie. **Non
  fait** : « détail des prestations effectivement réalisées » et « autres prestations » ; l'écran invite à les écrire
  dans les clauses particulières (Q110).
- **Première échéance** : « Montant total dû à la première échéance de paiement pour une période complète de location »,
  loyer et charges détaillés (exemple des notes : 740,00 € = 650,00 + 90,00), puis, si le bail ne commence pas un 1er,
  le premier terme au prorata, calculé comme l'appel de loyer.
- **Clause résolutoire** : les deux phrases du contrat type, mot pour mot ; renvoi à l'article 24 retiré. **Rubrique
  III** (reconduction, congés) : mot pour mot en nu, durée du contrat à la place de « 3 ou 6 ans » ; en meublé, alignée
  sur le sens (l'annexe meublée du recueil a été retouchée à la main à cinq endroits non dits). **Rappel de décence** :
  la phrase du contrat type. **Extraits du règlement de copropriété** : la quote-part de charges du lot est annoncée.
- **Durée réduite** : un bail nu dont l'« événement de durée réduite » est rempli n'est plus produit (Q107) ; la rubrique
  sort du bail meublé (l'article 11 n'est pas applicable au meublé d'après le texte fourni). Voir [[Types de baux]].
- **Solidarité** : clause dans l'ordre de l'article 8-1 VI ; exception des époux et partenaires de PACS dite sous
  condition à deux locataires ; case « mariés ou pacsés » qui remplace la règle et retitre le contrat « Contrat de
  location » ([[Bail]]).
- **Non traités** : rubriques « le cas échéant » (usage mixte, chauffage collectif, loyer de base avec complément,
  charges sans provision, révision du forfait, partage des économies de charges, assurance pour compte des colocataires,
  majoration pour travaux, annexes « autorisation préalable » et « loyers habituellement constatés ») ; adresse
  électronique exigée alors que le contrat type la dit facultative.
- Les baux déjà préparés gardent leur empreinte ; un dossier de signature « prêt » mais non envoyé se prépare de
  nouveau (Q40).

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Notice** : décision « joindre la notice officielle entière » (Q46) non réalisable tant que le texte n'est pas sûr
>   (Q77) ; contrats individuels de colocation : l'arrêté vise les contrats établis suivant le contrat type, qui ne s'y
>   applique pas — notice due ou non ? (`JURISTE.md`, partie 8, point 3).
> - **Activité et garant du mandataire**, **première échéance au prorata**, **« tribunal judiciaire »**, **majoration
>   de 10 % sur quel loyer**, **rubrique III du meublé** : `JURISTE.md`, partie 9, points 15 à 19.
> - **Frais d'agence** : la rubrique 7 ci-dessus (BailPDF) donne 12 / 10 / 8 €/m² et 3 €/m² ; le barème 2026 relevé le
>   14/09 donne 12,10 / 10,09 / 8,07 € TTC et 3,03 € TTC ([[Bail]]). Les deux chiffres coexistent dans le wiki.
> - **Article 3 de la loi de 1989** : le recueil le donne dans sa version du 1er janvier 2022, probablement modifiée
>   depuis (supposé, non constaté — servitude de résidence principale citée par la notice et non par l'article).
