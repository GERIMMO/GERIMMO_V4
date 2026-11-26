# Reprise du lot D7 (vendeur des abonnements) et lot « textes » T4 (vente et données) — notes

Date : 24/11/2026. Arbre : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/palier1-t`
(second arbre Git, détaché, parti du commit D7 `e9e46692`). **Un commit local : `6b9d9e01c252b0fa48303b1a467536c6675ffe08`** (HEAD détaché, aucune
branche déplacée), rien n'est poussé. Un seul commit et non deux : la nouvelle version des conditions porte à la fois
la reprise D7 (article 17, article 2) et le lot T4 (annexe 1, dix ans) sous une même empreinte. Aucune écriture en
production, aucun réglage ouvert, aucun serveur lancé, banc partagé non touché.

**Statut du recueil** : texte fourni par le dirigeant, source Légifrance et version déclarées, non recontrôlé par nous.
Chaque passage cité ci-dessous a été relu dans `recueil/r3-refs25-37.txt` avant la correction. Rien n'est dit « conforme ».

**Vocabulaire** : « vérifié » = commande lancée et résultat lu ; « supposé » = raisonnement, sans preuve par exécution.

---

## 1. Ce qui change, en clair

### 1.1 Médiateur de la consommation (décision de pilotage, corrige le commit D7)

Textes relus (l. 8-33 du recueil) : L. 612-1 — « le professionnel garantit au consommateur le recours effectif à un
dispositif de médiation de la consommation » ; L. 616-1 — « Tout professionnel communique au consommateur […] les
coordonnées du ou des médiateurs compétents dont il relève ».

| Cas | Avant (commit D7) | Maintenant |
|---|---|---|
| Particulier, vendeur complet, **sans médiateur**, réglage par défaut | paiement ouvert | **paiement fermé**, phrase : « Le paiement en ligne n'est pas encore ouvert aux particuliers. Les coordonnées du médiateur de la consommation de Gerimmo doivent être publiées avant la première souscription. » |
| Même cas, le super admin a cliqué « Lever le blocage » | ouvert | ouvert ; l'écran d'abonnement dit « aucun n'est désigné à ce jour » |
| Professionnel (agence), sans médiateur | ouvert | ouvert (le médiateur ne le concerne pas) |
| Vendeur incomplet, particulier, blocage levé ou non | fermé | fermé |
| Vendeur incomplet, **agence**, blocage levé (D7R-04) | **ouvert** | **fermé** : toute première souscription exige un vendeur complet |
| Entrepreneur individuel dont le nom ne porte pas « EI » (identité saisie avant le contrôle, D7R-05) | ouvert | fermé comme un vendeur incomplet ; l'ouverture des ventes est refusée et nomme le manque |
| Hausse de capacité d'un client déjà abonné | le vendeur ferme si le blocage est actif | inchangé ; le médiateur ne ferme jamais une hausse |

- Un seul bouton (« Lever le blocage », existant) : il ouvre le particulier sans médiateur ET laisse passer les hausses
  avec un vendeur incomplet. Je n'ai pas créé de second réglage (aucune fonction nouvelle, aucune migration pour cela).
- La carte « Blocage des abonnements » de /admin/parametres cite les deux articles mot pour mot, dit que la décision
  appartient au dirigeant et qu'elle est inscrite à l'historique. Elle n'écrit nulle part que vendre sans médiateur est
  permis.
- Journal : la levée est enregistrée par la base dans le registre des modifications (mécanisme existant, lu par
  /admin/journaux ; libellé précisé : « Blocage des abonnements (identité du vendeur incomplète, médiateur absent) :
  levé. »).
- Jamais de médiateur inventé : mentions légales, écran d'abonnement, courriels et conditions restent vrais avec un
  médiateur vide (tests).

### 1.2 Conditions générales : nouvelle version « 2026-11-24 » (24 novembre 2026)

Mécanisme existant respecté : `CONDITIONS_VERSION` / `CONDITIONS_DATE` (`app/src/lib/editeur.ts`), une entrée de plus
dans `app/src/lib/conditions-versions.json` (date d'effet, nature, résumé, empreinte de garde). Les entrées des versions
passées ne sont pas modifiées ; aucune version archivée n'est touchée (l'archive vit en base, je n'y ai pas accès).

Ce que la version change :
- **Article 17** (D7R-01, R25-A2) : un seul texte, vrai avec et sans médiateur. Il dit le droit du consommateur dans les
  mots de L. 612-1, renvoie aux mentions légales pour le nom et les coordonnées, et dit que ces mentions indiquent, tant
  qu'aucun médiateur n'est désigné, qu'il n'y en a pas. Plus de « sera désigné […] dès l'adhésion de l'Éditeur ».
- **Annexe 1** (R34-A1) : le rôle d'OpenAI décrit les trois envois que le code fait réellement (relus dans
  `lib/conversation-privee-ia.ts`, `lib/lecture-document-ia.ts`, `lib/proposition-devis-ia.ts`) : assistant « Demander à
  Gerimmo » (sujet et messages), lecture assistée (le fichier entier), propositions de devis (catégorie, symptômes d'une
  liste fermée, catalogue).
- **Article 9** (R31-A1) : factures conservées « au moins dix ans » (au lieu de six).
- **Article 2** (D7R-08) : « l'entreprise identifiée aux mentions légales » (au lieu de « l'entrepreneur individuel »,
  écrit en dur).
- **Article 15.3** (R34-B1, conditionnel) : une phrase — le passage en lecture seule est automatique ; le client peut
  demander qu'une personne réexamine sa situation. **Choix à confirmer** (question 3).
- Formulaire de rétractation : la réserve « adresse du siège (à venir) » devient « adresse de l'éditeur (à venir) »
  (visible seulement si l'adresse manque).

**Les conditions de l'espace artisan ne changent pas** (même version 2026-10-24, même empreinte : vérifié). Leur annexe
garde son propre rôle d'OpenAI (propositions de devis : l'espace artisan n'a ni l'assistant ni la lecture assistée).

La version est déclarée **« nouvelles souscriptions uniquement »** (comme les versions 2026-11-11 et 2026-11-15) :
aucun client déjà abonné n'est mis en non-reconduction par ce commit. Voir 6 (ce dont le lot D4 / Q15 aura besoin).

### 1.3 D7R-02 : saisir le médiateur ne referme plus les ventes

- Avant : la commande d'un particulier comparait TOUTE l'identité saisie à celle archivée avec les conditions
  (médiateur, téléphone, prestataires compris). Saisir le médiateur après l'ouverture fermait les ventes, sans un mot,
  jusqu'à une livraison de code.
- Maintenant : la comparaison ne porte que sur ce que le texte des conditions imprime — nom, adresse, e-mail de
  contact, et la présence de l'encadré « Document en cours de finalisation » (`identiteDesConditions`,
  `app/src/lib/editeur.ts`). L'article 17 ne dépend plus du médiateur.
- Preuve : `tests/vendeur-mediateur-reprise-d7.test.ts`, bloc 4 — pour chacun des champs de la saisie, le texte du
  contrat rendu change si et seulement si l'identité retenue change. Si un article se met un jour à citer un autre
  champ, ce test échoue.
- Reste vrai, et dit dans la console avant la saisie : changer le **nom, l'adresse ou l'e-mail de contact** après
  l'archivage change le contrat ; les premières souscriptions des particuliers attendent alors une nouvelle version
  (livraison de code). C'est voulu (le contrat archivé doit être celui affiché).

### 1.4 Entrepreneur individuel et mention « EI » (D7R-03, D7R-05, R28-A1)

Texte relu (R. 526-27, l. 1053-1055) : « une dénomination incorporant son nom ou nom d'usage précédé ou suivi
immédiatement des mots : “ entrepreneur individuel ” ou des initiales : “ EI ” ».
- Forme juridique reconnue quelles que soient la ponctuation, la casse et les accents : « Entrepreneur individuel, nom
  commercial X », « Entrepreneur individuel(X) », « entrepreneur individuel. », « EI, … », « E.I. », « Entrepreneuse
  individuelle », « Entreprise individuelle », « Micro-entrepreneur », « Auto-entrepreneur », « Micro-entreprise »…
  (24 variantes testées une à une). « EIRL », « SAS », « EURL » ne le sont pas.
- Mention : « EI », « E.I. » ou les mots en toutes lettres, en mot entier, qui **touchent** un mot du nom (espace,
  virgule ou parenthèse). Refusés : « EI-CONSEIL Martin », la mention seule, « non entrepreneur individuel », un tiret
  entre le nom et la mention, « ei » en minuscules. Limite dite dans le code : « SOCIETE EI » passe (le code ne sait pas
  que le mot voisin est le nom d'une personne).
- Le contrôle est rejoué à l'ouverture des ventes et avant toute première souscription.

### 1.5 Conservation des factures : dix ans (R31-A1)

Textes relus (l. 1998-2013 et 2017-2060) : article 36 de la loi n° 2026-534 du 25 juin 2026 — à l'article L. 102 B du
LPF, « doivent être conservés pendant un délai de six » devient « sont conservés pendant un délai de dix » ; « Le
présent article s'applique aux documents et aux pièces dont le délai de conservation expire après le 1er janvier 2027 ».
L. 102 B, I : le délai court « de la date à laquelle les documents ou pièces ont été établis ».

**Ce que le code programmait à six ans** (lu dans les migrations, dans l'ordre réel du manifeste) :
1. `purger_archives_comptes()` : retire une à une les copies de factures jointes à l'archive d'un compte fermé, à
   l'échéance de `echeance_facture_archivee` (plancher de 72 mois).
2. `clients_stripe_au_terme()` + mission de purge (`lib/comptes-fermeture-serveur.ts`) : **supprime chez Stripe la fiche
   du client — et ses factures avec elle** — six ans après la fin du dernier abonnement payé.
3. La liste des suppressions à faire (`cibles_conservation_complementaire`) et la garde des archives lisent la même fonction.

**A-t-il déjà tourné ?** Supposé : non, rien n'a pu être supprimé à ce titre. Raisonnement par les dates : la plus
ancienne migration du dépôt date de 2026 ; aucune facture n'a six ans avant 2032. Non vérifié en production (non lue).

**Correction** (on allonge, on ne raccourcit rien, on ne supprime rien) — migration
`20261125103000_factures_conservation_dix_ans.sql` : catalogue « archive:facture » à 120 mois, plancher 120 ;
`echeance_facture_archivee` plancher 120 pour toutes les archives, même celles constituées avant ; nouvelles archives à
120 mois ; client Stripe jamais proposé avant dix ans, ni avant l'échéance recalculée de sa dernière facture archivée.
Les archives existantes ne sont pas réécrites (une archive ne se modifie pas) : leur date enregistrée reste l'ancienne,
mais plus rien ne s'en sert seule pour supprimer.
Textes publics alignés : conditions (article 9), confidentialité (tableau, deux paragraphes), console (fermeture d'un compte).

### 1.6 Seconde migration, découverte en créant la nouvelle version : courrier d'impayé

Le courrier du jour d'un prélèvement échoué (mise en demeure, article 15.4) ne part que pour un contrat conclu sous une
version des conditions inscrite dans une liste fermée, **en deux endroits** : le code (`lib/relances-paiement.ts`) et une
fonction de la base. La liste était « 2026-10-24, 2026-11-15 ». Sans correction, un client qui souscrit sous la
nouvelle version et dont le prélèvement échoue n'aurait pas reçu le courrier que l'article 15.2 lui promet (le relais
aurait été alerté à la place). Migration `20261125104000_courrier_impaye_conditions_du_24_novembre.sql` + la même
valeur dans le code. **À refaire à chaque nouvelle version des conditions** (noté pour le lot D4).

---

## 2. Tableau des identifiants

| Identifiant | État | Ce qui est fait / pourquoi |
|---|---|---|
| D7R-01 | corrigé | Article 17 réécrit (1.2), nouvelle version ; le test qui figeait l'ancienne phrase est réécrit. |
| D7R-02 | corrigé | 1.3 ; avertissement dans les deux rubriques de la console ; tests. |
| D7R-03 | corrigé | 1.4 ; un test par variante. Effet public (capital « à venir » pour un EI mal ponctué) : disparaît avec la reconnaissance. |
| D7R-04 | corrigé | Toute première souscription exige le vendeur, agence comprise (garde, action, écran) ; tests action + règle. |
| D7R-05 | corrigé | Contrôle « EI » rejoué à l'ouverture et dans la garde ; contournements cités refusés ; « E.I. » et espaces multiples acceptés ; « ei »/« Ei » restent refusés (message clair). |
| D7R-06 | corrigé | /admin/sante et message d'enregistrement de l'identité : ne disent plus « à venir » pour le médiateur ni « sans rien fermer ». |
| D7R-07 | corrigé | Libellés courts (`CHAMPS_EDITEUR`), aide sous le champ (`AIDES_EDITEUR`) : le journal et le refus d'archivage n'affichent plus les parenthèses. |
| D7R-08 | corrigé | Article 2 neutre ; « adresse de l'éditeur » dans les deux réserves (conditions, courriel). |
| D7R-09 | corrigé | E141 : le renvoi au bailleur ne vise que le locataire ; phrase voisine (« exporté ce que vous souhaitez garder ») corrigée ; finalité « renvoi au médiateur » reformulée. |
| D7R-10 | corrigé | Exemple fictif « 123 456 789 » dans le commentaire ; test qui interdit tout autre numéro de cette forme dans quatre fichiers. |
| D7R-11 | corrigé | Preuve « pas une société » : chaque phrase qui nomme l'Éditeur est lue en entier ; tests des variantes de forme et du chemin agence ajoutés ; l'assertion faible (`not.toContain("médiateur")`) remplacée par des égalités et par la preuve que le contrôle suivant a été atteint. |
| D7R-12 | corrigé (non vu dans un navigateur) | Message d'erreur de l'ouverture en couleur d'alerte ; libellés sur une ligne (l'aide est sous le champ). Rendu réel à regarder sur le banc. |
| R25-A1 | corrigé (option prudente) | 1.1 : fermé par défaut, levée possible par le dirigeant. |
| R25-A2 | corrigé | Article 17 ; mentions légales et courriels déjà corrigés par le commit D7 (relus, inchangés). |
| R26 | sans écart (confirmé) | Seul le commentaire « connue par des sources secondaires » est mis à jour. |
| R27 | sans écart ; question juriste | « domicile » (texte) / adresse de l'entreprise (page) : voir 8. |
| R28-A1 | corrigé | 1.4. Reste hors code : compte Stripe, intitulé du compte bancaire (5). |
| R29-A1 | corrigé | « TVA non applicable, article 293 B du CGI » : « article » en toutes lettres dans le pied des factures Stripe, le courriel de confirmation, /tarifs (quatre fichiers). Relu : 293 E, l. 1950-1953. |
| R29-A2, R29-A3 | non fait | Reportés (décision Q14), rien touché. Le parcours e2e de l'artisan et le kit de recette gardent « art. ». |
| R30 | sans écart | Rien à faire avant le texte réglementaire (à surveiller). |
| R31-A1 | corrigé | 1.5. |
| R32 | sans écart | — |
| R33-A1 | non fait — question | Les « raisons » de l'importance de chaque critère du classement ne sont dans aucun document : les écrire serait inventer. Demande aussi une nouvelle version des conditions de l'espace artisan (ré-acceptation de tous les artisans). Question 5. |
| R33-A2 | non fait — question | Citer « l'article A10 » dans l'e-mail de refus ou de suspension suppose que le motif libre du superviseur soit l'un des motifs de A10 : il faudrait un choix dans une liste (fonction nouvelle). L'applicabilité du règlement n'est pas tranchée (définitions absentes du recueil). Question 5. |
| R34-A1 | corrigé | Annexe 1 (1.2). |
| R34-A2 | question | La durée de conservation chez OpenAI n'est dans aucun document fourni. Texte inchangé. Question 4. |
| R34-B1 | corrigé (à confirmer) | Phrase à l'article 15.3. Question 3. |
| R35, R36, R37 | sans écart | — |
| E141 | corrigé (suite) | Voir D7R-09. |

---

## 3. Preuves (commandes lancées, résultats lus)

Tout est lancé dans `palier1-t/app`. Base : **ma propre base** `gerimmo_ci_sonde_tquatre` (et sa copie `…_api`), créée
par `createdb` puis `node e2e/local/preparer-ci.mjs` (564 migrations du manifeste, la mienne des dix ans comprise ; la
seconde migration y a été appliquée ensuite par `psql -f`). Aucune base du banc touchée, aucun serveur, aucun port.

**Vérifié**
- `npx next typegen` puis `npx tsc --noEmit` → code de sortie 0.
- `npx eslint <60 fichiers .ts/.tsx modifiés ou ajoutés>` → code de sortie 0, aucune sortie.
- **Suite vitest complète** avec ma base (`npx vitest run --maxWorkers=1`, journal
  `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/t4-vitest-complet-3.log`) :
  1 070 fichiers — 1 022 réussis, 15 en échec, 33 sautés ; 15 779 tests — 15 469 réussis, 6 en échec, 304 sautés.
  **Les 15 fichiers en échec ne viennent pas du lot** :
  - 10 exigent un service absent de mon environnement (base ou émulateur nommés du banc, navigateur sans tête) :
    `fiabilite-priorites-base`, `finalisation-courriels-base`, `perimetre-pilote-base`, `reprise-courriels-base`,
    `lot2-acces-notifications-base`, `lot2-auth-reel`, `lot3-notifications-base`, `souscription-formulaire-navigateur`,
    `ux-accueil-dirigeant-navigateur`, `ux-console-direction-navigateur` ;
  - 4 échouent **à l'identique sur l'arbre non modifié** (`git stash`, même base) : `contrats-durables-base` (1 test),
    `echeanciers-charges` (1 test, moteur PDF), `jour-de-paris-suite-migrations-rejeu` (1 test : la chaîne « Ordre
    complet » des retours, refusée par un maillon des e-mails antérieur au lot), `patrimoine-finance-retours-base` (2 tests) ;
  - `exercice-restauration` (1 test) : réussi au premier passage sur la base neuve, en échec ensuite parce qu'une
    restauration bute sur trois lignes orphelines de `destinataires_rectifications_quittance` laissées par d'autres
    tests (aucune ligne du lot : `archives_comptes` est vide).
  Premier passage (avant la seconde migration et les entrées de la chaîne des retours) : 14 fichiers en échec, les
  mêmes moins `exercice-restauration` (journal `…/scratchpad/t4-vitest-complet.log`).
- Les 32 fichiers de test modifiés ou ajoutés, **sans base** : 30 réussis, 2 sautés (les deux fichiers de base),
  701 tests réussis, 153 sautés.
- Contre-épreuve de la seconde migration : son retour joué sur ma base, `tests/impayes-et-retractations-durables-base.test.ts`
  échoue pour la version 2026-11-24 (3 tests : le courrier ne part pas) ; migration rejouée, 24 tests réussis.
- Les conditions de l'espace artisan gardent leur empreinte du 24/10/2026 (`tests/conditions-empreinte.test.ts`, inchangée
  dans `conditions-versions.json`).
- Nouvelle empreinte de garde des conditions clients, version 2026-11-24 :
  `d8c690edacf312bdd57d28dfdf5b24a35e4b3e8edb9b131d06879ad5cd20d6df`.

**Tests nouveaux ou réécrits (aucun désactivé, aucun affaibli ; chaque réécriture porte son commentaire)**
- Nouveaux : `tests/vendeur-mediateur-reprise-d7.test.ts` (132 tests : règle de la garde case par case, 24 formes
  « entrepreneur individuel », 16 noms qui portent la mention et 16 qui ne la portent pas, console, contrat indépendant
  du médiateur champ par champ) ; `tests/factures-conservation-dix-ans-base.test.ts` (10 tests) ;
  `tests/courrier-impaye-version-conditions-base.test.ts` (5 tests, dont la garde « la version en vigueur est dans les
  deux listes »).
- Réécrits parce qu'ils affirmaient l'ancienne règle : `garde-souscription` (particulier sans médiateur : fermé par
  défaut ; archive : seul ce que le contrat imprime compte), `abonnement-proprietaire`, `console-identite-mediateur`,
  `vendeur-entrepreneur-individuel-d7`, `conditions-v1-textes`, `pages-legales-rendu`, `pages-legales`,
  `confidentialite-v1`, `durees-conservation` (+ sa liste de référence), `conditions-empreinte` (les trois variantes du
  médiateur rendent désormais le même texte), `conservation-reglages-base`, `fermeture-comptes-base`,
  `conservation-prospection-base` (éprouve toujours 20261024140000 seule : ma migration y est défaite dans la
  transaction), `impayes-et-retractations-durables-base` (rejoué pour les trois versions des conditions).
- Mis à la nouvelle version ou au nouveau libellé : `acceptation-conditions-actions`, `conditions-acceptation`,
  `conditions-versions-pages`, `essai-deux-mois`, `courriers-contrat`, et dix fichiers pour « article 293 B ».

**Supposé (non vérifié par exécution)**
- Aucune purge n'a jamais supprimé de facture (raisonnement par les dates ; production non lue).
- Le rendu dans un navigateur des écrans de console modifiés et des pages légales (rendu serveur testé seulement).
- Les deux pages `tests/fixtures/conditions-next-start*.html` : **non relevées de nouveau**. Les passages du contrat
  modifiés y ont été remplacés par un script (`…/scratchpad/t4-fixture/adapter-fixtures.py`), HTML et données de
  navigation ; le test « au caractère près » prouve que le texte est celui du rendu d'aujourd'hui, pas qu'un
  `next start` d'aujourd'hui sert ce flux. Dit dans l'en-tête de `tests/conditions-flux.test.ts`.
- La construction (`npm run build`) et les parcours Playwright : non lancés.
- État de la production : identité saisie, version déjà archivée, comptes payants ou fermés existants.

---

## 4. Tests à rejouer sur le banc

Avant : appliquer les deux migrations aux bases du banc, dans l'ordre (`psql -w "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f …`
puis la même sur `"$SUPALOCAL_DB"`) : `20261125103000_factures_conservation_dix_ans.sql`,
`20261125104000_courrier_impaye_conditions_du_24_novembre.sql`.

1. Suite vitest complète (référence du banc : deux fichiers en échec). À regarder de près :
   - `tests/jour-de-paris-suite-migrations-rejeu.test.ts` — la chaîne « Ordre complet » des retours porte mes deux
     retours en tête ; je n'ai pas pu la voir passer (elle échoue chez moi avant le lot, sur un autre maillon) ;
   - `tests/exercice-restauration.test.ts`, `tests/contrats-durables-base.test.ts`, `tests/echeanciers-charges.test.ts`,
     `tests/patrimoine-finance-retours-base.test.ts` (en échec dans mon environnement avant comme après) ;
   - les trois fichiers de base du lot et `conservation-*`, `fermeture-comptes-base`, `impayes-et-retractations-durables-base`.
2. Parcours Playwright : `e2e/blocage-souscription.spec.ts` (libellé du journal modifié, carte réécrite — les textes
   « Règle active », « Règle levée », « Blocage levé », les deux boutons sont gardés), `e2e/abonnement.spec.ts`
   (« TVA non applicable, article 293 B du CGI »), `e2e/conditions-flux.spec.ts` (texte extrait = texte affiché, sur le
   build), `e2e/souscription-sans-alerte-sortie.spec.ts` (il se saute seul si le bouton de paiement n'apparaît pas :
   avec un banc sans médiateur saisi et règle active, il se sautera — saisir un médiateur fictif ou lever la règle).
3. **Relever de nouveau** `tests/fixtures/conditions-next-start.html` et `…-degradee.html` sur le `next start` du banc
   (identité fictive de `IDENTITE_DU_BANC` ; puis base coupée), et retirer l'avertissement de l'en-tête de
   `tests/conditions-flux.test.ts`.
4. À l'œil, sur téléphone et sur grand écran : /admin/parametres (carte « Blocage des abonnements » avec ses deux
   citations ; formulaire « Contact et entreprise » avec l'aide sous les champs ; message de refus de l'ouverture en
   rouge), /admin/sante (« Informations légales »), /conditions (articles 2, 9, 15.3, 17, annexe 1), /confidentialite
   (tableau des durées), /mentions-legales.
5. **Fusion avec l'arbre `palier1`** : un autre lot y prépare `20261125090000_conge_textes_officiels_t1.sql`. Mes deux
   migrations portent des numéros postérieurs. Fichiers que les deux lots allongent au même endroit :
   `e2e/local/ordre-migrations.txt`, `tests/relais-migrations-manifeste.test.ts`, `vitest.config.ts`,
   `supabase/retours-arriere/LISEZ-MOI.md` (tableau, et tête de la chaîne « Ordre complet » : garder l'ordre
   décroissant des numéros, sans citer d'autre numéro entre accents graves dans le texte d'une entrée — six tests le
   vérifient).

Bases laissées en place (aucune suppression) : `gerimmo_ci_sonde_tquatre` et `gerimmo_ci_sonde_tquatre_api`.

---

## 5. Gestes du jour de publication

Ordre (remplace l'ordre 5.2 des notes D7) :
1. **Base d'abord** : appliquer les deux migrations, dans cet ordre, avant le code —
   `20261125103000_factures_conservation_dix_ans.sql` puis `20261125104000_courrier_impaye_conditions_du_24_novembre.sql`.
   (Si le lot T1 livre `20261125090000_…`, il passe avant : les numéros suivent.)
2. Déployer le code.
3. /admin/parametres, « Contact et entreprise » : saisir l'identité du vendeur (tableau 5.1 des notes D7, inchangé ;
   le nom s'écrit `NOM Prénom EI`). **Relire le nom, l'adresse et l'e-mail avant d'archiver** : les changer ensuite
   suspend les premières souscriptions des particuliers jusqu'à une nouvelle version des conditions.
4. /admin/sante → « Versions des conditions » → archiver la version du 24 novembre 2026. Si l'archivage est refusé
   (« déjà archivée avec un autre texte »), ne rien forcer : prévenir.
5. Vérifier que la règle « Blocage des abonnements » est **active**.
6. Après « je valide la publication » : « Ouvrir les souscriptions » (case à cocher).
7. **Médiateur** : tant qu'il n'est pas saisi, aucun particulier ne peut souscrire. Deux issues, au choix du dirigeant :
   - saisir le médiateur (nom, adresse postale, site) dès la convention signée — à tout moment, sans nouvelle version
     des conditions et sans fermer quoi que ce soit ;
   - ou « Lever le blocage », après avoir lu les deux articles affichés par la carte : la vente s'ouvre aux
     particuliers sans médiateur ; la décision est inscrite à l'historique ; « Réactiver le blocage » la retire.
8. Compte Stripe (hors Gerimmo) : nom `NOM Prénom EI`, adresse, SIREN (inchangé, notes D7 5.3). Les clients Stripe
   existants reçoivent le nouveau pied de facture (« article 293 B ») à leur prochaine opération.
9. Hors logiciel : intitulé du compte bancaire professionnel avec la dénomination « … EI » (R. 526-27, alinéa 3).

À faire avant le 1er janvier 2027 au plus tard : étape 1 (dix ans). Rien ne presse techniquement (aucune purge avant 2032).

---

## 6. Ce dont le lot D4 (Q15, accord exprès des clients existants) aura besoin

- La version 2026-11-24 est déclarée `"nouvelles_souscriptions_uniquement": true`. Tant que ce drapeau reste, un client
  déjà abonné n'est ni invité à accepter, ni mis en non-reconduction ; il reste sous sa version (dont l'annexe 1
  décrit OpenAI trop étroitement, et l'article 9 annonce six ans).
- Pour recueillir l'accord exprès : retirer le drapeau (une ligne), fixer une date d'effet qui laisse le préavis
  (l'article 16 et `lib/non-reconduction-conditions.ts` : pas de non-reconduction avant un mois plein après
  l'archivage), vérifier l'écran « Nos conditions générales évoluent » avec le résumé de la version (rédigé, 762
  caractères), et décider si un client qui n'accepte pas voit vraiment son abonnement non reconduit pour ces
  changements-là (aucun ne touche le prix ni la durée).
- Le changement de sous-traitance (annexe 1) : l'annexe elle-même promet une information « par courriel, au moins un
  mois à l'avance » de tout ajout ou remplacement de prestataire. Ici le prestataire ne change pas, sa description
  s'élargit : au juriste de dire si le courriel est dû (point 8.6).
- À chaque nouvelle version : ajouter son identifiant aux deux listes du courrier d'impayé (1.6), mettre à jour
  `e2e/recette-production/preparer-comptes.sql`, et **relever de nouveau** les deux pages de
  `tests/fixtures/conditions-next-start*.html` sur un vrai `next start` (voir 4).
- Les contrats conclus sous 2026-11-15 gardent un article 17 qui parle d'une « adhésion » : aucun contrat payant
  n'existe à ce jour (supposé : ventes jamais ouvertes ; non vérifié en production).

---

## 7. Questions au dirigeant (option prudente déjà appliquée)

1. **Médiateur : adhérer, ou lever le blocage ?** Option appliquée : fermé aux particuliers par défaut. La levée est à
   un clic, et elle se retire. Le texte que vous avez fourni ne prévoit pas d'exception ; la sanction n'est pas dans le recueil.
2. **Un seul bouton pour deux effets.** « Lever le blocage » ouvre le particulier sans médiateur ET laisse passer les
   hausses de capacité quand l'identité du vendeur est incomplète. Voulez-vous deux réglages distincts ? (Petite
   migration ; non faite : fonction nouvelle.)
3. **Article 15.3 : « demander qu'une personne réexamine sa situation ».** Phrase ajoutée parce que la mise en lecture
   seule est automatique (réponse du juriste A7 : c'est une décision automatisée). Elle vous engage à répondre à ces
   demandes. À retirer avant l'archivage si vous n'en voulez pas (cela change l'empreinte : me le dire).
4. **OpenAI : durée de conservation.** La page confidentialité renvoie aux informations d'OpenAI. Quelle durée prévoit
   votre contrat avec OpenAI ? Sans elle, le texte reste tel quel.
5. **Espace artisan (R33).** Voulez-vous (a) écrire, pour chaque critère du classement, pourquoi il compte, et (b) que
   le superviseur choisisse le motif d'un refus ou d'une suspension dans la liste de l'article A10 ? Les deux demandent
   une nouvelle version des conditions de l'espace artisan, que chaque artisan devra accepter de nouveau.
6. **Anciens clients fermés (s'il y en a).** Un compte fermé avant ce lot a reçu un courriel disant que ses factures
   sont gardées « jusqu'au … » (six ans). Elles le seront dix ans. Faut-il les en informer ? (Supposé : aucun compte
   payant fermé à ce jour.)
7. **« Particulier » = tout espace au tarif propriétaire**, SCI et propriétaire professionnel compris : le médiateur
   leur est exigé comme à un consommateur. Option la plus protectrice ; à garder ?

---

## 8. Points pour JURISTE.md

À ajouter ou préciser :
1. **Vente à un consommateur sans médiateur** (remplace le point 1 des notes D7). État du produit : fermé par défaut ;
   ouverture possible sur décision du dirigeant, tracée. Reste à dire : la sanction ; les « modalités fixées par
   décret » de L. 616-1 (où et comment communiquer les coordonnées : décret absent du recueil) ; si l'essai gratuit
   (inscription ouverte sans médiateur) est déjà un contrat de consommation qui l'exige.
2. **Article 17, nouvelle rédaction** : suffit-elle tant qu'aucun médiateur n'existe ? Le droit est énoncé pour le
   « Client consommateur » seul (mots de L. 612-1) ; l'ancienne rédaction visait aussi le « non-professionnel » (SCI
   familiale) : la médiation de la consommation lui est-elle ouverte ?
3. **Dix ans (L. 102 B)** : le recueil donne l'article modificateur, pas la rédaction de L. 102 B au 01/01/2027. Point de
   départ retenu : la plus tardive de l'émission et de la fin de l'exercice (à défaut, fin du dernier abonnement payé) —
   toujours au moins dix ans après l'émission. La preuve du contrat reste à dix ans après la fin du dernier abonnement payé.
4. **Mention « EI »** : tranché par R. 526-27 pour le nom ; reste l'appréciation « correspondances à usage
   professionnel » (courriels automatiques signés « L'équipe Gerimmo ») et la place du nom commercial.
5. **Réexamen par une personne (RGPD, art. 22)** : la phrase ajoutée à l'article 15.3 est-elle la bonne réponse, et
   faut-il la même pour la fin d'essai (lecture seule sans souscription) ?
6. **Annexe 1 élargie** : information préalable des clients existants due ou non (RGPD, art. 28 ; annexe : « au moins
   un mois à l'avance »).
7. **Mention de franchise** : « article » en toutes lettres appliqué (293 E du recueil). Le reste du point 13 est inchangé.
8. **Domicile de l'éditeur personne physique** (loi 2004-575, art. 1-1) : inchangé, voir analyse 3, référence 27.

À alléger : « mention EI : articles non lus » (R. 526-27 est lu dans le recueil) ; « conservation des factures : six ans »
(dix ans, texte lu) ; « rétractation en ligne : sources secondaires » (L. 221-21 et D. 221-5 lus dans le recueil).

---

## 9. Seconde reprise (24/11/2026, après la relecture adverse T4R)

**Un commit local de plus : `a10933680ff4c42d42829117f5109906d7bcdf7c`** (parent `6b9d9e01`, HEAD détaché de `palier1-t`, rien n'est
poussé). Base utilisée : `gerimmo_ci_sonde_tquatre` (et sa copie `…_api`), où les deux migrations nouvelles sont
appliquées. Aucun serveur, aucun port, banc partagé non touché. Le conteneur a redémarré en cours de route : l'arbre et
la base étaient intacts, rien n'a été refait.

### 9.1 Ce qui change, par identifiant

| Identifiant | État | Ce qui est fait |
|---|---|---|
| T4R-01 | corrigé | Migration `20261125105000_archive_compte_apres_client_stripe.sql` : `purger_archives_comptes` ne supprime plus une archive dont le client Stripe n'est pas dans `clients_stripe_supprimes`. Vérifié : à dix ans et un jour, la facture part, l'archive reste, le client est proposé ; trace posée, l'archive part à la purge suivante ; une archive sans client part comme avant ; avec l'ancien texte, le client est perdu (contre-épreuve dans le test). |
| T4R-02 | corrigé | Réglage SÉPARÉ : colonne `vente_particuliers_sans_mediateur_le` (migration `20261125106000_type_vendeur_et_vente_sans_mediateur.sql`), vide par défaut, datée par la base. « Lever le blocage » retrouve son sens d'avant le lot (hausses seulement). Case « j'ai lu les deux articles » obligatoire. Journal : ligne du blocage sans « médiateur absent » ; ligne de la décision avec l'état réel du médiateur. Répond aussi à la question 2 du §7 (deux réglages). |
| T4R-03, T4R-04 | corrigé | Choix explicite « Type de vendeur » (liste : entrepreneur individuel / société ou autre personne morale), stocké comme 26e clé de l'identité (même migration ; la base n'admet que les deux valeurs). La forme juridique n'est plus lue par aucun contrôle. Sans choix : vendeur incomplet, ventes fermées. Mention « EI » : « DUPONT Jean - EI », « Jean SANS EI », « Marie PAS EI », « E.I », « E. I. », « Y EI » acceptés ; limite inchangée et dite (« SOCIETE EI » passe : le code ne sait pas ce qu'est un nom). |
| T4R-05 | corrigé | /admin/sante, le statut de /admin/parametres et le message d'enregistrement de l'identité lisent `defautsVendeur`, comme la garde. |
| T4R-06 | corrigé | Article 15.3 : « à l'échéance prévue ci-dessus » ; phrase de réexamen RETIRÉE (voir 9.4, question A). |
| T4R-07 | corrigé | Article 17 : promesse bornée à « la réponse par laquelle l'Éditeur clôt une réclamation faite depuis la page « Aide et retours » » (ce que fait `deciderRetour`). « Non-professionnel » non rétabli (9.4, question B). |
| T4R-08 | corrigé | « Un médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première souscription. » |
| T4R-09 | à rejouer sur le banc | Les deux pages `tests/fixtures/conditions-next-start*.html` sont de nouveau adaptées par script (`…/scratchpad/t4-fixture/adapter-fixtures-seconde-reprise.py` : articles 15.3 et 17, empreinte d'identité). Longueurs déclarées des quatre rangées de texte long vérifiées exactes (`…/scratchpad/t4-fixture/verifier-rangees.py`). Toujours pas un vrai relevé. |
| T4R-10 | corrigé / noté | La migration `20261125103000` (modifiée : elle n'a été jouée dans aucune production) écrit une ligne `conservation_regle_modifiee` quand la durée change, avec l'ancienne durée réelle, sans auteur. L'écran /admin/conservation s'appuie bien sur ce journal. Pied de facture « article 293 B » : un client Stripe existant ne le reçoit qu'à sa prochaine souscription ou hausse, pas à un simple renouvellement — noté, rien de fait. |

Nouvelle empreinte de garde des conditions clients, version 2026-11-24 :
`67391a33df830dffdb617ba08de99b734ce3e6ec0ac490d1d67f05f784d52fb9` (l'ancienne, `d8c690ed…`, est dans
`empreintes_precedentes` avec sa note ; ni l'une ni l'autre n'a été publiée ou archivée).

### 9.2 Preuves

- `npx tsc --noEmit` : 0. `npx eslint` sur tous les fichiers .ts/.tsx du commit : 0.
- 245 fichiers de test liés aux fichiers modifiés, sur `gerimmo_ci_sonde_tquatre` : 4 460 tests, 4 400 réussis, 56 sautés,
  4 en échec dans 4 fichiers — `contrats-durables-base`, `jour-de-paris-suite-migrations-rejeu`,
  `patrimoine-finance-retours-base`, `perimetre-pilote-base` : les mêmes qu'avant le lot (§3). Pour la chaîne « Ordre
  complet », vérifié que mes quatre retours passent en tête ; elle s'arrête plus loin, sur le maillon des e-mails.
- Contre-épreuve (code d'avant, tests d'après) : 169 tests en échec ; identifiants vus en échec : T4R-02 (39), T4R-03
  (96), T4R-04 (88), T4R-05 (8), T4R-06 (2), T4R-07 (1), T4R-10 (1). T4R-01 et T4R-08 : contre-épreuve dans les tests
  eux-mêmes (retour joué ; phrase exacte).
- Tests nouveaux : `archive-compte-apres-client-stripe-base` (11), `type-vendeur-vente-sans-mediateur-base` (9),
  `vendeur-textes-seconde-reprise-t4` (38). Réécrits, chacun avec son commentaire : `vendeur-mediateur-reprise-d7`
  (253 tests), `console-identite-mediateur`, `garde-souscription`, `abonnement-proprietaire`,
  `vendeur-entrepreneur-individuel-d7`, `pages-legales`, `pages-legales-rendu`, `conditions-v1-textes`,
  `factures-conservation-dix-ans-base`. Adaptés à la 26e clé : `supervision-complete`, `prestataires-declares`,
  `identite-prestataires-migration-rejeu`, `retours-oct18-registre` ; identités fictives complétées du type de vendeur
  dans cinq fichiers.
- Non fait : suite vitest complète (seuls les fichiers liés), construction, serveur, Playwright, rendu navigateur.

### 9.3 Gestes du jour de publication (remplace le §5)

1. **Base d'abord**, dans cet ordre, avant le code : `20261125103000`, `20261125104000`, `20261125105000`,
   `20261125106000`. Sans la dernière, l'enregistrement de l'identité est refusé (message « migration à appliquer »).
   Si `20261125103000` a déjà été appliquée quelque part dans sa première rédaction, la ligne du journal des durées n'y
   sera pas écrite (le rejeu ne change plus rien) : sans conséquence sur les durées.
2. Déployer le code.
3. /admin/parametres, « Contact et entreprise » : **choisir d'abord le « Type de vendeur »** (Entrepreneur individuel),
   puis saisir l'identité (nom `NOM Prénom EI`). Relire le nom, l'adresse et l'e-mail avant d'archiver.
4. /admin/sante → « Versions des conditions » → archiver la version du 24 novembre 2026 (empreinte ci-dessus). Si
   l'archivage est refusé, ne rien forcer.
5. Vérifier sur /admin/sante, « Informations légales » : « L'identité du vendeur est complète. »
6. Après « je valide la publication » : « Ouvrir les souscriptions » (case à cocher).
7. **Médiateur** : tant qu'il n'est pas saisi, aucun particulier ne peut souscrire. Deux issues :
   - saisir le médiateur (nom, adresse, site) dès la convention signée ;
   - ou, carte « Blocage des abonnements », rubrique « Vente aux particuliers sans médiateur de la consommation » :
     lire les deux articles, cocher la case, « Ouvrir la vente aux particuliers sans médiateur ». La décision est datée
     et inscrite à l'historique ; « Retirer cette décision » la défait.
   **« Lever le blocage » n'ouvre plus rien aux particuliers** : inutile d'y toucher (laisser « Règle active »).
8. Compte Stripe et compte bancaire : inchangés (§5, points 8 et 9).

### 9.4 Questions ajoutées pour le dirigeant et le juriste

- **A. Lecture seule automatique et RGPD, article 22** (remplace la question 3 du §7 et le point 5 du §8). La phrase « le
  Client peut demander qu'une personne réexamine sa situation » est retirée. Le texte du recueil n'impose cette garantie
  que pour une « décision fondée exclusivement sur un traitement automatisé […] produisant des effets juridiques » sur
  une personne ; il ne dit pas si la mise en lecture seule d'un compte impayé (ou en fin d'essai, article 8.2) en est
  une, ni ce qu'il en est quand le client est une société. Si le juriste répond oui : remettre la phrase (pour 15.3 ET
  8.2), décider qui répond et sous quel délai, puis nouvelle empreinte avant archivage.
- **B. « Non-professionnel » à l'article 17.** L'ancienne version ouvrait le médiateur au « Client consommateur ou
  non-professionnel » ; L. 612-1 ne vise que le consommateur. Faut-il le rétablir (engagement contractuel de plus), et
  le médiateur choisi acceptera-t-il une SCI ?
- **C. Réclamation reçue par courriel.** Le contrat ne promet plus le rappel du médiateur que pour une réclamation close
  dans l'application ; L. 616-1, alinéa 2, demande cette information quand une réclamation n'a pas abouti. Pour un
  courriel, c'est à la personne qui répond de l'écrire (ou d'enregistrer la réclamation dans « Aide et retours »).
- **D. Simulation du nettoyage.** L'écran compte encore, parmi les preuves arrivées à leur terme, une archive que la
  purge fait désormais attendre (client Stripe non supprimé). Écart d'affichage seulement ; à corriger si gênant.

### 9.5 À rejouer sur le banc (s'ajoute au §4)

1. Appliquer les quatre migrations aux bases du banc, puis la suite vitest complète.
2. **T4R-09** : relever de nouveau `tests/fixtures/conditions-next-start.html` et `…-degradee.html` sur le `next start`
   du banc, puis retirer l'avertissement de l'en-tête de `tests/conditions-flux.test.ts`.
3. Playwright : `e2e/blocage-souscription.spec.ts` (libellé du journal changé : « Blocage des abonnements (identité du
   vendeur incomplète : augmentations payantes) : levé. » ; la carte a désormais deux formulaires — vérifier que
   `getByRole("status")` de la région reste unique), `e2e/abonnement.spec.ts`, `e2e/conditions-flux.spec.ts`,
   `e2e/souscription-sans-alerte-sortie.spec.ts` (sans médiateur fictif, il faut maintenant la décision datée, plus la
   levée du blocage). Vérifier aussi `e2e/recette-production` si un jeu y pose une identité : il lui faut le type de vendeur.
4. À l'œil : /admin/parametres (liste « Type de vendeur » en tête, carte à deux formulaires, case à cocher, date de la
   décision), /admin/sante (« Informations légales » avec un nom sans « EI »), /admin/journaux (deux lignes),
   /admin/conservation (ligne « 6 ans → 10 ans » après application de `20261125103000` sur une base à 72 mois),
   /conditions (articles 15.3 et 17).
5. Fusion avec `palier1` : mêmes fichiers partagés qu'au §4.5 ; mes quatre retours sont en tête de la chaîne « Ordre complet ».
6. **Identité fictive du banc** : aucun jeu de données du dépôt ne pose l'identité ; celle du banc a été saisie à la
   main et n'a pas de type de vendeur. Tant qu'il n'est pas choisi dans /admin/parametres, le banc tient le vendeur pour
   incomplet : tout parcours qui ouvre les ventes ou atteint le paiement restera fermé.
