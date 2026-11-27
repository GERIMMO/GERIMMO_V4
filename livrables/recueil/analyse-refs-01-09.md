# Analyse 1 — références 01 à 09 du recueil confrontées au code de Gerimmo

Fait le 24/11/2026, en lecture seule.

**Ce qui a été lu.**
- Recueil : `r1-refs01-09.txt` en entier (3 439 lignes) et `r0-preambule.txt`. Les numéros « L… » ci-dessous sont les
  lignes de `r1-refs01-09.txt`.
- Code : arbre `palier1/app` (les chemins ci-dessous partent de ce dossier). Modèles `bail-nu.ts`, `bail-meuble.ts`
  (par différence avec le bail nu), `bail-colocation.ts`, `bail-individuel.ts`, `designation-individuelle.ts`,
  `mentions-location.ts`, `notice.ts`, `cautionnement.ts`, `conge-bailleur.ts`, `revision-irl.ts` ;
  `src/lib/mention-caution.ts`, `src/lib/textes-signature-actes.ts`, `src/lib/documents/catalogue-options.ts` ;
  en-tête et corps de `supabase/migrations/20261124170000_revision_loyer_troisieme_reprise_d2.sql` ; la fonction
  `enregistrer_conge` (migration `20261112120300`, lignes 583 à 700) ; le blocage F/G de la révision (migration
  `20260910175000`, lignes 202 à 207).
- `JURISTE.md` (parties 1, 5, 6, 7, 8), `REPONSES-JURISTE.md` (partie 1, réponses 1·1 à 1·40), `QUESTIONS.md`
  (Q5, Q11, Q23, Q28, Q39, Q43, Q46, Q62), `TEXTES-OFFICIELS-LUS-2026-11-24.md` (points 1, 3, 7).

**Ce qui n'a pas été lu.** Les écrans autres que ceux cités ; `catalogue-bail.ts`, `avenant.ts`, `communs.ts` ;
le corps complet de `reviser_loyer` (seuls l'en-tête de la règle et les trois endroits modifiés ont été lus) ; les
parties 2, 3 et 4 de `JURISTE.md` et de `REPONSES-JURISTE.md`. Rien n'a été exécuté.

**Rappel de provenance.** Le recueil est un texte fourni par le dirigeant, source et version déclarées, non
recontrôlé par nous. « Conforme » veut dire ici « conforme au texte fourni », rien de plus.

---

## Référence 01 — Loi de 1989, article 17-1 (révision du loyer)

### A. Écarts confirmés

**R01-A1 — mineur. Le blocage F/G ne regarde pas la date du bail.**
- Texte, L29-37 : la révision et la majoration « ne peuvent pas être appliquées dans les logements de la classe F ou
  de la classe G » ; ces dispositions « sont applicables aux contrats de location conclus, renouvelés ou tacitement
  reconduits un an après la publication de la présente loi » ; outre-mer : « après le 1er juillet 2024 ».
- Code : `supabase/migrations/20260910175000_revision_irl_annuelle_et_indice_fige.sql:206-207` :
  `if v_dpe in ('F', 'G') then raise exception 'Révision interdite : logement classé DPE % (passoire thermique, depuis 2022)'`.
  Aucune condition sur la date de conclusion ou de reconduction du bail.
- Effet : Gerimmo refuse aussi la révision d'un bail de six ans conclu avant le 24/08/2022 et pas encore reconduit
  (jusqu'en 2028 au plus tard), et d'un bail d'outre-mer d'avant le 01/07/2024 non reconduit. C'est plus sévère que
  le texte fourni, au détriment du bailleur.
- Correction minimale : ne refuser que si le bail a été conclu, renouvelé ou reconduit depuis le 24/08/2022
  (01/07/2024 outre-mer) ; sinon avertir. À défaut, garder le refus et l'écrire comme « prudence de Gerimmo ».

**R01-A2 — mineur. La date de révision est toujours la date anniversaire.**
- Texte, L8-9 : la révision « intervient chaque année à la date convenue entre les parties ou, à défaut, au terme de
  chaque année du contrat ». Le contrat type prévoit le champ « a) Date de révision : […] » (L2595).
- Code : `src/lib/documents/modeles/bail-nu.ts:209` imprime « Le loyer est révisé chaque année à la date anniversaire
  du contrat » ; en-tête de la migration `20261124170000`, lignes 5-6 : « L'« échéance » est la date de révision :
  une date anniversaire du début du bail ».
- Effet : pour un bail préparé dans Gerimmo, c'est cohérent (le bail écrit la date anniversaire). Pour un bail repris,
  signé ailleurs avec une autre date de révision convenue, Gerimmo ne peut pas la suivre.
- Correction minimale : à l'écran de reprise d'un bail, dire que Gerimmo révise à la date anniversaire et que le
  bail doit dire la même chose ; sinon, plus tard, un champ « date de révision convenue ».

**R01-A3 — mineur. Ancienne rédaction de la lettre : mauvaise version citée.**
- Texte, L5 : version de l'article « depuis le 24 août 2022 ».
- Code : `src/lib/documents/modeles/revision-irl.ts`, bloc `mentions`, branche des révisions sans premier terme :
  « (article 17-1 I de la loi du 6 juillet 1989, rédaction issue de la loi n° 2014-366 du 24 mars 2014) ».
- Correction minimale : retirer « rédaction issue de la loi n° 2014-366 du 24 mars 2014 ». Ne touche que les
  lettres de révisions enregistrées avant la décision Q43.

### B. Points que le texte tranche

- **Q23 et JURISTE 6·16 (c) — délai d'un an.** Texte, L17-19 : « A défaut de manifester sa volonté d'appliquer la
  révision du loyer dans un délai d'un an suivant sa date de prise d'effet, le bailleur est réputé avoir renoncé au
  bénéfice de cette clause pour l'année écoulée. » Règle A de la migration (révision acceptée de l'échéance à la
  veille de la suivante, refusée ensuite). **Le code est conforme au texte fourni.** Formulation proposée : « Délai
  d'un an : lu dans l'article 17-1 I (recueil, réf. 01). Reste seulement la question du dernier jour (partie 7,
  point 4). »
- **JURISTE 1·7 — gel et bail de six ans d'avant le 24/08/2022.** Texte, L33-35 (cité en A1). Le texte tranche : pas
  de gel avant reconduction ou renouvellement. **Écart, voir R01-A1.** Formulation : « Tranché par le texte. Gerimmo
  refuse quand même : à corriger ou à présenter comme une prudence. »
- **JURISTE 1·27 — refus de hausse par avenant en F/G.** Texte, L29-31 : « La révision et la majoration de loyer
  prévues aux I et II du présent article ne peuvent pas être appliquées dans les logements de la classe F ou de la
  classe G ». **Le code est conforme au texte fourni** pour la majoration liée à des travaux (seule hausse que le II
  prévoit, L24-27). Formulation : « Refus fondé sur 17-1 III pour la révision et la majoration pour travaux. »
- **JURISTE 1·35 — révision demandée en retard, quel indice.** La loi (L11-15) ne le dit pas. La notice officielle,
  elle, le dit, L772-774 : « Il est à comparer avec l'indice du même trimestre connu à la date de révision. » Règle B
  de la migration : l'indice de l'échéance, un indice plus récent est refusé. **Le code est conforme au texte fourni
  (notice).** Formulation : « Tranché par la notice officielle (réf. 06) : indice connu à la date de révision. »
- **Indice de référence à défaut de clause.** Texte, L14-15 : « cette date est celle du dernier indice publié à la
  date de signature du contrat ». Le bail de Gerimmo écrit toujours le trimestre (`bail-nu.ts:210-211`) : la règle
  « à défaut » ne joue donc pas pour un bail préparé dans Gerimmo. Conforme au texte fourni.

### C. Points que le texte ne tranche pas

- **Calcul sur un an après une année perdue** (JURISTE 7·1). Le texte dit « réputé avoir renoncé … pour l'année
  écoulée » (L18-19) ; il ne dit pas comment calculer la révision suivante. Reste au juriste (jurisprudence).
- **Premier terme qui suit la demande** (Q43, JURISTE 5·6, 6·16 a, 7·2). Texte, L21-22 : la révision « prend effet à
  compter de sa demande ». Gerimmo l'applique plus tard (terme suivant). Ce n'est pas plus que ce que le texte
  permet ; faut-il l'écrire comme une renonciation : reste au juriste.
- **Date de la demande : envoi ou réception, preuve** (6·7, 6·16 b, 7·3). Le texte parle de « manifester sa volonté »
  et de « sa demande », sans forme ni date. Reste au juriste.
- **Dernier jour du délai d'un an** (7·4). « dans un délai d'un an suivant sa date de prise d'effet » : le jour
  anniversaire lui-même est-il dedans ? Reste au juriste.
- **Baisse de l'indice.** Le texte plafonne « à la hausse » (L11) et ne dit rien d'une baisse. Gerimmo applique la
  baisse. Reste au juriste.
- **Sans DPE, peut-on réviser** (1·8) ; **hausse par avenant hors travaux** (1·26) ; **arrondi au centime** : non
  dits par l'article.
- Les règles B2, C3 et C4 de la migration sont des garde-fous de saisie (elle le dit elle-même) : rien à comparer.

### D. Nouveautés

Aucune : la version fournie est celle du 24 août 2022.

### E. Doutes sur le recueil

Aucun signe d'altération. Version déclarée « au 31 août 2026 », pas au 24/11/2026.

---

## Référence 02 — Loi de 1989, article 15 (congés)

### A. Écarts confirmés

**R02-A1 — bloquant. Congé pour vendre (logement nu) : les cinq alinéas du II ne sont pas reproduits.**
- Texte, L198 : « Les termes des cinq alinéas précédents sont reproduits à peine de nullité dans chaque
  notification. » Ces cinq alinéas sont aux lignes L156-196.
- Code : `src/lib/documents/modeles/conge-bailleur.ts:181-193` : la lettre résume (offre de vente, deux premiers
  mois, notaire) mais ne reproduit aucun alinéa.
- Correction minimale : dans le congé pour vendre d'un logement nu, imprimer mot pour mot les cinq alinéas
  (L156-196), sous le titre « Article 15 II de la loi du 6 juillet 1989 (reproduction) ». Petite correction, à
  faire relire une fois sur le Journal officiel par une personne.

**R02-A2 — important. Congé pour vendre : « à peine de nullité de l'offre » est faux.**
- Texte, L156-157 : « le congé doit, à peine de nullité, indiquer le prix et les conditions de la vente projetée ».
- Code : `conge-bailleur.ts:189-190` : « Le prix et les conditions de la vente figurent dans le congé à peine de
  nullité de l'offre. »
- Correction minimale : « à peine de nullité du congé ». (Tranche JURISTE 6·5.)

**R02-A3 — important. Congé pour vendre : les conditions de la vente sont facultatives.**
- Texte, L156-157 : prix **et conditions** de la vente, à peine de nullité.
- Code : `src/lib/documents/catalogue-options.ts`, champ `conditions_vente` : `facultatif:true` ;
  `conge-bailleur.ts:186-188` : la ligne « Conditions de la vente » ne s'imprime que si elle est saisie.
- Correction minimale : en location nue, compter les conditions comme manquantes tant qu'elles ne sont pas saisies
  (comme le prix).

**R02-A4 — important. Aucune notice jointe ni annoncée au congé pour reprise ou pour vente.**
- Texte, L113-116 : « Une notice d'information relative aux obligations du bailleur et aux voies de recours et
  d'indemnisation du locataire est jointe au congé délivré par le bailleur en raison de sa décision de reprendre ou
  de vendre le logement. »
- Code : `conge-bailleur.ts` (fichier entier, 292 lignes) : le mot « notice » n'y figure pas ; recherche sans
  résultat dans `src` pour une notice de congé.
- Correction minimale : écrire dans la lettre « Pièce jointe : notice d'information (arrêté du 13 décembre 2017) »
  et joindre ce texte (référence 13 du recueil, hors de ma part). En attendant : le dire à l'écran de préparation.

**R02-A5 — important. Préavis d'un mois en zone tendue accordé d'office.**
- Texte, L140-142 : « Le locataire souhaitant bénéficier des délais réduits de préavis mentionnés aux 1° à 5° précise
  le motif invoqué et le justifie au moment de l'envoi de la lettre de congé. A défaut, le délai de préavis
  applicable à ce congé est de trois mois. » Le 1° est la zone tendue (L122).
- Code : `supabase/migrations/20261112120300_conge_ajuste_dernier_terme_et_depot_au_centime.sql:649-650` :
  `elsif v_zone then v_preavis := 1;   -- de plein droit, aucun justificatif exigible`.
- Effet : un congé du locataire enregistré en zone tendue met fin au bail un mois après, même si sa lettre n'invoque
  pas la zone tendue. Le bailleur perd deux mois de loyer que le texte lui laisse.
- Correction minimale : en zone tendue, demander « La lettre invoque-t-elle la zone tendue ? » ; sans cela, trois
  mois. (Tranche JURISTE 1·12.)

**R02-A6 — important. Le délai est compté depuis la première présentation, pas depuis la réception.**
- Texte, L145-147 : « Ce délai court à compter du jour de la réception de la lettre recommandée, de la signification
  de l'acte du commissaire de justice ou de la remise en main propre. »
- Code : colonne `date_premiere_presentation` (même migration, ligne 689) ; `catalogue-options.ts`, aide du champ
  `date_presentation` : « la date de première présentation est ensuite à enregistrer sur la fiche du bail ».
- Effet : une lettre présentée mais non retirée est comptée comme reçue.
- Correction minimale : libellé « date de réception (signature de l'avis de réception, signification ou remise en
  main propre) » et avertissement « une lettre non retirée ne fait pas courir le délai ». (Tranche JURISTE 1·15.)

**R02-A7 — mineur. Congé pour vendre : la phrase sur le notaire est incomplète.**
- Texte, L173-175 : « le notaire doit, lorsque le bailleur n'y a pas préalablement procédé, notifier au locataire ces
  conditions et prix à peine de nullité de la vente ».
- Code : `conge-bailleur.ts:191-193` : « le notaire doit vous notifier ces conditions et ce prix ».
- Correction : réglée par R02-A1 (reproduction mot pour mot) ; sinon ajouter la réserve. (Tranche JURISTE 6·6.)

**R02-A8 — mineur. Congé pour reprise : sanction mal décrite, liens incomplets.**
- Texte, L251-253 : le congé frauduleux « est puni d'une amende pénale dont le montant ne peut être supérieur à
  6 000 € pour une personne physique et à 30 000 € pour une personne morale » ; L66-68 : PACS « enregistré à la date
  du congé », concubin notoire « depuis au moins un an à la date du congé ».
- Code : `conge-bailleur.ts:203-207` : « une reprise fictive ou frauduleuse expose le bailleur à des dommages et
  intérêts » ; « à la date du congé » absent.
- Correction : ajouter l'amende et « à la date du congé ».

**R02-A9 — mineur. Rappel des locataires protégés incomplet.**
- Texte, L223-226 (personne à charge de plus de 65 ans), L228-230 (« bailleur … personne physique âgée de plus de
  soixante-cinq ans »), L236-242 (bénéficiaire de l'allocation de l'article L. 544-1 du code de la sécurité sociale).
- Code : `conge-bailleur.ts:267-270` : seul le locataire de plus de 65 ans est cité.
- Correction : compléter la mention, ou renvoyer à la notice.

**R02-A10 — mineur. « Acte d'huissier ».**
- Texte, L144-145 : « signifié par acte d'un commissaire de justice ».
- Code : `catalogue-options.ts`, aide du champ `date_presentation` : « acte d'huissier » ; commentaire de
  `conge-bailleur.ts:12`.
- Correction : « acte de commissaire de justice ».

### B. Points que le texte tranche

- **1·12** : oui, trois mois sans motif invoqué et justifié (L140-142). Écart, voir R02-A5.
- **1·15** : le délai court de la réception (L145-147). Écart, voir R02-A6.
- **1·16** : ce sont « les cinq alinéas précédents », donc les cinq premiers alinéas du II (L156-196, L198). Écart,
  voir R02-A1. Formulation : « Tranché : alinéas 1 à 5 du II, texte au recueil réf. 02. »
- **1·17** : oui. Texte, L63-65 : « A peine de nullité, le congé donné par le bailleur doit indiquer le motif allégué
  et, en cas de reprise, les nom et adresse du bénéficiaire de la reprise ainsi que la nature du lien ». Le PDF n'est
  pas produit sans ces mentions (`conge-bailleur.ts:199-202`). **Le code est conforme au texte fourni.**
- **1·18** : la notice « est jointe » (L113-116) : obligation certaine ; le texte ne dit pas la sanction. Écart sur
  l'obligation, voir R02-A4 ; la sanction reste au juriste.
- **1·38** : mentions de la reprise exactes ; il manque la notice (A4) et, pour la vente, la reproduction (A1) et
  les conditions (A3). « Raisons de la reprise » correspond à L69-70 : « le bailleur justifie du caractère réel et
  sérieux de sa décision de reprise ».
- **6·4** : Texte, L162-163 : « A l'expiration du délai de préavis, le locataire qui n'a pas accepté l'offre de vente
  est déchu de plein droit de tout titre d'occupation sur le local. » ; L158 : offre « valable pendant les deux
  premiers mois du délai de préavis ». La phrase de la lettre (`conge-bailleur.ts:190-191`) **est conforme au texte
  fourni.**
- **6·5** : nullité du congé (L156-157). Écart, voir R02-A2.
- **6·6** : la réserve existe (L174). Écart, voir R02-A7.
- **Préavis de six mois, effet à l'échéance, loyer dû pour le seul temps d'occupation** : L70-71, L149-150 ;
  `conge-bailleur.ts:246-248, 264-266`. Conforme au texte fourni.
- **Congé pour vendre en meublé sans offre de vente** : la notice le confirme, L1540-1541 : « Dans le cas d'un
  logement non meublé (art. 15 II), le locataire est alors prioritaire ». `conge-bailleur.ts:178-180` conforme.

### C. Points que le texte ne tranche pas

- **1·13** (date à laquelle on apprécie la zone tendue) : rien dans l'article.
- **1·14** (calcul au jour près). Le texte dit « six mois » et « à compter du jour de la réception », pas la façon de
  compter. À noter : le code accepte un congé reçu le 21 mars pour un bail dont le dernier jour est le 20 septembre
  (`congeBailleurDansLesDelais`, `conge-bailleur.ts:72-74` : présentation + 6 mois ≤ terme + 1 jour), alors que la
  réponse 1·14 le dit tardif d'un jour. Reste au juriste.
- **1·19** (reprise par une SCI) : article 13, hors de ma part.
- **5·4** (congé du bailleur pendant le préavis du locataire) : non dit.
- **Acquisition d'un bien occupé** (L73-85) : Gerimmo ne connaît pas la date d'acquisition et ne contrôle rien
  (aucune occurrence dans le code). Ce n'est pas une mention du document ; un avertissement à l'écran serait
  prudent.
- **Suspension du congé pendant une procédure d'insalubrité** (L91-102) : non géré, hors périmètre des documents.

### D. Nouveautés

Aucune : version du 29 juillet 2023. « Commissaire de justice » remplace « huissier ».

### E. Doutes sur le recueil

- L96-98 : « l'une des procédures mentionnées aux a et b » alors qu'aucun « a » ni « b » ne figure dans l'article
  reproduit. Renvoi orphelin : coquille possible du texte officiel ou passage manquant. À vérifier avant de
  reproduire ce passage (il n'est pas dans les cinq alinéas du II).
- Trois adresses pour une seule version (L57-59), dont une datée 2025-06-18 : sans conséquence visible.

---

## Référence 03 — Loi de 1989, article 22-1 (cautionnement)

### A. Écarts confirmés

**R03-A1 — important. Bailleur personne morale : un simple rappel, pas de refus.**
- Texte, L281-287 : « Si le bailleur est une personne morale autre qu'une société civile constituée exclusivement
  entre parents et alliés jusqu'au quatrième degré inclus, le cautionnement ne peut être demandé que : - s'il est
  apporté par un des organismes dont la liste est fixée par décret en Conseil d'Etat ; - ou si le logement est loué
  à un étudiant ne bénéficiant pas d'une bourse de l'enseignement supérieur. »
- Code : `src/app/agence/[orgId]/baux/[bailId]/carte-cautionnement.tsx:33-35` : « Bailleur en société … Vérifiez
  votre situation … Gerimmo ne contrôle pas ce point. » ; `cautionnement.ts` ne lit pas la qualité du bailleur.
- Correction minimale : quand la qualité du bailleur est « SCI » ou « personne morale » (pas « SCI familiale »),
  refuser l'acte d'une caution personne physique sauf case cochée « locataire étudiant non boursier ». La qualité
  du bailleur est déjà dans les données (`bail-nu.ts:109`). (Tranche JURISTE 1·24 et 1·39.)

**R03-A2 — mineur. Conditions de révision recopiées en partie.**
- Texte, L300-302 : l'acte fait apparaître « le montant du loyer et les conditions de sa révision tels qu'ils figurent
  au contrat de location ».
- Code : `cautionnement.ts:157-159` : « révisé chaque année dans la limite de la variation de l'IRL — trimestre de
  référence ». Le bail écrit en plus « à la date anniversaire du contrat » et la valeur de l'indice
  (`bail-nu.ts:209-215`).
- Correction : reprendre la phrase du bail telle quelle (date de révision, trimestre, valeur).

**R03-A3 — mineur. « Pénalités de retard » dans l'acte et dans la mention.**
- Texte (notice), L609-613 : sont interdites et « inapplicables » les clauses « qui prévoient des pénalités en cas de
  retard dans le paiement du loyer ».
- Code : `cautionnement.ts:178-180` : « des pénalités ou intérêts de retard » ; `src/lib/mention-caution.ts:6` :
  « intérêts et pénalités de retard ».
- Correction : retirer « pénalités ». Attention : la mention sert aussi au contrôle après signature ; ne changer que
  pour les actes à venir.

### B. Points que le texte tranche

- **1·23 — reproduction de l'avant-dernier alinéa.** Texte, L294-298, comparé mot à mot à
  `cautionnement.ts:52-53` (`RESILIATION_CAUTION_DUREE_INDETERMINEE`) : identique. C'est bien l'avant-dernier alinéa
  de l'article tel que fourni. **Le code est conforme au texte fourni.** Le point peut sortir de la liste.
- **1·24 et 1·39** : tranchés par L281-287 et L276-279. Écart, voir R03-A1. Le second cas (assurance) est couvert :
  texte, L276-279 : « sauf en cas de logement loué à un étudiant ou un apprenti » ; code,
  `textes-signature-actes.ts:44-45` et refus `cautionnement.ts:78`. **Conforme au texte fourni** pour ce second cas.
- **Remise d'un exemplaire du bail à la caution.** Texte, L303-304 : « Le bailleur remet à la caution un exemplaire
  du contrat de location. Ces formalités sont prescrites à peine de nullité du cautionnement. » Code :
  `cautionnement.ts:208-211` et cadre du bail (`textes-signature-actes.ts:51-52`). **Conforme au texte fourni.**
- **Colocation.** Notice, L1083-1085 : « l'acte de cautionnement doit nécessairement identifier un des
  colocataires ». L'écran l'exige (`personnes-bail.tsx:167`, champ `garant_de` obligatoire) ; l'assembleur accepte
  encore un garant sans locataire désigné (`cautionnement.ts:95-102`). À fermer pour une colocation (mineur, compté
  avec R03-A2).

### C. Points que le texte ne tranche pas

- **5·3** (cautionnement pendant le préavis) : non dit.
- **1·32** (avenant et caution) : voir référence 04.
- Liste des organismes admis à se porter caution d'un locataire d'une société : décret absent du recueil.

### D. Nouveautés

Aucune (version du 1er janvier 2022).

### E. Doutes

Aucun signe d'altération. Version déclarée « au 14 juin 2026 ».

---

## Référence 04 — Code civil, articles 2297 et 2294

### A. Écarts confirmés

Aucun sur ces deux articles. (La remarque « pénalités » est en R03-A3.)

### B. Points que le texte tranche

- **1·22 — la mention satisfait-elle l'article 2297.** Texte, L327-335 : la caution « appose elle-même la mention
  qu'elle s'engage en qualité de caution à payer au créancier ce que lui doit le débiteur en cas de défaillance de
  celui-ci, dans la limite d'un montant en principal et accessoires exprimé en toutes lettres et en chiffres » ;
  solidaire : « elle reconnaît dans cette mention ne pouvoir exiger du créancier qu'il poursuive d'abord le débiteur
  ou qu'il divise ses poursuites entre les cautions ».
  Code : `mention-caution.ts:6` contient chacun de ces éléments (engagement, défaillance, plafond en lettres et en
  chiffres, « couvrant le principal et les accessoires », et pour la caution solidaire la reconnaissance) ;
  caution simple : pas de reconnaissance, ce que L335 permet (« A défaut, elle conserve le droit de se prévaloir de
  ces bénéfices »). La mention est recopiée par la caution (`cautionnement.ts:193-201`). **Le contenu est conforme
  au texte fourni.** Formulation : « Contenu de la mention vérifié sur l'article 2297. Reste : la saisie au clavier
  en signature électronique vaut-elle “appose elle-même” (C). »
- **1·32 — avenant qui augmente le loyer.** Texte, L348-350 : « Le cautionnement doit être exprès. Il ne peut être
  étendu au-delà des limites dans lesquelles il a été contracté. » Le texte va dans le sens de la réponse (la caution
  n'est pas engagée au-delà). Côté code, je n'ai pas relu l'avenant : constaté d'un seul côté, je ne le classe pas en
  écart.

### C. Points que le texte ne tranche pas

- Mention saisie au clavier en signature électronique : l'article 1174 du code civil n'est pas dans ma part.
- Les articles 2305 et 2306 du code civil, cités par l'acte pour les bénéfices de discussion et de division
  (`cautionnement.ts:167-174`), ne sont pas dans le recueil : numéros non vérifiables ici.

### D. Nouveautés — aucune. ### E. Doutes — aucun.

---

## Référence 05 — Loi de 1989, article 3 (contenu du bail)

### A. Écarts confirmés

**R05-A1 — mineur. Extraits du règlement de copropriété : la quote-part n'est pas annoncée.**
- Texte, L414-417 : extraits « concernant la destination de l'immeuble, la jouissance et l'usage des parties
  privatives et communes, et précisant la quote-part afférente au lot loué dans chacune des catégories de charges ».
- Code : `bail-nu.ts:180-182` et annexe `bail-nu.ts:272` : pas de mention de la quote-part.
- Correction : compléter la phrase et le libellé de l'annexe.

Les dix mentions de L378-403 sont présentes dans le bail nu et le bail meublé (parties, date d'effet et durée,
surface habitable, locaux, loyer et révision, dernier loyer du précédent locataire, travaux, dépôt), ainsi que les
dépenses d'énergie de L405-407 (`mentions-location.ts:25-28`). Conforme au texte fourni.

### B. Points que le texte tranche

- **1·4 — un résumé suffit-il.** Texte, L409-412 : « Une notice d'information … est annexée au contrat de location.
  Un arrêté … détermine le contenu de cette notice. » Le contenu est fixé : un résumé ne suffit pas. Gerimmo le dit
  déjà (`notice.ts:37-38`). Voir référence 06.
- **6·2 — « voies d'indemnisation ».** La notice du bail porte sur les « voies de conciliation et de recours »
  (L409-410). Les « voies de recours et d'indemnisation » sont celles de la notice du congé (réf. 02, L113-115). Le
  retrait du mot dans le résumé est donc **conforme au texte fourni**.
- **8·3 — pour quels baux.** Article 1 de l'arrêté, L478-480 : la notice est « jointe aux contrats de location
  établis suivant les contrats types définis par le décret n° 2015-587 ». Le contrat type ne s'applique pas aux
  « colocations formalisées par la conclusion de plusieurs contrats » (L2406-2407). Donc : nu, meublé, colocation à
  bail commun : oui. Contrats individuels de colocation : l'arrêté ne les vise pas à la lettre, l'article 3 de la
  loi ne distingue pas : reste au juriste. Bail mobilité : absent du recueil.

### C. Points que le texte ne tranche pas

- **1·5** (régulariser les baux signés sans la bonne notice) : le texte dit seulement « Le bailleur ne peut pas se
  prévaloir de la violation du présent article » (L421). Pas de sanction écrite.
- **5·9** (notice dans le même dossier signé) : « annexée » sans autre précision.

### D. Nouveautés

Voir E : la version fournie est ancienne.

### E. Doutes sur le recueil — **à lever avant toute correction fondée sur cet article**

- **Version périmée.** L370-371 : « En vigueur au 1er janvier 2022 ; depuis le 1er janvier 2022 », adresse datée
  2022-01-01. C'est la seule référence de ma part consultée à une date de 2022 et non de 2026.
- **Indice de modification postérieure.** La notice (L1307-1311) dit que le bailleur doit mentionner la servitude de
  résidence principale « explicitement dans le contrat de location, sinon le contrat est nul », et le décret de
  2026 vise les articles 3 et 4 (L3238-3239). Rien de tel dans l'article 3 fourni : il a très probablement été
  modifié depuis 2022 (supposé, non constaté).
- L411 : « location.Un arrêté » (espace manquant), sans conséquence.

---

## Références 06 et 07 — Notice d'information (arrêté du 29 mai 2015, annexe remplacée par l'arrêté du 9 octobre 2026)

### Réponse à la question posée : peut-on joindre la notice entière, et laquelle ?

- **Oui, le texte entier est maintenant disponible** : annexe complète aux lignes L503 à L2308 (préambule, six
  parties, deux tableaux, quatorze notes).
- **Quelle version** : celle de l'arrêté du 9 octobre 2026, « en vigueur depuis le 18 octobre 2026 » (L465-466,
  L2329-2330). Elle s'applique « aux contrats conclus ou renouvelés à compter de son entrée en vigueur » (article 2,
  L2357-2358 ; rappel L2306-2308). Tout bail préparé aujourd'hui dans Gerimmo relève donc de cette version.
- **Pour un bail conclu avant le 18/10/2026** : l'ancienne annexe n'est pas dans le recueil. Gerimmo ne prépare que
  des contrats à signer : sans effet pratique.
- **Trois précautions avant de l'imprimer comme « notice officielle »** (voir E) : le texte vient d'un site miroir ;
  les deux tableaux sont à reconstruire ; trois adresses internet sont coupées. Une relecture humaine contre le
  Journal officiel (JORF n° 0243 du 17 octobre 2026, texte n° 29) est nécessaire une fois.
- **Titre à imprimer** : « Notice d'information annexée aux contrats de location — annexe de l'arrêté du 29 mai 2015,
  dans sa rédaction issue de l'arrêté du 9 octobre 2026 (en vigueur depuis le 18 octobre 2026) ».

### A. Écarts confirmés

**R06-A1 — important. Le bail déclare la notice annexée ; Gerimmo ne fournit qu'un résumé.**
- Texte : article 3 de la loi, L409-412 ; contrat type, L2479-2480 : « la notice d'information qui doit être jointe à
  chaque contrat » ; annexes du contrat type, L2766.
- Code : `bail-nu.ts:101-103` : « Les parties déclarent avoir pris connaissance de la notice d'information …
  annexée au présent contrat et en faisant partie intégrante » ; `notice.ts:37-38` : résumé « qui ne remplace pas la
  notice officielle » ; depuis le lot D3, le bailleur doit déposer lui-même la notice
  (`src/lib/documents-bail.ts:103-107`), sans contrôle de version.
- Correction : produire la notice officielle depuis le texte du recueil (version du 18/10/2026) et la joindre
  d'office au dossier de signature ; retirer le dépôt par le bailleur. Taille moyenne (mise en page, tableaux).
  Classé « important » et non « bloquant » parce que l'envoi en signature électronique est déjà bloqué sans notice
  déposée (JURISTE 8·2).

**R06-A2 — important. Résumé : sanction du dépôt de garantie restitué en retard fausse.**
- Texte, L1624-1626 : « le montant dû au locataire est majoré d'une somme égale à 10 % du loyer mensuel, pour chaque
  mois de retard commencé ».
- Code : `notice.ts:57` : « À défaut, il produit intérêt au profit du locataire. »
- Correction : reprendre la phrase de la notice.

**R06-A3 — mineur. Résumé : version citée et inexactitudes.**
- Version : `notice.ts:104` cite « Arrêté du 29 mai 2015 » sans sa modification (L465-466).
- `notice.ts:45` : « six ans pour une personne morale » ; texte, L622-624 : trois ans aussi pour « une société civile
  immobilière familiale ».
- `notice.ts:61` : « À défaut d'état des lieux, le locataire est présumé avoir reçu le logement en bon état de
  réparations locatives » ; texte, L1091-1094 : « à défaut d'état des lieux d'entrée … sauf si le locataire en
  apporte la preuve contraire ou si le bailleur a fait obstacle ».
- `notice.ts:85` : « le juge des contentieux de la protection » ; texte, L1757-1758 : « relève exclusivement du
  tribunal judiciaire ».
- `notice.ts:77` : préavis du locataire en meublé (un mois, L1529) non dit.
- `notice.ts:80-81` : rubrique « aides au logement » avec « avance Loca-Pass » : absente de la notice officielle ;
  `notice.ts:40` se dit pourtant « résumé fidèle rubrique par rubrique ».
- Parties de la notice sans équivalent dans le résumé : nuisibles (L1457-1481), départ du conjoint victime de
  violences (L1633-1647), prévention des expulsions (L1964-2071), gel des loyers F/G (L667-669, L756-759).
- Correction : devient sans objet si la notice entière est jointe (R06-A1) ; le résumé peut alors être retiré.

### B. Points que le texte tranche

- **1·4, 1·37** : texte intégral exigé (voir réf. 05 B). Gerimmo ne présente plus le résumé comme la notice :
  conforme sur ce point ; l'écart restant est R06-A1.
- **8·2 (b) — quelle version.** Article 2 de l'arrêté, L2357-2358 : « s'applique aux contrats conclus ou renouvelés à
  compter de son entrée en vigueur ». La version exigée est celle en vigueur à la conclusion du contrat. Formulation :
  « Version tranchée par l'arrêté du 9 octobre 2026, art. 2. »
- **Délai de complément de l'état des lieux** (`textes-signature-actes.ts:14-15`). Notice, L1099-1102 : « dans les
  dix jours suivant sa date de réalisation pour tout élément concernant le logement, ou durant le premier mois de la
  période de chauffe concernant l'état des éléments de chauffage ». **Le code est conforme au texte fourni** (la loi
  elle-même, article 3-2, relève d'une autre part).

### C. Points que le texte ne tranche pas

- **8·2 (a), (c), (d)** : qui répond d'une mauvaise version, régularisation des baux signés, signature papier.
- Bail **reconduit tacitement** après le 18/10/2026 : l'article 2 dit « conclus ou renouvelés », pas « reconduits ».
- **5·9** : même dossier signé ou remise séparée.

### D. Nouveautés révélées

- **Nouvelle notice depuis le 18/10/2026** : le résumé de Gerimmo est daté de l'ancienne. Elle intègre notamment :
  servitude de résidence principale et nullité du bail qui ne la mentionne pas (L1305-1311) ; commandement de payer
  à six semaines (L1819-1825) ; clauses résolutoires facultatives (L1792-1801) ; lutte contre les nuisibles
  (L1457-1481) ; présence du locataire à l'audience (L1920-1933).
- **Zones tendues : changement de décret au 1er janvier 2027.** Note 5, L2262-2266 : « Jusqu'au 31 décembre 2026 :
  décret n° 2013-392 … A partir du 1er janvier 2027 : décret n° 2026-831 du 25 août 2026 ». Le référentiel
  « zone tendue » de Gerimmo (préavis réduit, encadrement) devra être relu à cette date. Ce décret n'est pas dans ma
  part du recueil.
- **Congé du bailleur adressé « à chacun des cotitulaires du bail »** (L1558) : Gerimmo le dit à l'écran
  (`catalogue-options.ts`, aide de `date_presentation`) mais imprime une seule lettre pour tous.

### E. Doutes sur le recueil

- **Source miroir.** L497-498 : « Extraction intégrale depuis la reproduction LEGI/DILA de LibreJustice, puis
  concordance de tout le contenu lexical avec les pages officielles ». Ce n'est pas une copie directe du Journal
  officiel.
- **Adresses internet abîmées** : L1441-1442 (« https: //www.bureaucentraldetarification.fr »), L1939
  (« https://youtu.be/4og3KOPxOfw ? si=… »), L1374-1375 (adresse coupée en deux).
- **Note (12) jamais appelée** dans le corps (les appels vont de (1) à (11), puis (13) et (14)) : L2296-2297.
- **Sommaire et corps divergents** : sommaire L567-568 « 5.5. … et droit au logement opposable (DALO) » ; titre du
  corps L2073 sans ces mots.
- **Contacts étranges** : L2186-2190 : pour l'UNPI nationale, « Site internet : parismetropole.unpi.org, courriel :
  parismetropole@unpi.fr » ; « France Assureurs » classé parmi les organisations de bailleurs. Peut-être le texte
  officiel ; à relire sur le Journal officiel.
- **Tableaux** (L1150-1167, L1181-1191) : rendus en colonnes de texte, à reconstruire.
- **Arrêté du 9 octobre 2026** (L2338-2368) : pas d'article fixant une date d'entrée en vigueur ; le « 18 octobre
  2026 » est déduit de la publication du 17. Cohérent, non vérifiable. Je n'ai aucun moyen de confirmer l'existence
  de cet arrêté ni du décret n° 2026-831 : textes déclarés par le recueil.

---

## Référence 08 — Décret n° 2015-587, contrats types (version en vigueur depuis le 01/10/2026)

Comparaison rubrique par rubrique de `bail-nu.ts` (annexe 1, L2456-2831) et de `bail-meuble.ts` (annexe 2,
L2846-3209). Les fonctions communes sont dans `mentions-location.ts`.

### A. Écarts confirmés

**R08-A1 — important. Mandataire professionnel : activité et garant absents.**
- Texte, L2492-2495 : « [nom ou raison sociale et adresse du mandataire ainsi que l'activité exercée] ; le cas
  échéant, [numéro et lieu de délivrance de la carte professionnelle / nom et adresse du garant] (3) » ; note (3),
  L2778-2780 : « Mention obligatoire s'appliquant aux professionnels exerçant une activité mentionnée à l'article
  1er de la loi n° 70-9 du 2 janvier 1970 ». Même texte en meublé, L2891-2894.
- Code : `bail-nu.ts:123-127` et `bail-meuble.ts:161-164` : nom, adresse, carte professionnelle. Ni « activité
  exercée », ni « nom et adresse du garant ». La donnée existe (`organisations.garantie_financiere`, migration
  `20260909140000`, ligne 12).
- Correction : ajouter les deux mentions pour une organisation « agence ». Petite.

**R08-A2 — important. Honoraires : les trois alinéas de l'article 5 I sont résumés, pas rappelés.**
- Texte, L2700-2716 (meublé L3082-3098) : « Il est rappelé les dispositions du I de l'article 5 … alinéas 1 à 3 : »
  suivi des trois alinéas en entier ; puis « détail des prestations effectivement réalisées » (L2725-2727) et
  « autres prestations » (L2730).
- Code : `mentions-location.ts:54-56` : paraphrase en trois phrases ; pas de détail des prestations ni d'« autres
  prestations ».
- Correction : imprimer les trois alinéas tels que le contrat type les donne ; ajouter un champ « prestations
  réalisées ». Petite à moyenne. Ne concerne que les agences.

**R08-A3 — important. Première échéance : montant au prorata au lieu de la période complète.**
- Texte, L2635-2638 (meublé L3016-3019) : « Montant total dû à la première échéance de paiement pour une période
  complète de location : [détailler la somme des montants relatifs au loyer, aux charges… ] ».
- Code : `bail-nu.ts:52-64` et `:236` ; `bail-meuble.ts:71-83` et `:270` : montant proratisé quand le bail ne
  commence pas un 1er (« premier mois au prorata »), sans détail loyer / charges.
- Correction : imprimer le montant d'une période complète, détaillé (loyer + charges) ; le prorata du premier mois
  peut rester sur une seconde ligne. Petite.

**R08-A4 — mineur. Clause résolutoire : rédaction différente et ajout.**
- Texte, L2675-2678 : « Le contrat de location est résilié de plein droit pour défaut de paiement du loyer ou des
  charges aux termes convenus ou pour non versement du dépôt de garantie. La clause de résiliation de plein droit ne
  produit effet que six semaines après la date d'un commandement de payer demeuré infructueux. »
- Code : `mentions-location.ts:42-44` : même sens, autres mots, plus « sous réserve des dispositions de l'article 24
  de la loi du 6 juillet 1989 ».
- Correction : reprendre les deux phrases du contrat type mot pour mot. Petite. (JURISTE 1·2.)

**R08-A5 — mineur. Phrases fixes de la partie III non reprises.**
- Texte nu, L2570-2575 ; meublé, L2959-2969 (reconduction, congé du locataire à tout moment, congé du bailleur à
  l'échéance pour reprise, vente ou motif sérieux et légitime).
- Code : `bail-nu.ts:194` : « reconduite tacitement aux mêmes conditions à défaut de congé donné dans les formes et
  délais légaux » ; `bail-meuble.ts:108` : « un an, reconduit tacitement ».
- Correction : imprimer les phrases du contrat type. Petite.

**R08-A6 — mineur. Bail meublé : rubrique « durée réduite » étrangère à l'annexe 2.**
- Texte, L2957-2958 : « B. Durée du contrat : [durée minimale d'un an ou de neuf mois si la location est consentie
  à un étudiant] ». Aucune durée réduite pour événement. La note (6) de l'annexe 1 la réserve au « bailleur personne
  physique » (L2784-2785).
- Code : `bail-meuble.ts:229-236` : imprime la clause d'événement si `duree_reduite_evenement` est saisi, sinon
  « Durée réduite … : sans objet ».
- Correction : retirer cette rubrique du bail meublé et refuser la saisie pour un meublé. Petite. (JURISTE 1·6.)

**R08-A7 — mineur. Rappel de décence : une phrase qui n'est pas celle du contrat type.**
- Texte, L2539-2541 : « La consommation d'énergie finale et le niveau de performance du logement sont déterminés
  selon la méthode du diagnostic de performance énergétique mentionné à l'article L. 126-26 du code de la
  construction et de l'habitation. »
- Code : `mentions-location.ts:24` : « La consommation d'énergie finale doit également respecter le seuil
  applicable. »
- Correction : remplacer par la phrase du contrat type. Petite.

**R08-A8 — mineur. Rubriques « le cas échéant » absentes des modèles.**
Constaté dans le texte et absent de `bail-nu.ts` / `bail-meuble.ts` :
- destination « usage mixte professionnel et d'habitation » (L2543) : le modèle écrit toujours « usage exclusif
  d'habitation » (`bail-nu.ts:172`) ;
- chauffage ou eau chaude collectifs : « préciser les modalités de répartition de la consommation du locataire »
  (notes 4 et 5, L2781-2783) ;
- complément de loyer : « montant du loyer de base, nécessairement égal au loyer de référence majoré »
  (L2589-2591) ; `mentions-location.ts:72` n'imprime que le complément et sa justification ;
- charges : option « paiement périodique des charges sans provision » (L2598-2600) ; modalités de révision du
  forfait (L2605-2606, meublé L3006) ;
- contribution pour le partage des économies de charges (L2607-2613) ;
- assurance souscrite par le bailleur pour le compte des colocataires (L2614-2629) ;
- majoration du loyer en cours de bail pour travaux d'amélioration du bailleur (L2659-2661) ;
- annexes : « autorisation préalable de mise en location » et « références aux loyers habituellement constatés »
  (L2768-2770).
- Correction : ajouter ces rubriques, vides ou « sans objet » par défaut. Moyenne (champs à créer).

**R08-A9 — mineur. Adresse électronique exigée alors qu'elle est facultative.**
- Texte, L2489-2491 et L2505-2506 : « numéro de téléphone portable (facultatif) / adresse électronique (facultatif) ».
- Code : `bail-nu.ts:69` et `:111` : l'adresse électronique est un champ compté manquant ; seul le téléphone est
  traité comme facultatif.
- Correction : ne plus bloquer le PDF sur l'adresse électronique (elle reste nécessaire à la signature
  électronique, à dire à cet endroit).

### B. Points que le texte tranche

- **1·1 — toutes les rubriques sont-elles reprises.** Non : écarts R08-A1 à A9. Sont **conformes au texte fourni** :
  téléphone portable facultatif (L2490, `bail-nu.ts:111-112`) ; identifiant fiscal (L2513, `:154`) ; période de
  construction, surface, pièces (L2516-2519, `:161-165`) ; rappel des classes F/E/D et de l'outre-mer (L2526-2538,
  `mentions-location.ts:20-23`) ; classe du DPE (L2542) ; servitude de résidence principale (L2544-2546,
  `mentions-location.ts:31-36`) ; zone tendue, loyers de référence, dernier loyer (L2582-2593,
  `mentions-location.ts:67-85`) ; révision et trimestre (L2594-2596) ; dépenses d'énergie et année des prix
  (L2646-2653) ; travaux depuis le dernier contrat (L2656-2658) ; dépôt d'un mois / deux mois (L2667-2668, L3049-3050) ;
  solidarité (L2670-2672) ; clauses résolutoires facultatives, dont la servitude et le délai fixé par le maire
  (L2679-2696, `mentions-location.ts:45-47`) ; inventaire du mobilier en meublé (L3148).
- **1·2 — clause résolutoire rédigée autrement.** Le texte donne la rédaction (L2675-2678) ; il ne dit pas si une
  autre rédaction est tolérée, mais il dit que le contrat est établi « dans le respect du présent contrat type »
  (L2483-2484). Écart, voir R08-A4. Formulation : « Rédaction lue ; alignement mot pour mot à faire. »
- **1·6 — durée réduite.** Notice, L640-641 : ouverte au bailleur « personne physique, membre d'une société civile
  immobilière familiale ou d'une indivision » ; annexe 2 : pas de durée réduite en meublé (L2957-2958). Écart en
  meublé, voir R08-A6.
- **1·33 — forfait de charges.** Notes (10) et (32), L2793-2794 et L3172-3173 : « ce forfait est révisé dans les
  mêmes conditions que le loyer principal ». Forfait réservé à la colocation en location nue (L2598-2600) :
  `src/app/actions/baux.ts:160-166` le refuse sur un bail nu simple. **Conforme au texte fourni.**
- **Contrat individuel de colocation.** Le contrat type ne s'y applique pas (L2406-2407, L2462-2463) ; le modèle
  l'écrit (« Contrat indépendant — article 8-1 », `bail-nu.ts:99`). **Conforme au texte fourni.**

### C. Points que le texte ne tranche pas

- **1·3** (clauses « assurance » et « troubles » imprimées par défaut). Le texte dit « Le cas échéant » (L2679) ; la
  base met ces deux clauses à « oui » par défaut (migration `20260914150000`, lignes 14-15) et l'écran permet de
  dire non. Le texte ne dit pas qui doit choisir. Reste au juriste.
- **1·20, 1·21** (solidarité entre époux, entrée tardive du remplaçant) : article 8-1, hors de ma part.
- **1·11** (diagnostics exigibles) : la liste des annexes (L2755-2765) les cite ; le régime relève de l'article 3-3.

### D. Nouveautés révélées

- **Version du 01/10/2026** : le code la connaît déjà (`mentions-location.ts:1-3`, « Sources vérifiées le
  14/09/2026 ») et en a repris les trois apports (téléphone, servitude, clause résolutoire à six semaines).
- Application : « contrats conclus ou renouvelés à compter de cette même date » (L2829-2831). Gerimmo ne réécrit pas
  les baux déjà signés (`mentions-location.ts:40-41`) : cohérent.

### E. Doutes sur le recueil

- Préambule, L62-64 : « cinq écarts de transcription corrigés dans le contrat meublé » : la copie a donc été
  retouchée à la main ; les cinq endroits ne sont pas indiqués.
- Coquilles conservées, annoncées comme officielles (L2449-2450) : « pou le compte » (L2638), « le signature »
  (L2792), « lisant » pour « listant » (L3194), numérotation « 3. » et « 4. » au lieu de « 1. » et « 2. »
  (L3023-3025), double virgule (L2984), « (16) … ; » (L2804). Non vérifiables.
- IX.A, L2700 : « du I de l'article 5 (I) » (redite), contre « du I de l'article 5 » en meublé (L3082).

---

## Référence 09 — Décret n° 2026-596 du 6 juillet 2026

### A. Écarts confirmés

Aucun écart propre. Les quatre modifications de l'article 1er (L3257-3282) sont dans les annexes de la référence 08
et dans le code : téléphone portable (2° et 3°), servitude de résidence principale (4°), clause résolutoire (5°).
Les écarts de rédaction sont comptés en R08-A4.

### B. Points que le texte tranche

- **1·1 (date d'application).** Article 3, L3400-3401 : « L'article 1er du présent décret entre en vigueur le 1er
  octobre 2026 et s'applique aux contrats conclus ou renouvelés à compter de cette même date. » Gerimmo applique la
  nouvelle rédaction à tout contrat préparé : **conforme au texte fourni.**

### C. Points que le texte ne tranche pas

Bail reconduit tacitement après le 01/10/2026 : « conclus ou renouvelés » seulement.

### D. Nouveautés révélées

- **Article 2, en vigueur le 1er janvier 2027** (L3293-3397, L3402) : il ne touche que les aides au logement à
  Saint-Barthélemy, Saint-Martin et Saint-Pierre-et-Miquelon. Sans effet sur Gerimmo.

### E. Doutes sur le recueil

- L3320-3322 et L3373-3375 : renvoi aux « motifs mentionnés aux 1° et 2° du présent article » alors que les motifs
  sont listés « a) » et « b) ». Incohérence interne (peut-être d'origine) ; sans effet pour Gerimmo.
- L3226-3227 : trois versions consolidées citées (02/08, 28/08, 11/10/2026) pour un texte « version initiale ».
- Signataires et numéros (L3417-3426) : non vérifiables par moi.

---

## Tableau récapitulatif

| Identifiant | Gravité | Document ou écran touché | Taille |
|---|---|---|---|
| R02-A1 | bloquant | Congé du bailleur pour vendre (logement nu) : reproduire les 5 alinéas de l'article 15 II | petite |
| R02-A2 | important | Congé pour vendre : « nullité de l'offre » → « nullité du congé » | petite |
| R02-A3 | important | Congé pour vendre : conditions de la vente obligatoires | petite |
| R02-A4 | important | Congé pour reprise ou vente : notice à joindre et à annoncer | moyenne |
| R02-A5 | important | Enregistrement du congé du locataire en zone tendue (préavis d'un mois d'office) | petite |
| R02-A6 | important | Congés : date de réception au lieu de première présentation (écran et base) | petite |
| R03-A1 | important | Acte de cautionnement : bailleur personne morale non familiale | petite |
| R06-A1 | important | Bail et dossier de signature : notice officielle entière, version du 18/10/2026 | moyenne |
| R06-A2 | important | Résumé de la notice : sanction du dépôt restitué en retard | petite |
| R08-A1 | important | Bail nu et meublé (agence) : activité et garant du mandataire | petite |
| R08-A2 | important | Bail nu et meublé (agence) : rappel des 3 alinéas de l'article 5 I, détail des prestations | petite à moyenne |
| R08-A3 | important | Bail nu et meublé : montant de la première échéance « période complète » | petite |
| R01-A1 | mineur | Révision du loyer : blocage F/G sans regard de la date du bail | petite |
| R01-A2 | mineur | Révision : date de révision convenue autre que l'anniversaire (baux repris) | petite (avertissement) |
| R01-A3 | mineur | Lettre de révision, ancienne rédaction : version de la loi citée | petite |
| R02-A7 | mineur | Congé pour vendre : réserve sur la notification par le notaire | petite |
| R02-A8 | mineur | Congé pour reprise : amende pénale, « à la date du congé » | petite |
| R02-A9 | mineur | Congé : rappel des locataires protégés incomplet | petite |
| R02-A10 | mineur | Écran du congé : « huissier » → « commissaire de justice » | petite |
| R03-A2 | mineur | Acte de cautionnement : conditions de révision telles qu'au bail ; colocataire désigné | petite |
| R03-A3 | mineur | Acte et mention de caution : « pénalités de retard » | petite |
| R05-A1 | mineur | Bail : quote-part de charges dans les extraits du règlement de copropriété | petite |
| R06-A3 | mineur | Résumé de la notice : version et inexactitudes (sans objet si R06-A1 fait) | petite |
| R08-A4 | mineur | Bail : clause résolutoire mot pour mot | petite |
| R08-A5 | mineur | Bail : phrases fixes de la partie III | petite |
| R08-A6 | mineur | Bail meublé : rubrique « durée réduite » | petite |
| R08-A7 | mineur | Bail : phrase du rappel de décence | petite |
| R08-A8 | mineur | Bail : rubriques « le cas échéant » absentes | moyenne |
| R08-A9 | mineur | Bail : adresse électronique facultative | petite |

**Total : 1 bloquant, 11 importants, 17 mineurs.**

**Points de JURISTE.md qui peuvent être allégés** (texte lu, conclusion écrite ci-dessus) : partie 1, points 4, 7,
12, 15, 16, 17, 22 (contenu), 23, 24, 27, 35, 39 ; partie 6, points 2, 4, 5, 6 ; partie 8, point 2 (b) ; Q23 (délai
d'un an). **Restent au juriste** : 1·2 (tolérance), 1·3, 1·5, 1·8, 1·13, 1·14, 1·18 (sanction), 1·26, 5·3, 5·4, 5·6,
5·9, 6·7, 6·16, 7·1 à 7·4, 8·2 (a, c, d), 8·3.

**Deux réserves générales sur le recueil pour ma part** : l'article 3 de la loi est fourni dans une version de 2022
(référence 05, E) ; la notice vient d'un site miroir et porte des traces de copie (références 06-07, E).
