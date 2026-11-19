# PR #345 — reprise ciblée des 49 échecs navigateur, 18 novembre 2026

Base du travail : `6234b3b037665e2670e63bca20c233e6f080500b`, branche `codex/ux-accueil-proprietaire-20261118`.
CI examinée : https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44395490692 (233 réussites, 49 échecs Playwright).
Un seul agent. Créneau autorisé 21:48:42–22:18:42 UTC. Aucune fusion, migration en production, publication, ouverture des ventes ou envoi réel.

## Résultat de la finalisation

Les 46 corrections du commit `1c4a169be7349d6e7326bee645ee75f9cbe1fcca` sont conservées. Les trois derniers scénarios d’abonnement sont corrigés sans changer l’application : tarifs informatifs dans l’état fermé, conditions/contact accessibles, aucune commande proposée.
Les 11 scénarios de `abonnement.spec.ts` passent (plus le setup des sessions). Les prix sont vérifiés sur le seed à deux biens : 7,98 € / mois et 79,80 € / an. Une copie locale propre `gerimmo_ci_ux_subscription_api` remplace, pour ce seul rejeu, le banc enrichi par les essais précédents (14 biens).

Le précédent départ artificiel par `page.evaluate(window.location.assign)` est remplacé par deux tests navigateur obligatoires, mensuel et annuel, dans `tests/souscription-formulaire-navigateur.test.ts`. Ils montent le **vrai composant**, ses calculs et sa protection de saisie ; seule la frontière serveur/prestataire est simulée. Clic réel, acceptation des conditions, confirmation obligatoire du montant, commande unique (798 / 7980 centimes), page de paiement fictive atteinte, aucune boîte de sortie. Ces tests ne prétendent pas être un nouveau paiement Stripe TEST hébergé.

Validation : **69 tests réussis, 0 échec, 0 ignoré** dans les trois fichiers formulaire navigateur, souscription/hausse Stripe et gardes de souscription. Les 67 contrôles serveur conservent les refus contractuels, l’unicité et les reprises. TypeScript et ESLint ciblé réussis. Journaux `abonnement-propre.log`, `validation-souscription.log`, `typescript-abonnement.log` dans le dossier de preuves local.
La CI complète doit confirmer le nouveau SHA après push ; aucun résultat à venir n’est présenté comme acquis.

## Causes communes (49 échecs couverts par la classification)

| Famille | Nombre | Cause observée / correction |
|---|---:|---|
| Abonnement | 3 | Formulaire mensuel/annuel recherché alors que la fermeture des ventes affiche des tarifs informatifs. Assertions de tarifs fermés corrigées ; clics mensuel/annuel éprouvés sur le vrai composant avec fournisseur fictif. |
| Réception des loyers et impayés | 6 | Ancienne modale remplacée par un détail natif. Gestes, repli/réouverture, saisie conservée, paliers, quittance et montants contrôlés. |
| Artisan | 4 | Registre et devis dans des rubriques, informations validées repliées, nouvelles étiquettes de créneaux ; navigation adaptée, assertions PDF et financières maintenues. |
| Dossiers logement / incident | 19 | Sections désormais dans des onglets, ancres et liens ; distinction « Disponible » / vraie action requise. Contrôles de lecture seule, documents, métrologie, accès clavier conservés. |
| Supervision | 11 | Huit scénarios CI tardifs arrivent à Connexion après la limite d’inactivité. Nouvelle connexion réelle + TOTP fictif, sans modification de sécurité. Navigation et automatismes renommés. L’attente des animations de l’annuaire retenait une ancienne promesse alors que playState était finished ; désormais relue à chaque frame, avec la même limite de 5 s et axe conservé. |
| Compte et authentification | 2 | Inscription progressive et première activation : champs et bouton actualisés, changement de mot de passe / second facteur vérifiés. |
| Finances | 2 | « Restant dû », « Attendu », accès « Bilan de l’année ». Encaissement unique de 840 € et affectation unique de 640 € conservés. |
| Consentements et recommandés | 2 | Accès au suivi propriétaire déplacé ; retrait des consentements et configuration fournisseur absente testés sans prestataire réel. |

## Banc et preuves

Banc entièrement fictif local, PostgreSQL sur 127.0.0.1:56542, base `gerimmo_ci_ux_browser_api`, API 54297, application compilée 3100, boîte fictive 55520. Seed officiel `seed-parcours.mjs` rejoué avant les parcours artisan ; l’absence initiale d’acceptation des conditions artisan venait du seed incomplet du banc, pas d’une régression. Nom de base explicitement ajouté à la liste locale autorisée, contraintes loopback et utilisateur maintenues.
Build réussi. ESLint ciblé : voir `eslint-final.log`. TypeScript : premier processus interrompu par sa limite mémoire, reprise avec mémoire adaptée réussie (code 0), `typescript-final.log`.
Traces CI originales dans `output/ci-345-navigateurs-20261118/traces`. Journaux et traces locales conservés dans le même dossier de preuves (sous-dossiers résultats).
Aucun test supprimé, ignoré ou délai augmenté. Aucune modification du code applicatif, de calcul, de droit ou de migration.

## Suite autorisée

Une seule CI complète après push de ce candidat ; PR en brouillon jusqu’à sa réussite. Aucun merge, migration de production, déploiement ni ouverture des ventes. Aucun fichier applicatif ou SQL modifié par cette finalisation.

## Dernier résultat par scénario initial

| Fichier / scénario | Dernier résultat | Preuve |
|---|---|---|
| `abonnement.spec.ts` — en annuel, le montant prélevé en une fois est affiché | Réussi (état fermé + formulaire TEST) | `abonnement-propre.log`, `validation-souscription.log` |
| `abonnement.spec.ts` — les deux lots de démonstration coûtent 7,98 € sur l’abonnement unique | Réussi (état fermé + formulaire TEST) | `abonnement-propre.log`, `validation-souscription.log` |
| `abonnement.spec.ts` — quitter le formulaire annuel vers un paiement simulé ne demande pas de confirmer la sortie | Réussi (état fermé + formulaire TEST) | `abonnement-propre.log`, `validation-souscription.log` |
| `alerte-impaye-proprietaire.spec.ts` — impayé de deux mois à 1440px : total sur la ligne, alerte fermée à la réception complète | Réussi | `replay.log` |
| `alerte-impaye-proprietaire.spec.ts` — impayé de deux mois à 390px : total sur la ligne, alerte fermée à la réception complète | Réussi | `replay.log` |
| `artisan-fin-mission.spec.ts` — devis privé : compléter son identité puis reprendre sans ressaisir ni altérer la version validée | Réussi | `replay-final.log` |
| `artisan-fin-mission.spec.ts` — intervention acceptée : démarrage, photo, bilan, facture (creation) et réception gestionnaire | Réussi | `fin.log` |
| `artisan-fin-mission.spec.ts` — intervention acceptée : démarrage, photo, bilan, facture (sci) et réception gestionnaire | Réussi | `fin.log` |
| `bail-signe-non-actif.spec.ts` — proprietaire › bail signé et documents lisibles sans activation | Réussi | `replay-final.log` |
| `bail-signe-non-actif.spec.ts` — superadmin › bail signé et documents lisibles sans activation | Réussi | `replay-final.log` |
| `compte-securite.spec.ts` — on active puis on retire son second facteur sans l'aide de personne | Réussi | `replay.log` |
| `compte-securite.spec.ts` — on change son mot de passe depuis son compte, et l'ancien ne vaut plus rien | Réussi | `replay.log` |
| `consommations-patrimoine.spec.ts` — consommations : relevé locataire, facture et décompte à 1440px | Réussi | `replay.log` |
| `consommations-patrimoine.spec.ts` — consommations : relevé locataire, facture et décompte à 390px | Réussi | `replay.log` |
| `consommations-patrimoine.spec.ts` — consommations : relevé locataire, facture et décompte à 768px | Réussi | `replay.log` |
| `contre-audit-proprietaire.spec.ts` — fiche de lot : accès direct, clavier et retour à 1440px | Réussi | `selected.log` |
| `contre-audit-proprietaire.spec.ts` — fiche de lot : accès direct, clavier et retour à 390px | Réussi | `selected.log` |
| `contre-audit-proprietaire.spec.ts` — fiche de lot : accès direct, clavier et retour à 768px | Réussi | `selected.log` |
| `contre-audit-proprietaire.spec.ts` — incident : décider puis consulter l’historique à 1440px | Réussi | `complements.log` |
| `contre-audit-proprietaire.spec.ts` — incident : décider puis consulter l’historique à 390px | Réussi | `complements.log` |
| `contre-audit-proprietaire.spec.ts` — la fiche conserve les dépenses, les documents et l’historique sans modale | Réussi | `selected.log` |
| `depot-document-lot.spec.ts` — propriétaire : un document déposé depuis la fiche du lot y apparaît à 1440px | Réussi | `selected.log` |
| `depot-document-lot.spec.ts` — propriétaire : un document déposé depuis la fiche du lot y apparaît à 390px | Réussi | `selected.log` |
| `diagnostic-rapport-range.spec.ts` — un rapport rangé en « Autre » se déclare comme DPE du lot et lève le blocage | Réussi | `selected.log` |
| `dossier-proprietaire.spec.ts` — propriétaire : repères et rubriques accessibles à 1440px | Réussi | `selected.log` |
| `dossier-proprietaire.spec.ts` — propriétaire : repères et rubriques accessibles à 390px | Réussi | `selected.log` |
| `dossier-proprietaire.spec.ts` — propriétaire : un bail commencé se reprend partout, sans brouillon vierge en double | Réussi | `selected.log` |
| `encaissement-reste.spec.ts` — PAY01 : Encaisser le reste transmet sa commande et solde une seule fois le loyer | Réussi | `replay.log` |
| `equipes.spec.ts` — supervision : pause et reprise des passages sans exécution du traitement | Réussi | `selected.log` |
| `lot3-loyer-facture.spec.ts` — propriétaire : loyer confirmé et dépôt de facture conservé (SCI) | Réussi | `cloture.log` |
| `lot3-loyer-facture.spec.ts` — propriétaire : loyer confirmé et dépôt de facture conservé (nom propre) | Réussi | `derniers.log` |
| `lot3-loyer-facture.spec.ts` — une échéance de 640 € après cession apparaît uniquement chez le titulaire à la date du loyer | Réussi | `fin.log` |
| `navigation-matin.spec.ts` — Tour du matin de la supervision › arrive sur le bureau de direction et retrouve les destinations dans le menu mobile | Réussi | `selected.log` |
| `navigation-matin.spec.ts` — Tour du matin de la supervision › le menu complet est accessible sur ordinateur sans ouvrir le bouton mobile | Réussi | `selected.log` |
| `parcours-artisan.spec.ts` — le registre privé se télécharge seulement au clic, depuis la facturation et les clients | Réussi | `replay.log` |
| `reception-loyer-proprietaire.spec.ts` — réception du loyer à 1440px : échéance, pas reçu, partiel puis solde | Réussi | `soldes.log` |
| `reception-loyer-proprietaire.spec.ts` — réception du loyer à 390px : échéance, pas reçu, partiel puis solde | Réussi | `soldes.log` |
| `recommandes-consentements.spec.ts` — 1440px › consentements et recommandé à 1440px : retrait, configuration absente et suivi durable | Réussi | `replay.log` |
| `recommandes-consentements.spec.ts` — 390px › consentements et recommandé à 390px : retrait, configuration absente et suivi durable | Réussi | `replay.log` |
| `relocation-bail.spec.ts` — relocation : le nouveau brouillon reprend les conditions du bail précédent, signalées et effaçables, à 1440px | Réussi | `selected.log` |
| `relocation-bail.spec.ts` — relocation : le nouveau brouillon reprend les conditions du bail précédent, signalées et effaçables, à 390px | Réussi | `selected.log` |
| `reseau-couverture.spec.ts` — Couverture du réseau, côté supervision › la couverture se lit commune par commune, sans aucune décision d’ouverture ni de rattachement | Réussi | `selected.log` |
| `supervision-consignes.spec.ts` — présentation mobile › consignes et relais restent lisibles sans débordement | Réussi | `selected.log` |
| `supervision-consignes.spec.ts` — présentation ordinateur › consignes et relais restent lisibles sans débordement | Réussi | `selected.log` |
| `supervision-consignes.spec.ts` — une consigne exige une version activée, conserve sa preuve et reste suspendable | Réussi | `selected.log` |
| `supervision-consultation.spec.ts` — consultation superadmin › les commandes proposées correspondent au rôle connecté | Réussi | `selected.log` |
| `support-bailleur.spec.ts` — le bailleur retrouve la réponse apportée à sa demande par la supervision | Réussi | `replay.log` |
| `utilisateurs.spec.ts` — annuaire lisible, filtres cumulés et ouverture du bon compte | Réussi | `cloture.log` |
| `utilisateurs.spec.ts` — les abonnements et la trésorerie restent deux lectures distinctes | Réussi | `replay.log` |

## Blocage identifié dans la CI de finalisation

La CI [44412339066](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44412339066), sur `7351683b114ea0ae724698e9449d7bc07b2e913d`, a validé les migrations, permissions, concurrence, lint, build et types. Suite principale : **12 812 réussites, 1 échec, 22 ignorés préexistants** (919 fichiers réussis, 1 en échec, 2 ignorés).
L’unique échec est le nouveau scénario mensuel : `checkbox.check()` attend un état coché alors que React retire immédiatement la case après acceptation. Le clic avait eu lieu ; l’annuel a réussi. Correction limitée au test : clic utilisateur puis assertion sur le reçu d’acceptation durable et la disparition de la case, avant la confirmation du montant. Aucune assertion de consentement retirée, aucun délai augmenté. Rejeu ciblé : **2/2 réussis**, ESLint réussi (`acceptation-durable.log`).
Les étapes E2E de cette CI n’ont pas été exécutées après cet échec. Un nouveau SHA est donc nécessaire ; la validation complète du correctif reste obligatoire avant de sortir la PR du brouillon.

## Blocages navigateur de la validation suivante

La CI [44415296811](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44415296811), sur `b78d298f69a97fde474c3dd545b20f7644a20da7`, a validé les **12 813 tests principaux**, sans échec (22 ignorés préexistants). Le navigateur mobile a terminé avec **277 réussites, 5 échecs, 3 ignorés préexistants**. Les étapes navigateur suivantes n'ont pas été exécutées.

Les cinq échecs ont deux causes confirmées par les traces :
- Quatre retours de veille : le `beforeEach` de reconnexion superadministrateur était appliqué à tout `navigation-matin.spec.ts`, remplaçant aussi les sessions administrateur d'agence, agent, propriétaire et locataire. La reconnexion est désormais limitée aux deux groupes de supervision. Chaque autre rôle conserve sa propre session et ses assertions d'accès.
- Historique d'incident à 1440 px : le clic sur un dossier était encore en cours de navigation lorsque le test ouvrait l'historique du dossier affiché par défaut. La réponse Next arrivait ensuite et réinitialisait le volet. Le test attend maintenant l'URL exacte du dossier et l'onglet actif avant d'ouvrir l'historique. Sur le banc enrichi, l'attente globale `networkidle` bloquait aussi sur le préchargement d'un document ; elle est remplacée pour ce scénario par l'affichage du titre puis les assertions de navigation effective. Les assertions d'ordre, d'ouverture, d'accessibilité et de débordement restent présentes.

Rejeux locaux sans répétition automatique : **10/10 scénarios de navigation réussis** (`navigation-finale.log`), puis **2/2 scénarios d'incident réussis à 390 et 1440 px** (`incident-navigation.log`). Le premier rejeu d'incident a échoué sur l'attente réseau décrite ci-dessus ; ces échecs restent conservés dans les preuves. ESLint ciblé et `git diff --check` réussis. Aucun changement applicatif ni de sécurité. Un push du correctif déclenche la CI du nouveau SHA ; aucune relance à code identique.

## Passe courriels après réussite des 282 parcours mobiles

La CI [44420982370](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44420982370), sur `530ebb22fcfc9a92a99a0365e21a8c3de7aa9081`, valide **12 813 tests principaux / 22 ignorés préexistants** et **282 parcours mobiles / 3 ignorés préexistants**, sans échec. La passe séparée de courriels donne **1 réussite et 3 échecs** :
- `lot2-pilote` et `premiere-location-continue` cherchent encore le champ « Prénom » de l'ancienne inscription. Les traces montrent le nouveau champ « Votre nom ». Les tests utilisent désormais le formulaire simplifié et « Créer mon espace » ; le parcours documentaire renseigne les coordonnées facultatives après vérification de l'e-mail. La récupération de mot de passe reste contrôlée jusqu'à la reconnexion avec le nouveau secret fictif.
- `lot2-artisan` attend l'ancien titre de l'invitation. Le test suit maintenant « Vérifier votre invitation artisan », ouvre la création de compte repliée et choisit son premier mot de passe. Les assertions de confidentialité avant connexion, d'acceptation, de validation administrative et d'accès au carnet sont conservées.
- Les rejeux révèlent deux commandes du même parcours déplacées par l'UX : sollicitation dans « Devis et facture », statut du logement dans « Caractéristiques ». Les tests suivent ces onglets, puis « Voir le loyer… » dans les finances ; aucune modification applicative ni écriture SQL de substitution.

Rejeux sans répétition automatique : **inscription/récupération réussie** (`courriels-reprise.log`), puis **2/2 réussis** (`courriels-fin.log`) : invitation artisan jusqu'à la mission acceptée/démarrée avec courrier durable accepté, et première inscription jusqu'à la quittance PDF du même bail (640 € = 600 € + 40 €, identité, coordonnées, référence et impression vérifiées). Les échecs intermédiaires et les traces CI restent conservés dans le dossier de preuves `ci444209`. ESLint ciblé et `git diff --check` réussis.

Vérification WebKit ciblée des sept fichiers UX déjà corrigés : **36/36 réussis**, sans répétition automatique ni test ignoré, en 4,1 minutes (`webkit-final.log`) : factures artisan particulier/SCI, bail non actif, consommations à 390/768/1440 px, dossier propriétaire, portail et registre artisan, consentements/recommandés, annuaire et séparation abonnements/trésorerie. Ces 36 cas incluent la préparation des sessions ; ils ne sont pas additionnés aux suites Chromium comme autant de scénarios métier distincts. CI complète requise sur le commit contenant ces corrections avant de déclarer la PR prête.

La dernière étape CI utilise aussi `invitation-artisan.spec.ts`, hors de la passe courriels. Son ancien titre d'invitation a été reproduit localement (**1 échec**, `invitation-isolee-avant.log`). La CI [44428163490](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44428163490) de `37246628` a donc été arrêtée pour ne pas attendre cet échec prévisible en fin de chaîne ; elle ne constitue pas une validation. Même adaptation du titre, du volet de première visite et de l'onglet devis, sans changement des refus d'envoi ni des permissions. Rejeu : **1/1 réussi** en 20,9 s, sans répétition automatique (`invitation-isolee-apres.log`), ESLint et diff vérifiés. Aucun test ni assertion métier supprimé. Validation intégrale requise sur le nouveau SHA.
