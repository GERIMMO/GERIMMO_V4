# Workflows Business n8n

Les workflows du Sprint 10 sont volontairement petits et indépendants. Ils consomment des événements enregistrés dans `automation_events` et n’embarquent aucune règle métier critique.

## Variables serveur

- `GERIMMO_API_URL`
- `N8N_BUSINESS_WEBHOOK_SECRET`
- `EMAIL_PROVIDER_API_KEY`
- `EMAIL_FROM`

## Workflows

- Fin d’essai
- Paiement accepté
- Paiement refusé
- Renouvellement
- Suspension
- Réactivation
- Facture générée
- Code promotionnel

Les changements d’état restent exécutés par GERIMMO. n8n orchestre les relances et l’envoi des e-mails, ce qui permet une reprise sans altérer les données d’abonnement.
