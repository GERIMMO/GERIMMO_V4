# 05 — Envoi des e-mails métier (+ archives n8n)

> ## ⚠️ DÉCISION 2026-07-20 : n8n n'est plus le chemin retenu.
>
> Les e-mails métier sont désormais **envoyés par l'application elle-même** :
> - envoi via **Resend** (`src/lib/email/resend.ts`), avec le domaine gerimmo.app déjà vérifié ;
> - vidage de la file `document_email_outbox` par `dispatchPendingEmails()` (`src/services/email-dispatch-service.ts`) ;
> - déclenchement par **Vercel Cron** : `GET /api/cron/automations` (une fois par jour, cf. `vercel.json`),
>   qui génère les loyers le 1er, met en file les rappels de documents, puis envoie les e-mails en attente ;
> - déclenchement manuel possible : `POST /api/cron/automations` par un super administrateur connecté.
>
> **Pourquoi** : la documentation ci-dessous constatait elle-même que n8n « se contente d'orchestrer l'envoi
> d'e-mails », que son hébergement n'était pas localisé, et que les 8 workflows étaient déclenchés par webhook
> alors que l'app expose des endpoints de *tirage* — incompatibilité à réécrire. Un service externe de plus à
> héberger, payer et surveiller, pour une tâche que trois fichiers couvrent, ne se justifiait pas.
>
> **Variables requises (Vercel)** : `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (ce dernier existe déjà pour
> `/api/cron/production-health`).
>
> Les endpoints `/api/automations/business` et `/api/automations/rent` restent en place : ils fonctionnent et
> permettraient de rebrancher n8n plus tard sans rien réécrire. La suite de ce document décrit ce modèle n8n,
> conservée comme référence.

---

> Statut au 2026-07-18 : **PRÉPARÉ, NON ACTIVÉ.** Les 8 workflows existent (`n8n/workflows/*.json`) mais sont `active: false`.
> n8n n'est pas critique : l'app fonctionne sans lui. Il ne gère que les **e-mails/relances** liés aux abonnements.
> Ne pas activer tant que **Stripe** (paiements) et le **service d'e-mails** ne sont pas configurés — sinon le robot n'a rien à traiter.

## Rôle de n8n

n8n est le « robot d'e-mails » du cycle de vie des abonnements. GERIMMO garde toute la logique métier ;
n8n se contente d'orchestrer l'envoi d'e-mails de relance. Reprise possible sans altérer les données d'abonnement.

## Architecture (modèle « tirage » / pull)

1. L'app enregistre les événements dans la table `automation_events` (statut `pending`).
   Sources : `stripe-service.ts` (webhooks Stripe), `business-service.ts`, `admin-functional-service.ts`.
2. n8n interroge périodiquement l'endpoint app **`POST /api/automations/business`**, authentifié par l'en-tête
   `x-gerimmo-automation-secret` = `N8N_BUSINESS_WEBHOOK_SECRET`. Actions supportées :
   - corps `{ "action": "evaluate_lifecycle" }` → exécute la RPC `evaluate_subscription_lifecycle` (suspensions, fins d'essai…).
   - corps vide → renvoie jusqu'à 25 événements `pending` échus.
   - corps `{ "action": "acknowledge", "eventId": "…" }` → marque l'événement `processed`.
3. Pour chaque événement, n8n envoie l'e-mail correspondant via le fournisseur d'e-mails, puis `acknowledge`.

⚠️ **Incohérence à réconcilier avant activation** : les 8 fichiers workflow sont déclenchés par **webhook**
(chemins `gerimmo-*`), ce qui suppose que l'app **pousse** vers n8n. Or l'app ne pousse pas (pas d'appel à
`N8N_BUSINESS_WEBHOOK_URL` dans le code) : elle expose l'endpoint de tirage ci-dessus. Choisir un seul modèle à l'activation :
soit ajouter le push app→n8n, soit remplacer les déclencheurs webhook par un déclencheur planifié (Schedule) qui tire l'endpoint.

## Les 8 workflows (`n8n/workflows/`)

| Fichier | Objet | Chemin webhook |
|---|---|---|
| trial-expiration.json | Fin d'essai | gerimmo-trial-expiration |
| payment-succeeded.json | Paiement accepté | gerimmo-payment-succeeded |
| payment-failed.json | Paiement refusé | gerimmo-payment-failed |
| renewal.json | Renouvellement | gerimmo-renewal |
| suspension.json | Suspension | gerimmo-suspension |
| reactivation.json | Réactivation | gerimmo-reactivation |
| invoice-generated.json | Facture générée | gerimmo-invoice |
| promotion-applied.json | Code promotionnel | gerimmo-promotion |

## Variables et secrets

Côté **app (Vercel)** :
- `N8N_BUSINESS_WEBHOOK_SECRET` — secret partagé avec n8n (obligatoire).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — pour générer les `automation_events` de paiement.
- `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` — envoi d'e-mails.

Côté **n8n** :
- `GERIMMO_API_URL` — URL de l'app (ex. domaine Vercel de prod).
- `N8N_BUSINESS_WEBHOOK_SECRET` — même valeur que côté app.
- `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`.

## Workflows loyers / quittances / rappels documents (bloc 4 — ajouté 2026-07-19)

Même modèle « tirage » et même secret (`x-gerimmo-automation-secret` = `N8N_BUSINESS_WEBHOOK_SECRET`).
Endpoint dédié : **`POST /api/automations/rent`**. Toute la logique métier reste côté GERIMMO
(fonctions SQL) ; n8n déclenche et envoie les e-mails.

Actions supportées :

| Corps | Effet | Réponse |
|---|---|---|
| `{ "action": "generate_rent_periods" }` (option. `"month": "YYYY-MM-01"`) | RPC `generate_rent_periods_for_month` : crée les loyers du mois pour toutes les locations actives (idempotent). | `{ created: <n> }` |
| `{ "action": "queue_document_reminders" }` | RPC `queue_document_expiry_reminders` : met en file les rappels des documents officiels arrivant à échéance (anti-doublon 30 j). | `{ queued: <n> }` |
| corps vide | Renvoie jusqu'à 50 e-mails `pret` de `document_email_outbox` (quittances, relances, mises en demeure, rappels documents). | `{ emails: [...] }` |
| `{ "action": "mark_email_sent", "outboxId": "…" }` | Marque la ligne d'outbox `envoye` (+ `sent_at`). | `{ acknowledged: true }` |

Planification n8n recommandée :
- **Mensuel (ex. le 1er)** : `generate_rent_periods` — génère les échéances de loyer du mois.
- **Quotidien** : `queue_document_reminders` — rappels d'échéance documents.
- **Toutes les X minutes** : tirer les e-mails `pret`, les envoyer via le fournisseur, puis `mark_email_sent`.

Contrat de la file e-mails (`document_email_outbox`) : l'app écrit des lignes `status='pret'` (quittances validées,
relances/mises en demeure, rappels documents). n8n les envoie et repasse chaque ligne à `envoye` via `mark_email_sent`.
Les statuts `erreur`/`archive` existent aussi (voir contrainte `document_email_status_valid`).

⚠️ La question WhatsApp « loyer reçu ? » posée au gestionnaire (agent/propriétaire selon `organizations.organization_type`)
et les notifications spontanées nécessitent des **templates Meta approuvés** (message hors fenêtre 24 h) — à faire avant activation.

## Checklist d'activation (le jour venu)

1. [ ] Stripe configuré et webhooks branchés (les `automation_events` se remplissent).
2. [ ] Service d'e-mails configuré (`EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`).
3. [ ] Définir `N8N_BUSINESS_WEBHOOK_SECRET` (même valeur sur Vercel et n8n).
4. [ ] Importer les 8 JSON dans n8n (Import from File).
5. [ ] Réconcilier le déclencheur (Schedule qui tire l'endpoint, ou push app→n8n) — voir l'incohérence ci-dessus.
6. [ ] Renseigner les variables n8n (`GERIMMO_API_URL`, secret, e-mail).
7. [ ] Tester un événement de bout en bout, puis passer les workflows en `active: true`.
8. [ ] Surveiller `automation_events.status` (`failed`) et la table `business_email_outbox`.
9. [ ] Bloc 4 : créer les 3 planifications n8n sur `POST /api/automations/rent` (générer loyers mensuels,
       rappels documents quotidiens, envoi des e-mails `document_email_outbox`). Le service d'e-mails doit être configuré.
