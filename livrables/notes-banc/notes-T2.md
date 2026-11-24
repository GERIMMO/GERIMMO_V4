# Notes du lot T2 — Bail, caution, colocation, notice

Date : 25/11/2026. Arbre : `$S/palier1`, un commit local `13495037` (parent `75128ffb`, lot T1), sans push.
Aucune migration, aucune donnée écrite, aucun droit modifié.

Textes relus par moi avant chaque correction (le recueil reste « fourni par le dirigeant, source et version déclarées,
non recontrôlé ») : `r1-refs01-09.txt` L270-305 (article 22-1), L462-468 et L618-626, L1088-1095, L1525-1531, L1618-1628,
L1754-1760 (notice), L2476-2512, L2524-2546, L2562-2580, L2630-2640, L2662-2800 (contrat type nu), L2885-2900, L2950-2972,
L3012-3022, L3044-3125 (contrat type meublé) ; `r2-refs10-24.txt` L252-300 (article 22), L1560-1668 (articles 8-1, 11, 13).
Code relu : les quatre modèles de bail, `mentions-location.ts`, `cautionnement.ts`, `mention-caution.ts`, `notice.ts`,
les deux formulaires du bail, la carte du cautionnement, l'activation d'un bail signé, `generer_appels_loyer_interne`.

Consigne d'économie appliquée : les neuf écarts importants d'abord ; parmi les mineurs, seulement les textes faux.

## 1. Tableau identifiant → verdict

| Identifiant | Verdict | Ce qui a été fait |
|---|---|---|
| R03-A1 (important) | **corrigé** | Écart réel (la carte disait « Gerimmo ne contrôle pas ce point » ; le modèle ne lisait pas la qualité du bailleur). L'acte est **refusé** quand un bailleur est « SCI » (non familiale) ou « Personne morale », sauf case « logement loué à un étudiant qui ne bénéficie pas d'une bourse » (carte du bail, catalogue, signature en ligne). La déclaration s'imprime dans l'acte. SCI familiale, personne physique, indivision : inchangé. |
| R17-A3 (important) | **corrigé** | Bail à plusieurs locataires : acte refusé tant que le garant n'est pas rattaché à un locataire du bail. L'écran l'annonce. |
| R06-A2 = R11-A1 (important) | **corrigé** | Résumé de la notice : « il produit intérêt » remplacé par la majoration de 10 % du loyer mensuel par période mensuelle commencée en retard, son exception (adresse non communiquée), et « ne porte pas intérêt » (article 22). |
| R06-A1 (notice entière) | **non fait, voulu** | Gerimmo n'imprime pas la notice. Vérifié : l'écran ne disait PAS quelle version déposer ; il le dit maintenant (annexe de l'arrêté du 29 mai 2015 dans sa rédaction issue de l'arrêté du 9 octobre 2026, contrats conclus ou renouvelés depuis le 18 octobre 2026). Le résumé le dit aussi. |
| R08-A1 (important) | **corrigé** | Mandataire : « activité exercée : gestion immobilière » et « garant (nom et adresse) » = garantie financière du profil, comptée « à renseigner » si vide. Libellé du profil de l'agence précisé. Voir « supposé ». |
| R08-A2 (important) | **corrigé en partie** | Les trois alinéas du I de l'article 5 rappelés mot pour mot, plafonds, détail par partie. **Non fait** : « détail des prestations effectivement réalisées » et « autres prestations » (pas de donnée) ; l'écran invite à les écrire dans les clauses particulières. |
| R08-A3 (important) | **corrigé** | « Montant total dû à la première échéance de paiement pour une période complète de location : 740,00 € (loyer 650,00 € + charges 90,00 €) », puis, si le bail ne commence pas un 1er, le premier terme au prorata, détaillé. Voir § 2 (un écart d'un centime trouvé et corrigé). |
| R17-A1 (important) | **corrigé (option minimale)** | Texte conditionnel, sans donnée nouvelle : la clause donne la règle de la colocation dans les mots de l'article 8-1, puis, quand le bail a exactement deux locataires, « Cette règle ne s'applique pas si la location est consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat… ». Même phrase dans l'acte de cautionnement. La base n'est pas touchée (voir questions). |
| R17-A2 (important) | **corrigé (refus)** | Un bail nu (ou colocation / contrat individuel sur logement nu) dont le champ « événement de durée réduite » est rempli n'est plus produit ; message qui dit quoi faire. Les deux formulaires préviennent. |
| R20-A1 = R08-A6 (important) | **corrigé** | Le bail meublé ne lit plus le champ et n'imprime plus la rubrique, même « sans objet » ; champ masqué en meublé. |
| R03-A2 (mineur) | **corrigé** | L'acte reprend la date de révision et la valeur de l'indice, comme le bail. |
| R03-A3 (mineur) | **corrigé** | Plus de « pénalités de retard », ni dans l'acte ni dans la mention à recopier. |
| R05-A1 (mineur) | **corrigé** | Quote-part de charges annoncée pour les extraits du règlement de copropriété (contrat et liste des annexes). |
| R06-A3 (mineur) | **corrigé en partie** | SCI familiale (trois ans), état des lieux d'entrée et ses deux exceptions, préavis d'un mois en meublé, « tribunal judiciaire », version de la notice. **Non traité** : rubrique « aides au logement » (absente de la notice), parties de la notice sans résumé. |
| R08-A4 (mineur) | **corrigé** | Clause résolutoire : les deux phrases du contrat type, mot pour mot ; renvoi à l'article 24 retiré. |
| R08-A5 (mineur) | **corrigé** | Phrases de la rubrique III. Nu : mot pour mot, « 3 ou 6 ans » remplacé par la durée du contrat. Meublé : voir § 4. |
| R08-A7 (mineur) | **corrigé** | Dernière phrase du rappel de décence : celle du contrat type. |
| R17-A4 (mineur) | **corrigé pour le texte** | Bail et acte : « à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau colocataire figure au bail. À défaut… au plus tard… six mois ». La base (remplaçant arrivé après coup) : non traitée. |
| R01-A3 (mineur) | **corrigé** | Lettre de révision, ancienne rédaction : « rédaction issue de la loi n° 2014-366 » retiré. |
| R01-A1, R01-A2 | **non traités** | Règle de calcul et champ nouveau, pas un texte. |
| R08-A8, R08-A9 | **non traités** | Rubriques « le cas échéant » à créer ; adresse électronique facultative (change la liste « à renseigner »). |
| R04, R09 | **sans écart** | Rien à corriger (analyse confirmée pour ce que j'ai relu : la mention garde tous les éléments de l'article 2297, test). |

Aucun écart n'a été trouvé « faux ».

## 2. R08-A3 — vérifications chiffrées (argent)

Le premier terme imprimé au bail se calcule maintenant comme l'appel de loyer (`generer_appels_loyer_interne`) :
loyer et charges proratisés **chacun**, arrondis au centime, puis additionnés. L'ancien calcul du bail arrondissait le
total : il pouvait s'écarter d'un centime de l'appel émis et du décompte de prorata.

| Cas | Période complète | Premier terme |
|---|---|---|
| 650,00 + 90,00, entrée le 15/11/2026 (16 j / 30) | 740,00 € | 346,67 + 48,00 = 394,67 € |
| 650,50 + 50,50, entrée le 15/11/2026 | 701,00 € | 346,93 + 26,93 = **373,86 €** (ancien calcul : 373,87 €) |
| 650,00 + 90,00, entrée le 02/12/2026 (30 j / 31) | 740,00 € | 629,03 + 87,10 = 716,13 € |
| 1 000,00 + 100,00, entrée le 29/02/2028 (1 j / 29) | 1 100,00 € | 34,48 + 3,45 = 37,93 € |
| 1 000,00 + 100,00, entrée le 28/02/2027 (1 j / 28) | 1 100,00 € | 35,71 + 3,57 = 39,28 € |
| 930,00 + 31,00, entrée le 02/12/2026 | 961,00 € | 900,00 + 30,00 = 930,00 € |

- Parité avec la base (formule de la fonction, exécutée dans Postgres) : **50 764 cas** (cinq mois dont février 2027 et
  2028, chaque jour, 49 loyers × 7 charges) — 50 764 identiques. L'ancien calcul différait dans 9 973 de ces cas.
  Fichiers : `$S/recueil/T2/parite.csv`.
- Test permanent : grille de 5 472 cas contre un calcul témoin en centimes entiers.
- Le décompte de prorata et l'avis d'échéance lisent l'appel de loyer : ils ne changent pas et concordent avec le bail.
- Non vérifié : un bail « à terme échu » — le bail dit le montant, pas la date du premier paiement (inchangé).

## 3. Circuits de signature — ce qui est préservé, ce qui est à préparer de nouveau

L'activation d'un bail signé recalcule l'empreinte du contrat. Chaque texte modifié garde donc son ancienne rédaction
sous la « typographie archivée » (celle de la production).
- Les neuf empreintes de la production (`signature-empreinte-avant-g8.test.ts`) et celles d'avant le 24/10 : inchangées.
- Comparaison octet pour octet avec le commit précédent, hors dépôt : **13 824 rendus archivés identiques** (agence,
  copropriété, 1 à 3 locataires, colocation, DPE, durée réduite, prorata, étudiant, garant, loyer absent ; nu et meublé ;
  les deux formats archivés). Script : `$S/recueil/T2/zz/`.
- Bail nu à durée réduite signé avant ce lot : reste activable (le rendu du jour, refusé, est sauté ; test).

**À préparer de nouveau après publication** (l'envoi répond « Le dossier a changé depuis la préparation. Préparez et
relisez un nouveau PDF. ») :
1. tout bail (nu, meublé, colocation, contrat individuel) dont le dossier de signature est « prêt » mais pas envoyé ;
2. tout acte de cautionnement « prêt », y compris celui qui attend que la caution confirme son mobile (son envoi
   automatique sera refusé) ;
3. un bail nu « prêt » avec un événement de durée réduite : il affiche le refus ; vider le champ ou rédiger hors Gerimmo ;
4. un acte « prêt » pour un bailleur SCI non familiale / personne morale, ou sans colocataire désigné : il affiche le refus.
Un dossier déjà envoyé, en cours ou signé n'est pas touché. Les résumés de notice déjà rangés gardent leur fichier (donc
la phrase fausse) : l'écran ne les signale pas « à actualiser » (voir questions).

## 4. Contrat meublé « retouché à la main à cinq endroits »

Extraction par programme (`$S/recueil/T2/extraire.py`, résultat `extraits.json`) : les trois alinéas de l'article 5 I,
les deux phrases de la clause résolutoire et la phrase du rappel de décence sont **identiques** dans l'annexe 1 et
l'annexe 2 : repris mot pour mot dans les deux baux (`contrat-type-textes.ts`, garde par empreinte).
Aligné sur le sens, pas mot pour mot (meublé) : la phrase de reconduction (« un an » ; aucune pour le bail étudiant) ;
les phrases sur les congés sont celles de l'annexe 1, qui ne diffèrent de l'annexe 2 que par la place de « quant à lui ».
Coquille du recueil non reproduite : « du I de l'article 5 (I) » (annexe 1) ; j'ai pris la forme de l'annexe 2.

## 5. Preuve par rendu PDF

`$S/phase3/correctifs/T2/` : `rendre.sh`, `zz-t2-rendu.test.ts` (jamais commité), `analyse-pages.py`, `apres/`.
- 40 essais : **36 PDF** (3 à 9 pages), 3 refus attendus (SCI, personne morale, colocataire non désigné), 1 « incomplet »
  attendu (meublé sans inventaire). Longueurs variées : clauses de 1 à 30 répétitions, inventaire de 11 à 40 lignes,
  1 à 3 locataires, agence ou non.
- Lecture page par page : aucun titre seul en bas de page, aucun « Fait à » isolé, aucune dernière page presque vide.
- Pages regardées : `apres/img/nu-agence-3.png` (première échéance, solidarité), `nu-agence-4.png` (clause résolutoire,
  honoraires), `caution-2-2.png` (étendue, colocation, mention).
- **Image de signature** : le bail et l'acte de cautionnement sont des actes des parties ; ils portent des cadres de
  signature, jamais l'image de signature de l'émetteur. Rien à essayer là ; deux dossiers ont été rendus avec leurs
  pages de signature électronique (`signature-*.pdf`).
- Contextes fictifs des tests, pas des dossiers de la base : les dossiers « familles » n'existent plus dans le banc.

## 6. Contrôles

- Tests liés aux fichiers modifiés : 93 fichiers, 2 012 tests, tous verts. Nouveau : `textes-officiels-t2.test.ts` (46).
- Suite complète : 15 754 réussis, 1 échec et 5 fichiers en échec, tous dans la liste attendue (`lot2-auth-reel`,
  `lot3-notifications-base`, `api-isolation`, deux `ux-*-navigateur`). `$S/recueil/T2/vitest-complet.log`.
- Types et lint : propres.
- Parcours e2e (precheck) : voir la fin de ce fichier.
- Tests mis à jour parce qu'ils affirmaient l'ancien état, avec commentaire : « (premier mois au prorata) », rubrique
  « durée réduite » en meublé, rappel « Gerimmo ne contrôle pas ce point », six empreintes de garde (anciennes valeurs
  notées dans le test).
- Fichiers du lot T1 touchés, par nécessité : `catalogue-options.ts` (ligne du cautionnement), `e2e/prudences-juridiques.spec.ts`
  (étape 4, cautionnement) et `tests/prudences-juridiques-sans-texte.test.ts` (P0-09). Rien de ce que T1 y a écrit n'est modifié.

## 7. Supposé

1. **« Activité exercée : gestion immobilière ».** Gerimmo n'a pas cette donnée. J'ai repris ce que le mandat de gestion
   de Gerimmo imprime déjà (« carte professionnelle “Gestion immobilière” »). Faux pour une agence qui ne ferait que de la
   transaction.
2. **Garant du mandataire** = le champ « garantie financière » du profil (texte libre). Les agences existantes y ont
   écrit « organisme, montant », sans adresse : le bail imprimera ce qu'elles ont écrit.
3. **Qualité du bailleur absente ou illisible** : traitée comme une personne physique (acte de cautionnement préparé),
   comme pour la durée du bail.
4. **Deux locataires = peut-être des époux.** L'exception n'est imprimée que pour exactement deux locataires.
5. « Hors charges » pour « loyer mensuel en principal » (article 22) dans le résumé, comme le décompte de restitution.
6. La case « étudiant non boursier » est proposée à tous (la carte ne lit pas la qualité du bailleur) ; elle ne compte
   que pour une société.

## 8. Mineurs et restes non traités

- R01-A1 : la révision est refusée en F/G sans regarder la date du bail (plus sévère que le texte).
- R01-A2 : date de révision convenue autre que l'anniversaire (baux repris).
- R08-A2 (reste) : détail des prestations réalisées, autres prestations.
- R08-A8 : usage mixte, répartition du chauffage collectif, loyer de base avec complément, charges sans provision,
  révision du forfait, partage des économies de charges, assurance pour compte des colocataires, majoration pour
  travaux, annexes « autorisation préalable » et « loyers du voisinage ».
- R08-A9 : adresse électronique exigée alors qu'elle est facultative au contrat type.
- R06-A3 (reste) : rubrique « aides au logement » ; nuisibles, conjoint victime de violences, prévention des expulsions.
- R17-A4 (base) : un remplaçant arrivé après le départ enregistré ne raccourcit pas les six mois.
- R17-A1 (base) : le départ d'un des deux locataires calcule toujours une fin de solidarité à six mois, époux compris.
- R17-D : confirmation de l'événement deux mois avant le terme, report unique (article 11) ; normes de peuplement.
- Le bailleur société : la caution d'un organisme habilité ne se prépare pas dans Gerimmo (liste du décret absente du recueil).

## 9. Questions au dirigeant

1. **Époux et partenaires de PACS** : faut-il une vraie case au bail (« mariés ou pacsés entre eux, seuls au bail »),
   pour retirer la règle des six mois du contrat et du calcul de la base ? Aujourd'hui : texte conditionnel seulement.
2. **Bail nu à durée réduite** : le refus suffit-il, ou faut-il le vrai parcours (durée, raisons, événement, contrôle du
   bailleur, confirmation deux mois avant le terme) ?
3. **Activité du mandataire** : ajouter un champ au profil de l'agence, ou garder « gestion immobilière » ?
4. **Résumés de notice déjà rangés** : faut-il les signaler « à actualiser » à l'écran (ils portent « produit intérêt ») ?
5. **Détail des prestations d'honoraires** : champs à créer, ou consigne « clauses particulières » suffisante ?
6. **Articles 25-4 et 25-6** absents du recueil : le plafond de deux mois du dépôt en meublé n'a pas pu être relu.

## 10. Points pour JURISTE.md

À retirer (tranchés par le texte fourni, et codés) :
- 1·6 et 5·12 (a) — durée réduite en meublé : non ; rubrique retirée du bail meublé.
- 1·20 — clause à six mois pour deux époux : le régime de la colocation ne les concerne pas ; clause conditionnelle.
- 1·24 et 1·39, et le rappel P0-09 (ligne 120 de JURISTE.md) — caution demandée par une société : refus codé.
- 1·23 — reproduction de l'avant-dernier alinéa de l'article 22-1 : identique au texte fourni.
- 6·2 — « voies d'indemnisation » retiré du résumé : confirmé.

À alléger :
- 1·1 et 1·2 — contrat type : clause résolutoire et article 5 I maintenant mot pour mot ; restent R08-A8, R08-A9 et le
  détail des prestations.
- 1·21 — remplaçant entré après la date d'effet : le texte du bail suit la loi ; reste le calcul de la base.
- 1·22 — mention de l'article 2297 : contenu vérifié ; reste la saisie au clavier en signature électronique.
- 1·4, 1·37, 8·2 (b) — notice : texte intégral exigé, version dite à l'écran ; restent 8·2 (a), (c), (d).

À ajouter :
- Une location à deux époux doit-elle porter une clause de solidarité, et laquelle ? La phrase conditionnelle imprimée
  suffit-elle, ou faut-il deux contrats distincts selon la situation de famille ?
- Acte de cautionnement d'époux colocataires désignant un seul des deux : la règle « cautionnement nominatif » imprimée
  sous condition est-elle sans risque ?
- Bailleur société et « étudiant non boursier » : la simple déclaration du bailleur imprimée dans l'acte suffit-elle,
  ou faut-il un justificatif ? Qu'en est-il d'un apprenti (l'article ne le cite que pour l'assurance) ?
- Indivision dont un seul membre est une société non familiale : Gerimmo refuse l'acte ; est-ce trop sévère ?
- « Activité exercée » du mandataire : quelle formule exacte ? Le garant est-il bien l'organisme de garantie financière ?
- Première échéance : le contrat type demande le montant d'une « période complète » ; la seconde phrase (premier terme
  au prorata) peut-elle y figurer ?
- Résumé de la notice : « tribunal judiciaire » (mots de la notice) ou « juge des contentieux de la protection » ?
- Majoration de 10 % : « loyer mensuel en principal » = hors charges, et hors complément de loyer ?
- Phrases de la rubrique III du bail meublé : à relire sur le Journal officiel (annexe retouchée dans le recueil).

## 11. Parcours e2e et fin de lot

- `precheck.sh T2 13495037` : préparation, API, jeu d'essai et compilation à 0 ; **11 parcours réussis sur 11**
  (`prudences-juridiques`, `decisions-24-11-d3`, `decisions-24-11-d3-reprise`, `decisions-24-11-d1`,
  `depot-bail-signe-papier`), terminé avant le redémarrage du conteneur (`$S/banc-integ/T2.status`).
- Après le redémarrage : rendu PDF refait en entier avec le code du commit (mêmes chiffres : 36 PDF, 3 refus, 1 incomplet,
  aucune alerte de mise en page) ; fichier de travail du rendu retiré de l'arbre ; arbre propre ; aucun serveur laissé
  (l'émulateur d'API et le serveur de l'application sont arrêtés ; Postgres tourne).
- La suite vitest complète n'a pas été relancée après le redémarrage : le code n'a pas changé depuis le passage du § 6.
