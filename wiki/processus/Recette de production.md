---
type: process
tags: [recette, production, lancement, personas, qualite]
status: draft
created: 2026-09-20
updated: 2026-10-22
sources: ["[[Fonctionnalités par persona]]", "[[Invitation d'un artisan par un propriétaire]]", "[[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]]", "[[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]", "[[Onboarding et abonnement]]", "[[Quittancement des loyers]]", "[[Cycle de vie d'un incident]]", "[[Registre des anomalies — audit du 13 octobre 2026]]"]
---

# Recette de production

**En une phrase :** le tour complet de `gerimmo.app`, persona par persona, que
l'on fait **le jour du déploiement** et à chaque mise en production qui touche
un parcours — pour constater, sur le vrai service et les vrais courriers, que
ce que le banc a prouvé tient en production.

> [!warning] Règle remplacée le 21 octobre 2026 — cinq comptes fixes retirés
> Décision du dirigeant du 21/10 (`log.md`, « Retirer tous les comptes et dossiers sauf le superadmin ») : les cinq comptes fixes du 17/10 ont été effacés avec les autres (migration `20261021175930`, application 39651969057) et la recette joue désormais **cinq comptes éphémères par passage**, purgés en fin de passage (PR #232, recette n° 30 39656877362). La section « Règle actuelle — cinq comptes fixes » ci-dessous est l'ancienne règle, conservée comme historique. Constat et preuves : [[Contrôle des livraisons de Codex — 22 octobre 2026]].

## Règle actuelle — cinq comptes fixes (17 octobre 2026)

### Aperçu local du superadmin — environnement distinct à conserver

Le 17 octobre, le dirigeant demande aussi de conserver le compte local `superadmin@gerimmo-demo.fr` pour les futurs essais visuels, sans double authentification dans cet aperçu. Le même compte et son identifiant sont copiés dans la base dédiée `gerimmo_ci_apercu_permanent`, port local 55439. Elle est stockée durablement dans `work/environnement-local-permanent/postgres` à la racine de la conversation, avec une sauvegarde initiale. **Aucun reset, seed ou nettoyage de recette ne doit cibler cette base.** Ne pas supprimer ou recréer ce compte entre deux essais.

Le lanceur de l'aperçu est `outputs/superadmin-visuel/local/demarrer.mjs`, URL `http://localhost:3102/admin/brief`. L'exception au code MFA réside exclusivement dans l'émulateur E2E, sous un drapeau explicite ; elle exige le mode développement, le compte fictif exact et des adresses locales pour le site, l'API et la base. Aucun changement dans les gardes de l'application, les sessions réelles ou la production. Les cinq identités de recette de production décrites ci-dessous restent distinctes.

### Recette publiée

À la demande explicite du dirigeant, les cinq identités de test sont désormais
conservées entre les évolutions : administrateur d'agence, propriétaire, locataire,
artisan et supervision. La PR #201 met cette règle en place ; la recette n°24 (39022945703) confirme
49 scénarios réussis et les cinq mêmes comptes présents après clôture. Preuves :
[[Mission du 16 octobre — suivi vérifié]].

- Les adresses et identifiants restent les mêmes. La fin d'un contrôle ne les supprime plus.
- Au début du contrôle suivant, seuls leurs dossiers fictifs sont remis à zéro,
  après vérification qu'aucune relation ne les rattache à un utilisateur réel.
- Le compte de supervision reste présent, mais son privilège, ses sessions et son
  accès sont retirés à la fin. Chaque contrôle utilise un vrai second facteur et
  une autorisation de 61 minutes au maximum.
- Le scénario de nouvelle inscription utilise un sixième compte ponctuel, distinct
  des cinq comptes permanents. Ce compte ponctuel est supprimé après son test.
- Les secrets sont propres à chaque exécution et ne sont ni publiés ni conservés
  dans le rapport. Les adresses sont des destinations fictives Resend.
- Le chantier reste déclenché manuellement, uniquement sur main, sans paiement
  réel ni message aux utilisateurs. Les essais de services externes décrits dans
  le guide historique ci-dessous constituent des validations distinctes.

La réussite doit confirmer les cinq comptes conservés, aucune session ou permission
de supervision encore active, et aucun compte d'inscription ponctuel restant.
Les consignes historiques de suppression de tous les comptes ci-dessous sont
supplantées par cette règle pour le groupe fixe.

## Déclencheur
- Le déploiement de lancement (visé le 30/09/2026), puis toute mise en
  production touchant l'inscription, l'accès, les envois ou la facturation.
- Le banc local prouve la logique ; il **émule** l'authentification et
  n'envoie aucun courrier. La recette de production vérifie ce que le banc ne
  peut pas : les modèles d'e-mails de Supabase Auth, le SMTP, Resend, Stripe,
  les tâches Vercel, les variables d'environnement.

## Acteurs
- Le porteur du projet, avec deux boîtes mail qu'il contrôle (une pour
  l'agence de recette, une pour un « locataire » de recette) et une carte
  bancaire réelle pour l'[[Abonnement|abonnement]] (à rembourser ensuite depuis Stripe).
- L'agent LLM, pour lire les journaux et consigner.

## Avant de commencer
1. `/admin/sante` ne montre **aucun manque** : variables posées, six tâches
   « à l'heure » ou, le premier jour, en attente de leur première passe ;
   documents légaux **complets** (plus aucun « à fournir »).
2. Les modèles d'e-mails d'authentification sont collés dans Supabase
   (`app/supabase/templates/LISEZ-MOI.md`), le SMTP personnalisé est actif,
   `https://www.gerimmo.app/**` figure dans les Redirect URLs (Site URL
   `https://www.gerimmo.app`). Depuis la
   PR #194 (16/10/2026), le LISEZ-MOI demande aussi de coller *Confirm signup*,
   *Reset password* et *Magic link* et de désactiver « Allow new users to sign
   up » : **faits le 16/10 au soir** (journal, entrées « ops | Réglages GitHub et
   Supabase » et « audit | Courriers Supabase et batterie locale » du 16/10 : trois
   modèles enregistrés, inscription publique fermée, liens à 3 600 s) ; les recettes
   n° 20 (38950274565) et n° 24 (39022945703) passent l'inscription, la confirmation
   et la récupération ([[Invitation d'un artisan par un propriétaire]]).
3. Décision prise sur les données de développement (purgées ou renommées en
   démonstration) — la recette crée **ses propres** organisations, nommées
   « Recette … », pour pouvoir les retirer après.

## Étapes — par persona, dans l'ordre où ils arrivent

### 1. Public (sans compte)
- `/`, `/connexion`, `/inscription`, `/mot-de-passe-oublie` : s'affichent en
  moins de deux secondes, sans erreur console.
- `/mentions-legales`, `/conditions`, `/confidentialite` : **aucun passage
  « à fournir »**, pas d'encadré « en cours de finalisation ».
- Formulaire de demande de devis : envoyer une demande → elle apparaît dans
  `/admin/devis`.

### 2. Supervision ([[Super Admin]])
- Connexion : le second facteur est **exigé** (pas de console sans code).
- `/admin` : aucun bandeau « Le service n'est pas prêt ».
- **Ouvrir une organisation** « Recette Agence » avec l'adresse de l'agence de
  recette → l'e-mail **« Votre accès Gerimmo »** arrive, **en français**,
  signé Gerimmo, lien vers `gerimmo.app`.
- `/admin/journaux` : la traversée est au journal d'audit.

### 3. [[Administrateur d'agence]]
- Suivre le lien de l'e-mail → choisir un mot de passe (douze caractères, un
  mot de passe connu des fuites est refusé) → arrivée sur `/espaces` puis le
  tableau de bord.
- Le **parcours de démarrage** s'affiche, avec la proposition d'activer les
  envois automatiques → l'activer dans le profil (les trois cases).
- Identité de l'organisation → un bien → un lot prêt (DPE, détention) → une
  fiche locataire avec l'adresse de recette → **inviter** → l'e-mail d'accès
  arrive dans la seconde boîte.
- Créer le bail, l'activer : le terme du mois est appelé ; **Loyers &
  charges** le montre ; enregistrer un encaissement → la quittance se génère.
- Déclarer un incident, le confier à un artisan de recette (créé à l'étape 6)
  et planifier un créneau.
- `/agence/…/profil` : image de signature déposée, elle apparaît sur la
  quittance PDF.

### 4. [[Propriétaire bailleur|Propriétaire gestion directe]]
- `/inscription` avec une troisième adresse → e-mail **« Confirmez votre
  adresse »** en français → confirmation → organisation en **essai de 2 mois** (14 jours avant le 30/09/2026)
  visible dans `/admin` (« En essai »).
- Premier bien (gratuit) puis deuxième → **souscrire** : page d'abonnement →
  Stripe → carte réelle → retour dans l'espace, statut **active** ;
  `/admin` compte une active de plus ; Stripe montre l'abonnement avec la
  bonne quantité.
  > [!note] Supplanté le 28/09/2026
  > Plus de « premier bien gratuit » : dès le premier bien, souscrire une formule
  > (Solo 5,99 €/mois ou 59,90 €/an…) ; à la fin de l'essai (2 mois depuis le 30/09/2026) sans
  > souscription, l'espace doit passer **en lecture seule** (consultable,
  > exportable). Vérifier aussi la mention « TVA non applicable, art. 293 B du
  > CGI » sur la facture Stripe et que le portail client ne propose que la
  > résiliation en fin de période — [[Grille tarifaire]],
  > [[2026-09-28-decision-tarification]].
- Rembourser depuis Stripe après la recette ; vérifier que le webhook
  `customer.subscription.deleted` repasse l'organisation en lecture seule si
  l'on résilie.

### 5. [[Locataire]] (au téléphone)
- E-mail d'invitation → mot de passe → espace : bail, loyers, quittance du
  mois, documents.
- Déclarer un incident depuis l'espace → il apparaît côté agence.
- Le lendemain de l'encaissement, avec l'automatique activé : la **quittance
  arrive par e-mail** (tâche de 7 h UTC).

### 6. [[Artisan]] (au téléphone)
- Inscription artisan → pièces déposées → dans `/admin/artisans`, valider →
  l'artisan reçoit l'accès.
- Mission proposée par l'agence → accepter, choisir un créneau → le locataire
  et l'artisan reçoivent le **rappel** la veille (tâche de 6 h UTC).

### 7. Le lendemain matin — les tâches
- `/admin/sante` : les six tâches sont **« à l'heure »**, chacune avec sa
  dernière passe et son bilan ; la tâche des abonnements a consigné une passe
  (Stripe joignable).
- Les courriers attendus sont arrivés : quittance (si terme soldé), avis
  d'échéance (à l'approche du prochain terme), rappel de rendez-vous.

## Les courriers à lire, un par un

| Courrier | Émis par | Déclenché à l'étape |
|---|---|---|
| Confirmez votre adresse | Supabase Auth | 4 |
| Votre accès Gerimmo (invitation / mot de passe) | Supabase Auth | 2, 3, 5, 6 |
| Confirmez votre nouvelle adresse | Supabase Auth | « Mon compte », changement d'adresse |
| Quittance de loyer / Reçu de paiement | Resend | 3 (bouton) ou 7 (tâche) |
| Avis d'échéance | Resend | 7 |
| Relance d'impayé (1 puis 2) | Resend | 7, après les délais réglés (5 et 15 jours) |
| Rappel d'intervention (veille, J-7) | Resend | 7 |
| Votre bail signé est disponible | Resend | 3 (dépôt du bail signé) |
| Votre rapport de gestion | Resend | clôture du mois, mandant avec adresse |
| Prélèvement non passé (quatre paliers) | Resend | après un échec de carte chez Stripe |

Pour chacun : expéditeur `Gerimmo <no-reply@gerimmo.app>` (ou l'expéditeur
réglé), français, liens vers `https://gerimmo.app/…`, aucun `localhost`,
signature attendue. Les dix corps se relisent aussi hors ligne :
`app/src/lib/*-email.ts`.

> [!info] Courriers apparus depuis le 15/10/2026 (liste ci-dessus : état au 30/09)
> - **« Rappel : Votre invitation locataire Gerimmo »** (Resend) : relances J+3 et J+10
>   d'une invitation en attente, par la mission « rappels » (X16, PR #190) — voir
>   [[Onboarding et abonnement]]. Aucune n'est encore partie (toujours aucune au 19/10 :
>   `relances_invitations_locataires` vide) : la première suppose une invitation envoyée
>   après le 15/10, puis trois jours.
> - **« Gerimmo — relais de 5 h : … »** et **« Gerimmo — urgence du relais »** (Resend) :
>   adressés au dirigeant seulement, sur deux adresses gardées hors du dépôt (D46-B,
>   PR #192) — voir [[Relais du dirigeant]]. Aucun encore reçu au 16/10.

## La recette automatisée (état au 19/10/2026)
Le chantier GitHub « Recette de production avec nettoyage »
(`.github/workflows/recette-production-autonome.yml`) joue sur `gerimmo.app` les parcours
de `app/e2e/recette-production/` (public, inscription et récupération, administrateur
d'agence, propriétaire, locataire, et depuis la PR #195 les contrôles des P1 « montant faux » ; depuis les PR #198 à #201, l'espace artisan en lecture, la supervision après MFA et les parcours métier D18, D22, D23) avec, depuis la PR #201 (17/10), cinq comptes fixes conservés (administrateur d'agence, propriétaire, locataire, artisan, supervision ; marqueur serveur `permanente-v1`, suffixe `r20261017000000-1`, `RECETTE_COMPTES_FIXES=1`) et un sixième compte ponctuel pour l'inscription, supprimé après son test (*jusqu'à la recette n° 20 : comptes éphémères, retirés à la fin*). **Il ne
part pas tout seul** : comme `recette-production.yml`, il ne se lance qu'à la main
(`workflow_dispatch`, ni planification ni déclenchement par une fusion ; journal du 14/10 :
« la recette ne tourne que sur déclenchement »). Recettes n° 4 à 18 consignées au journal
`log.md` (14, 15 et 16/10 ; n° 15 sur `a722f94`, exécution 38854421819 ; n° 16 sur
`bdaf755`, 38858371065 ; n° 17 sur `f24dfb0`, 38875612888 : 34 réussis, 1 sauté, 1 instable ;
n° 18 sur `db0a95f`, 38880135882 : 40 tests, 37 réussis, 1 sauté (`/cgu`, facultative),
2 instables). Suite (16 et 17/10) : n° 19 sur `10e0919` (38894330211, 16/10 : 39 réussis,
0 instable) ; n° 20 sur `4a5ddf5` (38950274565, 16/10 : 39 réussis, 1 ignoré, 0 instable) ;
n° 21 sur `d31a952` (39017066396, 17/10 : arrêt à l'accès artisan avant tout parcours,
nettoyage réussi) ; n° 22 sur `6614ea7` (39018291225 : expiration de l'attente
`networkidle` à 45 s sur `/artisan`, nettoyage réussi) ; n° 23 sur `3e07b49` (39019618173 :
48 réussis, 1 ignoré, 1 échec du test d'inscription, périmé, corrigé par la PR #201) ;
n° 24 sur `406ad8a` (39022945703, job 117368227992, 17/10 09 h 55-10 h 04 UTC : 49 réussis,
1 sauté (`/cgu`), 0 instable ; artefact `recette-production-39022945703` conservé 14 jours,
jusqu'au 31/10) ; **n° 25 sur `e25c0f7`** (39306114779, job 118243529993, 19/10 18 h 52-19 h 01 UTC :
49 réussis, 1 sauté, 0 instable ; première recette depuis le 17/10, elle couvre les PR #202 à #212 ;
clôture « cinq comptes fixes conservés ; supervision retirée ; sessions révoquées et comptes bloqués
jusqu'au prochain passage » ; artefact de 2 fichiers sans trace, 3 jours). Entre les deux : **aucune
recette du 17/10 10 h 04 UTC au 19/10 18 h 52 UTC malgré dix fusions (#202 à #211)** ; voir
« Fusions sans recette » ci-dessous. La configuration rejoue une fois un test
en échec (`retries: 1`, `app/e2e/recette-production/playwright.config.ts`) : un test
« instable » a échoué au premier essai puis réussi au second.

### Les contrôles des P1 « montant faux » (projet `recette-montants`, depuis la PR #195)
- **Quoi** : `app/e2e/recette-production/montants-p1.spec.ts` (étiquette `@montants`) joue
  les contrôles des quatre P1 de Q3/Q5 : **D04** (« 840,00 » tapé dans un navigateur réglé
  en anglais est enregistré et affiché 840,00 €), **D05** (le même envoi rejoué après une
  réponse perdue n'encaisse qu'une fois), **D37** (la ligne 250 vaut le montant qualifié, à
  l'écran et dans le champ du récapitulatif 2044), **D38** (une régularisation de
  l'exercice en cours est signalée et refusée sans confirmation explicite). Les quatre
  tests forment un bloc en série : un échec fait sauter les suivants.
- **Données éphémères** : dans le seul parc du propriétaire de la recette (« Parc de Paul
  Recette-<suffixe> »), la connexion de la recette à la base insère un bien et son lot, une
  fiche de locataire **sans adresse e-mail**, un bail actif, un appel de loyer de 840,00 €
  et une dépense « intérêts d'emprunt » de 2 345,67 € ; les écrans font ensuite deux
  encaissements, la confirmation de l'exercice fiscal du lot et la qualification de la
  dépense en ligne 250. Tout porte sur l'organisation du suffixe et `purger.sql` la retire
  après passage ; aucun fichier déposé, aucun e-mail, aucun paiement. Depuis la PR #201
  (17/10), le **compte** du propriétaire est fixe (conservé par `purger.sql`, marqueur
  `permanente-v1`), mais son **parc** reste éphémère : `preparer-comptes.sql` le recrée au
  début de chaque passage (il refuse de démarrer si une organisation du suffixe existe
  encore) et `purger.sql` le supprime à la fin, avec toutes ses données (relevé du 19/10
  dans `app/e2e/recette-production/`).
- **Où il tourne** : seulement avec une connexion à la base de la recette (variables
  `PG*`), que fournit le chantier « Recette de production avec nettoyage » ; le chantier
  manuel « Recette de production » ne la fournit pas et saute ces tests. Projet déclaré en
  dernier (`recette-montants`), parce qu'activer un bail referme le parcours de démarrage
  du propriétaire que vérifie un autre test.
- **Limites** : le PDF 2044 n'est pas généré (il serait déposé dans le stockage de fichiers,
  que le nettoyage ne garantit pas d'effacer) ; le chemin confirmé de D38 n'est pas joué
  (il enregistrerait une régularisation qui ne se modifie plus) ; la confirmation de D04
  au-delà de 2 × (reste dû + un terme) n'est pas exercée.
- **Premier passage** : recette n° 18 (38880135882, 16/10) — D04 en échec au premier essai
  (« Montant invalide : écrivez 1234,50, sans espace ni point de milliers. », rien
  d'enregistré ; D05, D37 et D38 sautés), puis les quatre réussis au second essai sur des
  données neuves ; cause de l'échec de D04 non établie au moment du diagnostic (ci-dessous). Voir
  [[Registre des anomalies — audit du 13 octobre 2026]].
- **Passages suivants** : n° 19, n° 20 (16/10) et n° 24 (17/10, 39022945703, tests 41-44
  de `montants-p1.spec.ts` : 6,7 s, 8,4 s, 10,3 s, 3,9 s) : D04, D05, D37, D38 réussis au
  premier essai. Cause de l'échec de D04 établie le 16/10 au soir par la trace de l'artefact
  (journal, entrée « audit | D04 expliqué par la trace conservée de la recette n° 18 » : la
  saisie ne ciblait pas un champ visible ; champ et requête d'action vides ; aucun défaut de
  calcul ni de lecture de la virgule). Puis n° 25 (19/10 au soir) : D04, D05, D37, D38 au premier essai.

### Échecs au premier essai : diagnostic du 16/10/2026
Diagnostic sur le banc local (build de `db0a95f`), sans aucune écriture en production
(journal, entrée « audit » du 16/10, « Échecs au premier essai de la recette »).
- **« crée la fiche d'un locataire à une adresse resend.dev »** (administrateur d'agence,
  mobile, `admin-agence.spec.ts`) échouait au premier essai (attente de navigation de plus
  de 30 s après « Créer la fiche ») et réussissait au second en quelques secondes (4,6 s à la
  n° 6 ; 3 à 4 s aux n° 14 à 18), **à chacune des recettes n° 6 à 18**, donc depuis le
  recâblage du test par la PR #183 (recette n° 6, 38661886020, 15/10 vers 00 h 46 UTC) :
  « 1 flaky », même expiration de `waitForURL` à la ligne 104 du test, dans le journal de job
  de chacune, des n° 6 à 13 (38661886020, 38686435654 — la n° 7, celle de la PR #184 —,
  38712773640, 38720668132, 38767814840, 38775647416, 38802750219, 38809953785 ; lus par
  l'API GitHub le 16/10) comme des n° 14 à 18 (38818788671, 38854421819, 38858371065,
  38875612888, 38880135882). Les entrées n° 6 et n° 8 à 16 du journal disaient « tous les
  parcours réussis » (la n° 6 : « sans échec ») et l'entrée « deploy » de la PR #184
  « recette de production verte », sans mentionner l'échec au premier essai (rectifié au
  journal, entrée « lint » du 16/10). **Cause prouvée : défaut du test.** Depuis la
  PR #170, la création d'une fiche par l'assistant reste sur place
  (`rester_dans_parcours=1`, `app/src/lib/creation-fiche-personne.ts`) et affiche « La
  fiche est créée » avec un lien « Ouvrir la fiche » ; le test, recâblé par la PR #183,
  attendait encore une redirection vers la fiche, qui n'arrive jamais. Le second essai
  passait par la branche de reprise du test (fiche trouvée dans la liste) **sans vérifier
  l'ouverture de la fiche**. Reproduit au banc : action serveur en 100 ms, aucune
  redirection, titre « La fiche est créée » visible, fiche créée une seule fois. **Aucun
  défaut de l'écran.** Test corrigé (commit `72e1e0b` : attendre le titre, cliquer « Ouvrir
  la fiche », puis attendre l'adresse de la fiche), vérifié au banc ; la PR #196 corrige
  aussi la branche de reprise : au second essai, elle ouvre la fiche depuis la liste et
  vérifie son nom (elle ne prouve pas l'écran « La fiche est créée », que seul le premier
  essai prouve). Ces corrections sont dans la PR #196 et ont été jouées en production :
  recette n° 19 (38894330211, 16/10), « crée la fiche » réussi au premier essai en 5,4 s,
  puis n° 20 et n° 24 sans test instable.
- **D04** (bloc des P1, premier essai de la recette n° 18, 16/10 à 09 h 29 UTC) : **cause
  non établie.** Le serveur a reçu un texte vide ou tronqué (« Montant invalide » ; rien
  d'enregistré). Non reproduit en 20 essais au banc avec le même build (saisie avant et
  pendant l'hydratation, CPU ralenti jusqu'à ×20, réseau lent, contenu retardé, serveur
  froid) : la saisie a toujours survécu et l'action a toujours reçu « 840,00 ». La piste
  d'une saisie perdue à l'hydratation est réfutée au banc (React 19.2 n'écrase pas la
  valeur d'un champ à l'hydratation ; aucun écart serveur/client relevé sur l'écran). Le
  test tapait sans attendre que la page soit prête et ne lisait pas le champ avant
  d'envoyer : il tape toujours dès que le champ est là (cas réel de D30 : champ
  saisissable avant l'hydratation, seul « Encaisser » inerte), puis attend l'activation
  d'« Encaisser » et vérifie la valeur saisie avant l'envoi, et note si la saisie a eu lieu
  avant ou après l'hydratation (PR #196 ; le commit `72e1e0b` attendait l'activation
  avant de taper, ce qui ne rejouait plus le cas observé), ce qui séparera une perte côté
  navigateur d'un refus du serveur si l'échec revient. Pour un utilisateur
  réel : perte de saisie non reproduite ; dans le cas observé, le refus est visible et
  aucun montant faux n'est enregistré.
  > [!note] Supplanté le 16/10 au soir
  > Trace de l'artefact relue (journal, « D04 expliqué par la trace conservée de la
  > recette n° 18 ») : la saisie ne ciblait pas un champ visible ; le champ et la requête
  > d'action restaient vides ; aucun défaut de calcul ni de lecture de la virgule. Le
  > diagnostic ci-dessus (« cause non établie ») est conservé comme état du 16/10 en
  > journée.
- **Reste** : ~~lire les traces Playwright de l'artefact `recette-production-38880135882`
  (conservé jusqu'au 30/10), que l'environnement de l'agent ne peut pas télécharger~~ →
  fait le 16/10 au soir (artefact téléchargé et lu hors dépôt public).

> [!warning] Ce que la recette ne joue pas (relevé du 16/10/2026, complété le 19/10)
> - ~~**Aucun parcours d'artisan ni de super-administrateur**~~ (16/10) → **joués depuis les
>   recettes n° 23 et n° 24** (17/10) : `artisan.spec.ts` (quatre écrans en lecture :
>   `/artisan`, `/artisan/devis`, `/artisan/agenda`, `/artisan/facturation`) et
>   `supervision.spec.ts` (`/admin/relais`, `/admin/sante` après MFA réel, recherche par
>   référence X18 de son propre espace de recette ; projet sans trace ni capture). **L'invitation
>   d'un artisan par un propriétaire (PR #194) reste non jouée** : son parcours navigateur
>   (`app/e2e/invitation-artisan.spec.ts`) ne tourne que sur le banc local.
> - ~~Ni D18, ni D22-B, ni D23-A, ni X18~~ (16/10) → **D18, D22 et D23 joués par la n° 24**
>   (`devis-rendez-vous.spec.ts`, `reglement-facture.spec.ts`, projet `recette-parcours-metier`),
>   X18 joué (`supervision.spec.ts`). **Restent non joués** (19/10) : la relance d'invitation
>   (X16), le plafond des appels IA (X19), l'avoir (D24-C, module désactivé), les e-mails du
>   relais, l'invitation d'un artisan, les signatures Zoho ([[Signature électronique]]).
> - ~~Ni les contrôles en production des P1 de la vague 1~~ → joués depuis la recette
>   n° 18 (projet `recette-montants`, ci-dessus), **sans** la génération du PDF 2044 ni le
>   chemin confirmé d'une régularisation d'exercice en cours.
> - **Échecs au premier essai** (ci-dessus) : une recette « en succès » peut cacher un
>   échec au premier essai ; le journal doit nommer les tests instables. « Créer la fiche »
>   est un défaut du test, corrigé par `72e1e0b` et **confirmé par la recette n° 19**
>   (puis n° 20 et n° 24, 0 instable). D04 : **cause établie le 16/10** au soir (trace relue,
>   voir ci-dessus) ; *au 16/10 en journée : cause non établie, traces à lire avant le 30/10*.
> - **Dix fusions sans recette** (18-19/10) : voir le paragraphe ci-dessous ; **levé le 19/10 au soir** par la recette n° 25 sur `e25c0f7` (PR #202 à #212 couvertes).

### Fusions sans recette (18-19/10/2026)
Depuis la recette n° 24 (17/10, 10 h 04 UTC), aucune exécution de
`recette-production-autonome.yml` ni de `recette-production.yml` n'a eu lieu (relevé du
19/10 par l'API GitHub), alors que dix PR ont été fusionnées sur `main` : #202 (`4466ad4`,
18/10, pilotage superadmin, trois migrations appliquées hors chantier GitHub) ; #203
(`b5f70e6`, 18/10, circuit de signature Zoho, trois migrations) ; #204 (`2e20241`) et #205
(`81d19d8`, 18/10, diagnostic du webhook et essai avec le compte permanent) ; #206
(`6cb2468`, 18/10, signatures des documents et devis avec plafond, deux migrations) ; #207
(`cce71b6`), #208 (`b78f73d`) et #209 (`a209ba9`, 18/10, mention de caution) ; #210
(`4b3439f`, 19/10 01 h 49 Paris, abonnement au jour de Paris et contenus publics, une
migration) ; #211 (`2fffec6`, 19/10 02 h 33 Paris, calendrier artisan et repères
d'incident). Les CI de `main` sont vertes pour chacune ; aucune n'a été suivie d'une
recette de production. Au sens de cette page (« à chaque mise en production qui touche un
parcours »), ces dix fusions sont donc restées **non recettées** jusqu'au 19/10 au soir. **Levée** : la
recette n° 25 (39306114779), jouée sur `e25c0f7` juste après la fusion de la PR #212 (correctifs de
l'audit final), couvre ces dix fusions et la onzième ; la purge de fin de recette a supprimé les cinq
circuits Zoho d'essai et le devis de recette de l'organisation fictive, comme consigné au journal.

## Résultat / sorties
- Une entrée `## [date] recette | Production` dans `log.md` : ce qui a été
  vu, ce qui a manqué, avec les références des courriers reçus.
- Les organisations « Recette … » retirées ou conservées comme démonstration
  (décision consignée).

## Critères de sortie
Tout ce qui précède vu **une fois** sur `gerimmo.app`, sans contournement ;
`/admin/sante` sans manque ; les dix courriers lus. Une étape qui échoue
**bloque l'ouverture** tant qu'elle n'est pas rejouée verte.

## Relations
- Ce que le banc couvre déjà : [[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]] (parcours par persona, captures).
- Ce que la recette doit prouver : [[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]] § 2.
