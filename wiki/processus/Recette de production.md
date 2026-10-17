---
type: process
tags: [recette, production, lancement, personas, qualite]
status: draft
created: 2026-09-20
updated: 2026-10-17
sources: ["[[Fonctionnalités par persona]]", "[[Invitation d'un artisan par un propriétaire]]", "[[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]]", "[[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]", "[[Onboarding et abonnement]]", "[[Quittancement des loyers]]", "[[Cycle de vie d'un incident]]", "[[Registre des anomalies — audit du 13 octobre 2026]]"]
---

# Recette de production

**En une phrase :** le tour complet de `gerimmo.app`, persona par persona, que
l'on fait **le jour du déploiement** et à chaque mise en production qui touche
un parcours — pour constater, sur le vrai service et les vrais courriers, que
ce que le banc a prouvé tient en production.

## Règle actuelle — cinq comptes fixes (17 octobre 2026)

À la demande explicite du dirigeant, les cinq identités de test sont désormais
conservées entre les évolutions : administrateur d'agence, propriétaire, locataire,
artisan et supervision. La PR #201 met cette règle en place ; sa validation en
production reste à confirmer dans [[Mission du 16 octobre — suivi vérifié]].

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
   up » : **non faits au 16/10** ([[Invitation d'un artisan par un propriétaire]]).
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
>   [[Onboarding et abonnement]]. Aucune n'est encore partie : la première suppose une
>   invitation envoyée après le 15/10, puis trois jours.
> - **« Gerimmo — relais de 5 h : … »** et **« Gerimmo — urgence du relais »** (Resend) :
>   adressés au dirigeant seulement, sur deux adresses gardées hors du dépôt (D46-B,
>   PR #192) — voir [[Relais du dirigeant]]. Aucun encore reçu au 16/10.

## La recette automatisée (état au 16/10/2026)
Le chantier GitHub « Recette de production avec nettoyage »
(`.github/workflows/recette-production-autonome.yml`) joue sur `gerimmo.app` les parcours
de `app/e2e/recette-production/` (public, inscription et récupération, administrateur
d'agence, propriétaire, locataire, et depuis la PR #195 les contrôles des P1 « montant faux ») avec des comptes éphémères, retirés à la fin. **Il ne
part pas tout seul** : comme `recette-production.yml`, il ne se lance qu'à la main
(`workflow_dispatch`, ni planification ni déclenchement par une fusion ; journal du 14/10 :
« la recette ne tourne que sur déclenchement »). Recettes n° 4 à 18 consignées au journal
`log.md` (14, 15 et 16/10 ; n° 15 sur `a722f94`, exécution 38854421819 ; n° 16 sur
`bdaf755`, 38858371065 ; n° 17 sur `f24dfb0`, 38875612888 : 34 réussis, 1 sauté, 1 instable ;
n° 18 sur `db0a95f`, 38880135882 : 40 tests, 37 réussis, 1 sauté (`/cgu`, facultative),
2 instables). La configuration rejoue une fois un test en échec (`retries: 1`,
`app/e2e/recette-production/playwright.config.ts`) : un test « instable » a échoué au
premier essai puis réussi au second.

### Les contrôles des P1 « montant faux » (projet `recette-montants`, depuis la PR #195)
- **Quoi** : `app/e2e/recette-production/montants-p1.spec.ts` (étiquette `@montants`) joue
  les contrôles des quatre P1 de Q3/Q5 : **D04** (« 840,00 » tapé dans un navigateur réglé
  en anglais est enregistré et affiché 840,00 €), **D05** (le même envoi rejoué après une
  réponse perdue n'encaisse qu'une fois), **D37** (la ligne 250 vaut le montant qualifié, à
  l'écran et dans le champ du récapitulatif 2044), **D38** (une régularisation de
  l'exercice en cours est signalée et refusée sans confirmation explicite). Les quatre
  tests forment un bloc en série : un échec fait sauter les suivants.
- **Données éphémères** : dans le seul parc du propriétaire éphémère de la recette, la
  connexion de la recette à la base insère un bien et son lot, une fiche de locataire
  **sans adresse e-mail**, un bail actif, un appel de loyer de 840,00 € et une dépense
  « intérêts d'emprunt » de 2 345,67 € ; les écrans font ensuite deux encaissements, la
  confirmation de l'exercice fiscal du lot et la qualification de la dépense en ligne 250.
  Tout porte sur l'organisation éphémère et `purger.sql` le retire après passage ; aucun
  fichier déposé, aucun e-mail, aucun paiement.
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
  données neuves ; cause de l'échec de D04 non établie (ci-dessous). Voir
  [[Registre des anomalies — audit du 13 octobre 2026]].

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
  essai prouve). Ces corrections sont dans la PR #196 et n'ont pas encore été jouées en
  production : la recette qui suit sa fusion le confirmera.
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
- **Reste** : lire les traces Playwright de l'artefact `recette-production-38880135882`
  (conservé jusqu'au 30/10), que l'environnement de l'agent ne peut pas télécharger.

> [!warning] Ce que la recette ne joue pas (relevé du 16/10/2026)
> - **Aucun parcours d'artisan ni de super-administrateur** : l'espace artisan et la
>   console `/admin` ne sont jamais parcourus (constat du tour final de vérification).
>   L'invitation d'un artisan par un propriétaire (PR #194) n'est donc pas jouée : son
>   parcours navigateur (`app/e2e/invitation-artisan.spec.ts`) ne tourne que sur le banc
>   local.
> - Ni le refus ou la révision d'un devis (D18), ni le report ou l'annulation d'un
>   rendez-vous par le locataire (D22-B), ni le règlement d'une facture d'intervention
>   (D23-A), ni une relance d'invitation (X16), ni la recherche par référence (X18), ni le
>   plafond des appels IA (X19), ni l'avoir (D24-C, module désactivé), ni les e-mails du
>   relais (journal, entrées « audit » du 15/10).
> - ~~Ni les contrôles en production des P1 de la vague 1~~ → joués depuis la recette
>   n° 18 (projet `recette-montants`, ci-dessus), **sans** la génération du PDF 2044 ni le
>   chemin confirmé d'une régularisation d'exercice en cours.
> - **Échecs au premier essai** (ci-dessus) : une recette « en succès » peut cacher un
>   échec au premier essai ; le journal doit nommer les tests instables. « Créer la fiche »
>   est un défaut du test, corrigé par `72e1e0b` mais pas encore joué en production : la
>   recette suivante le confirmera. D04 : cause non établie, traces de l'artefact à lire
>   avant le 30/10.

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
