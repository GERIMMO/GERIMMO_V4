---
type: synthesis
tags: [lancement, production, configuration, stripe, e-mails, rgpd, checklist]
status: stable
created: 2026-09-20
updated: 2026-09-20
sources: ["[[État du projet et décisions ouvertes]]", "[[Gerimmo en autonomie]]", "[[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]]", "[[Grille tarifaire]]", "[[Canaux de communication]]", "[[Fonctionnalités par persona]]"]
---
# Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)

Point d'information du porteur du projet (20/09) : **Gerimmo doit être publié
dans dix jours**, soit autour du **30 septembre 2026**. Le bot WhatsApp **ne
fait pas partie du lancement** (trop long ; il sera repris juste après —
décision humaine, voir [[Canaux de communication]]).

Cette page répond à « dis-moi ce qu'il reste à faire ». Elle part de deux
choses : ce que dit le wiki des chantiers volontairement laissés « après les
devs » ([[État du projet et décisions ouvertes]], § B) et **l'état réel de la
production** constaté ce matin.

---

## 1. Où en est la production ce matin (constat, pas opinion)

| Point | Constat au 20/09 |
|---|---|
| Code | `main` déployé, à jour des PR #64 et #65 ; CI verte |
| Base | Toutes les migrations appliquées, y compris les relances automatiques (20/09) |
| Tâches du matin | `quittances`, `appels`, `rappels` **ont tourné aujourd'hui** (0 envoi : aucune organisation n'a activé l'automatique) |
| Tâche `abonnements` | **N'a jamais tourné** : la route répond 503 avant tout journal quand Stripe n'est pas configuré → **les clés Stripe ne sont pas posées en production** |
| Tâche `relances` | Première passe demain 7 h 45 UTC (fusionnée ce matin) |
| Organisations | 3, toutes créées pendant le développement (27/07 ×2, 30/08), statut `active` sans abonnement ; 3 personnes à adresses de test |
| Comptes | 12 comptes, **un seul second facteur vérifié** (le super-admin est forcé au MFA par le code — `src/lib/mfa.ts`) |
| Automatisations | Quittances, appels et relances automatiques **toutes éteintes** sur les 3 organisations |
| Pages légales | Mentions légales, confidentialité et conditions d'utilisation existent (`/mentions-legales`, `/confidentialite`, `/conditions`) |
| Avis Supabase (sécurité) | 210 fonctions `security definer` appelables par `authenticated` et 7 tables RLS sans politique : **c'est la conception retenue** (la vérification est dans la fonction, les tables ne se lisent qu'à travers elles) — à documenter, pas à corriger |

Conclusion du constat : le produit tourne, les automatismes sont branchés,
mais **la facturation n'existe pas encore en production** et rien n'a été
testé en conditions réelles d'envoi.

---

## 2. Bloquant — sans quoi on ne publie pas

Dans l'ordre où je les ferais.

### 2.1 Stripe en mode réel
- Poser dans Vercel `STRIPE_SECRET_KEY` (clé *live*), `STRIPE_PRIX_BIEN`,
  `STRIPE_PRIX_LOT_AGENCE`, `STRIPE_WEBHOOK_SECRET`.
- Créer les deux prix chez Stripe conformes à [[Grille tarifaire]] :
  propriétaire direct **par bien** (1ᵉʳ bien gratuit, puis 5,99 €/bien/mois) ;
  agence **par palier de lots** (tarif gradué).
- Déclarer le point de terminaison `/api/stripe/webhook` avec les événements
  `customer.subscription.created / updated / deleted / paused / resumed`.
- **Tester de bout en bout** avec une vraie carte : inscription d'un
  propriétaire → essai → carte → statut `active` → la tâche `abonnements`
  journalise enfin une passe.
- Pourquoi c'est bloquant : l'essai dure **14 jours** ([[État du projet et décisions ouvertes]], décision du 19/08). Sans Stripe, tout inscrit du jour
  J passe **en lecture seule le 15ᵉ jour** sans pouvoir payer.

### 2.2 Les e-mails partent vraiment
- Domaine `gerimmo.app` **vérifié chez Resend** (SPF, DKIM) et
  `RESEND_EXPEDITEUR` posée sur ce domaine. L'expéditeur de test de Resend ne
  livre qu'au titulaire du compte.
- **SMTP personnalisé dans Supabase Auth** (confirmation d'inscription,
  réinitialisation de mot de passe, invitations) : le service par défaut est
  plafonné à quelques envois par heure — le premier après-midi d'inscriptions
  le sature.
- Envoyer et **lire** un exemplaire réel de chaque courrier : confirmation
  d'inscription, invitation, réinitialisation, quittance, appel de loyer,
  rappel d'échéance, relance d'impayé, relance de prélèvement.

### 2.3 Variables de production complètes
Liste de `app/.env.example` à confronter à Vercel :
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `CRON_SECRET`,
`RESEND_API_KEY`, `RESEND_EXPEDITEUR`, les quatre `STRIPE_*`,
`NEXT_PUBLIC_SITE_URL=https://gerimmo.app`. Les trois premières et
`CRON_SECRET` sont posées (les tâches du matin tournent) ; **les Stripe
manquent** ; les autres restent à vérifier.

### 2.4 Décider du sort des données de développement
Les 3 organisations, leurs 5 baux, 18 lots et les 3 personnes à adresses de
test sont dans la base de production. Deux voies, **au choix du porteur** :
- les **purger** avant l'ouverture (base propre, journal propre) ;
- les **garder comme organisations de démonstration** — alors renommer les
  personnes de test et ne jamais y activer d'envoi automatique.
Je ne supprime rien sans décision explicite.

### 2.5 Sauvegardes et restauration
- Projet Supabase sur un **plan avec sauvegardes quotidiennes** (idéalement
  PITR), **région UE** — chantier laissé « après les devs » dans
  [[État du projet et décisions ouvertes]] (PRA visé : RPO 24 h / RTO 4 h).
- Faire **un premier test de restauration** sur une branche ou un projet
  jetable **avant** l'ouverture : une sauvegarde jamais restaurée n'existe
  pas.

### 2.6 Les faits de l'éditeur sur les pages légales
Les mentions légales, les conditions et la page confidentialité tirent
l'identité de l'éditeur de `app/src/lib/editeur.ts` — **tous les champs sont
encore vides** : dénomination, forme juridique, siège, RCS, SIRET, directeur
de la publication, adresse de contact, médiateur de la consommation. Tant
qu'ils le sont, les trois pages affichent un encadré « document en cours de
finalisation » et des passages « à fournir ». C'est une obligation de la LCEN
(art. 6-III) sur un site marchand : **à remplir avant l'ouverture**, en une
fois, dans ce seul fichier. Seul le porteur connaît ces faits.

### 2.7 Accès super-admin
- Chaque compte super-admin avec son **second facteur enrôlé** (le code
  l'impose ; il ne reste plus qu'à le faire pour chaque personne).
- Mots de passe des comptes créés pendant le développement **changés** s'ils
  restent en production.

---

## 3. Important — à faire dans les dix jours, peut glisser de quelques jours

- **RGPD, côté papier** : registre des traitements de la plateforme et
  procédure de notification de violation (72 h) — deux documents, pas de code
  ([[État du projet et décisions ouvertes]], § B). La page de
  confidentialité doit citer l'hébergeur et la région retenus.
- **Restrictions réseau Supabase** : l'accès direct à la base limité aux
  adresses utiles ; clés `service_role` jamais côté client (déjà vrai dans le
  code, à vérifier dans Vercel).
- **Recette de production le jour du déploiement** : un parcours complet par
  persona sur `gerimmo.app` (agence : inviter un agent, créer un lot, un bail,
  quittancer ; propriétaire direct : s'inscrire, premier bien, payer ;
  locataire : ouvrir l'invitation, lire la quittance ; artisan : candidater).
  Le crawler de l'audit de nuit peut servir de trame ([[Audit de nuit — fonctionnalités, personas et automatisation (20 septembre 2026)]]).
- **Où regarder les premiers jours** : `/admin/journaux` (journal technique et
  passes des tâches), le tableau de bord des tâches Vercel, le tableau de bord
  Resend (rebonds), Stripe (webhooks en échec). Convenir d'un **rituel
  quotidien** de cinq minutes la première semaine.
- **Activer l'automatique dès l'arrivée** : proposer le quittancement, les
  appels et les relances automatiques dans le parcours de démarrage (proposition
  n° 7 de l'audit de nuit) — sinon chaque nouvelle organisation démarre
  « tout à la main », à rebours de l'objectif du projet.
- **Antivirus des pièces déposées** : laissé après les devs ; **acceptable de
  publier sans**, à condition de le noter comme risque connu et de le planifier.

---

## 4. Peut attendre — après l'ouverture

- **Bot WhatsApp** (décision du 20/09 ; voir [[Documents a generer et automatisation WhatsApp]] pour ce qui est prêt côté documents).
- Les **sept propositions** de l'audit de nuit (doublon d'incident en un clic,
  rapport de gestion à la clôture, dépenses récurrentes, « J'ai réglé » côté
  locataire, alertes ↔ incidents, délais 5 / 15 jours à confirmer, tableau
  de bord propriétaire au style v4).
- Suite de la refonte visuelle (Agenda + Alertes, Paramètres, Personnes, Parc,
  Incidents, Comptabilité), mode sombre, les dix photos restantes.
- Format définitif d'export du journal ; écran d'information CGU au
  paramétrage ; Yousign (V0 sans intégration maintenue).

---

## 5. Fait dans la foulée (20/09, après « Fais tout ce que tu peux faire seul »)

Ce que l'agent a livré seul, sur la branche de travail (PR ouverte, fusion
sur décision du porteur) :

- **Écran « Santé du service »** (`/admin/sante`, entrée de menu de la
  console) : chaque variable de production avec son état — posée, à vérifier,
  manque — sans jamais afficher une valeur (clé Stripe de test signalée,
  expéditeur `resend.dev` refusé, adresse locale refusée) ; les six tâches
  planifiées avec leur dernière passe et son bilan (à l'heure, en retard,
  jamais passée, en échec) ; les faits de l'éditeur manquants ; l'adoption
  des envois automatiques par les organisations vivantes. La page de
  supervision affiche un bandeau « Le service n'est pas prêt : n points »
  tant qu'un manque subsiste — il disparaît seul.
- **L'automatique proposé dès le parcours de démarrage** (proposition n° 7
  de l'audit de nuit) : le bloc du démarrage propose « Activer les envois
  automatiques » tant que les trois sont éteints ; le tableau de bord et le
  parcours partagent désormais la même liste (`lib/envois-automatiques.ts`).
- **Région Vercel fixée à Paris** (`vercel.json`, `regions: ["cdg1"]`) : sans
  ce réglage, le serveur s'exécutait à Washington et chaque page faisait un
  aller-retour transatlantique vers la base de Paris (RM-A4.7, hébergement
  européen — et de la latence en moins). Mentions légales mises à jour.
- **Page confidentialité réécrite** à partir du code et de la base : qui est
  responsable de quoi, données traitées, sous-traitants et régions, durées de
  `retention_rules`, mesures en place, droits et CNIL. Elle ne promet rien
  qui n'existe pas (la restauration testée en a été retirée).
- **Modèles d'e-mails d'authentification en français**
  (`app/supabase/templates/`, avec un LISEZ-MOI) : inscription, accès /
  mot de passe (le même courrier sert à l'invitation, l'application passe
  par le flux de réinitialisation), changement d'adresse — à coller dans le
  tableau de bord Supabase, avec les réglages d'URL et de SMTP indiqués.
- **Relecture des dix courriers du service** (`lib/*-email.ts` et les corps
  en ligne des actions) : français, liens construits sur l'adresse du site,
  ton conforme ; rien à corriger.
- **Wiki** : [[Registre des traitements]] (brouillon, deux volets),
  [[Procédure de notification de violation]] (chaîne, gestes, gabarits),
  [[Recette de production]] (le tour de `gerimmo.app` persona par persona).

**Reste au porteur** : les comptes Stripe et Resend, le DNS, le SMTP et les
modèles dans Supabase, le plan Supabase et le test de restauration, les faits
de l'éditeur, le sort des données de développement, le MFA des personnes.

## 6. Proposition de calendrier

| Jour | Quoi |
|---|---|
| J-10 → J-9 (20–21/09) | Stripe : prix, clés *live*, webhook ; premier paiement de test réel |
| J-8 (22/09) | Resend : domaine vérifié, expéditeur ; SMTP Supabase Auth ; lecture de chaque courrier |
| J-7 (23/09) | Variables Vercel passées en revue dans « Santé du service » ; faits de l'éditeur remplis ; décision sur les données de développement, puis purge ou renommage |
| J-6 (24/09) | Plan Supabase, région, sauvegardes ; **test de restauration** |
| J-5 → J-4 (25–26/09) | Recette de production par persona ; corrections mineures ; MFA de chaque super-admin |
| J-3 → J-2 (27–28/09) | Registre des traitements, procédure de violation, page confidentialité relue ; automatique proposé au démarrage |
| J-1 (29/09) | Gel du code ; « Santé du service » sans manque, six tâches à l'heure |
| J0 (30/09) | Ouverture ; rituel quotidien de surveillance pendant une semaine |

Ce que je peux faire seul dans ce calendrier : tout ce qui est code et wiki
(automatique au démarrage, trame de recette, registre des traitements en
brouillon, relecture de la page de confidentialité, vérification des
journaux). Ce qui relève du porteur : comptes Stripe et Resend, DNS du
domaine, plan Supabase, choix sur les données de développement, MFA des
personnes.

> [!warning] Points à trancher
> - **Données de développement** : purger ou garder en démonstration (§ 2.4).
> - **Antivirus** : publier sans, en risque accepté, ou retarder ?
> - **Plan Supabase** : le plan gratuit n'a pas de sauvegarde quotidienne —
>   le passage au plan payant est-il acté avant l'ouverture ?
> - Les **délais 5 / 15 jours** des relances automatiques restent un choix
>   de départ non confirmé par le porteur.
