# Lot D4 — décisions du 24/11 : Q15 (accord exprès), Q24 (relance à la main), Q37 (cinquième envoi), Q6/Q16 (gestes)

Arbre : `palier1-t` (HEAD détaché, parent `a1093368`), commit local, rien de poussé. Base : `gerimmo_ci_sonde_tquatre`
(et `…_api`), migration du lot appliquée aux deux. Aucun serveur, aucun port, aucun e-mail réel (`fetch` simulé).
Environnement des tests : `…/scratchpad/decisions/d4-env.sh`.

## 1. Fait

### Q37 — cinquième envoi automatique (relance d'une demande de report de rendez-vous)
- Migration `20261125110000_relance_report_rdv_et_relance_a_la_main.sql` (+ retour, manifeste, LISEZ-MOI, registres) :
  colonne `envois_automatiques_reglage.relance_report_rdv`, **fausse par défaut** ; les quatre fonctions du réglage
  connaissent cinq envois (mêmes droits) ; nouveau maillon de tête de la chaîne des e-mails (`…_avant_relances_d4`).
- Preuve refaite par la base avant l'envoi : interrupteur ouvert, aucun arrêt (général ou « rappels »), demande de cet
  espace toujours en attente et non échue, relance réservée et sans sort, mission planifiée, adresse de l'artisan.
- Code : `lib/envois-suspendus.ts` (cinquième flux, libellé), `lib/relances-reports-rdv.ts` (lit l'interrupteur une fois
  par passe ; fermé = aucun contexte, comme avant), liste fermée, console (le panneau affiche cinq interrupteurs).

### Q24 — accord des espaces conservé ; relance à la main ouverte
- La relance de loyer envoyée d'un clic par le propriétaire (`actions/reception-loyer.ts`) porte un contexte
  `relance_loyer_manuelle` quand l'interrupteur **« relance de loyer »** est ouvert. Elle n'exige pas l'accord permanent
  de l'espace. La base revérifie : propriétaire actif de cet espace, espace de propriétaire, plus ancien terme impayé,
  échu, mêmes montants (reste et total), pas de plan d'apurement, pas de relance du même niveau déjà consignée, adresse
  du locataire ou d'un colocataire engagé (jamais la caution), aucun arrêt (général ou « relances »).
- L'écran propose l'envoi immédiat dès que cet interrupteur est ouvert (`components/rappels-loyers.tsx`) ; fermé : PDF seul.
- Accord des espaces : rien n'est changé — il reste exigé pour la relance et l'avis automatiques et survit à une
  fermeture puis réouverture (testé).

### Q15 — nouvelle version des conditions, accord exprès du client déjà abonné
- Existant constaté : case à la souscription, archivage des versions, empreinte recopiée par la base sur chaque
  acceptation (`acceptations_cgu` : date, version, empreinte, ajout seul), écran « Nos conditions générales évoluent »,
  non-reconduction faute d'accord. La version 2026-11-24 était « nouvelles souscriptions uniquement » : un abonné
  n'était ni informé ni sollicité.
- Changement minimal : la version 2026-11-24 est déclarée `accord_au_prochain_acte` (conditions-versions.json ; le
  texte et son empreinte de garde ne changent pas). L'abonné voit l'écran (rappel à chaque connexion, « Plus tard »
  gardé) ; l'accord se donne par une **case non cochée par défaut** dont le libellé porte le lien vers le texte ; le
  serveur refuse sans la case, et refuse si la version n'est pas archivée (pas d'empreinte à garder). Tant qu'il n'a
  pas répondu : **rien n'est coupé, jamais de non-reconduction** pour cette version. L'accord est redemandé au prochain
  acte : hausse de formule ou de capacité, changement de périodicité, reprise après résiliation. Résilier ne le demande
  jamais. Version non archivée : rien n'est demandé (les actes passent comme avant).
- Aucune migration pour Q15.

## 2. Vérifié
- `npx tsc --noEmit` : 0. `npx eslint` sur les fichiers .ts/.tsx modifiés ou ajoutés : 0.
- 291 fichiers de test liés aux fichiers modifiés, sur ma base (21 h 29, émulateur du banc rendu injoignable) :
  5 777 tests réussis, 51 sautés, 0 test en échec ; 7 fichiers ne démarrent pas, **les mêmes sur l'arbre non modifié**
  (`git stash`) : ils exigent une base nommée du banc ou son émulateur (`lot2-acces-notifications-base`,
  `lot3-notifications-base`, `fiabilite-priorites-base`, `finalisation-courriels-base`, `perimetre-pilote-base`,
  `reprise-courriels-base`, `rapports-mensuels-api`). Journal : `…/scratchpad/decisions/d4-vitest-lies.log`.
- Trois fichiers « historique » lancés ensuite sur ma base : 3 échecs déjà décrits par le lot T4 (chaîne « Ordre
  complet » arrêtée au retour de `20261122200000` par le maillon `decision_artisan`, absent de cette chaîne ;
  `patrimoine-finance-retours-base`, 2 tests). Mon retour, premier de la chaîne, passe.
- Contre-épreuve (code et base d'avant, tests d'après) : 49 tests en échec sur 218, couvrant les trois décisions
  (`…/scratchpad/decisions/d4-contre-epreuve.log`) ; le test d'écran rendu discriminant ensuite (échoue avant, passe après).
- Migration : jouée deux fois, retour joué deux fois, reposée — sur les deux bases. Le retour rend mot pour mot le texte
  du 22/11 des quatre fonctions et garde l'état des quatre premiers interrupteurs (testé).
- Isolation et droits (testés) : aucune table nouvelle ; table du réglage toujours sans droit ni politique ; fonctions
  `SECURITY DEFINER`, `search_path` vide ; rien pour `anon` ; aucune fonction de plus ouverte aux comptes ; preuve
  refusée depuis un autre espace, sans espace, ou par le propriétaire d'un autre espace.
- Tests nouveaux : `relances-d4-base` (19, avec base), `relances-d4-ecrans`, `relances-d4-ecran-serveur`,
  `accord-expres-prochain-acte-d4` (25). Complétés : `relances-reports-rdv`, `relance-reception-loyer`.
  Réécrits avec leur commentaire (ils affirmaient l'ancienne règle) : `envois-suspendus`, `envois-suspendus-espaces`,
  `envois-suspendus-base` (quatre → cinq ; voir 3), `decision-artisan-base` et `type-vendeur-vente-sans-mediateur-base`
  (« dernier du manifeste / de la chaîne »), `acceptation-conditions-actions` (case obligatoire),
  `garde-souscription` (la hausse redemande les conditions quand une nouvelle version archivée attend l'accord).

## 3. Supposé, limites, écarts à connaître
- **Rejouer la migration du 22/11 (`20261122200000`) après celle du lot** rend aux quatre fonctions du réglage leur
  texte à quatre envois : le cinquième se lit alors « fermé » (rien ne part) jusqu'au rejeu de `20261125110000`. Le
  test du 22/11 affirmait « rejouée, rien ne change » ; il tient maintenant les deux temps. C'est écrit au LISEZ-MOI des retours
  (section « Chaîne de preuve des e-mails »).
- Reprise automatique : avec un contexte, la relance à la main suit le circuit conservé (reprise possible pendant
  15 minutes si l'envoi a échoué, preuve refaite avant). Avant, elle portait « sans reprise ».
- Relance à la main et relance automatique partagent la même clé d'envoi : si la relance automatique du même niveau a
  déjà été tentée pour ce terme, la relance à la main est refusée avec un message générique.
- Un e-mail retenu avant l'ouverture part bien une fois l'interrupteur ouvert (testé), mais sans copie chiffrée
  conservée pour une reprise (comportement hérité des quatre premiers envois).
- L'accord est celui du compte qui clique ; l'écran n'apparaît qu'au responsable de l'espace (inchangé).
- Le portail du prestataire de paiement (« Gérer mon abonnement ») n'a pas été examiné : s'il permet un changement de
  contrat, l'accord n'y est pas demandé.
- Avant 21 h 28, mes lancements avaient encore l'adresse de l'émulateur du banc (port 54321) : seul
  `rapports-mensuels-api` l'a joint (il a échoué dès sa connexion). Bases toujours les miennes. Corrigé ensuite.
- Non fait : suite vitest complète, construction, serveur, Playwright, rendu dans un navigateur. Le wiki n'est pas mis à jour.

## 4. À rejouer sur le banc
1. Appliquer `20261125110000` aux bases du banc, puis la suite vitest complète (dont les 7 fichiers qui exigent le banc).
2. `e2e/envois-automatiques.spec.ts` (modifié : cinq envois, « sur 5 ») — non rejoué.
3. Un parcours navigateur de l'écran « Nos conditions générales évoluent » avec un abonné fictif : case, refus sans
   case, accord, puis hausse et changement de périodicité avec la case sous le bouton.
4. Un parcours de la relance à la main, interrupteur fermé puis ouvert (service d'envoi simulé).
5. La chaîne « Ordre complet » des retours (déjà en échec avant le lot, voir 2).

## 5. Gestes du jour de publication (Q6, Q16, Q37, Q24, Q15) — s'ajoutent au § 9.3 des notes T4
1. **Base d'abord** : `20261125110000` après les quatre migrations des lots T4/D7, avant le code. Code sans migration :
   tous les envois s'affichent « suspendus » et rien ne part (échec sûr, mais gênant).
2. Déployer le code.
3. **Q16** : variable `GERIMMO_MODE=commercial` en production, puis redéploiement ; vérifier sur /admin/parametres.
4. Archiver la version du 24 novembre 2026 (geste T4 n° 4). Effet nouveau : dès l'archivage, un abonné existant voit
   l'écran et l'accord lui est demandé à ses actes. Aucun abonné aujourd'hui.
5. **Q6 + Q37** : /admin/parametres → « Envois automatiques d'e-mails », superviseur permanent en double vérification :
   ouvrir les **cinq** envois un par un (case de confirmation à chaque fois). La console dit combien d'espaces ont déjà
   donné leur accord : leurs e-mails partent à la passe suivante.
6. **Q24** : rien de plus — ouvrir « Relance amiable d'un loyer impayé » ouvre aussi la relance à la main.
7. Contrôle : cinq lignes « envoi_automatique » au journal de la supervision ; un essai réel avec un compte de test et
   une vraie boîte (pas de préproduction : Q1 annulée). Retour immédiat : « Fermer cet envoi ».

## 6. Questions au dirigeant (option prudente déjà appliquée)
1. **Q15, sans réponse du client** : rappel + accord au prochain acte, jamais de non-reconduction pour la version du
   24/11. L'autre option existe déjà dans le code (non-reconduction un mois après l'archivage) : un mot à changer dans
   la déclaration de la version. Laquelle pour une future version qui toucherait le prix ou la durée ?
2. **Q15, actes retenus** : hausse, changement de périodicité, reprise après résiliation. Le renouvellement tacite ne
   demande rien (aucun geste du client). Est-ce bien le sens voulu ?
3. **Q15, e-mail d'annonce** : l'article 16 promet une notification par courriel un mois avant ; aucun e-mail n'est
   envoyé par le code. Sans objet aujourd'hui (aucun abonné) ; à écrire avant la prochaine version ?
4. **Q24** : la relance à la main suit l'interrupteur de la relance automatique. Faut-il un interrupteur à part, ou
   la laisser toujours ouverte ?
5. **Q24** : la relance à la main reste réservée aux espaces de propriétaires (comme l'écran existant). Les agences ?

## 7. Points JURISTE
1. Article 16, second alinéa : les changements autres que prix, durée, caractéristiques essentielles « s'appliquent à
   la date annoncée ». Gerimmo demande pourtant l'accord exprès. Quelle version régit un abonné qui n'a pas répondu ?
   L'écran ne l'affirme pas (« rien ne change : votre abonnement continue »).
2. Préavis d'un mois et notification par courriel (article 16) : non automatisés ; l'accord est demandé dès l'archivage.
3. Preuve de l'accord : case, date du serveur, version, empreinte du texte archivé, compte. Ni adresse IP, ni copie du
   texte envoyée au client sur support durable après son accord : est-ce suffisant ?
4. Annexe 1 (sous-traitance) : information par courriel un mois à l'avance — repris des notes T4, point 8.6, inchangé.
5. Relance à la main : aucun texte d'e-mail modifié, aucune référence légale ajoutée.

---

# REPRISE D4 (relecture D4R, 24/11) — arbre `palier1-t`, parent `cb731af9` (lot D5), commit local, rien de poussé

Base : `gerimmo_ci_sonde_tquatre` (et `…_api`), migration de la reprise appliquée aux deux. Aucun serveur, aucun port
(émulateur neutralisé : port 59999), aucun e-mail réel (`fetch` simulé). Environnement : `…/scratchpad/decisions/d4-env.sh`.
Option retenue pour chaque défaut : section « REPRISE D4 » de `recueil/PETITES-REPRISES.md`.

## R1. Fait
- **D4R-01 (base)** — migration `20261125150000_accord_conditions_version_archivee` (+ retour, LISEZ-MOI, manifeste,
  registre, test en série) : `accepter_cgu` refuse (22023, rien d'écrit) un accord **source « compte », document
  `conditions_clients`** dont la version n'est pas dans `versions_conditions`. Inchangés : conditions artisans, règles
  des invités, source « espace_proprietaire », inscription (déclencheur de auth.users). Mêmes droits (authenticated ;
  ni public ni anon), SECURITY DEFINER, `search_path` vide ; remplacement seulement si la définition est celle du 24/10.
- **D4R-01 (application)** — `preuveConditionsEnVigueur` ne compte qu'une ligne **à empreinte** (`empreinte_sha256` non
  nulle). Le repli « colonne `document` absente » (M3, code avant la migration du 24/10) est gardé tel quel.
- **D4R-02** — `archiverConditionsPubliees` refuse d'archiver une **nouvelle** version des conditions clients s'il existe
  au moins un abonné actif (souscription chez le prestataire non close : tout statut sauf `canceled`,
  `incomplete_expired` ; lecture en échec = refus). Message au super-administrateur : nombre d'abonnés, article 16
  (notification par courriel et dans l'espace avant la prise d'effet), Gerimmo n'envoie pas encore cette annonce,
  l'annoncer d'abord. Une version déjà archivée se revérifie toujours. Conditions artisans non concernées. Aucune
  fonction d'envoi ajoutée. Texte des conditions NON modifié (empreinte du 24/11 intacte).
  Écran d'accord : « rien ne change » retiré (alinéa 2 de l'article 16 : les autres changements s'appliquent à la date
  annoncée) → « votre abonnement continue et vos données restent accessibles ; l'article 16 des conditions générales
  précise ce qui s'applique à la date annoncée ». Même retrait dans le refus « version non archivée ».
- **D4R-03** — même migration : déclencheur `relance_loyer_manuelle_sans_reprise` sur `courriels_durables` : dès qu'un
  contexte `relance_loyer_manuelle` est posé, `reprise_autonome = false` et copie chiffrée effacée (lignes déjà en file
  comprises). La tâche des reprises ne la renvoie plus ; le propriétaire renvoie d'un clic (même clé, un seul e-mail),
  et seule l'action écrit la consigne `relances`. Correction en base car `repriseAutonome:false` côté code supprimait
  aussi l'attache du contexte (la preuve de la base aurait alors toujours refusé l'envoi).
- **D4R-04** — NON corrigé en base (note) : une garde dans `demander_periodicite_suivante` devrait connaître la
  déclaration des versions (`conditions-versions.json` : « nouvelles souscriptions uniquement », « au prochain acte »,
  date d'effet), que la base ignore ; elle refuserait des changements que l'application admet (ex. abonné du 24/10 qui
  n'a jamais eu à accepter les versions du 11/11 et du 15/11). Contournement toujours possible par appel direct :
  à décider (révoquer la fonction aux comptes et la faire appeler par la clé de service après la garde, ou l'accepter).
- **D4R-05** — à décider : la relance à la main n'a pas de plafond par espace (deux e-mails par terme impayé et par
  destinataire) ; question au dirigeant (plafond ?). **D4R-06** — rien à faire (LISEZ-MOI suffisant).
- **Test « Ordre complet » (jour-de-paris-suite-migrations-rejeu)** — cause : le retour de `20261122210000` (motifs
  envoyés à l'artisan, maillon de la chaîne des e-mails posé le 22/11 au-dessus de `20261122200000`) manquait à la chaîne
  du LISEZ-MOI ; le retour de `20261122200000` se refusait donc. Défaut présent avant D4 (même échec à `fde4cbb4`, même
  base). Corrigé à la source (ligne ajoutée entre `20261122220000` et `20261122200000`) ; nouveau test sans base : dès
  qu'un maillon est nommé, tous les plus récents le sont.

## R2. Vérifié
- `npx tsc --noEmit` : 0 ; `npx eslint` sur les 21 fichiers .ts touchés : 0.
- Tests « échoue avant / passe après » : `accord-conditions-archivee-base` (9, en base, rôle `authenticated` : refus
  '2099-01-01' et version en vigueur non archivée, archivée acceptée avec empreinte, artisans/invités/espace
  propriétaire inchangés, anon refusé, droits, preuve d'application sans empreinte = nulle, déclencheur, rejeu, retour au
  texte exact du 24/10, marche avant) — 6 échecs avant migration, 1 échec sans le correctif applicatif ;
  `relances-d4-base` (nouveau cas : envoi en échec puis passe de reprise → aucun second envoi ; renvoi à la main → un
  envoi) — échoue avant ; `conditions-versions-archivage` (4 cas de refus D4R-02) — échouent sans le correctif ;
  `jour-de-paris…` (cas « chaque maillon ») et `incident-bien-categorie-base` — échouent avec l'ancien LISEZ-MOI.
- Migration jouée deux fois, retour joué deux fois, reposée (transaction annulée + test). Droits relevés avant/après :
  identiques (`{postgres, authenticated, service_role}` sur `accepter_cgu`).
- 322 fichiers liés, sur ma base : 6 002 réussis, 29 sautés, 5 échecs dans 10 fichiers, tous d'environnement : 6 exigent
  une base nommée du banc (`lot2-…`, `lot3-…`, `fiabilite-priorites-base`, `finalisation-courriels-base`,
  `perimetre-pilote-base` — liste fermée `gerimmo_ci_priorites1|sql|vun` —, `reprise-courriels-base`), 3 l'émulateur
  (`liste-attente-agences-action-api`, `premier-mot-de-passe-session-banc`, `rapports-mensuels-api` : « fetch failed »
  sur le port neutralisé), et la chaîne « Ordre complet » (voir R3). Journal : `…/scratchpad/zz-scripts/lies2.log`.
  Tests réécrits avec commentaire (ils affirmaient l'ancien état) : phrase de l'écran (`accord-expres-prochain-acte-d4`),
  filtres lus (`garde-souscription-deploiement`), suite du manifeste (`type-vendeur-vente-sans-mediateur-base`), voisin
  de `20261122220000` dans la chaîne (`incident-bien-categorie-base`) ; faux clients complétés d'un `.not` (7 fichiers)
  et `tests/fixtures/supabase-sur-pg.ts` (`.not(col, "is", null)`, `.limit`).
- `contrats-durables-base` : passe. `patrimoine-finance-retours-base` (2 échecs) : **environnement** — le fichier vise la
  base historique « avant lots » (`GERIMMO_HISTORIQUE_DB`, migrations < 20261109) ; sur la base complète, la table
  `factures_automatiques` est tenue par une clé de `factures_automatiques_evenements` (20261109202743, hors de sa liste).
  Mêmes 2 échecs, même message, à `fde4cbb4` sur la même base. `perimetre-pilote-base` : **environnement** (nom de base
  imposé), idem à `fde4cbb4`.

## R3. Supposé, limites
- Chaîne « Ordre complet » : sur ma base COMPLÈTE, une fois le maillon ajouté, le test s'arrête plus loin, au retour de
  `20261117095320`, qui se refuse par conception (« corriger en avant ») — comme 13 autres retours de la chaîne (14 refus
  relevés par un rejeu à blanc), dont `cron.unschedule` absent. Ce test est fait pour la base historique (banc :
  `GERIMMO_HISTORIQUE_DB`, migrations < 20261109), où ces migrations ne sont pas appliquées et où la chaîne des e-mails
  n'existe pas : non rejoué là (base du banc interdite). Supposé : il y passe.
- D4R-01 : tant que la version en vigueur n'est pas archivée, la case des conditions clients (souscription, inscription
  d'un propriétaire après invitation, accord à une nouvelle version) est refusée — d'où l'ordre des gestes ci-dessous.
  Une acceptation déjà enregistrée sans empreinte (ou celle de l'ouverture d'un espace) ne vaut plus preuve : la case est
  redemandée à la souscription. Aucun abonné aujourd'hui (Q64) : sans effet supposé en production.
- D4R-02 : un client en essai (sans souscription) n'est pas compté comme abonné ; avec un seul abonné actif, plus aucune
  nouvelle version des conditions clients ne peut être archivée — donc plus aucune nouvelle version ne peut être mise en
  ligne sans bloquer les souscriptions (D4R-01) — tant que l'annonce n'est pas écrite.
- PostgREST plafonne peut-être la lecture des abonnements (1 000 lignes) : sans effet (le refus vaut dès une ligne).

## R4. À rejouer sur le banc
1. Appliquer `20261125150000` aux bases du banc ; suite vitest complète, dont les 9 fichiers ci-dessus qui exigent le banc.
2. `jour-de-paris-suite-migrations-rejeu` avec `GERIMMO_HISTORIQUE_DB` (base historique) ; `patrimoine-finance-retours-base` idem.
3. Parcours navigateur : archivage depuis /admin/sante avec un abonné fictif actif (refus et message), puis sans abonné.
4. Relance à la main avec un service d'envoi simulé en échec (429), passe de la tâche des courriels : aucun envoi.

## R5. Gestes du jour de publication (remplacent les points 1 et 4 du § 5)
1. Base : les migrations des lots T4/D7, `20261125110000`, `20261125140000`, **sans `20261125150000`**. Puis le code.
2. **Contrôle avant d'archiver : zéro abonné actif** (`select count(*) from public.abonnements where stripe_subscription_id
   is not null and coalesce(stripe_statut,'') not in ('canceled','incomplete_expired')` → 0). Sinon la console refuse.
3. Archiver la version du 24 novembre 2026 (/admin/sante), aussitôt le code déployé : entre-temps, la souscription
   attend l'archive (la preuve d'accord exige l'empreinte).
4. Puis `20261125150000`. Contrôle : `select count(*) from public.acceptations_sans_version_archivee()` côté console ;
   un appel `accepter_cgu('2099-01-01')` par un compte de test doit être refusé.
5. Les autres gestes du § 5 (Q16, Q6 + Q37, Q24, contrôle) inchangés.

## R6. Questions au dirigeant
1. D4R-02 : l'annonce par courriel des nouvelles versions est à écrire avant toute version future dès qu'il y aura un
   abonné (sinon : ni archivage ni mise en ligne d'une version). La prévoir dans quel lot ?
2. D4R-04 : garde de la périodicité en base (révoquer la fonction aux comptes, appel par la clé de service) ou accepter ?
3. D4R-05 : plafond de relances à la main par espace ?
4. Un client en essai, sans souscription, doit-il compter comme « abonné » pour le refus d'archivage ?

## R7. Points JURISTE (s'ajoutent au § 7)
1. Article 16, second alinéa face à l'accord exprès demandé (déjà posé, § 7.1) : l'écran renvoie désormais à l'article
   sans dire « rien ne change ». Quels changements de la version du 24/11 (conservation des factures à dix ans,
   médiation, annexe OpenAI) s'appliquent à la date annoncée à un abonné qui n'a pas répondu ?
2. Article 16, premier alinéa : la notification par courriel et le préavis ne sont pas automatisés ; Gerimmo refuse donc
   l'archivage tant qu'il y a un abonné. Le refus suffit-il, ou faut-il, avec des abonnés, repousser la date d'effet ?
3. Un client en période d'essai est-il un « Client » à qui la notification de l'article 16 est due ?

Commit local de la reprise : `3788220b` (sur `cb731af9`), non poussé.
