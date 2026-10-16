---
type: process
tags: [recette, production, lancement, personas, qualite]
status: draft
created: 2026-09-20
updated: 2026-10-16
sources: ["[[Fonctionnalités par persona]]", "[[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]]", "[[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]", "[[Onboarding et abonnement]]", "[[Quittancement des loyers]]", "[[Cycle de vie d'un incident]]"]
---

# Recette de production

**En une phrase :** le tour complet de `gerimmo.app`, persona par persona, que
l'on fait **le jour du déploiement** et à chaque mise en production qui touche
un parcours — pour constater, sur le vrai service et les vrais courriers, que
ce que le banc a prouvé tient en production.

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
   `https://gerimmo.app/auth/confirm` figure dans les Redirect URLs.
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
Après chaque fusion déployée, le chantier GitHub « Recette de production avec
nettoyage » joue sur `gerimmo.app` les parcours de `app/e2e/recette-production/`
(public, inscription et récupération, administrateur d'agence, propriétaire, locataire)
avec des comptes éphémères, retirés à la fin. Recettes n° 4 à 14 consignées au journal
`log.md` (14 et 15/10) ; celles du 16/10 sur `a722f94` (exécution 38854421819) et `bdaf755`
(38858371065) ont réussi d'après GitHub Actions, sans entrée au journal de `main` à cette
date.

> [!warning] Ce que la recette ne joue pas (relevé du 16/10/2026)
> - **Aucun parcours d'artisan ni de super-administrateur** : l'espace artisan et la
>   console `/admin` ne sont jamais parcourus (constat du tour final de vérification).
> - Ni le refus ou la révision d'un devis (D18), ni le report ou l'annulation d'un
>   rendez-vous par le locataire (D22-B), ni le règlement d'une facture d'intervention
>   (D23-A), ni une relance d'invitation (X16), ni la recherche par référence (X18), ni le
>   plafond des appels IA (X19), ni l'avoir (D24-C, module désactivé), ni les e-mails du
>   relais (journal, entrées « audit » du 15/10).
> - Ni les contrôles en production des P1 de la vague 1 (encaissement avec virgule, rejeu
>   après réponse perdue, ligne 250 du 2044, régularisation d'un exercice non terminé).

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
