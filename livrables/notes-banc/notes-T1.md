# Notes du lot T1 — Congés (bailleur et locataire)

Date : 25/11/2026. Arbre : `$S/palier1`, un commit local, sans push.
Textes lus par moi avant chaque correction : `r1-refs01-09.txt` L57-257 (article 15 entier), `r2-refs10-24.txt`
L380-800 (arrêté du 13 décembre 2017 et sa notice, jusqu'au point 3-1), L1661-1666 (article 13), L2041-2116
(article 25-8). Le recueil reste « texte fourni par le dirigeant, source et version déclarées, non recontrôlé ».

## 1. Tableau identifiant → verdict

| Identifiant | Verdict | Ce qui a été fait |
|---|---|---|
| R13-A1 (bloquant) | **corrigé** | Écart réel (vérifié sur la base : `if v_effet > v_terme + 1`). Nouvelle règle « réception + préavis ≤ dernier jour du bail », dans la base (migration `20261125101500`), dans l'application (`src/lib/delai-conge-bailleur.ts`), dans le message du refus et dans le modèle. L'écran du bail affiche la date limite du terme en cours, avec « Gardez une marge ». |
| R02-A1 = R13-A3 | **corrigé** | Les cinq premiers alinéas de l'article 15 II sont imprimés mot pour mot dans le congé pour vendre d'un logement nu (`article-15-ii.ts`, extraits du recueil par programme, pas retapés). Garde-fou : cinq alinéas + empreinte ; texte altéré → pas de lettre, message clair. |
| R02-A2 | **corrigé** | « à peine de nullité de l'offre » supprimé : le résumé est remplacé par la reproduction. |
| R02-A3 | **corrigé** | Conditions de la vente exigées en location nue (comptées « à renseigner », pas de PDF sans elles). Facultatives en meublé. |
| R02-A4 = R13-A4 | **corrigé (option prudente)** | La lettre annonce « Pièce jointe : notice d'information… (arrêté du 13 décembre 2017) » pour vente et reprise d'un logement nu. Gerimmo n'imprime PAS la notice ; l'écran dit de la joindre soi-même et où la trouver (Légifrance, texte JORFTEXT000036236664 : identifiant donné par le recueil). |
| R02-A5 | **corrigé (option prudente)** | Plus de préavis d'un mois d'office en zone tendue. La personne qui enregistre le congé coche « la lettre précise le motif et le justifie » ; sinon trois mois. Base, formulaire, espace du locataire, FAQ du locataire, fiche du bien. Congés déjà enregistrés : non touchés. |
| R02-A6 = R13-A2 | **corrigé** | « Réception par le locataire » partout où le congé du bailleur parlait de « première présentation » ; explication des trois modes (lettre recommandée : remise effective ; acte de commissaire de justice : signification ; main propre : remise). La colonne `date_premiere_presentation` garde son nom (commentaire ajouté) ; aucune donnée changée. |
| R13-A5 | **corrigé (nu)** | Reprise refusée en location nue quand un bailleur est « SCI » (non familiale) ou « Personne morale », dans le modèle et dans la base. SCI familiale : la lettre dit que la reprise se fait au profit d'un associé. Meublé : non contrôlé (voir juriste). |
| R13-A7 | **corrigé (question posée)** | Question obligatoire « Logement acheté alors qu'il était déjà loué ? » (vente et reprise, nu). Si oui : date d'acquisition ; Gerimmo compare le terme visé à cette date et **refuse** dans les cas où la loi déplace le congé. Aucun calcul de « première reconduction » ni de date d'effet repoussée. |
| R02-A7 = R13-A6 (mineur) | **corrigé** | Phrase sur le notaire supprimée (le texte reproduit le dit lui-même). |
| R02-A8 (mineur) | **corrigé** | Amende pénale dans les mots du texte (art. 15 V / 25-8 III) ; « à la date du congé » ; « dommages et intérêts » retiré. |
| R02-A9 = R13-A8 (mineur) | **corrigé** | Personne à charge, exception du bailleur, dates d'appréciation ; allocation de l'article L. 544-1 (nu seulement, absente de l'article 25-8). |
| R02-A10 (mineur) | **corrigé** | « acte de commissaire de justice » dans l'écran, le catalogue et les commentaires du congé. |
| 1·38 (désignation des locaux, « supposé insuffisant ») | **corrigé en partie** | Congé pour vendre (nu) : désignation reprise des données du bail (adresse, autres parties, locaux privatifs ; pièces si connues). Voir « supposé » ci-dessous. |
| R13-D (vente à un parent, vente par lots, insalubrité) | **non fait** | Données que Gerimmo n'a pas. Une phrase à l'écran dit que le modèle ne traite pas la vente à un parent jusqu'au troisième degré. Le reste : notes. |
| 1·13 (date d'appréciation de la zone tendue) | **non fait** | Le texte du recueil ne tranche pas (analyse 1, C) ; la réponse du juriste (« à la date du congé ») est « analyse, texte à relire ». Gerimmo lit toujours la zone figée au bail. Question au juriste. |
| Destinataires (époux, partenaires) | **non fait** | Gerimmo ne connaît pas la situation de famille (lot T2, R17-A1). |

Aucun écart n'a été trouvé « faux » : chacun a été relu des deux côtés (texte et code) et confirmé.

## 2. R13-A1 — vérifications chiffrées

Règle appliquée : le congé est dans les délais si « date de réception + N mois » (addition calendaire ; quand le
quantième n'existe pas, dernier jour du mois) est au plus tard le **dernier jour du bail**. La date limite affichée est la
dernière date de réception qui satisfait cette règle.

Exemples de la notice, tous reproduits par la base ET par l'application (tests) :

| Exemple de la notice (ligne du recueil r2) | Terme | Date limite calculée |
|---|---|---|
| L567-568 : terme le 15 juin → au plus tard le 15 décembre | 15/06/2027 | 15/12/2026 |
| L569-570 : terme le 30 juin → au plus tard le 31 décembre | 30/06/2027 | 31/12/2026 |
| L570-572 : terme le 31 août → au plus tard le 28 février (29 si bissextile) | 31/08/2027 ; 31/08/2028 | 28/02/2027 ; 29/02/2028 |
| L577-578 : échéance au 20 septembre → préavis à compter du 20 mars | 20/09/2027 | 20/03/2027 |
| L666-669 (2-1-4) : terme le 20 juillet 2017 → congé le 20 janvier 2017 | 20/07/2017 | 20/01/2017 |
| L700-703 (2-2-2) : terme le 31 mai 2020 → au plus tard le 30 novembre 2019 | 31/05/2020 | 30/11/2019 |

Dans chaque cas, le lendemain de la date limite est refusé (c'est le jour que l'ancienne règle acceptait).
Cas du juriste (1·14) : dernier jour le 20 septembre, reçu le 21 mars (nu) ou le 21 juin (meublé) → refusé.
Parité base / application : 2 × 1 461 termes (chaque jour de 2026 à 2029, trois et six mois), même date limite.

Fins de mois **déduites** (pas dans la notice, même règle) : terme 28/02/2027 → 31/08/2026 ; terme 29/02/2028 →
31/08/2027 ; termes 29 et 30/08/2027 → 28/02/2027 ; terme 31/12/2027 → 30/06/2027 ; meublé : terme 30/11/2027 →
31/08/2027 ; termes 28, 29, 30 et 31/05/2027 → 28/02/2027.

### Ce que le texte ne tranche pas
1. **« Terme » = dernier jour du bail ou jour anniversaire ?** Un bail du 16 juin court jusqu'au 15 juin (Gerimmo :
   terme = début + durée − 1 jour). La notice dit « arrive à terme le 15 juin » sans dire lequel des deux elle vise.
   Ses exemples « 30 juin », « 31 août », « 31 mai » vont dans le sens du dernier jour (baux commencés un 1er). Gerimmo
   retient le dernier jour : c'est la lecture la plus stricte pour le bailleur (date limite un jour plus tôt).
2. **Meublé (trois mois, article 25-8).** La notice ne s'applique pas aux meublés ; l'article 25-8 dit seulement
   « préavis de trois mois » et « à compter du jour de la réception ». Même règle appliquée, par prudence (supposé).
3. **Fins de mois hors des deux exemples** (terme le 28 ou 29 février, le 29 ou 30 d'un mois) : déduites de la règle
   « à défaut, le délai expire le dernier jour du mois » citée par la notice. Exemple à faire confirmer : terme le
   28 février → Gerimmo accepte un congé reçu jusqu'au 31 août.
4. La notice dit qu'un congé donné « bien avant » reste valable : Gerimmo ne limite pas l'avance (inchangé).

### Congés déjà enregistrés
Non modifiés (la migration n'écrit aucune donnée). Un congé du bailleur enregistré sous l'ancienne règle avec une
réception au lendemain de la date limite reste en base tel quel. Je n'ai pas compté ces cas en production (pas d'accès,
et interdit). Requête de contrôle à lancer par le pilote, en lecture seule :
`select id, bail_id, date_premiere_presentation, date_effet, preavis_mois from conges where par='bailleur' and annule_le is null and (date_premiere_presentation + make_interval(months => preavis_mois))::date > date_effet;`

## 3. « Réception » — ce que l'utilisateur saisit aujourd'hui
- Formulaire d'enregistrement d'un congé (fiche du bail) : le champ s'appelait déjà « Date de réception du congé » et
  l'aide disait déjà « réception effective ». Rien à renommer là ; l'aide détaille maintenant les trois modes.
- Préparation du congé du bailleur (fiche du bail et catalogue) : le champ s'appelait « Présentation prévue au
  locataire » et le texte disait « le délai s'apprécie à la première présentation » : **faux**, corrigé en « Réception
  prévue par le locataire », avec « une lettre présentée mais non retirée ne fait pas courir le délai ».
- La liste des congés de la fiche du bail disait « date enregistrée le » : maintenant « reçu le ».
- La colonne `conges.date_premiere_presentation` contient donc, depuis toujours, ce que l'utilisateur a saisi comme
  date de réception. Elle garde son nom ; un commentaire de colonne le dit. Aucune donnée n'est changée. Risque
  résiduel : un utilisateur a pu, par le passé, y saisir une date de première présentation (le nom d'un écran l'y
  invitait pour le congé du bailleur). Non détectable.
- Hors périmètre, laissé tel quel : « première présentation » des relances et mises en demeure (impayés) et du
  décompte de restitution (lot T3).

## 4. Article 15 II — intégrité
- Les cinq alinéas à reproduire sont L156-196 de r1 ; la phrase qui l'impose est L198. Le « renvoi orphelin » signalé
  par l'analyse (« procédures mentionnées aux a et b », L96-98) est dans le **I** de l'article, pas dans le II : les
  cinq alinéas ne sont pas touchés. L'alinéa 4 est coupé par un saut de page du recueil (pied et en-tête de page au
  milieu de la phrase « notifier au / locataire ») : recollé, vérifié à la lecture ; aucun mot ne manque.
- Extraction par programme (`$S/recueil/t1-art15ii.json`), empreinte SHA-256
  `c2cdca5fedd1cd5890e74bbe71412dd1730e7c7a4fcec73da1af53b5148aece0 (corrigé au lot T3, reprise T1R-5 : la note portait une empreinte erronée, celle du code est la bonne)`.
- La lettre ne dit pas la version du texte. L'écran le dit (« version en vigueur depuis le 29 juillet 2023 : vérifiez
  sur Légifrance que ce texte n'a pas changé »).
- À faire une fois par une personne : relire ces cinq alinéas sur Légifrance (réponse 1·16 du juriste).

## 5. Notice de congé
- Non imprimée. Défauts constatés dans le recueil : « 30 0000 € » (L936-937), adresses internet coupées (L860, L943,
  L971), texte daté (« acte d'huissier », « Ministère de la cohésion des territoires »).
- La lettre l'annonce ; l'écran et le catalogue disent « joignez-la vous-même » et indiquent Légifrance avec
  l'identifiant du texte donné par le recueil (pas d'adresse complète recopiée, pas d'adresse inventée).
- Gerimmo ne vérifie pas que la notice est jointe (pas de dépôt, pas de case). Voir question au dirigeant n° 1.

## 6. Preuve par rendu PDF
`$S/phase3/correctifs/T1/` : `rendre.sh` (script), `zz-t1-rendu.test.ts` (jamais commité), `analyse-pages.py`,
`dossiers-fictifs.sql`, `apres/` (PDF, .txt, `rapport.json`, `img/`), `ecran-a.png` et `ecran-b.png` (écran du congé à
390 px, pris par le parcours e2e). Rendu fait avec le code du commit.
- Sessions réelles du banc (propriétaire direct « Parc de Claire Moreau », administrateur de « Agence Alpha »), trois
  baux nus actifs (bailleur personne physique, bailleur SCI non familiale, bail sous mandat d'agence) ; assemblage réel
  (lecture du dossier sous les droits du compte, `terme_bail`), rendu PDF réel ; image de signature fictive injectée
  une variante sur deux (aucune donnée de signature modifiée). Textes de 1 à 30 répétitions (conditions de la vente,
  raisons de la reprise, motif).
- 113 essais : **103 PDF** (37 de deux pages, 66 de trois), 8 refus attendus, 2 « incomplets » attendus.
- Lecture page par page (`analyse-pages.py`) : aucun titre en bas de page, aucun « Fait à » ni libellé « Signature »
  seul en bas de page, aucune dernière page réduite à la signature (au moins quatre lignes de texte avec elle).
  Pages regardées à l'œil : `apres/img/proprietaire-bail1-vente-01-sig-1.png` et `-3.png`, `planche-a.png` (reprise,
  motif légitime), `planche-b.png` et `planche-c.png` (vente, conditions longues).
- Refus constatés sur les dossiers : question d'acquisition sans réponse ; vente et reprise « acheté déjà loué » trop
  récentes ; reprise par la « SCI des Amandiers » ; vente sans conditions (« à renseigner »).
- Les dossiers fictifs « familles » de la phase 3 (org 40917290…) n'existaient plus dans la base du banc au début du
  lot, et `precheck.sh` remet la base à neuf : j'ai créé trois petits dossiers fictifs (`dossiers-fictifs.sql`) sur le
  jeu de démonstration. Ils disparaissent au prochain `precheck.sh`. Les PDF « avant » restent dans
  `$S/phase3/p1-off/documents-familles/org-40917290/conge_bailleur-1-*.pdf`.
- Défaut trouvé par ce rendu et corrigé avant le commit : la désignation des locaux était comptée « à renseigner »
  aussi pour la reprise et le motif légitime ; elle ne l'est plus que pour la vente d'un logement nu (test ajouté).

## 7. Ce qui est supposé (à savoir)
- Même règle de date limite en meublé qu'en nu (§ 2).
- « Terme » = dernier jour du bail (§ 2).
- La question « acheté déjà loué » : Gerimmo laisse passer un congé pour vendre quand le terme visé est **plus de
  trois ans** après l'acquisition, un congé pour reprise quand il est **plus de deux ans** après. Raisonnement : pour
  un bail nu de trois ou six ans, un terme situé plus de trois ans après l'achat est soit le terme en cours (permis
  par le texte), soit un terme postérieur à la première reconduction. À l'égalité exacte, Gerimmo refuse.
- La désignation des locaux du congé pour vendre reprend ce que Gerimmo sait du logement (les mêmes champs que le
  bail imprime), pas le texte d'un bail signé hors Gerimmo. « Autres parties du logement » et « locaux privatifs »
  sont exigés (ils se complètent sur la fiche du lot ; on peut y écrire « néant »). Le nombre de pièces n'est PAS
  exigé : sur un lot loué la base le verrouille (« avenant requis »), l'exiger aurait bloqué sans issue.
- En zone tendue, la base n'exige pas de pièce justificative déposée dans Gerimmo : la case cochée vaut confirmation
  par l'utilisateur. Hors zone tendue, la pièce reste obligatoire (inchangé).
- Zone tendue inconnue : comportement inchangé (un mois accepté s'il est demandé, puis alerte « à vérifier »).

## 8. Questions pour le dirigeant
1. **Notice de congé.** Le juriste (1·18) écrit « Gerimmo ne doit pas produire le congé sans la notice ». J'ai fait le
   minimum demandé : la lettre l'annonce, l'écran dit de la joindre. Voulez-vous en plus (a) une case obligatoire
   « je joins la notice », ou (b) un dépôt de la notice par le bailleur comme pour le bail (Q46), qui bloquerait la
   lettre tant qu'elle n'est pas déposée ?
2. **Préavis en zone tendue.** Désormais trois mois par défaut, un mois si l'utilisateur confirme que la lettre
   l'invoque et le justifie. Faut-il aussi exiger le dépôt de la lettre ou du justificatif dans Gerimmo ?
3. **Logement acheté déjà loué.** Dans les deux cas limités par la loi, Gerimmo refuse de préparer la lettre et
   renvoie vers un professionnel. Voulez-vous plus tard une vraie donnée « date d'acquisition » sur le lot, avec le
   calcul complet (lot à part) ?
4. **Congés du bailleur déjà enregistrés** avec l'ancienne règle : faut-il lancer la requête de contrôle du § 2 en
   production et prévenir les clients concernés ? (Lecture seule ; je ne l'ai pas fait.)
5. **Enregistrement d'un congé pour reprise par une société** : la base le refuse maintenant en location nue. Si un
   client a mal renseigné la qualité de son bailleur (« SCI » au lieu de « SCI familiale »), il doit la corriger
   d'abord ; le message le dit. D'accord avec ce blocage, ou préférez-vous un simple avertissement ?

## 9. Points pour JURISTE.md
À **retirer** (tranchés par le texte du recueil et corrigés) — partie 1 : points 12, 15, 16, 17, 19 ; partie 6 : points
5 et 6. À **alléger** : point 14 (tranché pour le nu par la notice ; reste le meublé et les fins de mois) ; point 18
(l'obligation est traitée ; reste la sanction) ; point 38 (mentions faites ; rappel « à faire relire » conservé).

À **ajouter** :
1. Date limite du congé du bailleur : « terme » = dernier jour du bail ou jour anniversaire de la prise d'effet ?
   (Gerimmo : dernier jour.)
2. Même calcul pour le meublé (trois mois) ? Et pour un terme en fin de mois court : terme le 28 février → congé reçu
   le 31 août encore valable ?
3. Reprise d'un logement **meublé** par un bailleur société : l'article 13 ne vise que les articles 11 et 15. Une
   société (familiale ou non) peut-elle donner congé pour reprise en meublé ? Gerimmo ne contrôle pas.
4. Logement acheté occupé : la « date d'acquisition » est-elle celle de l'acte authentique ? Et à l'égalité exacte
   (terme juste deux ou trois ans après) ?
5. Préavis d'un mois en zone tendue : que doit contenir la « justification » dans la lettre du locataire (simple
   mention de la commune, référence au décret) ? Gerimmo se contente de la confirmation de l'utilisateur.
6. Zone tendue appréciée à la date du congé (réponse 1·13, « à relire ») : Gerimmo lit la zone figée au bail.
7. Congé pour vendre : Gerimmo écrit toujours « vaut offre de vente ». Cas où la loi l'écarte (vente à un parent
   jusqu'au troisième degré avec occupation de deux ans, immeubles de l'article L. 126-17 du CCH) : non traités.
8. Phrase conservée dans les mentions : « il peut quitter le logement à tout moment, sans préavis de sa part ». Le
   texte dit seulement que le locataire ne doit le loyer que pour le temps d'occupation ; la notice ajoute qu'il est
   « conseillé d'informer le bailleur ». À confirmer ou à adoucir.
9. Désignation des locaux dans le congé pour vendre : suffit-il de reprendre les données du logement tenues dans
   Gerimmo quand le bail a été signé ailleurs ?
10. Colocation, époux, partenaires : un congé à chacun (notice 1-3) ; Gerimmo produit une lettre adressée à tous les
    locataires du bail et ne connaît pas la situation de famille.

## 10. Migration
`app/supabase/migrations/20261125101500_conge_textes_officiels_t1.sql` (additive : nouvelle version de
`enregistrer_conge`, fonction interne `date_limite_conge_bailleur`, commentaire de colonne ; aucune donnée, aucun droit
ouvert, aucune RLS touchée). Retour : `app/supabase/retours-arriere/20261125101500_conge_textes_officiels_t1.retour.sql`
(rend le texte de 20261112120300 ; à jouer avant le retour de 20261112120300). Manifeste, LISEZ-MOI, ordre des
migrations et FICHIERS_EN_SERIE mis à jour. Appliquée aux deux bases du banc.

## 11. Tests
- Nouveaux : `tests/textes-t1-conges.test.ts` (46 cas, sans base), `tests/textes-t1-conges-base.test.ts` (8 cas, base :
  exemples de la notice, parité, zone tendue, société, droits, rejeu / retour / marche avant).
- Mis à jour parce qu'ils affirmaient l'ancien état (commentaire dans chacun) : `depot-sortie-documents-phase3-lot51`
  (résumé de l'offre de vente), `documents-mise-en-forme-phase3` (libellé des conditions), `prudences-juridiques-sans-texte`
  et `catalogue-conge-montants-phase3` (« Gerimmo n'a pas pu comparer… »), `jour-de-paris-documents` et
  `audit-baux-documents-2026-09-29` (réponse à la question d'acquisition), `e2e/prudences-juridiques.spec.ts`.

## 12. Contrôles passés
- `npx tsc --noEmit` : rien. `npx eslint` sur les fichiers modifiés : rien.
- Suite vitest complète (`$S/recueil/t1-vitest-complet.log`) : 15 704 réussis, 2 échecs et 4 fichiers en erreur, tous
  dans la liste attendue et sans rapport (`lot2-auth-reel`, `lot3-notifications-base`, `api-isolation`,
  `exercice-restauration`, deux `ux-*-navigateur`). Après les dernières retouches : les 18 fichiers qui citent les
  modules du congé, 590 cas, tous réussis.
- `precheck.sh T1 <commit> e2e/prudences-juridiques.spec.ts` : base remise à neuf (migration du lot jouée dans l'ordre
  du manifeste), compilation, parcours réussi (`$S/banc-integ/T1.status`, `T1-e2e.log`).
- Aucun serveur laissé (`pkill -f next-server`).
