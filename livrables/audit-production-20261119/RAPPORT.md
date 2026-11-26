# Audit fonctionnel en production — Gerimmo `2928d63f` — 19 novembre 2026

Site : https://www.gerimmo.app · Version servie : `2928d63f61a4cb2bdbb248580035831bf678c088` (PR #345) ·
Tests réalisés entre 07 h 00 et 08 h 10 UTC, sur ordinateur (1440 px) et téléphone (Pixel 7).

## Verdict

**GO pour accueillir les 10 propriétaires pilotes, sous deux corrections et une vérification.**

- Le parcours complet d'un propriétaire particulier fonctionne **en production**, de l'inscription à la quittance,
  aux charges et à l'incident :
  - les montants sont justes ;
  - les documents sont réels et téléchargeables ;
  - l'espace locataire est cohérent ;
  - l'isolement entre comptes est étanche.
- **Aucune anomalie P0** : ni fuite, ni perte de données, ni action financière incorrecte.
- Deux points bloquent l'accueil de certains pilotes ou leur suivi :
  - **P1-1** : un propriétaire qui s'inscrit « en tant que SCI » ne peut pas établir correctement un bail au nom de sa
    SCI sans un contournement qu'il ne trouvera pas seul ;
  - **P1-2** : l'alerte quotidienne du dirigeant échoue chaque jour depuis le 12/11.

Le détail des corrections indispensables est au § 9.

## Ce qui a été fait, et comment

- **Comptes fictifs** créés en production avec votre accord :
  - deux propriétaires : un particulier et une gérante de SCI ;
  - un locataire ;
  - toutes les adresses sont des boîtes de test Resend (`delivered+audit-…@resend.dev`).
- **Accès du locataire** : ouvert par écriture directe en base, le parcours d'invitation par e-mail n'étant pas
  joignable.
- **Tous les gestes métier** ont été faits par l'interface, comme un utilisateur.
- **Aucun paiement**, aucune signature électronique, aucun recommandé, aucun courriel à une personne réelle.
  Aucune donnée existante n'a été modifiée.
- **Recette automatisée du projet** (chantier GitHub « Recette de production avec nettoyage », n° 50) lancée en
  complément, avec votre accord.
- **Purge complète en fin d'audit** (§ 8). La production est revenue exactement à son état initial.

---

## 1. Vérification technique

| Contrôle | Résultat | Statut | Preuve |
|---|---|---|---|
| Version publiée = PR #345 | Déploiement Vercel `dpl_7ei2vAVa…` (production, READY) sur `2928d63f` ; `/api/sante` renvoie `revision: 2928d63f…`, base joignable, maintenance non. Fusion de la PR #345 le 19/11 à 05 h 44 UTC. **Aucune ligne de différence** entre `2928d63f` et le candidat validé `f489641f`. | Réussi | `git diff f489641f 2928d63f` = 0 ligne ; API Vercel ; `/api/sante` |
| CI | CI de `main` sur `2928d63f` (run 44467244387) et CI du candidat (44428554024) : succès. | Réussi | GitHub Actions |
| Migration | `20261118093000_inscription_proprietaire_progressive` présente au registre de production. Effet constaté : un compte inscrit sans adresse ouvre son espace, et l'adresse est demandée dans le profil. | Réussi | Registre des migrations ; `particulier-01-apres-connexion.jpg` |
| Sauvegarde et restauration | « Sauvegarde quotidienne » (44467301506), « Vérifier la restauration de la sauvegarde réelle » (44468001861), migrations (44468349648, 44471667810) et « Publication contrôlée » (44475194164) : succès le 19/11. **Lus, non rejoués.** | Réussi (lecture) | GitHub Actions |
| Données existantes intactes | 5 espaces (tous en essai), 8 comptes, 13 biens, 24 logements, 11 baux brouillon, 27 fiches, 51 documents, 3 incidents, 0 encaissement, 0 quittance, 0 abonnement. Identique au relevé du 16/11 (5 espaces, 0 bail actif, 0 abonnement), et identique avant et après l'audit. **Limite** : comparaison par comptages, pas ligne à ligne. | Réussi | Requêtes en lecture seule |
| Ventes fermées | Réglage `souscriptions_payantes_ouvertes = false`. La page « Mon abonnement » affiche l'essai (61 jours restants) sans bouton de paiement. Webhook Stripe sans signature : 400. | Réussi | `compte-04-abonnement.jpg` |
| Connexion, déconnexion | Connexion des trois comptes fictifs ; déconnexion par le menu du compte. Après déconnexion, `/loyers` renvoie vers la connexion, et **l'ancien jeton est refusé par la base** (« La session a pris fin »). | Réussi | `compte-05-deconnecte.jpg` |
| Erreurs critiques | Aucune erreur serveur pendant les 70 minutes de tests. Aucune erreur navigateur ni réponse 5xx sur l'ensemble des écrans parcourus. **Une erreur récurrente hors de mes tests** : l'alerte du relais (P1-2). | Réussi, avec P1-2 | Vercel : erreurs d'exécution sur 3 h et 24 h |
| Recette automatisée n° 50 | 63 réussis, 4 échoués, 1 sauté ; purge de ses comptes vérifiée (« organisations 0, comptes 0 »). Les 4 échecs viennent de tests restés sur les anciens libellés, sauf un non conclu (§ 6, P2-1). | Partiel | Run 44476817457 |

## 2. Parcours d'un propriétaire particulier

Compte « Paul Audit-Particulier », bail nu de 600 € + 40 € de provisions, entrée le 01/11/2026.

| # | Étape | Résultat observé | Statut | Preuve |
|---|---|---|---|---|
| 1 | Connexion et tableau de bord | L'espace s'ouvre seul après la première connexion. Accueil « Commençons votre première location — 0/6 », bandeau d'envois repliable « J'ai compris ». | Réussi | `particulier-01-apres-connexion.jpg` |
| 2 | Création d'un bien | « Résidence Audit » créé : adresse, année, parties communes. | Réussi | — |
| 3 | Création d'un logement | Logement de 42 m² créé dans le même assistant, puis complété. | Réussi | — |
| 4 | Ajout d'un locataire | Fiche créée, « La fiche est créée ». | Réussi | — |
| 5 | Location et bail | Assistant en 7 étapes. Un dépôt de 2 400 € est **refusé** (« dépasse le plafond de 600,00 € »), 600 € accepté. DPE et ERP déposés, logement mis en location, bail papier signé déposé : bail **Actif**. | Réussi | `particulier-13-bail-depot-plafond.jpg`, `particulier-19-bail-actif.jpg` |
| 6 | Échéance de loyer | « Générer l'échéancier » : 1 terme de 640 €, affiché **Impayé** tant que rien n'est encaissé. | Réussi | `particulier-20-echeancier.jpg` |
| 7 | Quittance | Après l'encaissement de 640 € par le bailleur, quittance générée : période du 01/11 au 30/11, 600 € + 40 €, bailleur, locataire, logement, article 21. | Réussi | `particulier-23-loyer-encaisse.jpg`, `particulier-24-quittance.jpg` |
| 8 | Facture | Abonnement « EAU AUDIT » ; facture de 120 € avec PDF ; paiement indiqué : « Payée le… ». | Réussi | — |
| 9 | Répartition et régularisation | Répartition selon l'occupation, calcul vérifié puis validé. Régularisation 2026 : **charges réelles 120 €, provisions appelées 40 €, complément 80 €**. Décompte PDF créé, sans aucun paiement déclenché. | Réussi | `particulier-35-regul-validee.jpg` |
| 10 | Incident | Déclaré (fuite sous évier). L'écran « Ce qu'il vous reste à faire » demande qui paie ; décision « À la charge du locataire » motivée ; clôture « Résolu ». | Réussi | `particulier-41-incident-clos.jpg` |
| 11 | Documents | 5 documents listés ; le bail signé (16 Ko) et le décompte (41 Ko) sont téléchargés : vrais PDF au contenu exact. Réserves P2-2 et P2-3. | Réussi, avec réserves | `particulier-42-documents.jpg` |
| 12 | Espace locataire (téléphone) | « Tous vos loyers sont à jour », novembre « Payé 640 € » ; quittance, bail signé et décompte disponibles ; incident « Clos » avec la décision et sa raison ; en-tête au nom du bailleur. | Réussi | `locataire-03-paiements.jpg`, `locataire-04-documents.txt`, `locataire-05-demandes.jpg` |

**Cohérence en base** : 1 bail actif, 1 appel, 1 encaissement de 640 €, 1 quittance, 5 documents, **0 courriel mis en
file**.

## 3. SCI

Compte « Sophie Audit-SCI », inscrite comme « SCI », avec trois biens.

| Point | Résultat observé | Statut | Preuve |
|---|---|---|---|
| Plusieurs biens | 3 biens et 3 logements ; l'accueil affiche « 3 biens · 2 locations en cours » et « Loyers du mois 2 150 € sur 2 150 € ». | Réussi | `mobile-sci-01-accueil.jpg` |
| Rattachement des biens à la SCI | Chaque logement est rattaché à 100 % à la gérante, sous son nom personnel. Pour que la SCI soit bailleur, il a fallu le contournement décrit en P1-1. | **Échec sans contournement (P1-1)** | `sci-03-lotC.txt`, `sci-14-bailA-etape2.jpg` |
| Bail nu | Une fois le contournement fait : activation, quittance **au nom de la SCI**. | Réussi | `sci-26-doc-Quittance.jpg` |
| Bail meublé | Dépôt de 3 mois refusé (« plafond de 1 400,00 € » pour 700 €), 2 mois accepté ; l'inventaire du mobilier est exigé au récapitulatif. Activation non jouée. | Réussi (partiel) | `sci-36-meuble-depot.jpg` |
| Colocation | Deux colocataires ; dépôt plafonné à un mois (1 200 €) ; quittance de 1 300 € au nom des deux. | Réussi | `sci-30-coloc-apres-loyer.jpg` |
| Encaissements | 400 € sur 850 € : « réglé en partie… → **reçu**. La quittance sera disponible lorsque le loyer sera entièrement payé. » Puis 450 € : « soldé → quittance ». **Aucun loyer n'est encaissé sans la saisie du bailleur** ; le locataire n'a aucun bouton « j'ai payé », et sa tentative d'écriture directe est refusée (403). | Réussi | `sci-24-partiel.jpg`, `sci-25-solde.jpg`, `isolation-api.txt` |
| Charges | Non rejoué pour la SCI ; le parcours complet est couvert chez le particulier (§ 2, n° 9). | Non exécuté (SCI) | — |
| Documents | 14 documents : diagnostics (DPE, plomb, amiante, ERP), statuts de la SCI, baux signés. | Réussi | — |
| Changements de statut et clôtures | Mise en location **refusée** tant que le DPE manque (« DPE absent ou expiré »). Congé du locataire enregistré : fin prévue le 19/12/2026, annulation possible. Mois d'octobre clôturé. Bail meublé laissé en brouillon. | Réussi (partiel) | `sci-ECHEC-mise-en-location-lotA.jpg`, `sci-35-conge-enregistre.jpg` |

## 4. Expérience utilisateur (ordinateur et téléphone)

- **Compréhension.** Les chantiers UX de la PR #345 sont visibles et efficaces :
  - accueil d'un compte neuf réduit à « Commençons votre première location » ;
  - bloc « À faire maintenant » qui nomme le logement (« État des lieux de sortie à réaliser — Studio Audit SCI —
    échéance 19/12/2026 ») ;
  - incident ouvert sur « Ce qu'il vous reste à faire » ;
  - côté locataire : « Écrire à mon bailleur », bailleur nommé, documents ouverts sur les fichiers, un seul bouton
    « Urgence ».
- **Navigation.** Aucun débordement horizontal au téléphone. La barre du bas est constante dans les deux espaces.
- **Formulaires.** Les plafonds de dépôt arrêtent la saisie avec un message clair et le champ en focus. Le formulaire
  d'un diagnostic de plomb exige le résultat du constat, ce qui est normal mais n'est pas annoncé avant le dépôt.
- **Parcours interrompu.** Le parcours SCI (P1-1) : un propriétaire non technique ne trouvera pas seul qu'il doit se
  retirer de chaque logement, créer la SCI comme « personne morale », se recréer lui-même comme « personne physique »
  et déposer les statuts pour pouvoir signer.
- **Messages.** Tous ceux rencontrés sont compréhensibles. Il reste du vocabulaire d'agence côté locataire (P2-4).

## 5. Sécurité et services externes

| Contrôle | Résultat | Statut |
|---|---|---|
| Accès sans session à l'API de données (6 tables) | 401 « permission denied » partout. | Réussi |
| Pages privées sans session | Renvoi vers la connexion en gardant la destination (recette n° 50). | Réussi |
| Isolement par l'interface (20 essais croisés) | Chaque espace, bail, fiche, quittance ou document d'un autre compte renvoie **404** ; `/admin` et l'espace locataire d'autrui renvoient vers son propre espace ; aucune donnée d'autrui affichée. | Réussi |
| Isolement par l'API | Le particulier et le locataire lisent **0 ligne** de la SCI. Le particulier qui tente de renommer la SCI touche **0 ligne**. Le locataire qui tente de créer un encaissement de 640 € est **refusé (403, politique RLS)**. | Réussi |
| Session après déconnexion | Ancien jeton refusé (« La session a pris fin »). | Réussi |
| Base | 227 tables publiques, **toutes** sous RLS ; aucun droit d'écriture pour les visiteurs anonymes ; buckets privés, sauf `marketing-visuels` (public, voulu). | Réussi |
| En-têtes | HSTS avec preload, CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. | Réussi |
| Tâches planifiées | Protégées par un secret (contrôle du code ; non appelées, pour ne rien déclencher). | Réussi (code) |
| Stripe | Ventes fermées, aucun bouton de paiement, webhook sans signature refusé. | Réussi |
| Courriels | Aucun courriel mis en file pour les espaces fictifs. L'inscription et le mot de passe oublié ont envoyé chacun un courriel vers une boîte de test Resend, **non lue**. | Partiel |
| Signature électronique, recommandé AR24 | Non déclenchés, volontairement. | Non exécuté |

## 6. Anomalies

### P0 — Critique

**Aucune.**

### P1 — Bloquant

**P1-1 — Une SCI ne peut pas établir son bail sans contournement.** Pages : inscription, logement (étape
« Propriétaires »), bail (étape 2 « Personnes »).

- **Pour reproduire** :
  1. S'inscrire avec « Vous louez en tant que : SCI ».
  2. Créer un bien et son logement.
  3. Commencer un bail.
- **Attendu** : la SCI (raison sociale, SIREN) est bailleur, et la gérante peut être désignée comme signataire.
- **Observé** :
  - la fiche de la gérante prend la qualité « SCI » ;
  - chaque logement lui est rattaché à 100 % sous son nom personnel ;
  - « Qui signe pour la société ? » ne propose **que les locataires**. Le code ne retient comme représentants que les
    fiches « Personne physique », hors locataires du bail, et la gérante est exclue par sa qualité.
- **Contournement validé en production**, en six gestes que l'écran n'indique pas :
  1. créer la SCI comme « personne morale » ;
  2. supprimer la détention de la gérante sur chaque logement ;
  3. rattacher la SCI à 100 % ;
  4. créer une seconde fiche « Personne physique » pour la gérante ;
  5. déposer les statuts sur la fiche de la SCI ;
  6. désigner la gérante sur chaque bail.

  La quittance porte alors bien la SCI.
- **Preuves** : `sci-03-lotC.txt` (« Propriétaire actuel… Audit-SCI Sophie… 100 % »), `sci-14-bailA-etape2.jpg`
  (représentants proposés : trois locataires), `sci-12-detention-sci-lotC.jpg`.
- **Gravité** : P1 pour tout pilote SCI. Sans objet pour les particuliers.

**P1-2 — L'alerte quotidienne du dirigeant échoue chaque jour.** Route : `/api/cron/relais`.

- **Pour reproduire** : relevé des erreurs d'exécution Vercel sur 24 h et 7 jours.
- **Attendu** : l'alerte de 5 h part chaque jour.
- **Observé** : « [relais] Un envoi de l'alerte n'a pas abouti », chaque jour du 12/11 au 19/11 (04 h 00 UTC).
- **Conséquence** : pendant le pilote, le dirigeant ne serait pas prévenu d'une demande urgente ou d'un service en
  panne.
- **Preuve** : erreurs d'exécution Vercel, projet `gerimmo-v4`.
- **Gravité** : P1 (exploitation du pilote).

### P2 — Secondaire

| Id | Page | Pour reproduire | Attendu | Observé | Preuve |
|---|---|---|---|---|---|
| P2-1 | Recette de production | Lancer « Recette de production avec nettoyage ». | Recette verte sur la version publiée. | 4 échecs, détaillés ci-dessous. La recette ne sert donc plus de filet de sécurité tant qu'elle n'est pas mise à jour. | Run 44476817457 |
| P2-2 | Documents › Télécharger | Ouvrir un document, puis « Télécharger ». | Fichier « Bail-signe.pdf ». | Fichier nommé **« download »**, sans extension (Chromium). Sous Windows, il ne s'ouvre pas d'un double-clic. | Script de téléchargement |
| P2-3 | Documents | Déposer le bail signé d'un logement. | Rangé sous le bien, au nom du locataire. | Rangé dans « Documents généraux », sans nom de bien ni de locataire. | `particulier-42-documents.jpg` |
| P2-4 | Espace locataire d'un particulier | Ouvrir Paiements, puis Logement. | Le mot « bailleur ». | « votre **gestionnaire** la compare aux charges réelles », « zone en cours de vérification par votre gestionnaire », « Prévenez votre gestionnaire ». | `locataire-03-paiements.jpg` |
| P2-5 | Quittance d'une SCI ou d'une colocation | Encaisser un loyer de SCI, puis de colocation. | « SCI …, représentée par … » ; « leur en donne quittance » ; ligne de contact propre. | « Je soussigné(e) SCI Audit Les Tilleuls » sans représentant ; « lui en donne quittance » pour deux colocataires ; « · — » quand le téléphone est vide. | `sci-26-doc-Quittance.txt`, `preuves/` |
| P2-6 | Bien à Paris | Créer un bien en 75011. | Zone tendue reconnue. | « Zone tendue non renseignée » : tâches à l'accueil, et congé à un mois « à vérifier ». | `mobile-sci-01-accueil.jpg`, `sci-35-conge-enregistre.jpg` |
| P2-7 | Listes (incident, documents) | Créer un logement sans lui donner de nom propre. | Nom du logement distinct du bien. | « Résidence Audit — Résidence Audit » ; « Diagnostic · Résidence Audit · Résidence Audit ». | `particulier-42-documents.jpg` |

Détail des 4 échecs de la recette (P2-1) :

| Test | Cause | Contrôle manuel |
|---|---|---|
| « Mon abonnement » | Le test attend l'ancien récapitulatif de paiement. | La page est correcte (§ 1). |
| Inscription | Le test cherche un champ « Prénom » qui n'existe plus. | Inscription manuelle : « Vérifiez votre boîte mail ». **La confirmation par e-mail n'a pas été vérifiée.** |
| Parcours de démarrage | Le test attend « Terminer votre première location » ; la page dit « Commençons votre première location ». | Vu à l'écran. |
| D23 (artisan) | Texte présent mais caché ou en double. | **Non conclu** : pas de compte artisan manuel. |

## 7. Tests non exécutés

Ces tests ne sont **pas présentés comme réussis** :

- **Réception réelle des courriels** :
  - confirmation d'inscription ;
  - invitation du locataire ;
  - réinitialisation du mot de passe ;
  - quittance par e-mail.

  Les envois partent vers des boîtes de test que je ne peux pas lire. Le chemin complet « inscription → lien de
  confirmation → première connexion » n'a pas été joué ce jour ; mes comptes ont été créés en base et confirmés
  d'office.
- **Invitation du locataire par e-mail** : accès ouvert par écriture directe.
- **Signature électronique, lettre recommandée AR24, paiement Stripe** : exclus par consigne.
- **États des lieux** d'entrée et de sortie, **sortie réelle et restitution du dépôt** : la date d'effet du congé est
  le 19/12.
- **Charges de la SCI**, **activation d'un bail meublé avec inventaire**, **révision IRL**, **relances d'impayé et
  avis d'échéance** (suspendus en production).
- **Parcours artisan et console super-admin** manuels : seule la recette les a parcourus, en lecture (supervision :
  17 rubriques réussies après double authentification).
- **Double authentification d'un propriétaire.**
- **Restauration d'une sauvegarde** : workflow lu, non rejoué.

## 8. Données de test et purge

**Créé en production** :
- 3 comptes d'audit et 1 compte d'inscription non confirmé ;
- 2 espaces ;
- 4 biens et 4 logements ;
- 8 fiches ;
- 4 baux ;
- 4 encaissements ;
- 3 quittances ;
- 19 fichiers (diagnostics fictifs, baux papier fictifs, statuts, décomptes).

**Supprimé vers 08 h 10 UTC**, avec la logique du script `purger.sql` du projet. Garde-fous : seuls les comptes au motif
`delivered+audit-…-20261119@resend.dev` et les deux espaces nommés de l'audit, refus si un compte étranger y siège.

**Vérifié après purge** :
- 0 espace, 0 compte et 0 fiche d'audit ;
- totaux revenus à 5 espaces, 8 comptes, 13 biens, 24 logements, 11 baux, 27 fiches, 51 documents, 0 encaissement,
  0 quittance ;
- ventes toujours fermées.

**Fichiers** : la base interdit de les supprimer en SQL. Les 19 chemins sont dans la file `purge_fichiers`, que la tâche
planifiée « purge » vide chaque nuit à 03 h 40 UTC par l'API de stockage. D'ici là, ils sont illisibles : la politique
de lecture exige un document vivant. Un contrôle est programmé le 20/11 à 04 h 15 UTC.

**Reste assumé** : le journal technique peut citer des identifiants d'audit, sans donnée personnelle (comme pour la
recette).

**Secrets** : mot de passe généré localement, transmis à la base sous forme de hachage seulement, effacé en fin
d'audit, avec les sessions ; il n'apparaît dans aucune preuve.

## 9. Conclusion

**« Gerimmo est-il suffisamment fiable, compréhensible et fonctionnel pour accueillir ses 10 premiers propriétaires
pilotes ? »**

**Oui : GO.** Pour un propriétaire particulier, tout le parcours a été réalisé en production sans aide : bien,
logement, locataire, bail, loyer, quittance, facture, charges, incident, documents, espace locataire. Les montants
sont exacts et les garde-fous jouent : plafonds de dépôt, DPE obligatoire, reçu plutôt que quittance en cas de paiement
partiel, aucun encaissement sans saisie du bailleur. L'isolement entre comptes est étanche.

**Corrections indispensables pour débloquer le pilote :**

1. **P1-1 — SCI.** À l'inscription « SCI » :
   - créer la société comme personne morale et la gérante comme personne physique ;
   - rattacher les logements à la société ;
   - proposer la gérante comme signataire.

   **Tant que ce n'est pas corrigé, n'accueillir que des particuliers**, ou accompagner chaque SCI pas à pas avec le
   contournement du § 6.
2. **P1-2 — Alerte du dirigeant.** Rétablir l'envoi quotidien du relais avant le premier pilote : c'est le seul moyen
   d'être prévenu d'un problème chez eux.

**Vérification indispensable, sans code :** faire une inscription réelle avec une vraie boîte mail (lien de
confirmation, puis première connexion) avant d'envoyer les invitations. Ce chemin n'a pas pu être joué ce jour.

Le reste (P2-1 à P2-7) peut suivre pendant le pilote. La mise à jour des 4 tests de la recette (P2-1) est conseillée
dès cette semaine, pour retrouver un contrôle automatique vert à chaque publication.
