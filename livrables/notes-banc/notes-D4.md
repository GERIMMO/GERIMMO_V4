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
