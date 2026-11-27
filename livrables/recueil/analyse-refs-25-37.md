# Analyse 3 — références 25 à 37 du recueil confrontées au code de Gerimmo

Date : 24/11/2026. Lecture seule. Rien n'a été modifié, lancé ni testé.

**Ce qui a été lu**
- Recueil : `recueil/r3-refs25-37.txt`, en entier (3 010 lignes). Les numéros « l. » ci-dessous renvoient à ce fichier.
- Code : état **HEAD** de `palier1` (commit `fde4cbb4`), extrait dans `scratchpad/head-a3/` pour ne pas lire les
  fichiers en cours de modification. Les chemins sont relatifs à `app/`.
- `REPONSES-JURISTE.md` (parties 3A, 3B, 4), `JURISTE.md` (parties 3, 4, 6 point 13, 7 points 6 à 8),
  `QUESTIONS.md` (Q7, Q10, Q15, Q63, Q65, Q66), `TEXTES-OFFICIELS-LUS-2026-11-24.md` (fiche 10).

**Statut du recueil** : texte fourni par le dirigeant, source et version déclarées, non recontrôlé par nous.

**Travail en cours d'un autre agent** (vu en lecture seule, `git diff`) : il réécrit déjà les mentions légales, la
phrase du médiateur des courriers, le contrôle « EI » à la saisie, et **retire le blocage des ventes sans médiateur**.
Il ne touche pas `src/app/conditions/page.tsx`. Je le signale à chaque écart concerné.

**Vocabulaire** : « constaté » = lu des deux côtés, texte et code. « Supposé » = non vérifiable ici.

---

## Référence 25 — Code de la consommation, L612-1 et L616-1 (médiation)

### A. Écarts confirmés

**R25-A1 — bloquant pour l'ouverture des ventes aux particuliers. Aucun médiateur n'existe, alors que le texte en
fait une obligation du professionnel.**
- Texte : « le professionnel garantit au consommateur le recours effectif à un dispositif de médiation de la
  consommation » (l. 9-10). « Tout professionnel communique au consommateur […] les coordonnées du ou des médiateurs
  compétents dont il relève » (l. 28-29).
- Le texte ne prévoit aucune exception : ni pour un essai gratuit, ni pour une période de lancement.
- Code à HEAD : `src/lib/garde-souscription.ts:71-74` **ferme** la première souscription d'un particulier tant que le
  médiateur manque (« Les coordonnées du médiateur […] doivent être publiées avant la première souscription »). C'est
  la position conforme au texte. En revanche l'inscription gratuite est déjà ouverte sans médiateur
  (`src/lib/editeur.ts:77-78` : « Elles restent facultatives pour l'inscription gratuite »).
- Modification en cours (décision du dirigeant du 24/11) : ce blocage est retiré.
- Correction minimale : garder les lignes 71-74 jusqu'à l'adhésion à un médiateur. Sinon, le dirigeant ouvre en
  connaissance de cause : le texte fourni ne laisse pas de marge. La sanction n'est pas dans le recueil.

**R25-A2 — important. Des textes publiés promettent un médiateur qui n'existe pas.**
- Texte : L616-1 demande des **coordonnées** (l. 28-29), y compris « dès lors qu'un litige n'a pas pu être réglé dans
  le cadre d'une réclamation préalable » (l. 31-33).
- Code à HEAD :
  - `src/app/conditions/page.tsx:1067-1077` : le client « peut recourir gratuitement au médiateur de la consommation,
    qui sera désigné aux mentions légales dès l'adhésion de l'Éditeur ».
  - `src/app/mentions-legales/page.tsx:67-69` : « Adhésion à venir […] » puis « le consommateur peut recourir
    gratuitement à un médiateur compétent ».
  - `src/lib/courriers-contrat.ts:29-30` : « adhésion en cours », phrase envoyée à la confirmation d'abonnement et à
    la clôture d'une réclamation (lignes 40-52). Rien n'établit qu'une adhésion est en cours.
- Correction minimale : l'autre agent corrige déjà les mentions légales et les courriers (« aucun n'est désigné à ce
  jour »). **Reste l'article 17 des conditions**, non touché : même phrase à écrire, dans la prochaine version des
  conditions (celle déjà prévue par Q15).

### B. Points que le texte tranche
- **JURISTE partie 3, B11 ; partie 7, point 6 ; QUESTIONS Q7 et Q65.** Le texte vise « tout consommateur » et « tout
  professionnel » (l. 8, l. 28), sans condition de prix. Conclusion : écart, voir R25-A1. Formulation proposée :
  « Le texte fourni (L612-1, L616-1) impose au professionnel de garantir un médiateur et d'en communiquer les
  coordonnées, sans exception pour l'essai gratuit. Reste au juriste : la sanction, et où l'information doit figurer. »

### C. Ce que le texte ne tranche pas
- Où et comment communiquer les coordonnées (« selon des modalités fixées par décret », l. 28) : décret absent du recueil.
- La sanction d'une vente sans médiateur : article absent du recueil.
- La SCI cliente est-elle un « consommateur » au sens de ces articles : définition absente du recueil.

### D. Nouveautés
- Aucune : les deux articles sont déclarés inchangés depuis le 1er juillet 2016.

### E. Doutes sur le recueil
- L616-1 : adresse de type « loda » (l. 26) alors qu'il s'agit d'un article de code, et date d'adresse (02/05/2026)
  différente de celle de L612-1 (18/06/2026). Texte court et cohérent.

---

## Référence 26 — L221-21, ordonnance n° 2026-2, D221-5 (rétractation en ligne)

### A. Écarts confirmés
**Aucun pour l'abonnement payant.** Constaté point par point :

| Exigence du texte | Ligne | Code à HEAD |
|---|---|---|
| Fonction gratuite pendant tout le délai | l. 68-71, l. 889-891 | `abonnement-2026.tsx:386-409` : bloc affiché tant que le délai court |
| Libellé « renoncer au contrat ici » | l. 888 | `abonnement-2026.tsx:408` : « Renoncer au contrat ici » |
| Nom et prénom ; contrat identifié ; adresse de l'accusé | l. 907-912 | `formulaires-contrat.tsx:48-56` ; `retractation/page.tsx:94-109` |
| Bouton « confirmer la rétractation » | l. 916 | `formulaires-contrat.tsx:66` : « Confirmer la rétractation » |
| Accusé avec contenu, date et heure | l. 919-922 | `courriers-contrat.ts:243-247` : « reçu, le … à … (heure de Paris), votre déclaration : « … » » |
| Information préalable : existence et emplacement de la fonction | l. 133-135 | `conditions/page.tsx:637-641` ; `formulaire-souscription.tsx:327` ; `courriers-contrat.ts:164` |

### B. Points que le texte tranche
- **JURISTE partie 3, B13** (articles 8.10 et suivants des conditions à jour de la réforme ?). Texte : l. 68-74 et
  l. 887-922. Conclusion : **le code est conforme au texte fourni** pour la fonction en ligne, son libellé, sa
  confirmation et son accusé de réception. Formulation proposée : « Fonction de rétractation en ligne : comparée mot
  à mot à L221-21 et D221-5 fournis par le dirigeant, conforme. Restent au juriste : le délai lui-même et ses
  exceptions (L221-18, L221-28 non fournis), et les articles 8.7, 14 bis et 15, hors de ces textes. »
- Le commentaire `conditions/page.tsx:616-617` (« connue par des sources secondaires seulement ») peut être mis à jour.

### C. Ce que le texte ne tranche pas
- Le compte gratuit (contrat conclu à l'inscription, `conditions/page.tsx:222-225`) doit-il offrir lui aussi la
  fonction ? Elle n'existe que pour l'abonnement payant. Le texte renvoie au délai de L221-18, non fourni.
- La fonction est derrière la connexion (« Mon abonnement »). Est-ce « directement et facilement accessible »
  (l. 889-890) ? Appréciation.
- Prolongation du délai un samedi, dimanche ou jour férié (`conditions/page.tsx:630-632`) : texte non fourni.

### D. Nouveautés
- En vigueur depuis le 19 juin 2026 (l. 852-853) : déjà intégré au code. Rien à faire.
- Les contrats en cours au 19 juin 2026 restent sous l'ancien droit (l. 855-858) : sans effet connu sur Gerimmo.
- Les articles 4 à 25 de l'ordonnance ne concernent que les services financiers, l'assurance et la mutualité.

### E. Doutes sur le recueil
- Ordonnance « extraite de la copie publiée sur EUR-Lex » (l. 88) : source inhabituelle pour un texte français.
- Deux typographies d'apostrophes selon les passages (articles 24-25 « recoupés sur Légifrance ») : deux sources mêlées.
- Guillemets déséquilibrés à l'article 17, IV (l. 462-464). « téléphone vocale » (l. 470, l. 540) au lieu de
  « téléphonie vocale » ailleurs.
- Contrôles faits : 27 articles présents ; tableaux de l'article 24 comptés (onze lignes, dix lignes) : cohérents.
- D221-5 cite un décret n° 2026-3 (l. 924) non reproduit. L221-18, L221-5 et L221-28 absents.

---

## Référence 27 — Loi n° 2004-575, article 1-1 (mentions légales)

### A. Écarts confirmés
**Aucun écart propre à cette référence à HEAD**, sous la réserve R28-A1 (nom et « EI »).
Constaté : directeur de la publication (l. 964-966 ↔ `mentions-legales/page.tsx:37`) ; hébergeur avec dénomination,
adresse et téléphone (l. 968-969 ↔ `page.tsx:49-59`) ; stockage des données (l. 971-973 ↔ Supabase, `page.tsx:18`) ;
téléphone (l. 953 ↔ `page.tsx:39`) ; immatriculation (l. 954-956 ↔ `page.tsx:34`) ; pas de capital pour un
entrepreneur individuel (`page.tsx:32`).

### B. Points que le texte tranche
- **JURISTE partie 3, B12 ; partie 7, point 8.** Texte, pour une personne physique : « leurs nom, prénoms, domicile et
  numéro de téléphone et […] le numéro de leur inscription » (l. 953-956). Le texte dit **« domicile »**. La page écrit
  « Adresse […] adresse de l'entreprise » (`page.tsx:33`). Si l'adresse de l'établissement est aussi le domicile : le
  code est conforme au texte fourni. Si elle est différente : le texte ne prévoit pas d'autre adresse pour un éditeur
  professionnel (la dispense de la l. 975-979 ne vaut que pour un éditeur « à titre non professionnel »).
  Formulation proposée : « Le texte fourni exige le domicile de l'éditeur personne physique. Reste au juriste : une
  adresse d'établissement distincte du domicile suffit-elle ? »
- La réponse B12 du juriste cite « art. 6 III » : référence périmée. Le recueil donne l'article 1-1 (l. 946-948). Le
  code cite déjà l'article 1-1 (`src/lib/editeur.ts:7-9`).

### C. Ce que le texte ne tranche pas
- L'adresse à porter sur les factures et les conditions de vente : cet article ne vise que le site.

### D. Nouveautés
- L'article 1-1 remplace l'ancien 6 III depuis le 23/05/2024 (l. 947). Déjà pris en compte.

### E. Doutes sur le recueil
- Adresse de type « codes/article_lc » pour une loi, sans date (l. 948). Texte complet (I à V), cohérent.

---

## Référence 28 — Code de commerce, R526-27 (« EI »)

### A. Écarts confirmés
**R28-A1 — important. Rien n'impose la mention « EI » à côté du nom du vendeur.**
- Texte : « l'entrepreneur individuel utilise une dénomination incorporant son nom ou nom d'usage précédé ou suivi
  immédiatement des mots : “entrepreneur individuel” ou des initiales : “EI” » (l. 1053-1055). « La dénomination
  figure sur les documents et correspondances à usage professionnel » (l. 1057).
- Code à HEAD : `src/lib/editeur.ts:22-25` (dénomination en texte libre) ; `src/lib/identite-editeur.ts:8-14`
  (aucun contrôle) ; `mentions-legales/page.tsx:31` affiche « dénomination — forme », séparées par un tiret ;
  les courriers signent avec la dénomination saisie (`courriers-contrat.ts:56-58`).
- Conséquence : le nom commercial SAUVEXPERT seul, ou « Gerimmo » seul, ne suffit pas. Il faut « Prénom NOM EI » ou
  « EI Prénom NOM ».
- Correction minimale : contrôle à la saisie (l'autre agent l'écrit : `porteLaMentionEI`). **Hors code, à faire par
  le dirigeant** : le nom du vendeur dans le compte Stripe (il s'imprime sur les factures d'abonnement, voir R29-C).

### B. Points que le texte tranche
- **JURISTE partie 7, point 7 ; QUESTIONS Q63.** Texte l. 1053-1057. Conclusion : écart, voir R28-A1. Formulation
  proposée : « Tranché par le texte fourni : nom, immédiatement précédé ou suivi de “EI” ou “entrepreneur
  individuel”, sur les documents et correspondances professionnels. »

### C. Ce que le texte ne tranche pas
- Les courriels automatiques signés « L'équipe Gerimmo » sont-ils des « correspondances à usage professionnel » qui
  doivent porter le nom suivi de « EI » ? Appréciation.

### D. Nouveautés
- « Chaque compte bancaire dédié à son activité professionnelle […] doit contenir la dénomination dans son
  intitulé » (l. 1059-1060). Hors logiciel : à vérifier par le dirigeant auprès de sa banque.

### E. Doutes sur le recueil
- Aucun. L'article L526-22, auquel il renvoie, n'est pas fourni.

---

## Référence 29 — CGI 293 B, 289 ; annexe II, 242 nonies A (factures)

### A. Écarts confirmés
**R29-A1 — mineur. Libellé abrégé de la mention de franchise.**
- Texte (293 E, fourni en référence 30) : la facture « doit comporter la mention […] : “TVA non applicable, article
  293 B du CGI” » (l. 1950-1953).
- Code : « TVA non applicable, **art.** 293 B du CGI. » dans le pied des factures Stripe (`src/lib/stripe.ts:289`),
  le courrier de confirmation (`courriers-contrat.ts:137`) et `src/lib/tarifs.ts:339`. Les mentions légales et les
  conditions écrivent « article » en toutes lettres (`mentions-legales/page.tsx:35`, `conditions/page.tsx:83`).
- Correction minimale : écrire « article » partout. Trois chaînes.

**R29-A2 — important (factures des artisans). Le numéro de facture est saisi à la main.**
- Texte : « Un numéro unique basé sur une séquence chronologique et continue » (l. 1326).
- Code : `src/lib/documents/facture-intervention.ts:24` lit le numéro dans le formulaire. Gerimmo garantit l'unicité,
  pas la continuité (point déjà connu : JURISTE partie 4, point 2).
- Correction minimale : numérotation par Gerimmo, dans une série par artisan.

**R29-A3 — important (factures des artisans). La mention de franchise de l'artisan n'est pas contrôlée.**
- Texte : l. 1950-1955 (mention obligatoire) et l. 1333-1335 (« le taux […] ou, le cas échéant, le bénéfice d'une
  exonération »).
- Code : champ libre « Mentions de l'entreprise et de TVA » (`facture-intervention.ts:30` et `:56`). Aucun champ
  « régime de TVA » sur la fiche de l'artisan. Une ligne à 0 % peut sortir sans la mention.
- Correction minimale : champ « régime de TVA » sur la fiche ; mention imprimée d'office en franchise.

### B. Points que le texte tranche
- **JURISTE partie 6, point 13 ; QUESTIONS Q7 et Q63 (mention des factures d'abonnement aujourd'hui).** Texte :
  l. 1950-1955. Conclusion : la mention imprimée est celle du texte fourni, au libellé près (R29-A1). Voir la
  référence 30 pour le 1er janvier 2027.
- **JURISTE partie 4, point 3.** Texte l. 1950-1955 : la mention suit le **régime** de l'artisan, pas le taux d'une
  ligne. Conclusion : écart, voir R29-A3.
- **JURISTE partie 4, point 2 ; REPONSES 1·40.** Texte l. 1326-1329. Conclusion : écart, voir R29-A2.
- Constaté conforme : une facture en franchise peut omettre le numéro de TVA (l. 1391-1394), et la page ne l'affiche
  que s'il est saisi (`mentions-legales/page.tsx:36`).

### C. Ce que le texte ne tranche pas
- **Identité du vendeur sur les factures d'abonnement (supposé, non lisible dans le code).** Le texte exige « le nom
  complet, le numéro d'identification […] et l'adresse de l'assujetti et de son client » (l. 1303-1304). Gerimmo ne
  règle que le pied de facture (`stripe.ts:311`, `:363`) et exige l'adresse du client (`stripe.ts:558`). Le nom, le
  SIREN et l'adresse du vendeur viennent des réglages du compte Stripe, que je ne peux pas lire. **À vérifier par le
  dirigeant dans Stripe** : « Prénom NOM EI », SIREN, adresse.
- Une facture est-elle due à un client particulier ? Le texte ne l'impose que pour un client assujetti ou une
  personne morale (l. 1178-1180) : une SCI est donc concernée. Le reste relève d'autres textes.
- Activité déclarée « formation continue d'adultes » et vente d'un logiciel (Q66) : hors de ces articles.

### D. Nouveautés
- **Nouvelles mentions de facture** : numéro SIREN du client (l. 1303-1304), adresse de livraison (l. 1331), nature
  des opérations (l. 1337-1339), option pour les débits (l. 1360-1361). Elles s'appliquent aux factures émises à
  compter du **1er septembre 2026**, et du **1er septembre 2027** pour les micro-entreprises et les PME (l. 1423-1431).
  Concrètement : d'ici septembre 2027, les factures d'abonnement adressées à une SCI ou à un professionnel devront
  porter son SIREN (Gerimmo ne le demande pas à la souscription), et la facture d'artisan devra dire « prestation de
  services » ou « livraison de biens » (absent de `facture-intervention.ts`).
- L'article 289 du CGI est abrogé au 1er janvier 2027, sauf le 3 du I, le IV et le VII (l. 1285-1293). Les
  commentaires et réponses qui citent « CGI, art. 289 » devront être relus à cette date.
- Seuils inchangés : 37 500 € (année précédente) et 41 250 € (année en cours) pour les services (l. 1107-1109). La
  franchise cesse « à compter de la date du dépassement » (l. 1153-1155). Dans Gerimmo le régime est une constante du
  code (`src/lib/editeur.ts:57`) : en sortir demande une publication. Le texte parle du chiffre d'affaires « total »
  de l'assujetti : formation et abonnements s'additionnent (à confirmer avec l'expert-comptable, Q66).

### E. Doutes sur le recueil
- 293 B : version prudente (« certaines pages historiques affichent encore le 01/09/2026 », l. 1085-1086), trois adresses.
- 289 : deux adresses avec deux identifiants d'article différents (l. 1172-1173).
- 242 nonies A : la note transitoire renvoie au « second alinéa du I » (l. 1437-1438), qui ne désigne rien de lisible
  ici : note tronquée ou renvoi à un décret non reproduit. Articles 289 bis, 290 et 290 A non fournis.
- Contrôle croisé : les seuils concordent avec les fiches officielles lues le 24/11 (TEXTES-OFFICIELS, fiche 10).

---

## Référence 30 — CIBS L233-1 à L233-24 (à venir au 01/01/2027), ordonnances de report, CGI 293 E

### A. Écarts confirmés
Aucun de plus. Les écarts sur la mention sont en R29-A1 et R29-A3.

### B. Points que le texte tranche
- **JURISTE partie 6, point 13 (alerte sur le changement de mention) ; TEXTES-OFFICIELS, fiche 10 (« point à
  trancher »).** Trois constats dans le recueil :
  1. La date n'est plus le 1er septembre 2026 : « La date : “1er septembre 2026” est remplacée par la date : “1er
     janvier 2027” » (l. 1917). La fiche officielle qui annonçait un changement « à compter du 1er septembre 2026 »
     est donc contredite par le texte fourni.
  2. Aujourd'hui, la seule mention prévue par un texte fourni est « TVA non applicable, article 293 B du CGI »
     (l. 1953).
  3. Après le 1er janvier 2027, cette obligation de mention est **maintenue** : « les dispositions du II du présent
     article sont maintenues en vigueur jusqu'à leur reprise par les mesures réglementaires » (l. 1973-1976).
  Conclusion : **le code est conforme au texte fourni** (au libellé près, R29-A1), aujourd'hui et au 1er janvier 2027
  tant que la mesure réglementaire n'est pas parue. Formulation proposée : « Ne rien changer à la mention. Surveiller
  la parution du texte réglementaire pris pour l'article L. 216-41 du CIBS, qui fixera la nouvelle mention. »
- La référence « art. L. 223 et s. du CIBS » donnée par la fiche officielle ne correspond pas au recueil : le chapitre
  de la franchise y est numéroté L233-1 à L233-24 (l. 1463-1464). Ne pas l'imprimer sans texte.

### C. Ce que le texte ne tranche pas
- Le libellé exact de la future mention : le texte réglementaire n'est pas dans le recueil.
- La « tolérance jusqu'au 31/12/2027 » annoncée par la fiche officielle : aucun texte du recueil n'en parle.

### D. Nouveautés
- Au 1er janvier 2027 l'article 293 B du CGI disparaît ; la franchise passe dans le CIBS (l. 1484-1880). Les seuils
  restent 85 000 / 93 500 € et 37 500 / 41 250 € (l. 1616-1622).
- Sortie de franchise : dès le 1er janvier si le seuil de l'année précédente est dépassé, à la date du dépassement
  pour le seuil de l'année en cours (l. 1527-1530).
- Année de début d'activité : seuil réduit au prorata du temps (l. 1689-1691).
- Les mots « art. 293 B » des pages, courriers et commentaires resteront exacts comme **mention de facture**, mais ne
  désigneront plus un article en vigueur : à relire en janvier 2027.

### E. Doutes sur le recueil
- Tout le chapitre est « à venir » ; le recueil le dit clairement (l. 1465-1466).
- L233-10 renvoie à « L. 223-11 » alors que L233-11 se dit « mentionnée à l'article L. 233-10 » (l. 1648, l. 1663) :
  incohérence signalée par le recueil lui-même (l. 1472-1473).
- Plusieurs articles partagent une même adresse de section (L233-12 et L233-13 ; L233-14 et L233-15 ; L233-23 et
  L233-24) : pas de trace article par article.
- Non reproduits : le tableau de l'article 15 de l'ordonnance n° 2025-1247 (ce qui est maintenu de 289 et de 293 E)
  et l'article L. 216-41 du CIBS. Je ne peux donc pas vérifier la liste exacte des dispositions maintenues.
- « 20 bis » écrit sans « ° » (l. 1889, l. 1919-1920) : coquille probable.

---

## Référence 31 — Loi n° 2026-534, art. 36 ; LPF L102 B (conservation des factures)

### A. Écarts confirmés
**R31-A1 — important. Gerimmo écrit et programme six ans ; le texte fourni porte le délai à dix ans.**
- Texte : « les mots : “doivent être conservés pendant un délai de six” sont remplacés par les mots : “sont conservés
  pendant un délai de dix” » (l. 2002-2003). « Le présent article s'applique aux documents et aux pièces dont le délai
  de conservation expire après le 1er janvier 2027 » (l. 2012-2013). Toutes les factures de Gerimmo sont dans ce cas.
- Code :
  - `src/app/confidentialite/page.tsx:681` : « Au moins 6 ans […] ; la copie jointe à la preuve du contrat d'un compte
    fermé est supprimée six ans après la fin de l'exercice » ; aussi lignes 697-698 et 757-759.
  - `src/app/conditions/page.tsx:87-91` (commentaire : « SIX ans […] et non dix ans »).
  - `supabase/migrations/20261024090000_versions_conditions_et_archives_comptes.sql:377`, `:431`, `:463-466`
    (`interval '6 years'`).
  - `supabase/migrations/20261024130000_fermeture_comptes.sql:416`, `:2244` et
    `src/lib/comptes-fermeture-serveur.ts:569` : client Stripe supprimé six ans après la dernière facture.
- Rien n'est détruit avant 2032, mais la règle programmée et le texte publié seront faux au 1er janvier 2027.
- Correction minimale : dix ans dans les deux fonctions de purge (nouvelle migration), dans la page confidentialité
  et dans le commentaire des conditions.

### B. Points que le texte tranche
- **JURISTE partie 3, A16.** Texte l. 2002-2003 et l. 2012-2013. La réponse du juriste dit « Oui pour le délai
  fiscal ». Conclusion : écart, voir R31-A1. Formulation proposée : « Tranché par le texte fourni : dix ans. Le code
  est à corriger avant le 1er janvier 2027. »

### C. Ce que le texte ne tranche pas
- Point de départ exact des dix ans dans la version de 2027 : la future rédaction de L102 B n'est pas fournie.

### D. Nouveautés
- Le passage à dix ans est la nouveauté. Elle vaut aussi pour les pièces que le bailleur garde pour ses impôts, mais
  le texte ne vise que les documents soumis au contrôle de l'administration : pas de conclusion pour les quittances.

### E. Doutes sur le recueil
- L'article 36 modifie L102 B « dans sa rédaction résultant de l'ordonnance n° 2025-1247 » (l. 1998-2000). Cette
  rédaction future n'est pas reproduite : seule la version en vigueur l'est (l. 2017).
- Contrôle de cohérence fait : les mots que l'article 36 remplace se trouvent bien dans la version reproduite
  (l. 2021-2022, l. 2051-2052, l. 2056-2058). Pas de signe d'altération.
- L'intitulé de la loi n° 2026-534 n'est pas donné.

---

## Référence 32 — Code de commerce L441-10 ; code de la consommation L111-7

### A. Écarts confirmés
Aucun écart confirmé.
- Constaté conforme (L441-10) : la facture d'honoraires d'agence reprend le taux du texte, « taux appliqué par la
  Banque centrale européenne […] majoré de 10 points » et « exigibles le jour suivant la date de règlement »
  (l. 2144-2149 ↔ `src/lib/documents/modeles/facture-honoraires.ts:159-163`).
- Constaté conforme (L111-7, 1° et 2°) : les conditions décrivent au propriétaire l'ordre de présentation des artisans
  et écrivent « Aucun artisan ne paie pour être mieux classé » (l. 2088-2094 ↔ `conditions/page.tsx:585-594`). L'ordre
  décrit est celui du code (`migrations/20261024100000_…classement_artisans.sql:62-66` : note décroissante, puis nom).

### B. Points que le texte tranche
- **JURISTE partie 4, point 8 (c).** Texte : délai de trente jours par défaut « après la date de réception des
  marchandises ou d'exécution de la prestation » (l. 2120-2122) ; pénalités « exigibles sans qu'un rappel soit
  nécessaire » (l. 2152) ; indemnité forfaitaire due par « tout professionnel en situation de retard » (l. 2152-2154).
  Conclusion : pour un client professionnel, la facture d'artisan demande bien ces mentions ; Gerimmo les exige pour
  une SCI (`facture-intervention.ts:57-59`, texte libre). Le texte ne dit rien du client particulier.

### C. Ce que le texte ne tranche pas
- **Conditions de Gerimmo, article 15.2** : « Aucune pénalité ni aucuns frais de relance ne sont facturés »
  (`conditions/page.tsx:951-952`), y compris pour un client professionnel. Le texte dit que les conditions de
  règlement « précisent » le taux et l'indemnité (l. 2143-2146) et fixe un taux plancher (l. 2146-2147). Un vendeur
  peut-il y renoncer par écrit ? Au juriste.
- Le montant de l'indemnité (« fixé par décret », l. 2154) : absent du recueil. Le « 40 € » imprimé
  (`facture-honoraires.ts:162`) n'est donc pas vérifié ici.
- **JURISTE partie 3, B7** : Gerimmo est-il une « place de marché en ligne » ? La définition n'est pas dans le recueil
  (le I de L111-7 est « Abrogé », l. 2083).
- L111-7, 3° (« qualité de l'annonceur et droits et obligations […] en matière civile et fiscale », l. 2096-2097) :
  le décret d'application n'est pas fourni.
- **Avis en ligne** : aucun texte du recueil ne traite des avis de consommateurs. Le régime des évaluations
  d'artisans ne peut pas être contrôlé avec ce recueil.
- Une SCI familiale est-elle un « professionnel » pour ces pénalités ? Incertain, comme l'a dit le juriste.

### D. Nouveautés
- Le recueil annonce « une autre version [de L441-10] au 01/01/2027 » (l. 2117) sans la reproduire. À demander au
  dirigeant avant janvier.

### E. Doutes sur le recueil
- L441-10 : identifiant d'article d'allure récente pour une version « depuis le 26/04/2019 » ; version future non jointe.
- L111-7 : en vigueur « depuis le 17/02/2024 » en vertu d'une loi du 21 mai 2024 (l. 2112-2113), date antérieure à la
  loi ; faute d'accord (« les personnes […] met », l. 2108-2109), peut-être d'origine.

---

## Référence 33 — Règlement (UE) 2019/1150, articles 4 et 5 (espace artisan)

### A. Écarts confirmés
**R33-A1 — mineur. Les conditions de l'espace artisan listent les critères du classement, pas leurs raisons.**
- Texte : indiquer « les principaux paramètres déterminant le classement, et les raisons justifiant l'importance
  relative de ces principaux paramètres » (l. 2253-2255).
- Code : `src/app/conditions/artisans/page.tsx:122-137` (article A5) : critères et ordre, sans justification.
- Correction minimale : une phrase par critère (pourquoi la note d'abord, pourquoi trois évaluations, pourquoi deux
  tiers et un tiers). Nouvelle version des conditions de l'espace artisan.

**R33-A2 — mineur. L'e-mail de refus ou de suspension ne cite pas la clause appliquée.**
- Texte : l'exposé des motifs contient « une référence aux faits ou aux circonstances spécifiques […] ainsi qu'une
  référence aux motifs applicables à cette décision » prévus par les conditions générales (l. 2230-2234).
- Code : `src/lib/decision-artisan-email.ts:6-7` (« Aucune règle n'est citée ») et corps du message, lignes 39-58.
- Correction minimale : une phrase fixe, « Décision prise en application de l'article A10 des conditions de l'espace
  artisan », avec le motif de cet article choisi par le superviseur.

Constaté conforme : motifs transmis au plus tard à la prise d'effet (l. 2194-2198 ↔ `conditions/artisans/page.tsx:
222-223`) ; trente jours avant une fermeture définitive (l. 2200-2203 ↔ `:225-227`) ; exceptions pour manquements
répétés ou obligation légale (l. 2215-2224 ↔ `:225-226`) ; possibilité de répondre et de demander un réexamen
(l. 2205-2207 ↔ e-mail, ligne « Vous pouvez répondre à cette décision ») ; aucune rémunération n'influence le
classement (l. 2263-2267 ↔ `:135-136`).

### B. Points que le texte tranche
- **JURISTE partie 3, A3 (b) et (c).** (b) contenu : faits précis et clause appliquée (l. 2230-2234) : écart mineur,
  voir R33-A2. (c) exclusion définitive : motifs sur support durable trente jours avant (l. 2200-2203), sauf les trois
  cas des l. 2217-2224, et alors « sans retard indu » (l. 2226-2228). Les conditions le disent ; l'écran et l'e-mail
  d'exclusion n'existent pas encore (état décrit par JURISTE.md, non revérifié ici).
- **JURISTE partie 3, A2.** Texte l. 2253-2255. Conclusion : le classement est décrit aux artisans et aux
  propriétaires ; écart mineur R33-A1.

### C. Ce que le texte ne tranche pas
- **A3 (a)** : un e-mail est-il un « support durable » ? Définition absente (article 2 non fourni).
- **B7** : le règlement s'applique-t-il à un espace artisan gratuit ? Définitions absentes.
- Le « processus interne de traitement des plaintes visé à l'article 11 » (l. 2207) : article 11 non fourni. La page
  « Aide et retours » y suffit-elle ?

### D. Nouveautés
- Aucune : texte applicable depuis le 12/07/2020.

### E. Doutes sur le recueil
- Le recueil écrit lui-même « état consolidé à contrôler » (l. 2189). Seuls les articles 4 et 5 sont fournis.

---

## Référence 34 — RGPD, articles 5, 6, 12 à 15, 22, 28, 33

### A. Écarts confirmés
**R34-A1 — important. L'annexe de sous-traitance acceptée par les clients décrit OpenAI plus étroitement que ce que
le code lui envoie.**
- Texte : le contrat « définit l'objet et la durée du traitement, la nature et la finalité du traitement, le type de
  données à caractère personnel » (l. 2748-2752). Tout ajout de sous-traitant demande une autorisation et une
  information préalable (l. 2742-2746).
- Code : `src/lib/editeur.ts:244` (annexe 1 : « Propositions de devis artisans […] à l'exclusion des noms, adresses
  et descriptions libres des occupants ») contre `:239` (rôle réel : assistant, lecture d'une facture ou d'une photo
  de compteur, « le fichier entier »). Le commentaire `:241-243` le reconnaît.
- Correction minimale : nouvelle version des conditions avec l'annexe à jour (déjà décidée, Q15, « reste à faire »).
  Tant qu'elle n'est pas publiée, l'écart demeure.

**R34-A2 — mineur. Durée de conservation chez OpenAI renvoyée au prestataire.**
- Texte : fournir « la durée de conservation […] ou, lorsque ce n'est pas possible, les critères utilisés pour
  déterminer cette durée » (l. 2530-2531).
- Code : `src/app/confidentialite/page.tsx:355-358` : « les durées propres à OpenAI figurent dans ses informations
  officielles ».
- Correction minimale : écrire la durée prévue au contrat signé avec OpenAI (le dirigeant doit la fournir).

Constaté conforme : réponse sous un mois, prolongation de deux mois motivée (l. 2455-2461 ↔ `confidentialite/
page.tsx:851-853`) ; justificatif d'identité seulement en cas de doute (l. 2490-2493 ↔ `:853-855`) ; réclamation à
la CNIL (l. 2538 ↔ `:857-862`) ; transferts hors Union et moyen d'obtenir une copie des garanties (l. 2519-2524 ↔
`:417-429`) ; notification sous 72 heures (l. 2831-2835 ↔ `:802-804`) ; liste des droits (l. 2532-2534 ↔ `:812-819`) ;
absence de délégué dite clairement (`:87-89`).

### B. Points que le texte tranche
- **JURISTE partie 3, A27.** Texte : « Le sous-traitant notifie au responsable du traitement toute violation […] dans
  les meilleurs délais après en avoir pris connaissance » (l. 2839-2840). Code : `conditions/page.tsx:1179-1181`,
  mêmes mots. Conclusion : **le code est conforme au texte fourni.** Formulation proposée : « Conforme au texte ;
  un délai chiffré serait un plus, pas une obligation. »
- **A19, A19bis.** Texte l. 2742-2752. Conclusion : écart, voir R34-A1.
- **A19ter.** Texte l. 2530-2531. Conclusion : écart mineur, voir R34-A2.
- **A7.** Texte : exception « nécessaire à la conclusion ou à l'exécution d'un contrat » (l. 2700-2701), avec « au
  moins » le droit « d'obtenir une intervention humaine […], d'exprimer son point de vue et de contester la décision »
  (l. 2707-2711). Constaté : l'article 15 des conditions (`conditions/page.tsx:936-1000`) ne prévoit aucune voie de
  réexamen par une personne. Si le passage automatique en lecture seule est une « décision » au sens de l'article 22
  (avis du juriste : oui), il manque cette phrase. Écart **conditionnel**, noté R34-B1 au tableau.
- **A2, A10bis.** Texte : « décision fondée exclusivement sur un traitement automatisé » (l. 2695-2697). Le choix
  reste au propriétaire ou à l'artisan (`confidentialite/page.tsx:344-348`). Conclusion : cohérent avec le texte
  fourni ; la note des artisans, calculée automatiquement, a une voie de contestation (`:133-135`).

### C. Ce que le texte ne tranche pas
- **A21, A22** (transferts vers les États-Unis) : articles 44 à 46 absents du recueil.
- **A26** (délégué) : article 37 absent. **A17** : article 17 absent. **A19quater** : article 30 absent.
- **A24** (base légale du compte d'un locataire invité) : l'article 6 liste les bases (l. 2356-2371) sans choisir.
- **A20** (AR24 avec le compte du propriétaire) : appréciation du rôle de chacun.
- **A23, A25** (information de la caution, relais des demandes du locataire) : les messages d'invitation et le
  circuit de relais n'ont pas été relus dans le code pour cette analyse.
- **A1, A4, A5** : je n'ai pas revérifié chaque parcours pour confirmer qu'une personne décide à chaque étape.

### D. Nouveautés
- Aucune : texte de 2016.

### E. Doutes sur le recueil
- Source : pages de la CNIL et version EUR-Lex du 04/05/2016 ; le rectificatif de 2018 est seulement « mentionné »
  (l. 2311). Je ne peux pas dire si le texte reproduit l'intègre.
- Mise en page : trois titres d'articles sont collés au paragraphe précédent (l. 2343-2345, l. 2561-2563,
  l. 2691-2693). Point-virgule manquant à la l. 2510-2511. Pas de phrase tronquée relevée.
- Articles cités par les réponses du juriste mais absents : 4, 9, 17, 30, 35, 37, 44 à 46. L'article 34 (information
  des personnes après une violation) est absent aussi.

---

## Référence 35 — Loi n° 78-17, article 82 (témoins)

### A. Écarts confirmés
Aucun. Constaté : la page nomme trois témoins et les dit exemptés (`confidentialite/page.tsx:220-230`). Le code ne
pose que des témoins de session, d'activité et de confirmation (`src/proxy.ts`, `src/app/auth/confirm/route.ts:76`,
`:147`, `:155`). Aucune bibliothèque de mesure d'audience ou de publicité n'a été trouvée dans `src/`. Les brouillons
gardés dans le navigateur sont décrits (`:376-395`).

### B. Points que le texte tranche
- **JURISTE partie 3, A28.** Texte : dispense si l'inscription « est strictement nécessaire à la fourniture d'un
  service de communication en ligne à la demande expresse de l'utilisateur » (l. 2895-2896). Conclusion : **le code
  est conforme au texte fourni** pour les témoins de session et de confirmation. La réponse du juriste disait « je
  n'ai pas la liste exacte » : la liste est celle de la page, vérifiée dans le code.

### C. Ce que le texte ne tranche pas
- Le témoin d'inactivité et la mémorisation locale d'une quittance sont-ils « strictement nécessaires » ? Appréciation
  (le juriste a répondu oui pour l'inactivité).

### D. Nouveautés
- Aucune.

### E. Doutes sur le recueil
- Aucun.

---

## Référence 36 — CPCE, L100 (recommandé électronique)

### A. Écarts confirmés
Aucun.

### B. Points que le texte tranche
- **JURISTE partie 3, A6 ; QUESTIONS Q10.** Texte : « Dans le cas où le destinataire n'est pas un professionnel,
  celui-ci doit avoir exprimé à l'expéditeur son consentement à recevoir des envois recommandés électroniques »
  (l. 2927-2928). Code : `src/app/actions/recommandes.ts:56` refuse l'envoi sans l'accord du locataire pour la même
  adresse ; `src/lib/ar24.ts:82` le revérifie. Conclusion : **le code est conforme au texte fourni.** La fonction
  reste masquée tant qu'aucun compte AR24 n'est relié (Q10).

### C. Ce que le texte ne tranche pas
- L'accord donné dans l'espace locataire de Gerimmo vaut-il accord « exprimé à l'expéditeur » (le bailleur) ?
- Le prestataire satisfait-il « aux exigences de l'article 44 du règlement (UE) n° 910/2014 » (l. 2922-2925) ? Qualité
  d'AR24 non vérifiable ici. Décret d'application non fourni.

### D. Nouveautés
- Aucune.

### E. Doutes sur le recueil
- Adresse sans date (l. 2920). Texte cohérent.

---

## Référence 37 — Loi Hoguet n° 70-9, article 1

### A. Écarts confirmés
Aucun.

### B. Points que le texte tranche
- **JURISTE partie 3, B3, B4, B10.** Texte : la loi vise ceux qui, « d'une manière habituelle, se livrent ou prêtent
  leur concours, même à titre accessoire, aux opérations portant sur les biens d'autrui » (l. 2975-2977), dont « la
  gestion immobilière » (l. 2992). Constaté dans le code : les conditions écrivent que le Service « n'assure aucun
  séquestre de fonds, ne fait transiter aucun mouvement de fonds » (`conditions/page.tsx:272-275`) et que l'Éditeur
  « n'encaisse aucune somme » (`:582-583`) ; l'offre est réservée aux propriétaires qui gèrent leurs propres biens
  (`:143-149`). Le propriétaire qui gère son bien n'opère pas sur le bien d'autrui. Conclusion : le texte fourni ne
  contredit pas les réponses du juriste ; il ne les confirme pas non plus (voir C).

### C. Ce que le texte ne tranche pas
- Un logiciel qui envoie quittances et relances au nom du bailleur « prête-t-il son concours » à la gestion du bien
  d'autrui ? Le texte ne définit pas ces mots. Reste au juriste (B10, B10bis).
- **Maniement de fonds** : l'article 1 ne dit rien des fonds. Les articles sur la carte professionnelle et les fonds
  détenus ne sont pas dans le recueil. B4 ne peut pas être fermé avec ce seul article.
- Les modèles « mandat de gestion » et « facture d'honoraires » existent dans le code
  (`src/lib/documents/modeles/mandat-gestion.ts`, `facture-honoraires.ts`) pour une future offre aux agences : la
  question se reposera au palier 2.

### D. Nouveautés
- Aucune.

### E. Doutes sur le recueil
- **L'adresse source est une ancienne adresse de Légifrance, avec un identifiant de session et la date 20/04/2018**
  (l. 2972-2973), alors que la version est déclarée « en vigueur au 22/11/2026 ». Le lien ne prouve pas l'état de 2026.
- Le 8° cite les « articles L. 121-60 et suivants du code de la consommation » (l. 2998-2999), numérotation d'avant
  2016 : cohérent avec un texte non retouché depuis 2014, mais à recontrôler.

---

## Tableau récapitulatif

| Identifiant | Gravité | Document ou écran touché | Taille |
|---|---|---|---|
| R25-A1 | Bloquant (ouverture des ventes aux particuliers) | Garde de souscription ; décision du dirigeant | Petite (ne pas retirer le blocage) |
| R25-A2 | Important | Conditions générales, article 17 ; mentions légales ; courriers de confirmation et de réclamation | Petite |
| R28-A1 | Important | Mentions légales, conditions, courriers, factures Stripe (nom du vendeur suivi de « EI ») | Petite dans le code ; réglage Stripe par le dirigeant |
| R29-A1 | Mineur | Pied des factures d'abonnement, courrier de confirmation, page Tarifs | Petite |
| R29-A2 | Important | Facture de travaux de l'artisan (numérotation) | Moyenne |
| R29-A3 | Important | Facture de travaux de l'artisan (mention de franchise) ; fiche entreprise | Moyenne |
| R31-A1 | Important | Page confidentialité ; purge des factures et des clients Stripe (base) | Moyenne |
| R33-A1 | Mineur | Conditions de l'espace artisan, article A5 | Petite |
| R33-A2 | Mineur | E-mail de refus ou de suspension d'un artisan | Petite |
| R34-A1 | Important | Conditions générales, annexe 1 (OpenAI) | Moyenne (nouvelle version des conditions) |
| R34-A2 | Mineur | Page confidentialité (durée chez OpenAI) | Petite |
| R34-B1 | Mineur, conditionnel | Conditions générales, article 15 (réexamen par une personne) | Petite |

Total : 1 bloquant, 6 importants, 5 mineurs (dont 1 conditionnel).

**À faire hors code, par le dirigeant** : nom « Prénom NOM EI », SIREN et adresse dans le compte Stripe ; intitulé du
compte bancaire professionnel ; adhésion à un médiateur ; durée de conservation prévue au contrat OpenAI.

**À surveiller** : texte réglementaire sur la future mention de franchise (après le 01/01/2027) ; version de L441-10
au 01/01/2027 ; nouvelles mentions de facture au 01/09/2027 ; seuil de 37 500 € / 41 250 €.

## Ce que je n'ai pas pu lire ou vérifier
- Légifrance : aucun texte recontrôlé.
- Les réglages du compte Stripe (identité du vendeur sur les factures) et les données saisies en base (nom, adresse,
  médiateur).
- Les textes absents du recueil cités ci-dessus : décrets d'application (médiation, L111-7, L100, indemnité de
  recouvrement), L221-18 et L221-28, définitions du règlement 2019/1150, articles 4, 9, 17, 30, 34, 35, 37, 44 à 46
  du RGPD, autres articles de la loi Hoguet, texte sur les avis en ligne, version 2027 de L441-10 et de L102 B.
- Dans le code : les messages d'invitation (A23), le relais des demandes de droits (A25), l'écran d'exclusion d'un
  artisan, et chaque parcours « sans décision automatique » (A1, A4, A5).
