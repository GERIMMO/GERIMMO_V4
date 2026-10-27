# Audit de la refonte propriétaire (PR #264) — 27 octobre 2026

> Audit, correction et vérification de la refonte publiée le 27/10/2026 (commit `555c5282`), avec le regard d'un
> utilisateur, d'un développeur, d'un spécialiste UX et d'un webdesigner. Travail local sur la branche
> `claude/compassionate-euler-qpqjp6`. **Rien n'est publié : aucune fusion vers `main`, aucune migration appliquée en
> production.** Le bilan simple est dans le wiki : `wiki/syntheses/Bilan de l'audit de la refonte #264 — 27 octobre 2026.md`.

## 0. Verdict

**Prêt à publier avec réserves.** Les 70 défauts confirmés sont traités (53 corrigés, 12 partiellement, 5 renvoyés à une
décision produit) ; la batterie complète est au niveau de la référence ; aucune donnée réelle n'est encore touchée en
production. Les réserves sont listées en § 7 (décisions) et § 10 (déploiement : cinq migrations à passer par le chantier
« Migrations Supabase », simulation d'abord, avant le code).

## 1. Périmètre et correspondance avec la version publiée

- Version auditée : `555c5282fba2824a2cd6ec1184eb2a73af84928a` = `origin/main` = déploiement Vercel de production
  (`READY`, aucune erreur d'exécution sur trois jours). Les cinq migrations `20261026*` de la PR sont appliquées.
- La branche de travail a été alignée sur ce commit avant l'audit (arbre identique, 0 ligne de différence).
- Non accessibles depuis l'environnement : le dossier `…/work/audit-suite-20261025` du poste de l'utilisateur, le fichier
  `output/publication-20261027/etat.json` et le site `www.gerimmo.app` (règle réseau du conteneur). L'état de publication
  a été reconstitué par GitHub (PR #264), Vercel et la base Supabase en lecture seule (SELECT uniquement).

## 2. Méthode

1. **Banc local identique à la CI** (`.github/workflows/ci.yml`) : Postgres 16, 427 migrations rejouées par
   `e2e/local/preparer-ci.mjs`, émulateur Supabase local, données de parcours fictives (`seed-parcours.mjs`),
   application construite (`next build` puis `next start`). Défaut de banc corrigé en route : la carte des écrans
   (`npm run e2e:matrice`) manquait, d'où 18 faux échecs au premier passage ; un premier passage a aussi été pollué par
   les auditeurs qui partageaient les comptes de test (sessions invalidées) — seul le passage sur banc neuf fait foi.
2. **Référence avant correction** : lint, types, 11 516 tests unitaires, 236 parcours navigateur (téléphone 390×844).
3. **Audit en six domaines** (loyers et tableau de bord ; fiche du lot, personnes, incidents ; documents et
   diagnostics ; création du bail ; espaces locataire, artisan, supervision et droits ; transversal design,
   accessibilité, performance). Chaque auditeur devait **reproduire** chaque constat (script navigateur aux gabarits
   390×844 et 1440×900, requête SQL, sortie de test, capture) ; un **vérificateur adverse** par domaine a ensuite tenté de
   réfuter chaque constat. 72 constats relevés, 69 conservés, 3 réfutés ; un 70ᵉ (LOY-N1) a été trouvé pendant les
   corrections.
4. **Corrections en sept chantiers isolés** (branche `audit264/<chantier>`, base, émulateur et serveur propres),
   chaque chantier relu par un **relecteur adverse** qui rejoue les reproductions et cherche les régressions (droits,
   autres espaces, colocation, meublé, SCI, double soumission, dates Paris, montants au centime) ; reprise du chantier
   tant qu'il reste un point bloquant (deux tours au plus). Règle absolue : aucun contrôle désactivé, aucun test
   modifié pour « passer au vert » — chaque test existant modifié est justifié (§ 5).
5. **Intégration** sur la branche de travail (manifestes fusionnés par horodatage, quatre conflits de code résolus à la
   main), batterie complète, relecture adverse de l'intégration, rapport.

Comptes et données : fictifs uniquement. Production : lecture seule. Aucun courriel, SMS, relance, recommandé, paiement
ou signature réel. Pour les règles réglementaires, les textes ont été cités (annexe A) ; Légifrance et service-public
étant injoignables directement, ils ont été relus via un moteur de recherche et croisés avec le site du ministère.

## 3. Référence (avant toute correction)

| Contrôle | Résultat | Remarque |
|---|---|---|
| `npm run lint` | 0 erreur | |
| `npm run typecheck` | 0 erreur | |
| Vitest complet | 11 498 réussis / 1 échec | `tests/fichier-signe-navigateur` échoue **à l'identique avant #264** (`98223ad2`) : nom de téléchargement rendu par le Chromium 1243 du banc ; défaut de banc, pas de régression |
| Parcours navigateur (Playwright, 390×844) | 235 réussis / 1 instable | `alias-espace:114` : lecture du corps d'une réponse déjà quittée par l'outil de test (2 échecs sur 3 répétitions) ; aucun défaut visible |

## 4. Constats (70, vérifiés)

Répartition : 2 critiques, 20 majeurs, 41 mineurs, 7 cosmétiques. La liste complète (titre, domaine, gravité,
chantier) est en annexe B ; les reproductions, preuves et causes détaillées sont dans les fichiers
`resultats-A.json` et `resultats-B.json` conservés avec les preuves (§ 8).

### Critiques
- **FL-01** — Colocation à baux individuels : un incident déclaré par le gérant est rattaché au bail le plus récent du
  lot (`ouvrir_incident_agence`, `order by created_at desc limit 1`) et le gérant est enregistré comme déclarant au nom
  de ce locataire. Le colocataire voit l'incident, peut le contester ; l'occupant concerné ne voit rien.
- **DOC-02** — Impasse : un rapport déjà rangé dans « Documents » (type Autre ou Courrier) ne peut plus être déclaré
  comme diagnostic ; le message invite à « rattacher » sans moyen de le faire.

### Majeurs
- **LAT-01** — Après réception complète d'un loyer depuis le tableau de bord ou le bail, l'alerte « Loyer impayé » reste
  ouverte jusqu'à la tâche de nuit (5 h 30 UTC) et devient l'« action prioritaire » (fausse alerte) ; un bail réellement
  impayé est masqué pendant ce temps.
- **NEW-01 / LAT-03** — La relance envoyée depuis le tableau de bord et l'accueil taisent l'arriéré total du bail.
- **CB-01** — Deux onglets ou deux collaborateurs sur le même brouillon : le dernier à enregistrer écrase sans prévenir.
- **CB-05** — Changer d'étape sans enregistrer perd la saisie sans le dire ; récapitulatif et PDF reprennent l'ancienne valeur.
- **CB-02 / FL-02** — « Commencer un bail » crée un brouillon vide à chaque passage, même si un brouillon existe.
- **CB-03** — Un bail en préparation disparaît des tâches et n'a aucun accès depuis le parc.
- **DOC-01** — Un DPE réalisé entre 2018 et juin 2021 s'affiche valide jusqu'en 2028-2031 et lève le blocage de mise en
  location (décret n° 2020-1610 : valide jusqu'au 31/12/2024).
- **DOC-03 / DOC-04 / DOC-N1 / DOC-05 / DOC-06 / DOC-08** — Bibliothèque : nouvelle version sans effet sur le lot, état
  « à vérifier » pour des diagnostics datés, rapports sans bien ni lot, dépôt depuis le lot qui perd le lot, lots
  homonymes, nouvelle version qui naît « Expiré ».
- **FL-03 / FL-04 / FL-05 / FL-06** — Dépense sans date ni TEOM, propriétaire sans prénom devenu « Personne morale »
  (bail nu à 6 ans), « Compléter : caractéristiques » sans action, « 2 contrats » avec le loyer d'un seul.
- **ED-01** — L'assurance du locataire classée pendant la préparation n'est plus reprise après l'activation.

Les 41 mineurs et 7 cosmétiques (frictions, incohérences, textes, accessibilité, performance) sont en annexe B.

## 5. Corrections par chantier

Statuts : **corrigé** (défaut reproduit avant, absent après, test de régression), **partiel** (le cœur du défaut est corrigé, un reste est décrit), **décision requise** (choix produit ou de droits, rien d'implémenté au-delà du constat).

### 5.1 Loyers, alertes et tableau de bord (branche `audit264/loyers`, tête `4f152ae7`, migration `20261027100000_alerte_impaye_suit_encaissements.sql`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **TRV-06** — Carte « À vérifier » : le nom accessible ne reprend pas le libellé visible (axe label-content-name-mismatch), et le tabl | Mineure | corrigé | La carte « À vérifier » a désormais pour nom accessible son texte visible, dans l'ordre, dans TOUS ses états : le lien « À vérifier N demandes — Voir mes tâches », mais aussi le bouton « 5 loyers à confirmer / Avez-vous reçu vos loyers ? / Voir les loyers », le bouton « 1 action prioritaire / <titre> / 6 demandes · 5 loyers à confirmer » et le bouton « À vérifier / Liste incomplète ». axe (wcag2a/2aa/21a/21aa) ne signale plus label-content-name-mismatch sur la carte, pour le propriétaire comme pour la supervision. aria-haspopup="dialog" annonce toujours la fenêtre. |
| **LAT-01** — Après une réception complète déclarée depuis le tableau de bord, l'alerte « Loyer impayé » reste ouverte et devient l'«  | Majeure | corrigé | Dès que le propriétaire a confirmé la réception complète, l'alerte « Loyer impayé » se ferme : depuis le tableau de bord, depuis le bail ou depuis la saisie détaillée. Un bail soldé ne devient plus l'action prioritaire de l'accueil, de « À faire » ni de la synthèse de connexion. Si le règlement est retiré, la même alerte se rouvre, sans doublon. Après un règlement partiel, le montant suit le reste dû. Nouveau à cette reprise : l'historique affiche « Fermée automatiquement … — « Impayé soldé » » (et non plus « Fermée le … »). Une alerte fermée à la main reste fermée, même si la personne a écrit |
| **LAT-03** — L'accueil et « À faire » ne montrent qu'un mois et son montant par bail : l'arriéré total et la gravité d'un impayé de p | Majeure | partiel | Sur la ligne du bail, dans la fenêtre et dans « À faire », l'arriéré est visible : « 1 autre mois à recevoir sur ce bail », « 1 040,00 € au total », et la marque « Prioritaire » à partir de deux termes échus. La carte de l'accueil compte les échéances dues (« 7 loyers à confirmer »). Nouveau à cette reprise : l'en-tête « N à traiter » de « À faire » compte aussi les échéances, et non plus les baux. Sur VLA : « 15 À TRAITER », soit 10 demandes et « 5 à confirmer », au lieu de « 14 » face à « 5 à confirmer ». |
| **TRV-10** — La carte rouge « Avez-vous reçu vos loyers ? » clignote sans fin, sans moyen de l'arrêter en dehors du survol et du focu | Mineure | corrigé | La pulsation douce de la carte rouge, voulue par le propriétaire du produit, est conservée. Elle fait deux cycles de 2,4 s, puis la carte reste fixe ; avec « réduire les animations », il n'y en a aucune. Nouveau à cette reprise : la pulsation part du rouge fixe de la carte et y revient, sans saut de teinte au début ni à la fin. |
| **NEW-01** — La relance par e-mail envoyée depuis le tableau de bord tait l'arriéré : elle ne cite que le mois le plus ancien, alors  | Majeure | corrigé | La relance envoyée depuis « Loyers à confirmer » indique aussi la dette échue totale du bail (« Au total, X € restent dus … tous termes échus confondus »), comme les relances automatiques. La confirmation affiche ce total avant l'envoi : « 520,00 € restant à recevoir, 1 040,00 € échus au total sur le bail ». |
| **LAT-02** — Une relance antérieure du bail est présentée sur l'échéance suivante (« Une première relance a été enregistrée ») et mas | Mineure | corrigé | Une relance envoyée depuis le tableau de bord pour septembre n'apparaît plus comme « première relance » sur la ligne d'octobre. L'envoi est de nouveau proposé pour octobre. |
| **LAT-04** — Colocation : les tâches de chaque chambre sont strictement identiques et les rappels ne nomment pas la chambre | Mineure | corrigé | Les tâches d'un bail de chambre se distinguent : « État des lieux d'entrée à signer — VLA Colocation · Chambre Jardin » et « … · Chambre Rue », de même pour « Loyer impayé — lot · chambre ». |
| **LAT-05** — Le chiffre de la carte « À vérifier N demandes » ne correspond pas au compteur de « Mes tâches » vers lequel elle mène | Mineure | corrigé | La carte « À vérifier N demandes » annonce le même nombre que l'en-tête « Mes tâches » vers lequel elle mène (« 1 demande », « Mes tâches 1 »). |
| **LAT-07** — Le rappel de loyer n'a pas d'accès direct à la fiche du bail, et la carte annonce « les actions » alors que la fenêtre n | Mineure | corrigé | Le nom du lot de chaque loyer à confirmer est un lien vers les loyers du bail, y compris en lecture seule. La carte dit « Voir les loyers » quand la fenêtre ne contient que des loyers. |
| **LAT-08** — Le layout recalcule à chaque page propriétaire les vérifications (actions et rappels de loyers) pour une pastille « Aler | Mineure | corrigé | Les pages du propriétaire (parc, personnes, finances…) ne calculent plus à chaque chargement le plan du jour et les rappels de loyers pour une pastille que son menu n'affiche pas. |
| **LAT-06** — La tuile « Encaissé en octobre » mène à Finances, où ce montant n'apparaît dans aucun indicateur du mois | Mineure | corrigé | La tuile « Encaissé en octobre » dit ce qu'elle additionne (« Reçus ce mois, toutes échéances ») et ouvre les recettes et dépenses de Finances (#operations). |
| **LOY-N1** — LOY-N1 | — | corrigé | Le bouton « Envoyer la relance par e-mail » de la fenêtre des loyers est lisible. Il était blanc sur blanc. |
| **TRV-09** — Grand parc : une tâche par lot et par obligation, sans regroupement (630 tâches et 10 755 nœuds sur le tableau de bord,  | Mineure | décision requise | Sur un parc de 300 lots, le tableau de bord rend toujours une tâche par lot et par obligation (des centaines de lignes), et /alertes n'est pas paginé. |

Tests existants modifiés (justification du chantier) :
- app/tests/carte-verifications.test.ts (reprise TRV-06) : les attentes sur l'aria-label réordonné du bouton (« … — ouvrir le détail », « … — ouvrir les loyers ») figeaient exactement le défaut signalé par axe. Elles sont remplacées par « aucun aria-label, nom accessible = texte visible exact ». Chaque test garde son intention : question des loyers, compteurs distincts, urgence avant les loyers, liste incomplète, titre explicite sans aperçu.
- app/e2e/reception-loyer-proprietaire.spec.ts (reprise TRV-06) : son sélecteur reposait sur le suffixe « — ouvrir (le détail|les loyers) » de cet aria-label. Il retrouve désormais le même bouton par le début de son texte visible. Aucune attente n'est retirée.
- app/e2e/alerte-impaye-proprietaire.spec.ts (spec du chantier) : même changement de sélecteur, plus une passe axe et une vérification du nom accessible dans l'état bouton.
- app/tests/verifications-proprietaire.test.ts (reprise LAT-03) : « présente les termes successifs d'un bail » attendait total = 1 pour deux échéances dues d'un même bail. Il attend désormais 2, et vérifie qu'une seule ligne est présentée. Le changement est voulu : l'en-tête de « À faire » compte les échéances, comme la section « N à confirmer » et la carte de l'accueil.
- app/tests/verifications-proprietaire-navigation.test.ts (test d'origine de la PR #264, reprise LAT-03) : « présente les échéances successives d'un même bail sans gonfler le compteur » attendait total = 1 pour deux échéances. Renommé, il attend 2 et une seule ligne présentée. Les attentes suivantes (1 puis 0) sont inchangées. Justification : chaque échéance demande sa propre confirmation (deux clics dans l'e2e), et LAT-03 a fait compter les échéances à la carte et à la section voisine. Garder les baux dans l'en-tête mélangeait les unités sur un même écran (relecture). Si le produit préfère compter les baux, il faut changer les trois compteurs ensemble.
- app/tests/alerte-impaye-encaissement-base.test.ts (test du chantier, reprise LAT-01) : la lecture des alertes renvoie aussi closed_by, et « deux réceptions » attend closed_by nul ; deux tests sont ajoutés.
- Rappel du tour précédent (inchangé) : verifications-proprietaire.test.ts (« sans masquer les autres baux »), racine-pages-rendus.test.ts, racine-coquille-espace.test.ts, racine-pages-espace.test.ts, relance-reception-loyer.test.ts, rappels-loyers.test.ts, rappels-loyers-interface.test.ts, relais-migrations-manifeste.test.ts, vente-impaye-base.test.ts et activation-inactivite-v1-base.test.ts, vitest.config.ts (FICHIERS_EN_SERIE), avec les justifications du rapport précédent.

### 5.2 Fiche du lot, parc et accès au bail (branche `audit264/fiche_lot`, tête `8cad098f`, migration `20261027100500_parcours_demarrage_pluriel_baux.sql`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **FL-02** — « Commencer un bail » dans l'en-tête crée un nouveau brouillon vide (type meublé, sans chambre) à chaque passage, même s | Majeure | corrigé | Sur la fiche d'un lot qui a déjà un brouillon, le bouton principal de l'en-tête est « Reprendre le bail » (ou « Consulter et activer » pour un bail signé) et mène à ce brouillon. Sur un lot loué sans brouillon, l'en-tête propose « Ouvrir le bail », ou « Voir les N baux » quand plusieurs contrats sont en cours. Créer un autre contrat reste possible dans la carte du bail, sous « Préparer un autre contrat — facultatif ». Côté serveur, un second « Commencer » ne crée plus de brouillon vide en double. |
| **CB-02** — Le bouton d'en-tête « Commencer un bail » crée un nouveau brouillon alors qu'un brouillon existe ; « Reprendre le bail » | Majeure | corrigé | Même défaut que FL-02. En plus, le brouillon que « Reprendre le bail » ouvre est le plus avancé (signé, puis le plus renseigné), à défaut le plus ancien, et non plus le brouillon vide le plus récent. La liste « Baux à finaliser » suit le même ordre. |
| **CB-03** — Un bail en préparation disparaît des tâches du tableau de bord et n'apparaît nulle part dans le parc, même avec le filtr | Majeure | corrigé | Un bail en préparation devient une tâche de l'accueil : « Finaliser le bail · <lot> · Bail en préparation → Reprendre le bail » (fiche du lot s'il y a plusieurs brouillons). Dans « Biens & locations », la carte du lot affiche « Bail en préparation » et un lien « Reprendre le bail en préparation » ; le filtre « En préparation » retient ces lots. |
| **FL-06** — Résumé de la fiche du lot (agence) : « 2 contrats en cours » s'affiche au-dessus du loyer et de la date d'entrée d'un se | Majeure | corrigé | Le résumé agence d'un lot qui a plusieurs contrats en cours affiche le nom des locataires et « 970,00 € / mois · charges comprises, au total pour 2 contrats », plus le loyer ni la date d'un seul contrat. Le bouton principal dit « Voir les 2 baux » : il compte les contrats en cours annoncés juste au-dessus, même quand un brouillon ou un ancien contrat s'ajoute (avant la reprise : « 2 contrats en cours … Voir les 3 baux »). |
| **FL-05** — « Compléter : caractéristiques » (liste des biens) mène à une carte qui ne dit pas ce qui manque et n'a aucun bouton, et | Majeure | corrigé | « Compléter : caractéristiques » ouvre directement le formulaire du lot. L'encart « À compléter » ajoute « Caractéristiques du logement · 5 à renseigner », qui ouvre le formulaire. La carte « Le logement » affiche « Chauffage : À renseigner », etc., avec un bouton « Compléter ». |
| **FL-04** — Un propriétaire créé sans prénom dans « Nouveau propriétaire » est enregistré comme « Personne morale », sans choix poss | Majeure | partiel | La fenêtre « Nouveau propriétaire » demande la qualité dans la liste fermée (Personne physique, Indivision, SCI familiale, SCI, Personne morale), chacune avec son aide (bail nu de 3 ou 6 ans). Prénom, date et commune de naissance ne sont demandés, et obligatoires, que pour une personne physique. Une SCI familiale saisie sans prénom est enregistrée « SCI familiale » (bail nu de 3 ans), plus « Personne morale ». La carte « Propriétaires » affiche la qualité, et « bail nu de 6 ans » quand elle l'impose. |
| **FL-03** — La dépense saisie depuis « Journal & dépenses » du lot ne demande pas de date (écriture datée du jour et non modifiable) | Majeure | corrigé | La dépense saisie depuis « Journal & dépenses » demande la date de la pièce, pré-remplie au jour et modifiable ; le premier champ s'appelle « Catégorie », comme dans le message d'erreur. Pour une taxe foncière chez un propriétaire direct, un champ « dont enlèvement des ordures ménagères (€) » apparaît et la saisie est enregistrée en deux écritures (Taxe foncière et TEOM). Une facture de décembre 2025 saisie en 2026 garde sa date de 2025. |
| **FL-07** — « Créer le contrat individuel d'un locataire → » (Colocation) ne crée rien : il fait défiler vers la liste des contrats | Mineure | corrigé | Dans la fiche propriétaire, « Créer le contrat individuel d'un locataire → » mène au geste de création : s'il existe déjà un contrat, le lien ouvre « Préparer un autre contrat » avec « Commencer le bail » à l'écran ; sinon il mène au bouton de l'en-tête, ou à « Propriétaires » s'il n'y a pas encore de propriétaire. L'agence garde #baux. |
| **FL-10** — Choix du propriétaire dans la fiche du lot : locataires et garants proposés comme propriétaires, vocabulaire d'agence, e | Mineure | partiel | « 100 % . » devient « 100 % ». La fenêtre dit « La fiche complète se retrouve dans Locataires & garants » et « … une seule fiche de votre espace » chez le propriétaire, et garde les textes d'agence côté agence. |
| **FL-11** — Fiche du lot : « Bails à finaliser », « Le 1 du mois », chambre en préparation répétée, brouillons vides listés comme pe | Cosmétique | corrigé | On lit « Baux à finaliser » et « Le 1er du mois ». Une chambre dont le contrat se prépare n'est plus répétée sous « Chambres sans location en cours ». Un brouillon sans personne n'apparaît plus comme « Location 4 · Locataire à désigner » dans « Locataires & garants ». « Historique du lot » a le même résumé que « Journal & dépenses ». |
| **CB-16** — Petits défauts de texte : « 7 bailx en cours », « Bails à finaliser », message de plafond sans montant, quote-part au fo | Cosmétique | corrigé | Le parcours de démarrage affiche « 2 baux en cours », le parc « N baux en cours ». Le refus du dépôt donne le plafond (« … plafond de 700,00 € pour ce type de bail. ») sans renvoyer à l'étape Loyer quand on y est déjà. Le récapitulatif du bail écrit les quotes-parts « 33,33 % ». |
| **FL-09** — Fiches personnes : chambre et nom du locataire garanti absents, aucun historique des baux terminés, statut différent ent | Mineure | partiel | La fiche d'Alice affiche « VERIF-LPI Coloc · Chambre 1 », celle de Paul « Garant de VerifLPI Alice ». Dans « Locataires & garants », Chloé est « Locataire · bail en préparation », puce neutre, comme sur sa fiche. Après la relecture : une fiche dont le seul bail est en préparation est de nouveau rangée sous le filtre « Sans bail en cours » (elle n'apparaissait plus dans aucun filtre de rôle), les compteurs se recoupent (Locataires 2 + Garants 1 + Propriétaires 2 + Sans bail en cours 4 = 9 fiches), et la recherche « sans bail » la retrouve. Côté agence, la recherche « sans » retrouve aussi une f |

Tests existants modifiés (justification du chantier) :
- app/tests/etapes-bail-actions.test.ts (passage précédent) : contexteCreation simule la lecture des brouillons (« baux ») et de « bail_personnes » que commencerBail fait désormais avant d'insérer ; assertions existantes inchangées, elles passent aussi sur le code d'avant.
- app/tests/relais-migrations-manifeste.test.ts (passage précédent) : ajout de la migration 20261027100500 à MISSION_OCTOBRE.
- app/tests/roles-personnes.test.ts (reprise) : ajouts seulement (describe sansRoleEnCours et rendu des filtres de l'annuaire) ; aucune assertion existante modifiée.
- app/e2e/dossier-proprietaire.spec.ts (reprise) : le scénario FL-09, ajouté par ce chantier, gagne les clics sur les filtres « Sans bail en cours » et « Locataires » ; ses assertions existantes sont inchangées.

### 5.3 Diagnostics (branche `audit264/diagnostics`, tête `dbf61f62`, migration `20261027100200_diagnostics_validite_dpe_et_rapports.sql`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **DOC-02** — Impasse : un rapport déjà rangé dans « Documents » (type Autre) ne peut plus être déclaré comme diagnostic | Critique | corrigé | Un PDF déjà rangé dans Documents en « Autre » ou « Courrier », ou joint au bail comme annexe, peut être déclaré comme DPE ou ERP du lot. L'écran affiche l'encadré « Ce fichier est déjà dans vos documents… il sera classé en « Diagnostic », sans nouvelle copie » et le bouton « Utiliser ce fichier comme rapport ». Le blocage de mise en location est levé. Les pièces personnelles ne sont jamais proposées. Pour un fichier d'une signature en cours, l'écran affiche « Ce fichier fait partie d'une signature en cours : déclarez ce diagnostic une fois la signature terminée ou annulée. » NOUVEAU dans cette |
| **DOC-01** — Un DPE réalisé entre 2018 et juin 2021 s'affiche « Valide » jusqu'en 2028-2031 et lève le blocage de mise en location | Majeure | corrigé | Un DPE réalisé entre 2013 et le 30/06/2021 n'est plus présenté « Valide jusqu'en 2029 » et ne lève plus le blocage de mise en location. Le formulaire pré-remplit 31/12/2024 ou 31/12/2022 et explique pourquoi. Une échéance plus lointaine est refusée, avec la règle et sa source. Les DPE déjà enregistrés s'affichent « Expiré · Échu le 31/12/2024 ». Un DPE ancien enregistré sans fichier affiche « Fichier à joindre / Échu le 31/12/2024 ». |
| **DOC-03** — « Nouvelle version » d'un rapport de diagnostic dans Documents n'a aucun effet sur le lot, qui continue d'ouvrir l'ancie | Majeure | corrigé | Sur un rapport de diagnostic en service, le volet Documents propose « Renouveler sur la fiche du lot » (ou « du bien ») au lieu de « Nouvelle version », dans l'espace propriétaire comme dans l'espace agence. L'action directe est refusée. |
| **DOC-04** — La bibliothèque Documents affiche « À vérifier, sans échéance renseignée » pour des diagnostics datés, et son compteur « | Majeure | corrigé | Dans Documents, un rapport de diagnostic affiche l'état de son diagnostic (« Expiré », « Valide », « Remplacé »). Le bandeau « à renouveler » compte le DPE expiré, et le volet affiche « Expire le ». |
| **DOC-N1** — Bibliothèque Documents : les rapports de diagnostic ne disent pas à quel bien ou lot ils appartiennent, et deux ERP de b | Majeure | partiel | Chaque rapport de diagnostic de la bibliothèque nomme son bien, et son lot pour un diagnostic du logement. Deux ERP du même jour ne se confondent plus. Le volet porte « Rapport de diagnostic de <bien · lot> » avec un lien vers la fiche. |
| **DOC-07** — Plomb (CREP) : résultat jamais demandé ni règle des 6 ans montrée, le statut « Validité à vérifier » ne peut jamais être | Mineure | partiel | Le dépôt d'un CREP demande le « Résultat du constat ». S'il est positif, l'échéance est pré-remplie à six ans et devient obligatoire, et un CREP positif de plus de six ans s'affiche « Expiré ». S'il est négatif, l'aide dit « Sans limite de validité : laissez vide ». |
| **DOC-12** — Électricité et gaz « À préciser » sur un bâtiment construit en 2021 : l'année de construction connue n'est pas réutilisé | Mineure | corrigé | Pour un bâtiment de 0 à 14 ans, les champs « Année d'installation » de l'électricité et du gaz sont pré-remplis avec l'année de construction, avec l'aide « Proposée d'après la construction du bâtiment (2021). Enregistrez pour confirmer. » Rien n'est enregistré sans ce geste, et une réponse existante n'est jamais remplacée. Un bâtiment pas encore livré (année à venir) ne reçoit pas de proposition. |
| **DOC-09** — Fiche bien : « Voir le document » ouvre un nouvel onglet, alors que la fiche lot ouvre l'aperçu intégré | Mineure | corrigé | Sur la fiche bien (propriétaire comme agence), « Voir le document » ouvre l'aperçu intégré, comme sur la fiche lot, au lieu d'un nouvel onglet. |

Tests existants modifiés (justification du chantier) :
- app/tests/diagnostic-piece-existante-action.test.ts (cette reprise) : le faux magasin renvoie aussi partage_le (champ facultatif ajouté au type Piece, null par défaut). C'est une extension du dispositif, sans changement d'attente existante : seul un describe a été ajouté.
- app/tests/diagnostics-validite-rapports-base.test.ts (cette reprise) : la création du compte auth.users est factorisée dans la constante UTILISATEUR, pour créer aussi un compte locataire. Un cas et une ligne d'en-tête ont été ajoutés. Aucune attente existante n'a été changée.
- app/tests/diagnostic-piece-existante-action.test.ts (premier passage) : le faux magasin accepte .in(), et le filtre de type devient type_in=['diagnostic','autre','courrier']. Ce changement est voulu par DOC-02.
- app/tests/alertes-origine.test.ts (premier passage) : la date de réalisation du DPE de test passe de current_date-3000 à current_date-1000, car un DPE de 2018 n'est plus valable après le 31/12/2024 (DOC-01). L'intention du test (seuils J-90 et J-30) est conservée.
- app/tests/relais-migrations-manifeste.test.ts (premier passage) : ajout de la migration à MISSION_OCTOBRE, conformément à la convention.
- app/tests/diagnostics-fiches-rendu.test.ts (reprise 1) : uniquement des ajouts de cas.

### 5.4 Incidents, messagerie et aide (branche `audit264/incidents`, tête `becc73b5`, migration `20261027100100_incident_gerant_bail_explicite.sql`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **FL-01** — Colocation à baux individuels : l'incident déclaré par le propriétaire (ou l'agence) est rattaché au bail le plus récent | Critique | corrigé | Le propriétaire ou l'agence choisit la chambre concernée quand il déclare un incident dans une colocation où au moins deux chambres sont louées. Seul le locataire de cette chambre suit l'incident. Avec « Espaces partagés ou tout le logement », aucun colocataire ne le voit. Le gérant n'est plus enregistré comme déclarant au nom d'un locataire. Le locataire du bail rattaché garde les droits que la saisie lui donnait : il est informé (RM-7.2.4), il conteste (RM-7.2.5), il rouvre le dossier. La fenêtre « Mon logement » le compte aussi (signalements en cours, puis « Incident déclaré » et « Incident |
| **FL-08** — Messagerie : « Nouveau message » renvoie vers l'annuaire, dont les fiches de locataires sans espace ne permettent pas d' | Mineure | corrigé | Sur la fiche d'un locataire qui n'a pas encore d'espace, une carte « Messages » explique qu'il faut d'abord l'inviter, ou que l'invitation attend sa réponse. Son bouton « Inviter » (ou « Voir l'invitation ») mène au formulaire d'accès locataire. La navigation de la fiche propose « Messages ». La carte d'accès ne s'adresse plus au seul « futur locataire ». |
| **FL-12** — Aide propriétaire : 7 réponses seulement, rien sur les incidents, la colocation à baux individuels, les diagnostics ni l | Mineure | partiel | L'aide du propriétaire passe de 7 à 11 réponses, avec deux nouvelles rubriques, Biens et Incidents. Nouvelles réponses : qui paie un incident, location chambre par chambre, reprise d'un bail en préparation, pourquoi on ne peut pas écrire à un locataire. Chaque lien est nommé d'après l'écran qu'il ouvre. La réponse sur la colocation dit maintenant que la chambre n'est demandée que lorsque plusieurs chambres sont louées : c'est ce que fait le formulaire. |

Tests existants modifiés (justification du chantier) :
- app/tests/sprint7-incidents.test.ts (commit précédent) : l'essai « l'agence saisit pour le locataire » attendait le locataire comme déclarant, comportement supprimé par FL-01. Il attend maintenant un déclarant vide, le bail rattaché, et un incident vu comme le sien (est_declarant = true).
- app/tests/actions-rapides-incident.test.ts (commit précédent) : bail_id ajouté au jeu d'essai, exigé par le type IncidentVerification ; aucune assertion modifiée.
- app/tests/faux-postgrest.ts (commit précédent) : SCHEMA_CONNU.incidents déclare bail_id et l'intégration « bail », lues par le volet et l'accueil.
- app/tests/relais-migrations-manifeste.test.ts (commit précédent) : 20261027100100 ajouté à la fin de MISSION_OCTOBRE.
- app/vitest.config.ts (commit précédent) : le test SQL ajouté à FICHIERS_EN_SERIE, car il rejoue la migration et son retour.
- app/tests/incident-gerant-colocation-base.test.ts (reprise) : test ajouté par ce chantier, complété pour la fenêtre du lot (essai nouveau et essai du retour). Aucune assertion antérieure affaiblie.
- app/e2e/messages-locataire-sans-espace.spec.ts (reprise) : spec ajoutée par ce chantier, qui cible maintenant le cas du constat (locataire en cours sans compte) comme le demandait la relecture. Assertions conservées, une ajoutée (« Biens et baux »).

### 5.5 Création du bail (branche `audit264/bail`, tête `c86e5bc9`, migration `20261027100300_bail_assurance_activation_et_libelle_colocation.sql`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **CB-01** — Deux onglets (ou deux collaborateurs) sur le même brouillon : l'onglet resté ouvert écrase sans prévenir un loyer déjà e | Majeure | corrigé | Avant : quand deux onglets (ou deux collaborateurs) travaillaient sur le même brouillon, le dernier à enregistrer écrasait sans prévenir le loyer enregistré par l'autre. Après : l'enregistrement est refusé et la saisie reste affichée, avec le message « Cette étape a été enregistrée entre-temps dans un autre onglet ou par une autre personne. Rien n'a été enregistré… ». Chaque champ concerné est listé avec sa valeur enregistrée. Un champ que l'onglet n'avait pas touché reprend la valeur enregistrée, y compris un texte sur plusieurs lignes (corrigé à la reprise). Une saisie différente est conserv |
| **CB-05** — Changer d'étape par le fil d'étapes sans enregistrer : la saisie reste affichée mais n'est pas enregistrée, et rien ne l | Majeure | corrigé | Avant : en changeant d'étape (fil, Précédent ou Suivant), la saisie restait affichée sans être enregistrée, et le récapitulatif comme le PDF reprenaient l'ancienne valeur sans le dire. Après : quitter une étape modifiée ouvre la fenêtre « Modifications non enregistrées », avec « Enregistrer et continuer », « Abandonner les modifications » ou « Rester sur l'étape ». Le fil marque l'étape « Saisie non enregistrée » ; le récapitulatif l'indique avec un lien de retour. Reprise : une clause ou des travaux sur plusieurs lignes, une fois enregistrés, ne sont plus signalés à tort (fil, récapitulatif,  |
| **ED-01** — L'assurance du locataire classée pendant la préparation du bail n'est plus reprise après l'activation : le locataire se  | Majeure | corrigé | Avant : après l'activation, le locataire se voyait réclamer une attestation déjà classée par le propriétaire, aucune alerte ne suivait son échéance et le bail actif ne l'affichait plus. Après : l'attestation classée pendant la préparation est rattachée au locataire principal et aux colocataires présents (jamais aux garants). L'espace locataire l'affiche « Assurance en cours de vérification », les alertes d'échéance la suivent, et le bail actif montre une carte « Assurance du locataire ». verifie_le n'est jamais renseigné automatiquement. |
| **CB-13** — Rubrique « Propriétaires, locataires et garants » : « 1 information enregistrée », sans état d'attention, alors qu'aucun | Mineure | corrigé | Avant : sans locataire choisi, la rubrique des personnes annonçait « 1 information enregistrée », sans état d'attention. Après : elle affiche « Locataire principal — Compléter », compte « 1 information à vérifier » et passe en état d'attention. |
| **CB-07** — Complément de loyer facultatif signalé « Compléter / 1 information à vérifier » au récapitulatif alors que l'étape Claus | Mineure | corrigé | Avant : avec un encadrement des loyers et sans complément, le récapitulatif affichait « Complément de loyer — Compléter » alors que le PDF imprime « néant ». Après : il affiche « Néant », comme le contrat, sans rien à vérifier. |
| **CB-06** — Fausse alerte sur l'étape Loyer : « loyer + charges, montant au prorata » vise le loyer déjà rempli alors qu'il manque l | Mineure | corrigé | Avant : sans date d'entrée, l'étape Loyer signalait « loyer + charges, montant au prorata » sur un loyer déjà rempli. Après : seule la date d'entrée est signalée, à l'étape Le bail. |
| **CB-04** — Profil de l'organisation incomplet (en-tête du PDF) : les manques sont imputés aux parties (« Adresse du propriétaire », | Mineure | corrigé | Avant : un profil d'organisation sans adresse ni e-mail produisait « Adresse du propriétaire » et « Adresse e-mail des parties », qui menaient à une carte propriétaire pourtant complète. Après : « Adresse de votre profil (en-tête du contrat) » et « E-mail de votre profil (en-tête du contrat) », avec un lien vers /profil. Un propriétaire réellement sans adresse reste signalé. |
| **CB-09** — Corrections du récapitulatif : libellés bruts, plusieurs lignes pour un même locataire absent, ciblage au niveau de la s | Mineure | partiel | Sans locataire choisi, une seule correction « Choisir le locataire principal » remplace les cinq lignes d'identité, de naissance et d'adresse. Les mentions brutes ont un libellé lisible (Inventaire du mobilier, Classe énergie du DPE, Ville de votre profil, etc.). |
| **CB-10** — Le récapitulatif n'indique ni la durée du contrat ni sa date de fin | Mineure | corrigé | La rubrique « Le contrat » indique la durée du contrat (3 ou 6 ans avec reconduction tacite en nu, 1 an en meublé, 9 mois sans reconduction pour un bail étudiant) et la fin de la première période (ex. 30/11/2032 pour une SCI entrée le 01/12/2026). Reprise : pour un bail étudiant, la durée n'est plus répétée. On lit « Bail étudiant — Oui » puis « Durée du contrat — 9 mois, sans reconduction tacite ». Sans durée calculée, la ligne garde « 9 mois ». |
| **CB-11** — Le bouton Retour du navigateur quitte l'assistant au lieu de revenir à l'étape précédente | Mineure | corrigé | Le bouton Retour du navigateur revient à l'étape précédente au lieu de quitter l'assistant. Avancer, rafraîchir et la navigation rapide restent cohérents. Revenir à l'adresse ouverte sans étape rouvre l'étape 1. |
| **CB-12** — Lien « Règlement de copropriété » des pièces du récapitulatif : le focus clavier est perdu (BODY) | Mineure | corrigé | Le lien « Règlement de copropriété » des pièces du récapitulatif place le focus clavier sur le titre de la carte, au lieu de le perdre sur BODY. |
| **CB-15** — Message d'erreur obsolète : « choisissez la colocation à l'étape Dates et montants » (l'étape s'appelle « Le bail ») | Cosmétique | corrigé | Le refus d'ajouter un colocataire sur un bail non partagé indique « … choisissez la colocation à l'étape Le bail. » au lieu de « Dates et montants ». |
| **CB-08** — Relocation : le bail précédent du lot (loyer, charges, échéance, IRL, date de sortie) n'est pas repris | Mineure | décision requise | En relocation, le brouillon ne reprend toujours rien du bail précédent du lot (loyer, charges, échéance, IRL, précédente location). |
| **CB-14** — Inventaire du meublé saisi meuble par meuble : les 11 éléments du décret ne sont qu'un texte, sans ajout groupé | Mineure | décision requise | L'inventaire du meublé se saisit toujours meuble par meuble ; la liste du décret n'est qu'un rappel. |

Tests existants modifiés (justification du chantier) :
- app/tests/relais-migrations-manifeste.test.ts : nom de la nouvelle migration ajouté en fin de MISSION_OCTOBRE, comme l'impose e2e/local/ordre-migrations.txt ; aucune assertion modifiée (premier passage).
- app/tests/fixtures/navigateur/banc-navigation-bail.tsx : ajout d'une carte « Règlement d'essai » (champ replié) et d'un lien de récapitulatif pour les tests CB-12 et CB-11 ; les cas existants sont inchangés (premier passage).
- app/tests/presentation-recapitulatif-bail.test.ts (cas CB-10 ajouté par cette branche) : la durée attendue d'un bail étudiant passe de « 9 mois, sans reconduction tacite (bail étudiant) » à « 9 mois, sans reconduction tacite ». Changement voulu (relecture : redondance avec la ligne « Bail étudiant ») ; le cas est complété par l'assertion de non-répétition.
- app/e2e/brouillon-bail-saisie.spec.ts (ajouté par cette branche) : le libellé attendu au fil passe de « Modifications non enregistrées » à « Saisie non enregistrée ». Changement voulu : l'ancien libellé était tronqué au téléphone. Le titre de la fenêtre, lui, est inchangé et toujours vérifié.

### 5.6 Dépôt et bibliothèque de documents (branche `audit264/depot_documents`, tête `5de235bc`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **DOC-05** — « Déposer un document » depuis la fiche d'un lot perd le lot : le document n'apparaît jamais sur ce lot | Majeure | corrigé | Depuis « Autres documents » d'un lot, « Déposer un document » ouvre un dépôt déjà rattaché au lot. Le formulaire affiche une case cochée, que l'on peut décocher : « Rattacher au lot « VDD Résidence 2021 » ». Le lien de retour devient « ← Retour au lot ». Chez le propriétaire, après réussite, le dépôt se referme : on revient sur la fiche du lot, section Documents ouverte, avec le toast « Document déposé et rattaché à « … » ». Le document apparaît dans « Autres documents ». Côté agence, le lien de la fenêtre du lot transmet aussi le lot, et le succès indique « Rattaché à « bien · lot » ». Il n'y |
| **DOC-08** — Nouvelle version d'une pièce datée : l'ancienne échéance dépassée est pré-remplie, la nouvelle version naît « Expiré » e | Majeure | corrigé | « Nouvelle version » ne reprend plus l'échéance de la version remplacée. Le champ « Nouvelle date d'expiration » part vide et devient requis quand la pièce avait une échéance. L'aide dit « Celle qui figure sur le nouveau document. Version actuelle : 30/06/2026 (dépassée). » Une date déjà passée est refusée par le serveur avec le message « Cette date d'expiration est déjà passée : indiquez celle qui figure sur le nouveau document. » La saisie et le fichier sont conservés. La nouvelle version ne peut donc plus naître « Expiré » par mégarde. Le formulaire « Remplacer » de l'agence, qui utilise le |
| **DOC-06** — « Lier à une fiche » liste les lots sans nom de bien : avec les noms par défaut, « Lot unique » apparaît trois fois | Majeure | corrigé | « Lier à une fiche » liste désormais les lots sous le nom de leur bien (« VDD Belleville », « VDD Gambetta », « VDD Résidence 2021 ») ou sous la forme « bien · lot » (« Immeuble Vasseur · Lot 2 »). La liste est triée par bien puis par lot dans l'ordre naturel (Lot 2 avant Lot 10), et les lots archivés sont exclus. « Déjà lié à » (« Lot VDD Belleville ») et les baux (« Bail E2E Résidence des Tests · E2E Lot 1 · Locataire E2E ») utilisent le même libellé, côté propriétaire comme côté agence. |
| **DOC-13** — Quota de 20 dépôts par heure et par compte, essais refusés compris : les doublons refusés bloquent aussi les dépôts suiv | Mineure | partiel | Redéposer le même fichier refusé comme doublon ne consomme plus le quota. Sur le banc, 22 essais consécutifs laissent le nombre de réservations de l'heure à 8, au lieu de bloquer au 17e essai. Un transfert interrompu puis relancé ne consomme pas non plus de nouvelle réservation. Un fichier invalide (format, PDF tronqué, fichier vide, image illisible) est refusé dans le navigateur avant toute réservation. Quand la limite est atteinte, le message donne la cause et l'heure de reprise : « Vous avez envoyé beaucoup de fichiers en peu de temps (20 fichiers ou 100 Mo par heure au plus). Vous pourrez  |
| **DOC-11** — Fichier vide : message « Choisissez un fichier. » alors que le nom du fichier choisi est affiché | Mineure | corrigé | Un fichier vide (0 octet) est signalé dès sa sélection, sous le champ : « Le fichier « VDD-vide.pdf » est vide : choisissez le document complet. » L'envoi est bloqué sans aucune réservation. Côté serveur, le dépôt GED et la nouvelle version répondent « Ce fichier est vide : choisissez le document complet. » au lieu de « Choisissez un fichier. » quand un fichier nommé arrive vide. |
| **DOC-10** — Un PDF corrompu (en-tête et %%EOF valides) est accepté au dépôt, et son aperçu échoue ensuite | Mineure | partiel | Images : un PNG ou un JPEG dont seule la signature est valide est refusé avant tout transfert avec le message « L'image « … » est endommagée ou illisible. Choisissez une photo ou un scan qui s'ouvre sur votre appareil. » Une image valide passe. Aucune bibliothèque n'est chargée : le contrôle utilise le décodeur natif du navigateur (createImageBitmap), qui s'applique à tous les espaces utilisant le dépôt direct. PDF : le PDF corrompu de l'auditeur est toujours accepté (décision requise ci-dessous). |

Tests existants modifiés (justification du chantier) :
- app/tests/depot-direct.test.ts : la base factice de base() reçoit gt/order/limit/maybeSingle, qui répondent « aucune réservation à reprendre ». La correction voulue de DOC-13 ajoute cette recherche avant l'insertion. Les assertions du test (aucune colonne injectée, insertion et signature attendues) sont inchangées.

### 5.7 Composants partagés, espaces et accessibilité (branche `audit264/transversal`, tête `b7befb98`)

| Constat | Gravité | Statut | Effet pour l'utilisateur |
|---|---|---|---|
| **TRV-01** — Une sélection de texte glissée jusqu'au voile ferme la fenêtre ; si ni le nom ni l'e-mail ne sont remplis, la saisie est | Mineure | corrigé | Avant : sélectionner du texte dans un champ et relâcher la souris sur le fond fermait la fenêtre. Dans « Nouveau propriétaire » et « Nouveau locataire », une saisie sans nom ni e-mail (une adresse seule) était effacée, même par un simple clic sur le fond. Après : la fenêtre ne se ferme que si le geste commence et finit sur le fond. Une saisie commencée n'est jamais effacée sans prévenir : les fiches conservent tout champ rempli et affichent « nom à compléter — adresse email à compléter · modifier ». Ailleurs, un formulaire modifié dans une fenêtre (par exemple l'alerte de l'agence : Confier, M |
| **TRV-V01** — Raccourci « ⌘ / Ctrl K » affiché mais sans effet : sur les baux en brouillon et après la fermeture de la carte « Loyers  | Mineure | corrigé | Avant : le raccourci ⌘/Ctrl K affiché ne faisait rien sur un bail en brouillon, après la fermeture de la carte « À vérifier / Loyers à confirmer », ni sur une page portant le lecteur de document intégré. Après : il ouvre la recherche dès qu'aucune fenêtre n'est réellement ouverte au premier plan. |
| **TRV-02** — Fenêtre de recherche : la page derrière défile et le focus est perdu à la fermeture | Mineure | corrigé | Avant : la recherche ouverte laissait la page défiler derrière elle, et à la fermeture le focus tombait sur <body>. Après : la page ne défile plus, et le focus revient au bouton « Rechercher ». Au téléphone, dans la supervision, la recherche s'ouvre depuis le menu : le focus revient alors au bouton « Menu supervision ». |
| **ED-02** — Supervision au téléphone et sur tablette (≤ 900 px) : 16 liens sur 17 du menu passent en gris sur le fond bleu nuit phot | Mineure | corrigé | Avant : dans la supervision au téléphone et sur tablette (≤ 900 px), 16 liens sur 17 du menu étaient gris sur photo bleu nuit, avec un contraste de 2,0 à 2,9:1. Après : le menu reste clair à ces largeurs et ses liens sont lisibles. À l'ordinateur, le menu sombre avec photo est inchangé. |
| **ED-03** — Marque blanche : dans l'espace locataire d'une agence à charte, le bouton d'action principal (.btn-or) prend l'or de Ger | Mineure | partiel | Avant : dans l'espace locataire d'une agence à charte, le bouton d'action principal (« Signaler un problème ») restait doré, la couleur de Gerimmo, au milieu d'une page aux couleurs de l'agence. Après : il prend la couleur de l'agence, avec un texte blanc. Sans charte, l'or reste. |
| **ED-05** — En-tête du locataire au téléphone : la barre devient bleu nuit et révèle la tuile blanche du nom de l'agence, sans marge | Cosmétique | corrigé | Avant : au téléphone, l'en-tête du locataire devenait bleu nuit avec photo et faisait apparaître la tuile blanche du nom de l'agence, texte collé aux bords. Après : l'en-tête reste blanc, comme le prévoit prestige.css, et la tuile s'y fond, pour l'agence Alpha comme pour l'agence à charte. |
| **ED-04** — Mes documents (locataire) : deux gestes de consultation différents dans la même liste ; le titre d'une pièce n'est plus  | Mineure | décision requise | Dans « Mes documents » du locataire, une pièce s'ouvre en fenêtre (Aperçu) avec un titre non cliquable, une quittance dans un nouvel onglet avec un titre cliquable, et le bail s'ouvre en fenêtre depuis Documents mais dans un nouvel onglet depuis l'accueil et « Mon logement ». |
| **TRV-03** — Fond du menu latéral : deux photos plein format (≈ 547 Ko) téléchargées au premier chargement pour un décor sous un voil | Mineure | partiel | Avant : au premier chargement, le menu latéral téléchargeait deux photos plein format, « quartier » (292 Ko) puis celle du jour (253 Ko), soit 547 Ko en 4G lente selon l'auditeur. Après : une seule photo (255 Ko). Avant l'hydratation, le menu reste bleu nuit uni au lieu d'afficher brièvement la photo « quartier » aussitôt remplacée. Après l'hydratation, l'affichage est identique au pixel près. |
| **TRV-04** — L'icône du site est le logo source : PNG de 2016×1594 et 285 Ko, non carré | Mineure | corrigé | Avant : l'icône de l'onglet était le logo source, un PNG de 2016×1594 et 287 Ko, chargé à chaque premier chargement. Après : une icône de 6 Ko, d'aspect identique dans l'onglet et sur l'écran d'accueil. |
| **TRV-08** — Zoom à 400 % : l'en-tête collant et la barre basse fixe occupent 54 à 61 % de la hauteur visible | Mineure | corrigé | Avant : au zoom de 400 % (320×256, 360×225), l'en-tête collant et la barre basse prenaient 54 à 61 % de la hauteur visible chez le propriétaire, et 52 à 59 % chez l'artisan. Après : sous 500 px de haut, l'en-tête défile avec la page et seule la barre de navigation basse reste fixe. |
| **TRV-11** — Liste du parc sur ordinateur : la grille à deux colonnes alignées laisse 24 % de surface vide, avec des trous jusqu'à 71 | Mineure | corrigé | Avant : dans « Biens & locations » sur ordinateur, chaque rangée de la grille prenait la hauteur du bien le plus long. Un immeuble à côté d'une maison laissait de grands trous : 35 % de la liste vide, trou de 1579 px avec 4 biens fictifs. Après : deux colonnes indépendantes, 7 % de vide et un trou maximal de 226 px. Au téléphone et sous 1101 px, la colonne unique est inchangée. |
| **TRV-12** — Le repère saisonnier occupe la zone d'actions de l'en-tête sans fonction, et n'est pas retiré à ≤ 420 px comme dans les  | Cosmétique | corrigé | Avant : à ≤ 420 px, le repère saisonnier occupait la zone d'actions de l'en-tête du propriétaire et de l'agence, entre « Rechercher » et le menu du compte, alors qu'il était déjà retiré des autres en-têtes. Après : il y est retiré aussi. |
| **TRV-13** — Onglet resté ouvert à minuit : la photo et le menu changent d'ambiance, la date affichée reste celle du rendu serveur | Cosmétique | corrigé | Avant : dans un onglet resté ouvert, la photo et le menu passaient au décor du lendemain à minuit, mais la date de l'accueil et le reste du tableau de bord gardaient la veille. Après : quand le jour de Paris change (à minuit ou au retour sur l'onglet), la page est rafraîchie depuis le serveur, date comprise. |
| **TRV-05** — 14 images d'ambiance (≈ 2,4 Mo) et le composant BandeauAccueil ajoutés par la PR sans aucune utilisation | Cosmétique | décision requise | Aucun effet pour l'utilisateur : fichiers jamais servis. Ils alourdissent le dépôt et le déploiement. |

Tests existants modifiés (justification du chantier) :
- app/tests/fenetres-modales-navigateur.test.ts : ajout d'un plugin rolldown (action serveur de recherche et next/link remplacés par des versions neutres) et d'une mise en page minimale dans le HTML du banc (voile en position fixe, sans Tailwind), pour qu'un geste de souris atteigne le voile ; nouveaux tests ajoutés. Assertions existantes inchangées, et toujours vertes sur le code d'origine.
- app/tests/fixtures/navigateur/banc-fenetres-modales.tsx : le banc installe la protection de saisie comme le layout racine, ajoute un formulaire suivi dans le contenu commun (placé avant « Dernier contrôle » : l'ordre de tabulation des anciens tests ne change pas), RechercheEspace, une Modale gardée montée et un espace à défiler. Les anciens tests passent sans modification.
- app/tests/ambiance-site.test.ts : ajout de vi.mock('next/navigation') : AmbianceSite appelle désormais useRouter() pour rafraîchir la page au changement de jour (changement voulu, TRV-13). Nouveau test ajouté, assertions existantes inchangées.

## 6. Tests exécutés après correction

### Par chantier (banc isolé de chaque chantier, avant intégration)
Chaque chantier a rejoué : reproduction de l'auditeur **avant** correction (défaut constaté) puis **après** (défaut
absent), `npm run lint`, `npm run typecheck`, les tests Vitest des modules touchés et voisins (y compris les tests SQL
de sa migration et de son retour arrière, joués dans une transaction), les specs e2e de son domaine, et le parcours dans
le navigateur aux gabarits 390×844 et 1440×900, dans les espaces concernés (propriétaire, agence, locataire, artisan,
supervision selon le composant). Le relecteur adverse a ensuite refait ces vérifications sur sa propre copie.

### Sur l'intégration partielle (bail + dépôt de documents + transversal, tête `385ea301`)
lint 0 · typecheck 0 · build OK · parcours navigateur **240 réussis**, 1 instable (`alias-espace:114`, réussi au second
essai), 0 échec · Vitest **11 565 réussis**, 1 échec (`fichier-signe-navigateur`, banc, identique à la référence).

### Sur l'intégration finale (sept chantiers, tête `0636ae58`, puis `05369286` après les correctifs d'intégration)
Première batterie (tête `0636ae58`) : lint 0 · typecheck 0 · build OK · parcours navigateur **249 réussis**, 1 instable
(`alias-espace:114`, réussi au second essai), 0 échec · Vitest 11 667 réussis, **8 échecs** : le défaut de banc connu et
**7 échecs d'interaction entre chantiers**, invisibles tant que chaque chantier était testé seul :
- `embeds-ambigus` : le contrôle des embarquements PostgREST ne lit que les constantes du fichier ; les champs du rapport
  de diagnostic (chantier diagnostics) étaient importés d'un autre module → constante locale dans les deux fichiers (le
  littéral, avec ses clés étrangères explicites, redevient contrôlable) ;
- `nouvelle-version-echeance` (test du chantier dépôt) : le faux client ignorait `.limit`, utilisé par la garde DOC-03 du
  chantier diagnostics → le faux client répond « aucun diagnostic en service » ; assertions inchangées ;
- `supervision-logement-consultation` : DOC-09 avait remplacé le lien direct vers le fichier par un bouton d'aperçu, y
  compris en consultation supervision où la règle du dépôt interdit toute commande → le lien direct est rétabli en
  lecture seule ; l'aperçu intégré ne vaut qu'en gestion ; le test attend désormais le bouton en gestion (changement
  voulu, DOC-09) et toujours le lien en consultation.
Correctifs commités en `05369286`, puis batterie rejouée :

lint 0 · typecheck 0 · build OK · parcours navigateur **250 réussis, 0 échec, 0 instable** (1 ignoré) · Vitest
**11 674 réussis**, 1 échec (`fichier-signe-navigateur`, banc Chromium, identique à la référence d'avant correction), 17
ignorés. Soit, par rapport à la référence : +15 parcours et +176 cas unitaires, aucun nouvel échec.

### Relecture adverse de l'intégration
Un relecteur indépendant a relu le diff complet (170 fichiers), rejoué les cinq migrations et leurs retours sur une base
jetable (432 migrations ; comparaison `pg_get_functiondef` de toutes les fonctions `public` avant/après : 7 fonctions
ajoutées, 1 signature retirée, 10 modifiées chacune limitée à sa correction ; retours joués en ordre inverse → texte
identique à l'état antérieur), exécuté les 124 fichiers de tests qui importent un module modifié, `tsc` et `eslint` sur
les 95 fichiers TS/TSX du lot, et vérifié les quatre résolutions de conflit. **Deux points bloquants**, identiques à deux
des interactions ci-dessus (`nouvelle-version-echeance`, `supervision-logement-consultation`), corrigés en `05369286`.
Points non bloquants retenus : le test SQL `assurance-locataire-activation-base` rejoue du DDL et passe en série
(`FICHIERS_EN_SERIE`) ; ordre des sections du 27/10 dans le `LISEZ-MOI` des retours. Points non bloquants laissés tels
quels, à connaître : quatre retours sur cinq sont écrits `begin … commit` (comme ceux du 24-26/10) alors que la note du
20/10 du `LISEZ-MOI` promet des retours annulables dans une transaction externe — dérive antérieure à ce lot, à
harmoniser ; `personnes/[personId]/page.tsx` écrit « bien · Lot unique » là où `libelleLot` replie sur le bien
(antérieur).

### Tests ajoutés (22 fichiers)
- Parcours navigateur : `alerte-impaye-proprietaire`, `brouillon-bail-saisie`, `depot-document-lot`,
  `diagnostic-rapport-range`, `incident-gerant-colocation`, `messages-locataire-sans-espace`.
- Tests SQL des migrations (jouées puis défaites dans une transaction) : `alerte-impaye-encaissement-base`,
  `incident-gerant-colocation-base`, `diagnostics-validite-rapports-base`, `assurance-locataire-activation-base`,
  `parcours-demarrage-pluriel-base`.
- Unitaires et rendu : `aide-proprietaire-questions`, `depot-direct-reprise`, `depot-direct-client-reprise`,
  `depot-document-lot`, `diagnostics-fiches-rendu`, `feuilles-espaces-navigateur`, `icone-site`, `libelle-lot`,
  `nouvelle-version-echeance`, `remplacer-rapport-diagnostic`.
- 101 cas ajoutés au total, chacun échouant sans la correction correspondante (vérifié par les chantiers).

## 7. Problèmes ouverts et décisions nécessaires

Les points ci-dessous ne sont pas des défauts non corrigés par oubli : ce sont des choix de produit ou de droits que
l'audit ne pouvait pas trancher seul. Chacun est décrit avec ce qui a été fait et ce qui reste.

- **LAT-03** (loyers, partiel) — Sur la ligne du bail, dans la fenêtre et dans « À faire », l'arriéré est visible : « 1 autre mois à recevoir sur ce bail », « 1 040,00 € au total », et la marque « Prioritaire » à partir de deux termes échus. La carte de l'accueil compte les échéances dues (« 7 loyers à confirmer »). Nouveau à cette reprise : l'en-tête « N à traiter » de « À faire » compte aussi les échéances, et non plus les baux. Sur VLA : « 15 À TRAITER », soit 10 demandes et « 5 à confirmer », au lieu de « 14 » face à « 5 à 
  - Reste : Décision requise : Finances (/espace/<org>/loyers) n'affiche toujours pas d'arriéré cumulé, seulement les échéances de la période. Faut-il un indicateur « arriéré à ce jour », et sous quelle forme ? L'unité retenue est l'échéance : la carte de l'accueil, la section des loyers et l'en-tête de « À faire » la partagent désormais. Le test d'origine de la PR « sans gonfler le compteur » comptait un bail pour une demande ; il est adapté (voir tests_existants_modifies). Si le produit préfère compter le
- **TRV-09** (loyers, décision requise) — Sur un parc de 300 lots, le tableau de bord rend toujours une tâche par lot et par obligation (des centaines de lignes), et /alertes n'est pas paginé.
  - Reste : Décisions attendues : (1) regrouper par nature, et lesquelles ? (2) vers quelle destination filtrée (par exemple Biens filtrés par obligation, à créer) ? (3) plafonner « Mes tâches » avec un lien vers la liste complète ? (4) paginer /alertes ?
- **FL-04** (fiche_lot, partiel) — La fenêtre « Nouveau propriétaire » demande la qualité dans la liste fermée (Personne physique, Indivision, SCI familiale, SCI, Personne morale), chacune avec son aide (bail nu de 3 ou 6 ans). Prénom, date et commune de naissance ne sont demandés, et obligatoires, que pour une personne physique. Une SCI familiale saisie sans prénom est enregistrée « SCI familiale » (bail nu de 3 ans), plus « Personne morale ». La carte « Propriétaires » affiche la qualité, et « bail nu de 6 ans » quand elle l'im
  - Reste : L'étape 2 du parcours du bail (personnes-bail.tsx, autre chantier) n'affiche ni la qualité ni la durée qui en découle. Les fiches créées avant la correction avec « Personne morale » par défaut ne sont pas reprises (aucune donnée réécrite) : à corriger depuis la fiche de la personne.
- **FL-10** (fiche_lot, partiel) — « 100 % . » devient « 100 % ». La fenêtre dit « La fiche complète se retrouve dans Locataires & garants » et « … une seule fiche de votre espace » chez le propriétaire, et garde les textes d'agence côté agence.
  - Reste : DÉCISION REQUISE : liste des propriétaires proposés chez le propriétaire direct. La limiter aux propriétaires existants et à « Nouvelle personne » empêche de désigner une fiche déjà enregistrée ; l'email étant unique dans l'espace, la recréer serait refusé et bloquerait le parcours. Autre choix : n'exclure que les locataires et garants de baux, au prix d'une lecture de plus. Choix produit.
- **FL-09** (fiche_lot, partiel) — La fiche d'Alice affiche « VERIF-LPI Coloc · Chambre 1 », celle de Paul « Garant de VerifLPI Alice ». Dans « Locataires & garants », Chloé est « Locataire · bail en préparation », puce neutre, comme sur sa fiche. Après la relecture : une fiche dont le seul bail est en préparation est de nouveau rangée sous le filtre « Sans bail en cours » (elle n'apparaissait plus dans aucun filtre de rôle), les compteurs se recoupent (Locataires 2 + Garants 1 + Propriétaires 2 + Sans bail en cours 4 = 9 fiches)
  - Reste : Non fait, choix de présentation : afficher les baux terminés repliés, adapter la carte d'accès d'un ancien locataire, alléger « Repères du dossier ».
- **DOC-N1** (diagnostics, partiel) — Chaque rapport de diagnostic de la bibliothèque nomme son bien, et son lot pour un diagnostic du logement. Deux ERP du même jour ne se confondent plus. Le volet porte « Rapport de diagnostic de <bien · lot> » avec un lien vers la fiche.
  - Reste : DÉCISION REQUISE (produit) : ajouter ou non un filtre par bien dans la bibliothèque propriétaire, et ajouter ou non le nom du bien au titre généré des nouveaux dépôts.
- **DOC-07** (diagnostics, partiel) — Le dépôt d'un CREP demande le « Résultat du constat ». S'il est positif, l'échéance est pré-remplie à six ans et devient obligatoire, et un CREP positif de plus de six ans s'affiche « Expiré ». S'il est négatif, l'aide dit « Sans limite de validité : laissez vide ».
  - Reste : DÉCISION REQUISE (modèle de données) : conserver le résultat du constat (nouvelle colonne, par exemple diagnostics.resultat_plomb) pour afficher « Valide sans limite » sur un CREP négatif, puis adapter presentationDiagnostic et exigences-diagnostics-bail.
- **FL-12** (incidents, partiel) — L'aide du propriétaire passe de 7 à 11 réponses, avec deux nouvelles rubriques, Biens et Incidents. Nouvelles réponses : qui paie un incident, location chambre par chambre, reprise d'un bail en préparation, pourquoi on ne peut pas écrire à un locataire. Chaque lien est nommé d'après l'écran qu'il ouvre. La réponse sur la colocation dit maintenant que la chambre n'est demandée que lorsque plusieurs chambres sont louées : c'est ce que fait le formulaire.
  - Reste : DÉCISION REQUISE pour les diagnostics : aucune réponse n'est ajoutée. concepts/Diagnostic.md signale des références « citées de mémoire — à confirmer » et des points à trancher, et le chantier diagnostics modifie leur qualification en parallèle. La liste des diagnostics exigés est à valider sur service-public.fr ou legifrance.gouv.fr (non revérifié en ligne ici), puis à rédiger avec ce chantier.
- **CB-09** (bail, partiel) — Sans locataire choisi, une seule correction « Choisir le locataire principal » remplace les cinq lignes d'identité, de naissance et d'adresse. Les mentions brutes ont un libellé lisible (Inventaire du mobilier, Classe énergie du DPE, Ville de votre profil, etc.).
  - Reste : Le ciblage vise toujours le titre de section, pas la carte de la personne. Le lien vers /profil n'a pas de paramètre de retour vers le bail : la page profil ne gère que retour=nouveau-lot, et la modifier sort de ce chantier.
- **CB-08** (bail, décision requise) — En relocation, le brouillon ne reprend toujours rien du bail précédent du lot (loyer, charges, échéance, IRL, précédente location).
- **CB-14** (bail, décision requise) — L'inventaire du meublé se saisit toujours meuble par meuble ; la liste du décret n'est qu'un rappel.
- **DOC-13** (depot_documents, partiel) — Redéposer le même fichier refusé comme doublon ne consomme plus le quota. Sur le banc, 22 essais consécutifs laissent le nombre de réservations de l'heure à 8, au lieu de bloquer au 17e essai. Un transfert interrompu puis relancé ne consomme pas non plus de nouvelle réservation. Un fichier invalide (format, PDF tronqué, fichier vide, image illisible) est refusé dans le navigateur avant toute réservation. Quand la limite est atteinte, le message donne la cause et l'heure de reprise : « Vous avez 
  - Reste : Le PREMIER essai d'un doublon consomme encore une réservation, car ses octets ont réellement transité avant le contrôle métier. Ne pas le compter rouvrirait l'abus de stockage que le quota borne, sauf à libérer côté serveur l'objet transité. L'alternative serait un contrôle d'empreinte avant transfert, propre à chaque parcours et à son organisation. Le seuil de 20 par heure pour l'installation d'un parc reste lui aussi une décision produit : la limite est voulue et testée par tests/depot-direct-
- **DOC-10** (depot_documents, partiel) — Images : un PNG ou un JPEG dont seule la signature est valide est refusé avant tout transfert avec le message « L'image « … » est endommagée ou illisible. Choisissez une photo ou un scan qui s'ouvre sur votre appareil. » Une image valide passe. Aucune bibliothèque n'est chargée : le contrôle utilise le décodeur natif du navigateur (createImageBitmap), qui s'applique à tous les espaces utilisant le dépôt direct. PDF : le PDF corrompu de l'auditeur est toujours accepté (décision requise ci-dessous
  - Reste : DÉCISION REQUISE pour les PDF. pdf.js (pdfjs-dist 6.4.299) n'est PAS chargé sur la page de dépôt : LecteurDocument l'importe dynamiquement pour l'aperçu seulement. L'ouvrir avant transfert ajouterait au premier dépôt environ 433 Ko de module et 1,26 Mo de worker (tailles brutes) dans tous les formulaires à dépôt direct. Plusieurs fixtures e2e de PDF minimaux, sans xref (alias-espace, personne-reprise, invitation-artisan), seraient aussi à revoir. Un contrôle structurel sans pdf.js (startxref ava
- **ED-03** (transversal, partiel) — Avant : dans l'espace locataire d'une agence à charte, le bouton d'action principal (« Signaler un problème ») restait doré, la couleur de Gerimmo, au milieu d'une page aux couleurs de l'agence. Après : il prend la couleur de l'agence, avec un texte blanc. Sans charte, l'or reste.
  - Reste : Décision requise : faut-il masquer le décor saisonnier de Gerimmo (citrouille de l'en-tête, photo d'ambiance du menu) quand une charte d'agence est active ? Le wiki (concepts/Marque blanche.md) définit l'habillage par le logo et deux couleurs, sans rien dire du décor saisonnier : ce n'est pas implémenté.
- **ED-04** (transversal, décision requise) — Dans « Mes documents » du locataire, une pièce s'ouvre en fenêtre (Aperçu) avec un titre non cliquable, une quittance dans un nouvel onglet avec un titre cliquable, et le bail s'ouvre en fenêtre depuis Documents mais dans un nouvel onglet depuis l'accueil et « Mon logement ».
  - Reste : Décision attendue : aperçu en fenêtre partout (Modale ApercuDocumentEspace), ou nouvel onglet partout, pour le bail signé, les pièces et les quittances, depuis Documents, l'accueil et « Mon logement ». Une fois le geste choisi, le titre de chaque rang le déclenche (règle du 24/09) et le commentaire est mis à jour.
- **TRV-03** (transversal, partiel) — Avant : au premier chargement, le menu latéral téléchargeait deux photos plein format, « quartier » (292 Ko) puis celle du jour (253 Ko), soit 547 Ko en 4G lente selon l'auditeur. Après : une seule photo (255 Ko). Avant l'hydratation, le menu reste bleu nuit uni au lieu d'afficher brièvement la photo « quartier » aussitôt remplacée. Après l'hydratation, l'affichage est identique au pixel près.
  - Reste : La photo du jour reste servie plein format (1400×933, 140 à 385 Ko) sous un voile de 84 %. Des variantes réduites pour les fonds voilés imposeraient 15 fichiers de plus dans public/ (le tableau de bord, lui, passe par next/image). Estimation mesurée (fonds-estimation.cjs, WebP q60, voile composé) : halloween 253 → 154 Ko, écart moyen 0,61/255, p99 3/255 ; total 4,0 → 2,5 Mo. Le gain par premier chargement est à arbitrer contre le poids ajouté au dépôt (voir aussi TRV-05) : non fait.
- **TRV-05** (transversal, décision requise) — Aucun effet pour l'utilisateur : fichiers jamais servis. Ils alourdissent le dépôt et le déploiement.
  - Reste : Décision attendue : supprimer les deux dossiers (14 images, ≈ 2,4 Mo) et le composant BandeauAccueil avec son module CSS, ou les conserver pour un usage prévu. Usage actuel : aucun.

Défauts antérieurs à la refonte relevés en passant, non traités (hors périmètre, à planifier) :
- droits de l'agent restreint sur les pièces citées par un diagnostic (sécurité, chantier diagnostics) ;
- un double clic forcé sur « Enregistrer et continuer » peut enregistrer aussi l'étape suivante (sans perte de données) ;
- à exactement 900 px, le logo doré de la supervision reste visible sur le panneau clair ;
- procédure `fermetures_comptes_nuit` (24/10) sans `search_path` fixe (avertissement Supabase), par construction d'une
  procédure qui valide ; à documenter.

## 8. Preuves

- **Captures avant/après** (47 fichiers WebP, 1,6 Mo) : `app/docs/preuves-audit-264/` — nommées par constat, gabarit
  (`tel` = 390×844, `ordi` = 1440×900) et moment (`avant`, `apres`).
- **Reproductions** : chaque constat de l'annexe B porte ses étapes de reproduction, sa preuve (sortie, requête, capture)
  et sa cause dans `app/docs/preuves-audit-264/constats.json` (extraction des rapports des auditeurs et des
  vérificateurs). Les tests ajoutés (§ 6) sont les reproductions durables.
- **Rapports des chantiers** (statut par constat, correction, vérification avant/après, tests, limites) :
  `app/docs/preuves-audit-264/corrections.json`.
- Les scripts navigateur, journaux et 1 477 captures brutes des auditeurs (375 Mo) restent dans l'espace de travail de
  la session (`scratchpad/audit-264/`), non versionnés.

## 9. Limites de l'audit et points non vérifiés

- Site de production, `etat.json` et dossier local du poste injoignables (§ 1) : la correspondance code/production a été
  établie par GitHub, Vercel et la base ; l'« état de publication » attendu dans `etat.json` n'a pas pu être lu.
- Banc : Chromium 1243 au lieu de la version attendue par Playwright 1.64.1 (un test de téléchargement échoue pour
  cette seule raison) ; **WebKit mobile non rejoué** (étape CI `test:e2e:webkit`, navigateur absent du conteneur) ;
  pg_cron non exécuté (les tâches de nuit sont appelées à la main dans les tests) ; stockage émulé : la reprise d'une
  réservation de dépôt (`createSignedUploadUrl` sur un chemin déjà réservé, `list({search})`) est à confirmer sur
  Supabase Storage réel en recette.
- Règles réglementaires : DPE (décret n° 2020-1610) confirmé par deux sources officielles ; CREP (art. L. 1334-7 et
  R. 1334-11 CSP : 6 ans si présence de plomb, illimité si absence) et durées de bail (art. 10, 13, 25-7 de la loi
  n° 89-462) repris du code et du wiki, **non revérifiés en ligne**.
- Les espaces artisan et supervision ont été parcourus mais avec moins de profondeur que l'espace propriétaire (cible de
  la mission) ; l'aperçu (modale) de l'artisan n'a pas été exercé (aucune attestation dans les données de parcours).
- Grand parc : mesuré avec 300 lots fictifs (TRV-09, décision requise), pas au-delà.
- Les tests de production (« Recette de production avec nettoyage ») n'ont pas été lancés : ils relèvent de l'étape de
  publication.

### Ce que les contrôles de publication ne couvraient pas (et qui est maintenant couvert ou documenté)

### loyers-accueil
Non couvert par les tests existants :
- Aucun test ne vérifie la fermeture de l'alerte loyer_impaye après declarer_reception_loyer, ni après un encaissement depuis le bail (tests/reception-loyer-base.test.ts et e2e/reception-loyer-proprietaire.spec.ts ne lisent pas alerts).
- tests/verifications-proprietaire.test.ts ne distingue pas une alerte d'impayé d'un bail soldé d'une alerte d'un bail encore débiteur : l'alerte « autre-bail » reste critique dans tous les cas.
- Contenu du courriel de relance du tableau de bord quand plusieurs échéances sont dues : tests/relance-reception-loyer.test.ts ne vérifie que « 600,00 », jamais la dette totale.
- Rattachement d'une relance à l'échéance qu'elle vise : le test du dépôt fige au contraire la règle « toute relance datée d'après l'échéance ».
- Égalité entre le chiffre de la carte « À vérifier » et le compteur de « Mes tâches ».
- Distinction des tâches et des rappels de chambres d'une même colocation.
- Cohérence entre la tuile « Encaissé en <mois> » et les indicateurs de Finances.
- Parcours navigateur avec la synthèse d'alertes de connexion : les scripts e2e et ceux de l'auditeur la neutralisent par sessionStorage, alors qu'elle affiche des chiffres (« 5 alertes, dont 2 critiques ») différents de l'accueil qu'elle recouvre.
- Coût du layout propriétaire : aucun test ne garantit l'absence de lectures inutiles.
Vérifié sans défaut :
- Deux confirmations successives « J'ai reçu le loyer » enregistrent exactement deux encaissements (un par échéance), sans doublon. La fiche du bail affiche alors « Reste dû 0,00 € à jour » et deux quittances (v01-alerte.txt, v-reception.txt).
- Après réception, la ligne suivante du même bail apparaît bien (octobre après septembre) avec le bon montant (v-reception.txt).
- La tâche de nuit suivre_impayes_bail ferme les alertes des baux soldés avec le motif « Impayé soldé » et conserve celle d'un bail encore débiteur (v-fermeture-nocturne.out, transaction annulée).
- « Traiter » sur une alerte loyer_impaye mène bien à la carte des loyers du bail (#loyers), conformément à chemin-alerte.ts.
- Chaque bail de chambre a sa propre ligne de rappel, avec le nom de son locataire.
- Le texte de confirmation de la relance annonce clairement le destinataire et l'absence d'envoi automatique. L'envoi exige la case de confirmation (tests existants rejoués via le même banc de doubles).
- Pas de défilement horizontal à 390 px sur l'accueil ni dans la fenêtre des loyers (SCROLLX 0 dans v-initial.txt).
- Une relance automatique passe total_du au courriel (missions-planifiees/relances.ts l.139) : seul le chemin du tableau de bord est en défaut.
Réfutés / limites : Vérifications faites uniquement sur le banc local. Le dossier de l'auditeur s'appelle audit-264/loyers-alertes et non loyers-accueil. Ses scripts et sorties y ont été relus. Mes scripts, sorties et captures sont dans /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/audit-264/verif-loyers-accueil/. Pour ne pas dépendre de l'état laissé par l'auditeur, j'ai créé une organisation fictive à moi dans gerimmo_ci_sql_api : « VLA Parc Verif » (b2b20000-0000-4000-8000-00000000bb02), compte vla.proprio@example.com, cinq baux préfixés VLA. Ses réceptions et alertes y restent, sans suppression. Le contrôle SQL de LAT-01 a été rejoué dans une transaction annulée sur gerimmo_ci_sql. Aucun courriel n'a été envoyé : le contenu de la relance (NEW-01) est reconstruit par l'action serveur réelle, avec envoyerEmail intercepté dans un test hors dépôt.

Aucun constat n'est r

### lot-personnes-incidents
Non couvert par les tests existants :
- Incident ouvert par le gérant sur un lot à plusieurs baux vivants (colocation à baux individuels) : aucun test SQL ni d'action. tests/sprint7-incidents.test.ts et tests/incident-declaration.test.ts passent (32 tests) sans couvrir ce cas.
- Contestation ou réouverture par un « déclarant » que le gérant a désigné d'office (FL-01).
- commencerBail sur un lot qui a déjà un brouillon (tests/etapes-bail-actions.test.ts n'attend qu'une insertion par appel).
- Formulaire de dépense de la fiche du lot : date de pièce et TEOM absents, aucun test de composant.
- Qualité déduite de l'absence de prénom dans ajouterDetention (parc.ts:439).
- Cohérence entre avancementLot (liste des biens) et l'encart « À compléter » de la fiche.
- Loyer du résumé agence quand plusieurs baux sont en cours.
- Cible des liens #baux selon la vue (propriétaire ou agence).
Vérifié sans défaut :
- Vue propriétaire de la fiche du lot : « Locations en cours · 2 contrats · 970,00 € / mois CC », bon total (seul le résumé agence est faux).
- Liste « Locataires & garants » de la fiche du lot : le garant y est bien nommé « Garant de VerifLPI Alice ».
- Déclaration d'incident par le locataire (declarer_mon_incident) : rattachée à son propre bail, y compris en colocation à baux individuels.
- Le formulaire de comptabilité complet propose bien date de pièce, date d'imputation et TEOM (formulaire-compta.tsx:316-325).
- Les déclencheurs acceptent deux baux de colocation individuels actifs sur un même lot (avec loyer de référence) : la situation de FL-01 est atteignable hors banc.
- Écritures comptables non modifiables ni supprimables par l'utilisateur (politiques SELECT et INSERT seulement), conformément à la FAQ.
- Les 7 réponses de la FAQ concordent avec le code consulté (fiscal.ts : meublé exclu de la 2044, quote-part d'indivision).
Réfutés / limites : Aucun constat réfuté : les 12 sont reproduits avec mes propres données et scripts dans /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/audit-264/verif-lot-personnes-incidents/ (fixtures.sql, fl01-complet.sql/.out, fl01-imputation.sql/.out, fl01-form.mjs, fl02.mjs à fl11.mjs, captures PNG). Gravités maintenues. FL-01 est renforcé : le mauvais colocataire voit aussi la décision « dégradation fautive » et peut la contester en son nom. Deux nuances corrigées : FL-02 se produit à chaque passage par la fiche (le clic redirige vers le nouveau brouillon) plutôt qu'à chaque clic ; dans FL-03, la taxe foncière n'entre pas d'office dans la 2044, elle reste à qualifier, mais aucune qualification ne permet de corriger la date ni d'isoler la TEOM. Problème de banc relevé : les données de l'auditeur (fiche-lot/fixtures.sql) avaient été insérées sans déclencheurs (ses

### documents-diagnostics
Non couvert par les tests existants :
- Régime transitoire du DPE (2013-2017 jusqu'au 31/12/2022, 01/01/2018-30/06/2021 jusqu'au 31/12/2024) : tests/documents-bail.test.ts ne vérifie que +10 ans (l.15).
- deposerDiagnostic face à un doublon de type « autre » ou « courrier » de la même organisation : seul le cas « identité » est testé (tests/diagnostic-piece-existante-action.test.ts:130).
- Effet de remplacer_document_ged sur diagnostics.document_id (aucun test).
- presentationDocument et documents_a_renouveler pour une pièce de type diagnostic dont l'échéance vit dans diagnostics.
- Contexte du lot lors d'un dépôt lancé depuis « Autres documents » (fenetre-lot.tsx:1099).
- Libellés des lots homonymes dans « Lier à une fiche » (pane-document.tsx:277).
- Pré-remplissage et validation serveur de expire_le dans formulaire-remplacer et remplacerDocument, y compris l'impossibilité de corriger une échéance.
- Identification du bien ou du lot d'un rapport de diagnostic dans la bibliothèque Documents.
- Décompte des essais refusés dans le quota horaire : tests/depot-direct-base.test.ts:19 ne vérifie que le plafond de 20.
- Résultat du CREP (positif ou négatif) et règle des 6 ans.
Vérifié sans défaut :
- Un DPE réalisé le 10/03/2014 apparaît « Expiré · à renouveler » sur le lot et bloque la location (v04, v13).
- ERP réalisé le 01/10/2026 : échéance pré-remplie au 01/04/2027 (6 mois), statut Valide, blocage ERP levé (v09-12).
- Le trigger archiver_diagnostic_remplace archive l'ancien diagnostic de même type et de même niveau à chaque dépôt.
- Les politiques RLS de documents et de diagnostics limitent la lecture aux rôles admin_agence, agent et proprietaire_direct de l'organisation, plus le superadmin, sans accès locataire direct.
- document_dans_portefeuille couvre les rapports de diagnostic d'un lot ou d'un bien du portefeuille d'un agent restreint.
- documents_courants rattache bien les rapports de diagnostic au périmètre de lots (p_lots).
- Tests unitaires documents-bail, presentation-document et diagnostic-piece-existante-action : 38 réussis (npx vitest run, SUPABASE_DB_URL du banc).
- La proposition « Utiliser cette pièce » existe bien pour un doublon de type diagnostic (couverte par les tests).
Réfutés / limites : Aucun constat réfuté : les 13 ont été rejoués sur un compte propriétaire isolé, créé pour cette vérification (vdd.proprio@example.com, organisation d4d40000-0000-4000-8000-00000000dd02, données préfixées VDD, créées par compte.sql et seed.mjs dans /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/audit-264/verif-documents-diagnostics/). Aucune donnée d'un autre auditeur n'a été touchée. Gravités corrigées : DOC-07 passe de majeure à mineure, car le lot comme le bail affichent « Validité à vérifier » avec l'action « Vérifier le rapport », jamais « Valide ». Le « bail : Disponible » de l'auditeur provenait de statutPieceDiagnostic, que l'écran du bail n'affiche pas tel quel. Les autres gravités sont maintenues. DOC-02 reste critique : aucune issue dans l'application, et le même PDF retéléchargé est refusé à l'identique. Preuves de l'auditeur rectifiées : p

### bail
Non couvert par les tests existants :
- Concurrence sur un brouillon de bail : tests/etapes-bail-actions.test.ts l. 19 vérifie eq('loyer_hc', 500) sur la valeur relue, ce qui valide la garde inefficace ; aucun test à deux onglets ni à révision.
- Fiche du lot : aucun test de l'en-tête quand un brouillon existe (le seul e2e, dossier-proprietaire.spec.ts l. 125, clique « Commencer un bail » sur un lot neuf).
- Choix du brouillon « à reprendre » quand il y en a plusieurs (tri created_at desc).
- Tâches de l'accueil et parc : aucun test ne couvre un lot qui a un bail en brouillon (pilotage-proprietaire.test.ts, taches-accueil-proprietaire.test.ts), ni le filtre « En préparation ».
- Imputation des manques de l'en-tête (profil de l'organisation) aux parties dans correctionsRecapBail.
- Changement d'étape sans enregistrer : aucun indicateur d'étape modifiée dans le fil ni au récapitulatif.
- Mention « loyer + charges, montant au prorata » quand la date d'entrée manque.
- Complément de loyer facultatif dans rubriquesRecapBail.
- Reprise du bail précédent à la création d'un brouillon (relocation).
- Bouton Retour du navigateur dans l'assistant.
- Focus sur une carte dont le seul champ est dans un <details> fermé (#reglement-copro).
- Pluriels « bailx », « Bails à finaliser », « bails en cours » et format de la quote-part.
Vérifié sans défaut :
- Quitter la page de l'assistant par un lien ou un rechargement alors qu'une étape masquée est modifiée : la confirmation « Des modifications ne sont pas encore enregistrées… » apparaît bien (protection-saisie.ts). Seule la navigation interne à l'assistant est silencieuse (CB-05).
- Contrat individuel de colocation : stocké comme type 'colocation' avec chambre_id, comme prévu par lireEtapeBail (l. 52-55). Ce n'est pas un défaut.
- Plafond du dépôt de garantie appliqué : 1000,01 € refusé pour un meublé à 500 € (seul le libellé du message est en cause, CB-16).
- Le PDF imprime correctement « Complément de loyer : néant » quand le complément est vide (le défaut CB-07 ne concerne que le récapitulatif).
- La RPC choisir_personne_bail refuse bien un colocataire sur un bail nu (seul le texte est obsolète, CB-15).
- Porte D29-B : /parc/nouveau impose un profil complet (adresse et e-mail) au propriétaire direct avant la création d'un bien, ce qui limite la portée de CB-04.
- Tests unitaires du domaine : vitest sur etapes-bail-actions, presentation-recapitulatif-bail, pilotage-proprietaire, taches-accueil-proprietaire et champs-bail-parcours, 116 tests sur 116 réussis.
Réfutés / limites : Aucun constat n'est réfuté en entier : les 16 constats sont reproduits, avec les corrections suivantes. Gravité de CB-01 ramenée de critique à majeure : il faut deux sessions simultanées, et la valeur finale est celle que montre le récapitulatif avant la génération. Gravité de CB-04 ramenée de majeure à mineure : pour la cible principale, le cas suppose un profil d'organisation vide, ce que la porte D29-B empêche dans le parcours standard ; il reste possible via /parc/import, côté agence ou dans un banc semé sans profil, et un lien vers /profil figure alors dans la même liste. Dans CB-16, la partie « 100.00 % » est en grande partie un artefact du banc : l'émulateur renvoie numeric en texte, alors que PostgREST renverrait 100 ; seul le format décimal (« 33.33 % ») est retenu. Dans CB-05, la preuve de l'auditeur est corrigée : quitter la page par un lien déclenche bien la confirmation, et 

### espaces-droits
Non couvert par les tests existants :
- Après l'activation du bail : aucun test ne vérifie que la pièce pieces_attendues_bail 'assurance_locataire' est relue par mes_pieces_locataire, generer_alertes_assurance ou la fiche du bail actif (les 50 tests des trois fichiers pieces-attendues-bail-* et recapitulatif-pieces-bail ne couvrent que le brouillon).
- Cascade CSS : aucun test ne croise la classe experience-unifiee avec styleMarque (tests/marque-organisation.test.ts ne contrôle que les valeurs des variables).
- Aucun test de contraste du menu de supervision sous 901 px ; aucun test ne mentionne experience-unifiee.
- Aucun test de cohérence des gestes de consultation (modale ou nouvel onglet) entre les rangs de « Mes documents », l'accueil et « Mon logement » du locataire.
- Aucun test de mise en page de l'en-tête du locataire à 390 px (marge de la tuile du logo sur fond sombre).
Vérifié sans défaut :
- Barre d'onglets du bas de l'espace locataire à 390 px : liens rgb(94,108,125) sur fond blanc (.coquille-basse), contraste suffisant.
- Menu complet du locataire ouvert à 390 et 640 px : aucun lien visible sous 4,5:1 (le seul relevé, « Agence Alpha — Accueil », est un texte sr-only mesuré par erreur ; le libellé visible est rgb(22,36,58) sur blanc).
- Barre latérale du locataire à 1440 px : son fond bleu nuit précède la PR (var(--prestige-nuit) dans 98223ad2) ; ce n'est pas une régression de marque blanche. Seuls .btn-or et le décor saisonnier sont en cause.
- Titres et liens de l'espace locataire d'une agence à charte réelle : la couleur secondaire (titres rgb(59,31,92)) et la couleur primaire (lien « signalez-le ici ») s'appliquent bien avec la PR.
- activer_bail et les 17 déclencheurs de la table baux ne touchent ni document_liens ni pieces_attendues_bail : l'activation simulée par UPDATE dans les sondes ne fausse pas la conclusion d'ED-01.
- Tests unitaires tests/pieces-attendues-bail-base.test.ts, tests/recapitulatif-pieces-bail.test.ts et tests/pieces-attendues-bail-actions.test.ts : 50/50 verts sur gerimmo_ci_sql.
Réfutés / limites : Aucun constat réfuté : les cinq sont reproduits, avec leur cause dans le code. Corrections apportées : ED-02 passe de majeure à mineure. Le défaut est réel et propre à la PR, mais il touche seulement l'espace interne de supervision, hors parcours du propriétaire ; le menu reste opérable, la mesure donne de 2,0 à 2,9:1 (pas de perte d'information ni d'action sans effet, et rien à 1440 px). ED-04 : j'ai retiré l'argument du « doublon Télécharger ». Le bouton de la visionneuse et le lien du rang ne sont jamais visibles en même temps : la modale recouvre la liste. ED-03 : j'ai écarté la barre latérale bleu nuit, présente avant la PR. Pour ED-01 et ED-02, j'ai réutilisé les données de l'auditeur. Pour ED-03 et ED-05, j'ai créé de vraies données fictives sur gerimmo_ci_sql_api, préfixées VED : organisation « VED Agence Marque Verte » a540c5e1-…, compte verif-espaces-droits.locataire@example.co

### transversal-design
Non couvert par les tests existants :
- Fermeture d'une Modale ou de la recherche quand l'appui commence dans la fenêtre et le relâchement a lieu sur le voile (tests/fenetres-modales-navigateur.test.ts ne teste que le clavier)
- Règle de fermerModale (détention, champs-bail) : une fiche avec seulement adresse, CP, ville ou prénom est effacée au clic sur le voile
- Raccourci Ctrl+K quand une Modale montée-masquée (prop ouverte, nouveau dans la PR) est présente dans le DOM
- Retour du focus et verrou de défilement de la fenêtre de recherche native (RechercheEspace, RechercheSupervision)
- Nombre et poids des images de fond de menu au premier chargement (double téléchargement selon l'hydratation)
- Poids et dimensions du favicon (metadata.icons)
- Actifs orphelins dans public/illustrations
- Tableau de bord propriétaire dans le barrage axe, et étiquette wcag21a dans les contrôles axe propriétaire
- Part de hauteur prise par l'en-tête et la barre basse aux faibles hauteurs (zoom 400 %)
- Regroupement des tâches et volume du DOM pour un grand parc
- Animation infinie de la carte rouge (hors prefers-reduced-motion)
- Espaces vides de la grille du parc sur ordinateur
- Cohérence date / décor après la bascule de minuit
Vérifié sans défaut :
- Glisser à l'intérieur de la Modale, jusqu'à son bord, ne la ferme pas (trv01.cjs, cas D)
- Avec le nom saisi, une fermeture involontaire de « Nouveau propriétaire » conserve la saisie et affiche le résumé « modifier » (trv01.cjs, cas C)
- Modale et Tiroir : verrou de défilement et focus rendu au déclencheur via useFenetreModale (témoin fenetres.cjs de l'auditeur, cohérent avec use-fenetre-modale.ts)
- La carte rouge ne s'anime plus sous prefers-reduced-motion: reduce (trv10.cjs, animations [])
- En-tête propriétaire sans débordement horizontal à 320 et 390 px ; repère masqué dans l'en-tête locataire à 320 px (trv12.cjs)
- Locataire : une seule image de fond de menu ; téléphone propriétaire (390 px) : aucune image de fond plein format, seulement next/image de 12 Ko (trv03.cjs, double-fond-4g.cjs)
- Au téléphone (390×844) et en paysage (844×390), les barres fixes n'occupent que 16 à 19 % de la hauteur (trv08.cjs)
- Le bouton « Rechercher » ouvre toujours la recherche, même quand Ctrl+K est inerte (ctrlk2.cjs)
- Les 15 images accueil-evenements utilisées sont bien référencées par ambiance-accueil.ts et photo-ambiance.tsx
Réfutés / limites : CONSTAT RÉFUTÉ ET RETIRÉ : TRV-07 (« serveur injoignable alors que le navigateur se croit en ligne : page d'erreur de Chrome »). Le comportement est voulu et documenté. src/lib/repli-hors-ligne.ts, lignes 13-15, l'écrit en toutes lettres : « Limite assumée : navigator.onLine ne dit "hors ligne" que lorsque l'appareil n'a plus aucun réseau […] Un réseau présent mais mourant passe pour "en ligne" : la navigation échoue alors comme avant. Seul un service worker saurait traiter ce cas. » C'est la décision D26-B du wiki (wiki/syntheses/Décisions groupées — version candidate du 13 octobre 2026.md, ligne 200 : option B retenue sans service worker, l'option C étant exclue avant D14), livrée avant la PR #264 (DES-A-06, PR #184). C'est une limite de conception acceptée, pas un défaut de la PR ; à rouvrir au besoin comme décision produit. GRAVITÉS CORRIGÉES : TRV-01 passe de majeure à mineure. Le g

## 10. Migrations et précautions de déploiement

Cinq migrations, à appliquer **dans cet ordre, avant le code**, par le chantier GitHub « Migrations Supabase »
(simulation = vrai d'abord, puis application ; sauvegarde réussie depuis moins de 90 min ; CI verte sur la révision) :

| Migration | Objet | Données réécrites | Retour arrière |
|---|---|---|---|
| `20261027100000_alerte_impaye_suit_encaissements.sql` | déclencheur sur `encaissements` qui rappelle `suivre_impayes_bail` ; réouverture d'une alerte fermée automatiquement « Impayé soldé » | aucune (pas de rattrapage) | `….retour.sql` (revérifié : empreinte identique à l'état antérieur, un seul déclencheur après rejeu) |
| `20261027100100_incident_gerant_bail_explicite.sql` | `ouvrir_incident_agence(p_bail)` : bail choisi ou seul bail vivant, jamais de déclarant pour le gérant ; `fiche_lot` et `historique_du_lot` filtrées par titulaire (remplacement à compte exact d'occurrences : la migration s'arrête si la définition en vigueur diffère) | aucune ; **relevé** `retours-arriere/releve-incidents-gerant-colocation.sql` à exécuter en lecture seule après déploiement (0 incident concerné en production au 27/10) | `….retour.sql` (DO atomique) |
| `20261027100200_diagnostics_validite_dpe_et_rapports.sql` | plafond réglementaire du DPE à la lecture (`lot_blocages_location`, `generer_alertes_diagnostics`), `reclasser_rapport_diagnostic` (rapport déjà rangé → diagnostic, refus si partagé au locataire ou en signature), rapports à renouveler | aucune (plafond à la lecture, échéances enregistrées inchangées) | `….retour.sql` ; **hors de la chaîne « Ordre complet »**, à jouer avant le retour de `20261014200000` |
| `20261027100300_bail_assurance_activation_et_libelle_colocation.sql` | déclencheur : à l'activation du bail, l'assurance du locataire classée est rattachée aux locataires engagés ; message de `choisir_personne_bail` | **ajoute** des liens `document_liens` « personne » pour les baux actifs/préavis ayant une assurance classée (0 en production au 27/10) ; rien modifié ni supprimé | `….retour.sql` |
| `20261027100500_parcours_demarrage_pluriel_baux.sql` | `parcours_demarrage` : pluriel « baux » | aucune | `….retour.sql` |

Précautions :
- `lot_blocages_location` en production diffère du dépôt par la mise en forme seulement (commentaire « Loi Climat »,
  déclarations sur plusieurs lignes ; logique identique, vérifiée le 27/10) : son remplacement complet par
  `20261027100200` est sûr. Les 12 autres fonctions clés sont identiques au dépôt (empreinte du corps).
- Le manifeste `e2e/local/ordre-migrations.txt` et `MISSION_OCTOBRE` listent les cinq fichiers dans cet ordre ; la tête
  de la chaîne « Ordre complet si tout doit être défait » du `LISEZ-MOI.md` devient `20261027100000` (seule migration
  du lot citant `aujourdhui_paris()`), figée par `vente-impaye-base` et `activation-inactivite-v1-base`.
- Code : l'ancien code à 7 arguments fonctionne avec la nouvelle `ouvrir_incident_agence` (défauts), donc migrations
  d'abord puis code, comme le protocole. Nouveaux fichiers binaires à déployer : `public/logo/gerimmo-icone-96.png` et
  `-228.png` (les navigateurs gardent l'ancienne icône jusqu'à revalidation du cache court de `/logo`).
- Après déploiement : « Recette de production avec nettoyage » ; vérification en lecture seule des cinq versions dans
  `supabase_migrations.schema_migrations`, des déclencheurs `encaissements_alerte_impaye*`,
  `baux_assurance_locataire_activation`, et qu'aucune fonction nouvelle n'est ouverte à `anon`.
- Wiki à mettre à jour (hors code) : `concepts/Incident.md` (« l'agent peut saisir pour lui » → bail choisi ou unique,
  jamais de déclarant pour le gérant), `processus/Cycle de vie d'un incident.md`, `concepts/Diagnostic.md` (« 10 ans » →
  régime transitoire du DPE), `concepts/Alerte.md` ou équivalent (l'alerte d'impayé suit les encaissements).

## Annexe A — Sources

- DPE, durée de validité : décret n° 2020-1610 du 17/12/2020, art. 1 (art. D.134-4-2 CCH) — 10 ans ; réalisés du
  01/01/2013 au 31/12/2017 : valides jusqu'au 31/12/2022 ; du 01/01/2018 au 30/06/2021 : jusqu'au 31/12/2024.
  https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000042695192 ; confirmé par le ministère :
  https://www.ecologie.gouv.fr/politiques-publiques/diagnostic-performance-energetique-dpe
- CREP : art. L. 1334-7 et R. 1334-11 du code de la santé publique (repris du code du dépôt, non revérifiés en ligne).
- Durée du bail et dépôt de garantie : loi n° 89-462 du 6 juillet 1989, art. 10, 13, 22, 25-7 (repris du code et du
  wiki, non revérifiés en ligne).
- Accessibilité : WCAG 2.1 (1.4.3 contraste, 2.2.2 mettre en pause, 2.4.3 parcours du focus, 2.5.3 étiquette dans le
  nom, 1.4.10 redistribution à 320 px) ; mesures axe-core.

## Annexe B — Liste complète des constats

| Id | Domaine | Gravité | Titre | Chantier |
|---|---|---|---|---|
| DOC-02 | documents-diagnostics | Critique | Impasse : un rapport déjà rangé dans « Documents » (type Autre) ne peut plus être déclaré comme diagnostic | diagnostics |
| FL-01 | lot-personnes-incidents | Critique | Colocation à baux individuels : l'incident déclaré par le propriétaire (ou l'agence) est rattaché au bail le plus récent du lot. Ce colocata | incidents |
| CB-01 | bail | Majeure | Deux onglets (ou deux collaborateurs) sur le même brouillon : l'onglet resté ouvert écrase sans prévenir un loyer déjà enregistré | bail |
| CB-02 | bail | Majeure | Le bouton d'en-tête « Commencer un bail » crée un nouveau brouillon alors qu'un brouillon existe ; « Reprendre le bail » ouvre ensuite le br | fiche_lot |
| CB-03 | bail | Majeure | Un bail en préparation disparaît des tâches du tableau de bord et n'apparaît nulle part dans le parc, même avec le filtre « En préparation » | fiche_lot |
| CB-05 | bail | Majeure | Changer d'étape par le fil d'étapes sans enregistrer : la saisie reste affichée mais n'est pas enregistrée, et rien ne le signale dans l'ass | bail |
| DOC-01 | documents-diagnostics | Majeure | Un DPE réalisé entre 2018 et juin 2021 s'affiche « Valide » jusqu'en 2028-2031 et lève le blocage de mise en location | diagnostics |
| DOC-03 | documents-diagnostics | Majeure | « Nouvelle version » d'un rapport de diagnostic dans Documents n'a aucun effet sur le lot, qui continue d'ouvrir l'ancien fichier | diagnostics |
| DOC-04 | documents-diagnostics | Majeure | La bibliothèque Documents affiche « À vérifier, sans échéance renseignée » pour des diagnostics datés, et son compteur « à renouveler » igno | diagnostics |
| DOC-05 | documents-diagnostics | Majeure | « Déposer un document » depuis la fiche d'un lot perd le lot : le document n'apparaît jamais sur ce lot | depot_documents |
| DOC-06 | documents-diagnostics | Majeure | « Lier à une fiche » liste les lots sans nom de bien : avec les noms par défaut, « Lot unique » apparaît trois fois | depot_documents |
| DOC-08 | documents-diagnostics | Majeure | Nouvelle version d'une pièce datée : l'ancienne échéance dépassée est pré-remplie, la nouvelle version naît « Expiré » et la date ne peut pl | depot_documents |
| DOC-N1 | documents-diagnostics | Majeure | Bibliothèque Documents : les rapports de diagnostic ne disent pas à quel bien ou lot ils appartiennent, et deux ERP de biens différents sont | diagnostics |
| ED-01 | espaces-droits | Majeure | L'assurance du locataire classée pendant la préparation du bail n'est plus reprise après l'activation : le locataire se la voit réclamer, au | bail |
| FL-02 | lot-personnes-incidents | Majeure | « Commencer un bail » dans l'en-tête crée un nouveau brouillon vide (type meublé, sans chambre) à chaque passage, même si un « Bail à finali | fiche_lot |
| FL-03 | lot-personnes-incidents | Majeure | La dépense saisie depuis « Journal & dépenses » du lot ne demande pas de date (écriture datée du jour et non modifiable) et ne permet pas de | fiche_lot |
| FL-04 | lot-personnes-incidents | Majeure | Un propriétaire créé sans prénom dans « Nouveau propriétaire » est enregistré comme « Personne morale », sans choix possible : une SCI famil | fiche_lot |
| FL-05 | lot-personnes-incidents | Majeure | « Compléter : caractéristiques » (liste des biens) mène à une carte qui ne dit pas ce qui manque et n'a aucun bouton, et l'encart « À complé | fiche_lot |
| FL-06 | lot-personnes-incidents | Majeure | Résumé de la fiche du lot (agence) : « 2 contrats en cours » s'affiche au-dessus du loyer et de la date d'entrée d'un seul contrat | fiche_lot |
| LAT-01 | loyers-accueil | Majeure | Après une réception complète déclarée depuis le tableau de bord, l'alerte « Loyer impayé » reste ouverte et devient l'« action prioritaire » | loyers |
| LAT-03 | loyers-accueil | Majeure | L'accueil et « À faire » ne montrent qu'un mois et son montant par bail : l'arriéré total et la gravité d'un impayé de plusieurs mois sont m | loyers |
| NEW-01 | loyers-accueil | Majeure | La relance par e-mail envoyée depuis le tableau de bord tait l'arriéré : elle ne cite que le mois le plus ancien, alors que la règle documen | loyers |
| CB-04 | bail | Mineure | Profil de l'organisation incomplet (en-tête du PDF) : les manques sont imputés aux parties (« Adresse du propriétaire », « Adresse e-mail de | bail |
| CB-06 | bail | Mineure | Fausse alerte sur l'étape Loyer : « loyer + charges, montant au prorata » vise le loyer déjà rempli alors qu'il manque la date d'entrée | bail |
| CB-07 | bail | Mineure | Complément de loyer facultatif signalé « Compléter / 1 information à vérifier » au récapitulatif alors que l'étape Clauses est « Renseigné » | bail |
| CB-08 | bail | Mineure | Relocation : le bail précédent du lot (loyer, charges, échéance, IRL, date de sortie) n'est pas repris | bail |
| CB-09 | bail | Mineure | Corrections du récapitulatif : libellés bruts, plusieurs lignes pour un même locataire absent, ciblage au niveau de la section et lien profi | bail |
| CB-10 | bail | Mineure | Le récapitulatif n'indique ni la durée du contrat ni sa date de fin | bail |
| CB-11 | bail | Mineure | Le bouton Retour du navigateur quitte l'assistant au lieu de revenir à l'étape précédente | bail |
| CB-12 | bail | Mineure | Lien « Règlement de copropriété » des pièces du récapitulatif : le focus clavier est perdu (BODY) | bail |
| CB-13 | bail | Mineure | Rubrique « Propriétaires, locataires et garants » : « 1 information enregistrée », sans état d'attention, alors qu'aucun locataire n'est cho | bail |
| CB-14 | bail | Mineure | Inventaire du meublé saisi meuble par meuble : les 11 éléments du décret ne sont qu'un texte, sans ajout groupé | bail |
| DOC-07 | documents-diagnostics | Mineure | Plomb (CREP) : résultat jamais demandé ni règle des 6 ans montrée, le statut « Validité à vérifier » ne peut jamais être levé | diagnostics |
| DOC-09 | documents-diagnostics | Mineure | Fiche bien : « Voir le document » ouvre un nouvel onglet, alors que la fiche lot ouvre l'aperçu intégré | diagnostics |
| DOC-10 | documents-diagnostics | Mineure | Un PDF corrompu (en-tête et %%EOF valides) est accepté au dépôt, et son aperçu échoue ensuite | depot_documents |
| DOC-11 | documents-diagnostics | Mineure | Fichier vide : message « Choisissez un fichier. » alors que le nom du fichier choisi est affiché | depot_documents |
| DOC-12 | documents-diagnostics | Mineure | Électricité et gaz « À préciser » sur un bâtiment construit en 2021 : l'année de construction connue n'est pas réutilisée | diagnostics |
| DOC-13 | documents-diagnostics | Mineure | Quota de 20 dépôts par heure et par compte, essais refusés compris : les doublons refusés bloquent aussi les dépôts suivants | depot_documents |
| ED-02 | espaces-droits | Mineure | Supervision au téléphone et sur tablette (≤ 900 px) : 16 liens sur 17 du menu passent en gris sur le fond bleu nuit photographié (contraste  | transversal |
| ED-03 | espaces-droits | Mineure | Marque blanche : dans l'espace locataire d'une agence à charte, le bouton d'action principal (.btn-or) prend l'or de Gerimmo au lieu de la c | transversal |
| ED-04 | espaces-droits | Mineure | Mes documents (locataire) : deux gestes de consultation différents dans la même liste ; le titre d'une pièce n'est plus cliquable alors que  | transversal |
| FL-07 | lot-personnes-incidents | Mineure | « Créer le contrat individuel d'un locataire → » (Colocation) ne crée rien : il fait défiler vers la liste des contrats | fiche_lot |
| FL-08 | lot-personnes-incidents | Mineure | Messagerie : « Nouveau message » renvoie vers l'annuaire, dont les fiches de locataires sans espace ne permettent pas d'écrire et n'explique | incidents |
| FL-09 | lot-personnes-incidents | Mineure | Fiches personnes : chambre et nom du locataire garanti absents, aucun historique des baux terminés, statut différent entre liste et fiche, r | fiche_lot |
| FL-10 | lot-personnes-incidents | Mineure | Choix du propriétaire dans la fiche du lot : locataires et garants proposés comme propriétaires, vocabulaire d'agence, espace avant le point | fiche_lot |
| FL-12 | lot-personnes-incidents | Mineure | Aide propriétaire : 7 réponses seulement, rien sur les incidents, la colocation à baux individuels, les diagnostics ni la reprise d'un bail | incidents |
| LAT-02 | loyers-accueil | Mineure | Une relance antérieure du bail est présentée sur l'échéance suivante (« Une première relance a été enregistrée ») et masque l'envoi pour ce  | loyers |
| LAT-04 | loyers-accueil | Mineure | Colocation : les tâches de chaque chambre sont strictement identiques et les rappels ne nomment pas la chambre | loyers |
| LAT-05 | loyers-accueil | Mineure | Le chiffre de la carte « À vérifier N demandes » ne correspond pas au compteur de « Mes tâches » vers lequel elle mène | loyers |
| LAT-06 | loyers-accueil | Mineure | La tuile « Encaissé en octobre » mène à Finances, où ce montant n'apparaît dans aucun indicateur du mois | loyers |
| LAT-07 | loyers-accueil | Mineure | Le rappel de loyer n'a pas d'accès direct à la fiche du bail, et la carte annonce « les actions » alors que la fenêtre ne contient que des l | loyers |
| LAT-08 | loyers-accueil | Mineure | Le layout recalcule à chaque page propriétaire les vérifications (actions et rappels de loyers) pour une pastille « Alertes » que le menu pr | loyers |
| TRV-01 | transversal-design | Mineure | Une sélection de texte glissée jusqu'au voile ferme la fenêtre ; si ni le nom ni l'e-mail ne sont remplis, la saisie est effacée (même par u | transversal |
| TRV-02 | transversal-design | Mineure | Fenêtre de recherche : la page derrière défile et le focus est perdu à la fermeture | transversal |
| TRV-03 | transversal-design | Mineure | Fond du menu latéral : deux photos plein format (≈ 547 Ko) téléchargées au premier chargement pour un décor sous un voile d'au moins 78 à 84 | transversal |
| TRV-04 | transversal-design | Mineure | L'icône du site est le logo source : PNG de 2016×1594 et 285 Ko, non carré | transversal |
| TRV-06 | transversal-design | Mineure | Carte « À vérifier » : le nom accessible ne reprend pas le libellé visible (axe label-content-name-mismatch), et le tableau de bord propriét | loyers |
| TRV-08 | transversal-design | Mineure | Zoom à 400 % : l'en-tête collant et la barre basse fixe occupent 54 à 61 % de la hauteur visible | transversal |
| TRV-09 | transversal-design | Mineure | Grand parc : une tâche par lot et par obligation, sans regroupement (630 tâches et 10 755 nœuds sur le tableau de bord, 19 370 nœuds sur /al | loyers |
| TRV-10 | transversal-design | Mineure | La carte rouge « Avez-vous reçu vos loyers ? » clignote sans fin, sans moyen de l'arrêter en dehors du survol et du focus | loyers |
| TRV-11 | transversal-design | Mineure | Liste du parc sur ordinateur : la grille à deux colonnes alignées laisse 24 % de surface vide, avec des trous jusqu'à 712 px | transversal |
| TRV-V01 | transversal-design | Mineure | Raccourci « ⌘ / Ctrl K » affiché mais sans effet : sur les baux en brouillon et après la fermeture de la carte « Loyers à confirmer / À véri | transversal |
| CB-15 | bail | Cosmétique | Message d'erreur obsolète : « choisissez la colocation à l'étape Dates et montants » (l'étape s'appelle « Le bail ») | bail |
| CB-16 | bail | Cosmétique | Petits défauts de texte : « 7 bailx en cours », « Bails à finaliser », message de plafond sans montant, quote-part au format non français | fiche_lot |
| ED-05 | espaces-droits | Cosmétique | En-tête du locataire au téléphone : la barre devient bleu nuit et révèle la tuile blanche du nom de l'agence, sans marge intérieure (texte c | transversal |
| FL-11 | lot-personnes-incidents | Cosmétique | Fiche du lot : « Bails à finaliser », « Le 1 du mois », chambre en préparation répétée, brouillons vides listés comme personnes, résumé d'«  | fiche_lot |
| TRV-05 | transversal-design | Cosmétique | 14 images d'ambiance (≈ 2,4 Mo) et le composant BandeauAccueil ajoutés par la PR sans aucune utilisation | transversal |
| TRV-12 | transversal-design | Cosmétique | Le repère saisonnier occupe la zone d'actions de l'en-tête sans fonction, et n'est pas retiré à ≤ 420 px comme dans les autres en-têtes | transversal |
| TRV-13 | transversal-design | Cosmétique | Onglet resté ouvert à minuit : la photo et le menu changent d'ambiance, la date affichée reste celle du rendu serveur | transversal |
