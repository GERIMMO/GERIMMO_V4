---
type: process
tags: [recette, production, lancement, personas, qualite]
status: draft
created: 2026-09-20
updated: 2026-09-20
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
  bancaire réelle pour l'abonnement (à rembourser ensuite depuis Stripe).
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
  adresse »** en français → confirmation → organisation en **essai 14 jours**
  visible dans `/admin` (« En essai »).
- Premier bien (gratuit) puis deuxième → **souscrire** : page d'abonnement →
  Stripe → carte réelle → retour dans l'espace, statut **active** ;
  `/admin` compte une active de plus ; Stripe montre l'abonnement avec la
  bonne quantité.
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
