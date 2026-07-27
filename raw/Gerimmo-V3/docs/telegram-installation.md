# Installation du bot Telegram GERIMMO V3

## Portee

Le Sprint 6 active uniquement Telegram. Aucun composant WhatsApp n'est installe.

## Variables d'environnement

Configurer uniquement cote serveur :

- `TELEGRAM_BOT_TOKEN` : jeton fourni par BotFather ;
- `TELEGRAM_WEBHOOK_SECRET` : secret aleatoire transmis dans l'en-tete Telegram ;
- `TELEGRAM_BOT_USERNAME` : nom public du bot sans arobase ;
- `TELEGRAM_WEBHOOK_URL` : URL publique de la route webhook ;
- `SUPABASE_SERVICE_ROLE_KEY` : cle serveur Supabase, jamais exposee au navigateur.

## Creation du bot

1. Ouvrir une conversation avec BotFather dans Telegram.
2. Utiliser `/newbot` et conserver le jeton uniquement dans Vercel.
3. Definir les commandes simples : `start`, `menu`, `aide`.
4. Ne jamais enregistrer le jeton dans GitHub.

## Webhook

Route publique : `/api/bot/telegram/webhook`.

Apres deploiement, enregistrer le webhook Telegram avec :

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

Parametres attendus :

- `url` : valeur de `TELEGRAM_WEBHOOK_URL` ;
- `secret_token` : valeur de `TELEGRAM_WEBHOOK_SECRET` ;
- `allowed_updates` : `message` et `callback_query`.

## Securite

- La route valide `X-Telegram-Bot-Api-Secret-Token`.
- Chaque `update_id` est traite une seule fois.
- Les comptes sont lies uniquement par invitation temporaire hachee.
- Les noms, pseudonymes et numeros de telephone Telegram ne servent jamais d'identite.
- Les fichiers sont limites a 10 Mo et aux formats JPG, PNG, WEBP et PDF.
- Les erreurs affichees aux utilisateurs ne contiennent aucune information interne.

## Mode simule

Sans jeton Telegram, les tests locaux valident la classification, les limites de questions, les creneaux, les permissions SQL et la deduplication. Le webhook reel reste inactif jusqu'a la configuration des quatre variables Telegram.
