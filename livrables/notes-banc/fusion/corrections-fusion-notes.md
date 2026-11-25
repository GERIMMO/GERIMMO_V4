# Corrections des huit constats de la relecture de la fusion — compte rendu (25/11/2026)

Arbre : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/fusion`, branche locale
`claude/palier-1-fusion`, partie de 3aeeee94. Commit : **e71d2644** (un seul commit local, 38 fichiers). **Rien poussé.**
Aucune action en production, aucun e-mail, aucun appel à Stripe, Facebook ou un service d'envoi. Aucun test ni règle de
sécurité/RLS désactivé ou affaibli (les tests réécrits le sont parce qu'ils affirmaient le défaut ; chaque réécriture porte
un commentaire qui le dit). Aucune référence légale ajoutée : seul l'article 8-1 de la loi du 6 juillet 1989, déjà cité par
le code et le recueil (`recueil/r2-refs10-24.txt`, non recontrôlé sur Légifrance), est repris. Rien n'est écrit « conforme ».

Journaux « avant / après » : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/corrections-fusion/`
(`<ID>-avant.log` : le test écrit d'abord, lancé sur le code ou la base d'avant ; `<ID>-apres.log` : après la correction).

## 1. Les huit constats

| ID | Correction | Test qui échoue avant / passe après (vérifié) |
|---|---|---|
| A-01 | Migration additive **20261125153000_bail_epoux_pacses_personnes_a_la_signature** : colonne `bail_personnes.entree_apres_signature` posée par la base (déclencheur `bail_personnes_epoux_pacses`, vrai si la ligne est ajoutée à un bail sorti du brouillon ; le client ne la choisit pas) ; `enregistrer_depart_colocataire` relue (`pg_get_functiondef`, bloc de 152000 attendu une fois) : la fin vide ne vaut plus que pour une personne présente à la signature, le tiers et son garant gardent six mois / date du remplacement ; même déclencheur : troisième locataire refusé sur un brouillon coché ; déclencheur `baux_epoux_pacses_a_la_signature` : un bail coché ne sort du brouillon qu'avec exactement deux locataires. Droits de la fonction identiques (testé), fonctions de déclencheur fermées à tous, `fermer_fonctions_a_anon()`. Retour (garde la colonne ; s'arrête sur une fonction réécrite), ligne au LISEZ-MOI (avant le retour de 152000), ordre, manifeste, FICHIERS_EN_SERIE. Écrans : avertissement au-dessus de l'ajout d'un colocataire sur un bail signé coché, textes du départ selon la ligne (lecture tolérante de la marque dans `page.tsx`), note à la place de « Ajouter un colocataire » au brouillon coché à deux, message de réussite de l'action. | `tests/bail-epoux-pacses-tiers-base.test.ts` (sous `authenticated`, dépôt du bail papier par `activer_bail_papier`) : avant 7 échecs / 11, après 11/11 ; `tests/bail-epoux-pacses-tiers-ecrans.test.ts` : avant (sources d'avant remises) 6 échecs / 7, après 7/7. Tests de rang mis à jour (`textes-t2-reprises`, `type-vendeur-…-base`, `relais-migrations-manifeste`) et fixture de `bail-epoux-pacses-base` (les époux sont ajoutés au brouillon puis le bail est activé ; les retours se jouent dans l'ordre inverse) : 62/62. |
| C-01 | `catalogue-bail.ts`, branche `avenant_remplacement` : refus `REFUS_AVENANT_REMPLACEMENT_EPOUX_PACS` (lib/solidarite-colocation.ts) pour un bail coché ; le catalogue ne le propose plus (`catalogue-cibles.ts`, `.eq("locataires_epoux_pacses", false)`). | `documents-baux-phase3.test.ts` (C-01) + `dossiers-selon-etat-phase3.test.ts` (C19) : avant 2 échecs / 84, après 84/84. Empreintes des autres documents et avenants : `impayes-documents-phase3-lot53-reprise.test.ts` (empreinte `avenant_remplacement` 748025b2… pour un bail non coché, et celles des autres modèles) vert dans les 28 fichiers liés (718 réussis) et dans la suite complète. `catalogue-api.test.ts` (émulateur, vraie colonne) : vert. |
| R-01 | Migration **20261125150000 réécrite en place** : `accepter_cgu` garde le texte exact du 24/10 (reposé si la première écriture avait été jouée) ; `abonnements_sans_accord_conditions` ne compte plus qu'un accord dont l'empreinte est celle du texte archivé ; D4R-03 inchangé. Retour : rend le texte exact de 20261024100000 à la non-reconduction, repose celui du 24/10 d'`accepter_cgu`, retire le déclencheur. | `accord-conditions-archivee-base.test.ts` (réécrit, sous `authenticated`) : avant 7 échecs / 12, après 12/12 (dont : ligne forgée « 2099-01-01 » et version suivante « acceptée » avant son archivage ne valent pas accord, ne masquent pas l'accord réel, ne bloquent ni l'archivage ni rien ; la preuve de commande reste réservée au traitement). `premier-mot-de-passe-session-banc.test.ts` : avant 3 échecs / 6 (« L'acceptation des conditions n'a pas pu être enregistrée »), après 6/6. |
| A-02 | Retour de 20261125111000 : bloc de garde en tête — s'arrête avec « jouez d'abord le retour de 20261125151000 » si l'une des deux fonctions porte « reprise T3R-1 », rien n'est modifié. LISEZ-MOI mis à jour. | `textes-t3-reprise-base.test.ts` (A-02, mauvais ordre puis bon ordre) : avant 1 échec, après 22/22 avec `textes-t3-base` (dont un test qui jouait lui-même le mauvais ordre, corrigé et commenté). |
| C-02 | `mentions-legales/page.tsx` : ligne « Capital social » seulement pour `typeVendeur === "personne_morale"` ; type non choisi → encadré « Document en cours de finalisation ». `documentsIncomplets` n'est PAS modifié (il entre dans l'identité des conditions : l'empreinte des conditions ne bouge pas). | `pages-legales-rendu.test.ts` : avant 1 échec / 9, après 9/9 ; 7 fichiers liés 367 réussis. |
| C-03 | `conditions-versions.json`, résumé 2026-11-24 : « Article 17 : le recours gratuit à un médiateur de la consommation y est indiqué pour le seul Client consommateur ; le Client non-professionnel n'y est plus mentionné. » | `conditions-empreinte.test.ts` (C-03) : avant 1 échec / 23, après 23/23 — l'empreinte de garde calculée reste 67391a33… (test d'empreinte existant vert). |
| E-01 | `lireMotifIdentiteEditeur` : comparaison de l'archive pour toute première souscription (`premiereSouscription`) ; écran `abonnement-2026.tsx` : `!souscrit` sans condition sur le public. | `garde-souscription.test.ts` (3 cas agence + 1 témoin) et `abonnement-proprietaire.test.ts` (écran agence) : avant 4 échecs / 112, après 112/112 ; 21 fichiers liés 644 réussis. |
| E-02 | `reception-loyer.ts` : rien parti → erreur, rien consigné ; au moins un destinataire accepté → trace `relances` écrite, note « … · N envoi(s) à terminer (non parti(s)) », message qui nomme les adresses non servies ; le même palier n'est plus proposé (suivi) ni admis (preuve en base). | `relance-reception-loyer.test.ts` (E-02, échec définitif d'un colocataire, puis paiement partiel : une seule clé envoyée au locataire, une seule trace) : avant 1 échec / 26, après 26/26 ; le test qui affirmait « refus partiel : rien consigné » est réécrit et commenté ; 15 fichiers liés 236 réussis. |

## 2. Vérifications globales sur e71d2644 (vérifié : commande et sortie)

Variables du banc : `set -a; eval "$(grep '^export' banc-integ/banc.sh)"; set +a` (dossier de travail).

| Contrôle | Commande | Résultat (journal) |
|---|---|---|
| Types | `npx tsc --noEmit` | sortie 0, aucun message (`corrections-fusion/tsc.log`, vide) |
| Lint | `npx eslint` sur les 30 fichiers de code et de test touchés | sortie 0, aucun message (`corrections-fusion/eslint.log`, vide) |
| vitest COMPLET | `npx vitest run --maxWorkers=1` (dans `fusion/app`, base et émulateur du banc) | **Test Files 6 failed / 1087 passed / 4 skipped (1097) ; Tests 2 failed / 16 479 passed / 37 skipped (16 518) ; 1 erreur non gérée** (`corrections-fusion/vitest-complet.log`). Les six fichiers en échec sont tous dans la liste des échecs attendus : `lot2-auth-reel` (« Service fictif local exigé »), `lot3-notifications-base` (« Base Lot3 fictive obligatoire »), `ux-accueil-dirigeant-navigateur` et `ux-console-direction-navigateur` (navigateur absent de `/opt/pw-browsers`), `api-isolation` (1 test : super admin), `lecteur-document-navigateur` (1 test PDF.js ; l'erreur non gérée est la sienne : `public/pdfjs/6.4.299/pdf.worker.min.mjs` absent de l'arbre, fichier produit à la compilation). Aucun autre échec. |
| Parcours navigateur | `banc-integ/precheck.sh CORR e71d2644 e2e/abonnement e2e/bail-epoux-pacses e2e/blocage-souscription e2e/compte-securite e2e/conditions-flux e2e/envois-automatiques e2e/invitations-cycle e2e/souscription-sans-alerte-sortie e2e/textes-t3` | PREPARE/API/SEED/BUILD/E2E = 0 ; **22 réussis, 2 ignorés** (`souscription-sans-alerte-sortie` × 2 : paiement non configuré au banc, ignorés par la spec elle-même), 1,7 min (`corrections-fusion/CORR-e2e.log`, `CORR.status`). `compte-securite` crée un compte par `/inscription` puis choisit le mot de passe en cochant « accepte les conditions » (`e2e/confirmation-locale.ts:23`) : c'est le parcours d'inscription. |

Specs demandées : `bail-epoux-pacses`, `blocage-souscription`, `abonnement`, `envois-automatiques`, `textes-t3`, inscription / premier mot de passe (`compte-securite`, `invitations-cycle`) : toutes passées. `lot2-pilote` et
`premiere-location-continue` (inscription avec fournisseur d'e-mails fictif) sont exclues par `testIgnore` de
`e2e/playwright.config.ts:15-17` (« passe dédiée ») : **non lancées**.

## 3. R-01 — positions de la migration 20261125150000 (inscription, souscription, accord exprès)

La migration a été **réécrite en place** (jamais appliquée en production) : `accepter_cgu` garde le texte du 24/10 (aucun
refus), seule la non-reconduction exige l'empreinte. Le plan (`PLAN-PUBLICATION-NOTES.md`) revient à « toutes les
migrations avant le code » ; sa section « Preuves » reprend le tableau ci-dessous.

Sonde SQL `corrections-fusion/sonde-positions.sql` (sous `authenticated`, tout annulé) : (1) accord à 2026-11-24 non
archivée, comme l'inscription et le premier mot de passe du nouveau code ; (1 bis) accord à 2026-11-15, comme la case de
la souscription et le premier mot de passe du code en ligne 81740dec ; (2) ligne forgée « 2099-01-01 » ; (2 bis) un
compte B qui n'accepte qu'avant l'archivage ; (3) archivage de 2026-11-24 par la clé de service ; (4) accord exprès /
case de la souscription après l'archivage ; (5) preuve lue comme `preuveConditionsEnVigueur` ; (6) non-reconduction de
2026-11-24 pour un abonné A (accord après archivage) et B (avant seulement).

| État | Comment | Sonde | Tests et parcours |
|---|---|---|---|
| **Migrations avant le code (ordre retenu)** : base neuve, toutes les migrations dont 150000, puis le code | `precheck.sh CORR e71d2644 …` | — | 22 parcours réussis, 2 ignorés (paiement non configuré), dont `compte-securite` (inscription + premier mot de passe + case des conditions), `abonnement`, `blocage-souscription`, `conditions-flux` (`CORR-e2e.log`) |
| Code en ligne (81740dec) sur la base migrée | lecture + sonde (1 bis) | `accepter_cgu('2026-11-15','compte')` : accepté, aucun refus (`R01-sonde-avec.log`) ; texte d'`accepter_cgu` identique avant et après (md5 05c1f882…) ; sa preuve (`version = CONDITIONS_VERSION`, sans empreinte, `81740dec:app/src/lib/garde-souscription-serveur.ts:57-69`) lit une table inchangée ; la non-reconduction n'est pas appelée (2026-11-15 « nouvelles souscriptions uniquement ») | code en ligne non exécuté |
| **Code avant 150000** : banc neuf (`precheck.sh R01SANS`), puis retour de 150000 joué sur les deux bases (psql sortie 0) | `R01-sonde-sans.log` | (1)(1 bis)(2)(2 bis)(4) acceptés ; preuve = 1 ligne à empreinte ; non-reconduction : **aucun** abonné listé (B compté à tort : c'est le défaut R-01) ; déclencheur D4R-03 absent | `premier-mot-de-passe-session-banc` 6/6 ; parcours `compte-securite`, `abonnement`, `blocage-souscription`, `conditions-flux`, `invitations-cycle` : **17 réussis, 2 ignorés** (`R01-sans-e2e.log`, `--retries=0`) |
| Puis 150000 appliquée, code déjà en place | `R01-sonde-reappliquee.log` (psql sortie 0 sur les deux bases) | mêmes acceptations, même preuve ; non-reconduction : **B seul** listé ; déclencheur présent | `premier-mot-de-passe-session-banc` + `accord-conditions-archivee-base` 18/18 ; mêmes parcours **17 réussis, 2 ignorés** (`R01-reappliquee-e2e.log`) |
| Base de l'émulateur après la suite vitest complète, migration appliquée | `R01-sonde-avec.log` | identique à la ligne précédente | — |

Sans la migration, `accord-conditions-archivee-base` échoue sur les 4 tests qui portent sur son effet (non-reconduction
à empreinte, droits du déclencheur, D4R-03, rejeu) : attendu, il décrit la migration (`R01-sans-vitest.log`).
Inscription, souscription et accord exprès passent donc dans les deux ordres ; seule la non-reconduction change, dans
le sens voulu.

Lu dans le code (pas exécuté) : les deux codes appellent la non-reconduction avec `CONDITIONS_VERSION`
(`app/src/lib/non-reconduction-conditions.ts:84-89`) et ne l'exécutent que pour une version qui exige l'accord exprès
(`app/src/lib/nouvelle-version-conditions.ts:43-44`) ; 2026-11-15 porte `nouvelles_souscriptions_uniquement`, 2026-11-24
`accord_au_prochain_acte` (`app/src/lib/conditions-versions.json`) : aucun des deux ne l'appelle aujourd'hui.

## 4. Décisions prises et risques qui restent (à lire)

- **A-01, après la signature on avertit, on ne refuse pas.** Le remplacement de l'un des époux par un tiers est un cas
  réel (C-01 le renvoie au juriste) : la base l'accepte, marque la ligne, et la règle de la colocation s'applique au tiers
  et à son garant. Au brouillon, la case cochée interdit le troisième locataire (base et écran) ; la sortie du brouillon
  exige exactement deux locataires. La case elle-même reste refusée à l'écran pour un nombre de locataires autre que deux
  (`refusCaseEpouxPacsNombre`, déjà là avant).
- **A-01, lignes existantes.** La colonne vaut « faux » (présent à la signature) pour toute ligne antérieure à la migration.
  Sans objet en production si aucun bail n'y est coché (supposé : la colonne de la case vient de 20261125152000, du même
  lot non publié ; la production n'a pas été lue).
- **R-01, ce qui lit encore les lignes sans empreinte.** `comptes_inactifs_a_prevenir` et l'écran « les conditions
  évoluent » (`derniereVersionAcceptee`) regardent la dernière version acceptée sans exiger l'empreinte : une ligne
  forgée n'y trompe que le compte qui la forge (il ne lit que ses lignes) ; non modifié. `lier_preuve_commande` inchangée
  (clé de service seulement, sur l'identifiant choisi par le serveur après une preuve à empreinte ; test de droits).
- **R-01, accord donné avant l'archivage.** Pour la non-reconduction (versions « accord exprès », aucune aujourd'hui :
  2026-11-15 « nouvelles souscriptions uniquement », 2026-11-24 « au prochain acte »), un accord enregistré avant
  l'archivage de la version (sans empreinte) ne compte plus : il faudra le redemander après l'archivage.
- **E-02.** Une fois la trace écrite, le palier n'est plus proposé ni admis pour ce bail : la personne non servie n'est
  plus relancée depuis Gerimmo à ce palier (le message le dit et l'invite à la prévenir autrement).
- **C-02.** `documentsIncomplets` n'est pas modifié (il entre dans l'identité archivée des conditions) : seule la page des
  mentions légales lit le type de vendeur.

## 5. Questions au dirigeant

1. A-01 : pour un bail coché déjà signé, l'ajout d'un colocataire est accepté avec un avertissement (le tiers suit la
   règle de la colocation). Préférez-vous le refuser tant que le juriste n'a pas répondu sur le remplacement (C-01) ?
2. E-02 : une relance à la main partie pour l'un des colocataires seulement est consignée et ne repart plus à ce palier.
   Faut-il un geste « terminer l'envoi » réservé à la personne non servie (aujourd'hui : la prévenir hors de Gerimmo) ?
3. R-01 : pour une future version qui exigera l'accord exprès des abonnés, l'accord ne vaudra qu'une fois la version
   archivée (accord donné avant : à redemander). D'accord ?
4. R-01 : faut-il aussi faire exiger l'empreinte par le rappel des comptes inactifs et l'écran « les conditions
   évoluent » (aujourd'hui, une ligne sans empreinte y compte, sans effet hors du compte qui l'a écrite) ?
5. C-01 : en attendant le juriste, l'avenant de remplacement n'est plus proposé pour un bail coché. Quelle conduite
   indiquer au gérant qui doit remplacer l'un des époux (le message renvoie à un conseil, sans solution) ?

## 6. Points pour le juriste

1. **Tiers entré au bail d'époux ou de partenaires après la signature** (A-01) : l'application lui applique, à lui et à
   son garant, la fin de solidarité de la colocation (six mois après le congé, ou date du remplaçant — article 8-1 de la
   loi du 6 juillet 1989 tel que cité par le recueil, `r2-refs10-24.txt`, non recontrôlé sur Légifrance), et garde
   l'absence de fin pour les deux époux ou partenaires présents à la signature. Est-ce juste ?
2. **Remplacement de l'un des époux ou partenaires** (C-01) : quelle forme (avenant, nouveau bail, autre) ? L'avenant de
   remplacement de la colocation est refusé pour un bail coché tant que la question n'est pas tranchée (message :
   `REFUS_AVENANT_REMPLACEMENT_EPOUX_PACS`, `app/src/lib/solidarite-colocation.ts:68`).
3. **Article 17, Client non-professionnel** (C-03) : le résumé de la version 2026-11-24 dit maintenant que le
   non-professionnel n'y est plus mentionné ; la question de fond (doit-il l'être ?) est déjà posée (`QUESTIONS.md`, Q81 ; `JURISTE.md`, partie 9, point 27 (b)),
   rien de neuf à trancher ici.

## 7. Non vérifié (supposé ou hors de portée)

- Production : ni lue ni touchée (aucun bail coché, aucune version archivée, aucun abonné actif : supposé).
- Textes officiels : seuls ceux du recueil fourni, non recontrôlés sur Légifrance ; aucune référence ajoutée.
- API : émulateur local (`e2e/local/serveur-supabase-local.mjs`), pas PostgREST réel.
- Code en ligne (81740dec) non exécuté contre la nouvelle base : couvert par lecture et par la sonde SQL qui rejoue ses
  appels (§ 3).
- `lot2-pilote` et `premiere-location-continue` non lancés (exclus par la configuration) ; paiement réel (Stripe)
  jamais exercé (souscription ignorée deux fois au banc).
- CI GitHub non lancée (aucun push) : « CI verte » prouvée au banc fidèle à la CI seulement.
- Écrans A-01 et E-02 non regardés à la main à 390 / 1440 px (seul le parcours `bail-epoux-pacses` vérifie l'avertissement).
- `JURISTE.md` et `QUESTIONS.md` (dépôt principal, `/home/user/GERIMMO_V4`) non modifiés : les points sont ici.

## 8. État laissé

- Commit local **e71d2644** sur `claude/palier-1-fusion` (attribution Co-Authored-By et Claude-Session présentes) ; aucun
  push ; `app/output/` non suivi, jamais commité ; dépôt principal `/home/user/GERIMMO_V4` sans modification.
- Banc : bases `gerimmo_ci_sql` et `gerimmo_ci_sql_api` avec toutes les migrations, `20261125150000` réappliquée après
  la preuve des positions ; arbre `integ` détaché sur e71d2644 (precheck).
- Serveurs : émulateur et `next start` arrêtés ; `pgrep` ne trouve plus ni `serveur-supabase-local`, ni `next`, ni
  `vitest` ; ports 54321, 3100, 3200 et 3000 libres.
- Plan de publication mis à jour : `PLAN-PUBLICATION-NOTES.md` (exception D4 levée, A-01, nouvel ordre, preuves) ;
  l'ancienne version est gardée dans `corrections-fusion/PLAN-PUBLICATION-NOTES.avant.md`.


## 9. Reprise (relecture adverse des corrections 3aeeee94..e71d2644, 25/11/2026)

Arbre : `fusion`, branche locale `claude/palier-1-fusion`, partie de e71d2644. Commit : **89cb87ff** (14 fichiers),
**rien poussé**. Aucune action en production, aucun e-mail, aucun appel à un service externe. Aucun test ni règle de
sécurité/RLS désactivé ou affaibli. Aucune référence légale ajoutée. Rien n'est écrit « conforme ».
Journaux (avant/après, sondes) : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/reprise-fusion/out/`.
Copies d'avant : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/reprise-fusion/avant/`.

### 9.1 Les quatre défauts : tous réels

| ID | Vérifié comment | Correction | Test (échoue avant, passe après) |
|---|---|---|---|
| X-01 | Script du relecteur rejoué sur la base de test, transaction annulée (`out/X01-rejeu-avant.out`) : « EPOUX C · t · 2026-03-31 · 2026-09-30 », « GARANT DE C · t · · 2026-09-30 ». Cause lue : `20261125153000` l. 52-56 (marque posée à l'INSERT seulement), `devalider_bail` ne touche pas `bail_personnes`. | Migration additive **`20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature`**. Déclencheur `baux_epoux_pacses_marques_a_la_signature` (avant la mise à jour de l'état, `when old.etat='brouillon' and new.etat<>'brouillon'`, l. 70-74). Il remet la marque à faux pour chaque ligne encore au bail (`date_depart is null`, l. 61). Il passe après le contrôle des deux locataires : une activation refusée ne touche à rien. Déclencheur `bail_personnes_epoux_pacses_brouillon` (l. 47), après celui de 153000 : au brouillon, une ligne modifiée par la base porte « faux ». C'est la seule ouverture, pas de `pg_trigger_depth`. Le client n'a toujours aucun droit d'UPDATE. La migration n'écrit aucune ligne. Les deux fonctions sont fermées à tous. La fonction du départ n'est pas touchée. Retour en une seule instruction DO, à jouer avant celui de 153000. LISEZ-MOI, ordre, manifeste et FICHIERS_EN_SERIE à jour. Deux tests de rang complétés (`textes-t2-reprises`, `type-vendeur-…-base`), avec un commentaire. | `tests/bail-epoux-pacses-nouvelle-signature-base.test.ts`, sous `authenticated` : « activé, ajout de C et de son garant, Corriger, retrait de B, nouveau dépôt, départ » → fin vide pour C et son garant. Un tiers ajouté après la nouvelle signature garde les six mois. Une activation refusée ne bouge rien. Une personne déjà partie garde sa ligne. Droits et ordre des déclencheurs testés. Rejeu, retour (le défaut revient), marche avant. Avant : 7 échecs sur 9 (`out/X01-avant.log` ; les 2 qui passent sont des contrôles). Après : 9/9 (`out/X01-apres.log`). Rejeu du relecteur après : fin vide pour les deux (`out/X01-rejeu-apres.out`). |
| X-02 | Rejoué comme `psql -f` sans ON_ERROR_STOP (ON_ERROR_ROLLBACK dans une transaction annulée, `out/X02-rejeu-avant.out`) : erreur « Rien n'est modifié », puis `DO`. Le terme passe de t/f à f/t. | Retour de `20261125111000` : une seule instruction DO, avec la garde en tête du bloc (l. 27). **Même défaut dans le retour de `20261125151000`**, trouvé en relisant la chaîne : ses quatre `drop function` suivaient le bloc DO et partaient même quand le bloc s'arrêtait. Ils sont maintenant dans le bloc (l. 52-55). LISEZ-MOI mis à jour pour les deux. | `tests/textes-t3-reprise-base.test.ts` : chaque retour de la chaîne T3 fait une seule instruction (découpage dollar et guillemets, l. 51). Le retour du lot T3 est joué instruction par instruction, en premier : rien ne bouge. Le retour de la reprise est joué de même sur une définition inattendue : les secondes signatures restent. Avant : 3 échecs (`out/X02-avant.log`). Après : 16/16, et 25/25 avec `textes-t3-base` (`out/X02-apres.log`). Rejeu après : rien ne bouge (`out/X02-rejeu-apres.out`). psql sans ON_ERROR_STOP sort toujours avec le code 0 : c'est psql, pas le fichier. |
| Y-01 | Code lu : `reception-loyer.ts:156` (e71d2644) mettait toute erreur dans `nonServis`. Marques lues : `email.ts:166-176`, `courriels-durables.ts:17-25`. `prendre_courriel` lu en base : « inconnu » ne repart pas avec la même clé, « en_attente » repart après le délai. Les trois scénarios du relecteur sont rejoués par les tests ci-contre. | `reception-loyer.ts` l. 159 : `incertain` est rangé « non confirmé » (peut-être parti). L. 166 : on ne sort sans trace que si rien n'est parti ET rien n'est incertain. Sinon la trace est écrite (l. 176), avec la note « aucun envoi confirmé » ou « N destinataire(s) », puis « N envoi(s) non confirmé(s) (peut-être parti(s)) » et « N envoi(s) à terminer (non parti(s)) ». Le message ne dit jamais « n'est pas partie » d'un envoi incertain. Il ne reprend plus le texte du service (l. 182) : ce texte disait « réessayez », y compris pour le refus définitif, alors que le palier ne repart plus. Option retenue : la plus prudente des deux proposées. La reprise réservée aux non-servis demanderait de changer la preuve en base (`empreinte_maillon_relances_d4` refuse un palier consigné) : c'est la question 2 au dirigeant, déjà posée. | `tests/relance-reception-loyer.test.ts` l. 200-256, six tests. Cas « incertain, locataire seul, puis paiement partiel » : une seule clé, une seule trace. « Colocataire incertain » : la note ne dit pas « non parti ». « Colocataire en 429 » et « refus définitif » : plus de « réessayez ». Cas mixte. Refus momentané seul : rien de consigné (contrôle). Avant : 5 échecs sur 32 (`out/Y01-avant.log`). Après : 32/32 (`out/Y01-apres.log`). Le test qui attendait « : Refus temporaire. » est mis à jour, avec un commentaire qui dit pourquoi. |
| Y-02 | Sonde sur la base de test, transaction annulée (`out/Y02-sonde.out`, script `reprise-fusion/scripts/y02-sonde.sql`). `accepter_cgu('2099-01-01')` sous `authenticated` : ligne écrite sans empreinte, visible dans `acceptations_sans_version_archivee()` (« conditions_clients · 2099-01-01 · 1 »). La suppression est refusée, sous postgres comme sous service_role (« Une acceptation des conditions ne se modifie ni ne se supprime »). Les deux contrôles de remplacement rendent `t`. | `PLAN-PUBLICATION-NOTES.md`, contrôle 8 : lectures seules. Il garde la supervision, ajoute le md5 du texte d'`accepter_cgu` = `05c1f8827ce05a4599803634a822a575` (relevé sur les deux bases du banc) et la présence de `c.empreinte_sha256 = v.empreinte_sha256` dans `abonnements_sans_accord_conditions`. Il interdit d'appeler `accepter_cgu` en production pour ce contrôle. Le plan porte aussi 154000 (rang, retour avant 153000, effet sur l'ancien code) et `psql -v ON_ERROR_STOP=1` pour les retours. Ancienne version : `reprise-fusion/PLAN-PUBLICATION-NOTES.avant-reprise.md`. | Pas de test de code : le plan n'est pas dans le dépôt. Les deux requêtes de lecture ont été jouées au banc (`out/Y02-sonde.out`). |

### 9.2 Vérifications (commande et sortie)
- Variables du banc : `set -a; eval "$(grep '^export' banc-integ/banc.sh)"; set +a`. La migration 154000 a été appliquée aux deux bases avec `psql -v ON_ERROR_STOP=1` (sortie 0, `out/X01-application-*.log`), puis inscrite au registre local. Le precheck a ensuite reconstruit les deux bases à neuf : 576 migrations, la dernière est 154000.
- `npx tsc --noEmit` : sortie 0, aucun message (`out/tsc.log` vide). `npx eslint` sur les 8 fichiers TS modifiés : sortie 0, aucun message (`out/eslint.log` vide).
- Tests liés : 118 fichiers, ceux qui citent les fichiers et objets modifiés (`reprise-fusion/tests-lies.txt`), avec l'émulateur relancé par `banc.sh api`. **Test Files 118 passed (118) ; Tests 2068 passed (2068)** (`out/vitest-lies.log`). La suite vitest complète n'a pas été relancée.
- `banc-integ/precheck.sh REPRISE 89cb87ff e2e/bail-epoux-pacses e2e/reception-loyer-proprietaire e2e/envois-automatiques e2e/textes-t3 e2e/depot-bail-signe-papier` : PREPARE, API, SEED, BUILD et E2E sortent à 0. **9 passed** (setup + 8 parcours), 59 s (`out/REPRISE.status`, `out/REPRISE-e2e.log`). Aucun parcours navigateur n'exerce « Corriger » puis un nouveau dépôt, ni un envoi incertain : ces cas ne sont couverts qu'en vitest.

### 9.3 Questions au dirigeant (nouvelles)
6. Y-01 : un envoi « non confirmé » (délai dépassé, coupure) est consigné. Le palier ne repart plus, pour ne pas envoyer deux fois. Si l'e-mail n'est en fait jamais arrivé, le palier suivant sera proposé à son délai sur la foi d'une relance que le locataire n'a peut-être pas reçue. La note « envoi non confirmé » le dit. Faut-il plutôt bloquer le palier suivant tant que l'envoi n'est pas confirmé ?
7. Y-01 : après un refus momentané (429) d'un colocataire, le palier est fermé pour lui aussi. Avant E-02, il était repris au clic suivant. La question 2 (geste « terminer l'envoi ») vaut aussi pour ce cas.

### 9.4 Juriste
Rien de nouveau. X-01 applique la règle déjà posée (point 1 du § 6) au cas « Corriger » : les personnes présentes au bail signé de nouveau sont celles « au moment de la conclusion » de ce bail. **Faut-il traiter le bail signé de nouveau après « Corriger » comme la conclusion initiale du contrat (article 8-1, I, tel que cité par le recueil, `r2-refs10-24.txt`, non recontrôlé) ?**

### 9.5 Non vérifié
- Production : ni lue ni touchée. Supposé : aucun bail coché, puisque 152000 et 153000 n'y sont pas appliquées. Le md5 d'`accepter_cgu` en production n'a pas été lu ; supposé égal parce que le texte est celui du 24/10 avant comme après 150000.
- Les autres retours à plusieurs instructions, du 12/11 au 25/11 (une trentaine relevés par `reprise-fusion/scripts/instructions.mjs`), n'ont pas été examinés un par un. Seuls ceux de la chaîne T3 ont été corrigés. L'en-tête du LISEZ-MOI (« une seule instruction DO atomique ») vise les 71 retours historiques.
- Suite vitest complète et CI GitHub non relancées (aucun push). Écrans non regardés à la main.
- API : émulateur local, pas PostgREST réel.

### 9.6 État laissé
Commit local 89cb87ff, sans push. `app/output/` n'est pas commité. Arbre `integ` détaché sur 89cb87ff (precheck). Bases du banc reconstruites à neuf. L'émulateur est arrêté, et aucun `next`, `vitest` ni `playwright` ne tourne. Les ports 54321, 3100, 3200 et 3000 ne répondent pas. Un Chrome headless (puppeteer, PID 9043, lancé le 24/11 à 23:07, avant cette reprise) tourne encore : il n'est pas de cette session et je n'y ai pas touché. Dépôt principal `/home/user/GERIMMO_V4` non modifié.
