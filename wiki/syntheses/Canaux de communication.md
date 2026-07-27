---
type: synthesis
tags: [communication, bot, telegram, whatsapp, email]
status: in-progress
created: 2026-07-21
updated: 2026-07-25
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-module-15-messagerie]]", "[[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]", "[[2026-07-24-gerimmo-v3-module-19-mobile]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Canaux de communication

Synthèse des canaux par lesquels GERIMMO échange avec ses utilisateurs.

## Telegram (bot) — actif dans le code, **abandon acté** (humain, 2026-07-25)

**Décision : le bot Telegram n'est pas nécessaire — WhatsApp est le seul bot cible.**
À décommissionner lors de la migration V3 (le repli email couvre les cas sans
WhatsApp). État actuel du code, pour mémoire :
- Utilisé par : [[Locataire]] (déclarer/suivre [[Incident|incident]], demander des documents,
  choisir des créneaux), [[Artisan]] (répondre aux [[Devis]], proposer des créneaux, faire avancer
  l'[[Intervention et clôture|intervention]]), [[Propriétaire bailleur]] (voir biens, incidents, échéances).
- Webhook `/api/bot/telegram/webhook`, sécurité `X-Telegram-Bot-Api-Secret-Token`, déduplication par
  `update_id`, fichiers ≤ 10 Mo (JPG/PNG/WEBP/PDF).
- **Liaison par invitation** : jeton haché (SHA-256), expiration 30 min, `/start <token>` → compte lié
  (jamais par nom/numéro).

## WhatsApp (Meta Cloud API) — cible de migration (2026-07-18), non branché
- Même logique de bot réutilisée (adaptateur, parse, webhook `/api/bot/whatsapp/webhook`).
- Contrainte : **fenêtre de 24 h** → hors fenêtre, uniquement **templates Meta approuvés**.
- Liaison par **numéro de téléphone**. Telegram conservé en secours.
- **Enrôlement V3 (module 16)** : canal **optionnel avec repli email systématique**
  (RM-16.5.1/7) ; **consentement préalable daté, conservé, révocable** (case dans
  l'espace, STOP, ou via l'agence) ; 8 modèles Meta à faire approuver, **gérés par le
  super admin** ; « toute alerte doit disposer d'un canal de repli ».
- **Transfert hors UE (A4, 2026-07-24)** : Meta est le seul sous-traitant hors Union
  européenne. Acceptable par le triptyque **consentement explicite + canal optionnel
  + repli email permanent**, encadré par **clauses contractuelles types** — et le
  transfert doit être **déclaré aux agences** dans le contrat de sous-traitance
  (RM-A4.13). Voir [[Socle de sécurité]].

## E-mail (Resend) — documents & cycle de vie
- Deux files : `document_email_outbox` (quittances, relances, mises en demeure, rappels de documents)
  et `automation_events` (cycle de vie [[Abonnement|abonnements]]).
- Envoi via `dispatchPendingEmails()` / `dispatchLifecycleEmails()`, domaine `gerimmo.app`.

## Valeur probante des canaux (Livrable A3, 2026-07-24)
Aucun canal applicatif (email, bot, espace en ligne) n'a de **valeur probante** pour un
acte à effet juridique : les congés et mises en demeure partent en **LRAR ou par acte**,
hors plateforme, et l'agent saisit la date de première présentation —
voir [[Notification et valeur probante]]. L'email/l'espace personnel suffisent pour les
**documents courants** (quittances, appels de loyer, rapports — RM-A3.8). Les documents
financiers du propriétaire partent en **pièce jointe email, sans lien sécurisé**
(RM-A3.9, décision confirmée contre deux audits).

## La messagerie V3 (module 15, 2026-07-24)
**Toute conversation est rattachée à un objet** (bail, incident, lot — jamais de fil
général, RM-15.1.1) ; le locataire peut **ouvrir** une conversation. **WhatsApp
intégré** : message entrant → **file d'attente** → rattachement en un clic par l'agent
(alerte à 48 h) ; **la réponse emprunte le canal d'origine** (RM-15.4.1). Fil **à
trois** sur incident (l'artisan rejoint à l'affectation, retiré à la clôture, ne voit
que prénom + téléphone). Propriétaire : **traçage** des échanges qui engagent, sur le
mandat. Conversations **archivées avec le bail** (l'agence conserve, le locataire perd
l'accès).

> [!note] ~~Telegram absent du référentiel V3~~ — tranché le 2026-07-25
> Le sort de Telegram est décidé : **abandonné** (voir section Telegram ci-dessus).
> Reste au plan de migration : décommissionnement du bot et de sa liaison par jeton
> ([[Divergences code et référentiel V3]]).

## Pas de notifications push (module 19, 2026-07-24)

Décision actée : **site adapté au mobile, pas d'application native** — donc **pas de
notifications push**. « L'email et WhatsApp couvrent déjà les notifications »
(modules 14 et 16) ; le module 16 impose de toute façon un **repli email
systématique** pour toute alerte. Voir
[[2026-07-24-gerimmo-v3-module-19-mobile|module 19]].

## Messagerie interne + notifications
- Conversations directes/groupe entre membres d'une [[Organisation]], pièces jointes (10 Mo),
  notifications in-app, préférences par canal (`application`/`email`/`telegram`, heures calmes).

## Webhooks entrants — contrat V3 (Livrable A5, 2026-07-24)
Pour Yousign, Stripe et Meta : **signature vérifiée** (événement non signé rejeté +
alerte), **idempotence** par identifiant unique (un doublon est ignoré sans erreur),
**conservation 30 jours** + rejeu manuel super admin, réponse immédiate et traitement
asynchrone. Événements Meta : livré / lu (traces), **message entrant** (file de
rattachement), **consentement révoqué** (canal désactivé, repli email).
Voir [[Machines à états et événements]].

## Automatisations (Vercel Cron)
- Remplacent les 8 workflows n8n (abandonnés le 2026-07-20). Cron `/api/cron/automations` :
  génération des [[Période de loyer|échéances de loyer]], rappels de documents, envoi des e-mails en file.

> [!warning] Divergence — Vercel Cron (code) vs pg_cron (cible V3)
> Le [[2026-07-24-gerimmo-v3-architecture-lot-0|lot 0]] acte **pg_cron** pour les tâches
> planifiées (« un sous-traitant de moins, la logique reste avec les données ») alors que
> le code actuel s'appuie sur **Vercel Cron**. Les deux ont successivement remplacé n8n —
> migration des automatisations à prévoir. Voir [[Architecture du socle V3]].

> [!warning] Points à trancher
> - Migration WhatsApp non finalisée ; « loyer reçu ? » par bot au gestionnaire = fonctionnalité à venir
>   (templates Meta requis). Voir [[État du projet et décisions ouvertes]].
>