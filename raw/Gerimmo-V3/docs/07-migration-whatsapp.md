# 07 — Migration bot Telegram → WhatsApp (Meta Cloud API)

> Décision 2026-07-18 : remplacer Telegram par **WhatsApp**, via l'**API officielle Meta (WhatsApp Cloud API)**.
> Le code Telegram est conservé mais désactivable (secours). La logique métier du bot est indépendante du canal et réutilisée telle quelle.

## Ce qui est réutilisé (indépendant du canal)

- `src/services/bot/message-understanding.ts` — compréhension des messages (mots-clés), 0 couplage canal.
- `src/services/bot/brand-rules.ts`, `branding.ts` — règles de marque.
- Toute la logique métier de `telegram-bot-service.ts` en aval du parsing (incidents, documents, créneaux, conversations, `bot_*`).

## Ce qui est spécifique au canal (à écrire/adapter)

1. **Types** (`src/types/telegram-bot.ts`) : `BotChannel = "telegram" | "whatsapp"`. Généraliser `BotOutgoingMessage.chatId` (Telegram = number, WhatsApp = numéro E.164 string) → introduire un identifiant destinataire neutre. `externalMessageId` string (WhatsApp = `wamid…`).
2. **Adaptateur** `src/services/bot/whatsapp-adapter.ts` implémentant `BotChannelAdapter` via Graph API :
   - `sendMessage` → POST `graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` (type text + interactive buttons).
   - médias entrants → GET media URL puis download avec le token.
   - messages « hors 24 h » → **templates pré-approuvés** (pas de texte libre).
3. **Webhook** `src/app/api/bot/whatsapp/webhook/route.ts` :
   - `GET` = vérification (`hub.mode`, `hub.verify_token` = `WHATSAPP_VERIFY_TOKEN`, renvoyer `hub.challenge`).
   - `POST` = réception ; **valider la signature** `X-Hub-Signature-256` (HMAC SHA-256 avec `WHATSAPP_APP_SECRET`) ; parser `entry[].changes[].value.messages[]`.
4. **Cœur** : `processWhatsAppUpdate(payload)` qui mappe le format WhatsApp vers le pipeline commun.
5. **DB** : liaison des comptes par **numéro de téléphone** (aujourd'hui `telegram_accounts` = user/chat id numériques). Rendre le modèle neutre (colonne `channel` + identifiants génériques) ou table `whatsapp_accounts`. Adapter `bot_conversations.telegram_account_id`.
6. **Dashboard** : page réglages WhatsApp + flux de liaison (équivalent de `parametres/telegram`).
7. **Tests** : `tests/whatsapp-bot.test.ts` (miroir de `telegram-bot.test.ts`).

## Contraintes WhatsApp à respecter (différent de Telegram)

- **Fenêtre de 24 h** : hors de cette fenêtre, seuls des **templates approuvés par Meta** peuvent être envoyés (impacte les rappels d'incident spontanés).
- **Numéro dédié** + compte **WhatsApp Business** (Meta).
- Boutons interactifs limités (max 3 boutons « reply », ou listes).

## Variables d'environnement (à renseigner par l'utilisateur, côté Vercel)

- `WHATSAPP_ACCESS_TOKEN` — token (System User permanent recommandé, ou temporaire pour tester).
- `WHATSAPP_PHONE_NUMBER_ID` — id du numéro d'envoi.
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — id du WABA.
- `WHATSAPP_VERIFY_TOKEN` — valeur libre choisie par nous, saisie aussi dans la config webhook Meta.
- `WHATSAPP_APP_SECRET` — secret de l'app Meta, pour valider les signatures entrantes.

## Étapes côté utilisateur (Meta — délai réel possible)

1. Créer un compte **Meta Business** + une **App** (type Business) sur developers.facebook.com.
2. Ajouter le produit **WhatsApp** ; récupérer le numéro de test + `PHONE_NUMBER_ID` + `WABA_ID`.
3. Générer un **token**, récupérer l'**App Secret**.
4. Configurer le **webhook** vers `https://<app>/api/bot/whatsapp/webhook` avec le `verify token`, abonner l'événement `messages`.
5. Plus tard : ajouter un vrai numéro + faire approuver les **templates**.

## Ordre d'implémentation

Code d'abord (adaptateur + webhook + DB + cœur + tests, additif et sans casser Telegram), puis bascule du canal actif, puis branchement Meta + tests bout en bout, puis extinction de Telegram.
