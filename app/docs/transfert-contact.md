# Transfert de la boîte de contact

Demande du dirigeant du 22 octobre 2026 : les messages adressés à `contact@gerimmo.app` doivent parvenir à sa boîte Gmail professionnelle. Aucune autre boîte du domaine n'est transférée, aucune réponse automatique aux clients, aucun compte ni dossier d'essai créé en production.

## Activation

1. Publier `/api/resend/contact` après validation de la CI.
2. Dans Resend, créer un webhook vers `https://www.gerimmo.app/api/resend/contact`, événement `email.received` uniquement.
3. Le dirigeant copie lui-même la clé de signature dans Vercel Production : `RESEND_CONTACT_WEBHOOK_SECRET`. Ne jamais la consigner dans Git, une capture ou une conversation.
4. Renseigner la destination approuvée dans `RESEND_CONTACT_TRANSFERT_VERS`, puis `RESEND_CONTACT_TRANSFERT_ACTIF=true`. La clé Resend existante doit autoriser la lecture des messages entrants et l'envoi. Une clé limitée à l'envoi ne suffit pas ; ne pas élargir ses droits silencieusement.
5. Redéployer avec ces réglages. Le transfert est toujours fermé en Preview et sans configuration complète.
6. Vérifier une véritable réception choisie par le dirigeant : événement Resend réussi, envoi marqué Delivered, puis présence dans Gmail confirmée par le destinataire. Aucun message d'essai supplémentaire sans accord.

## Fonctionnement et limites

- Signature Svix vérifiée sur le corps brut, horodatage contrôlé par le SDK officiel ; l'adresse de destination n'est jamais reçue dans la requête.
- Lecture authentifiée du message Resend, puis du MIME original : texte, HTML, pièces jointes et images intégrées conservés. Contenu et pièces jointes ne sont pas enregistrés dans la base Gerimmo ni dans ses journaux.
- Expéditeur du transfert : `Nom via Gerimmo <contact@gerimmo.app>`. Le Reply-To vise l'adresse de réponse d'origine (à défaut son expéditeur). Gmail répond avec l'adresse Gmail du dirigeant ; répondre sous `contact@gerimmo.app` demande une configuration d'envoi distincte.
- L'original reste chez Resend selon sa durée de conservation. Les transferts utilisent le quota d'envoi existant, sans nouvelle offre payante ni dépassement automatique activé.
- Une clé d'idempotence stable par message protège les reprises pendant les 24 h garanties par Resend. Les messages de plus de 23 h sont bloqués avec `reprise_manuelle_requise` pour ne pas renvoyer après expiration de cette protection. Vérifier d'abord les envois avant toute reprise manuelle ; ne pas rejouer sans contrôle.
- En cas d'échec, la route renvoie un statut d'erreur : Resend réessaie et conserve le défaut dans son journal. Resend peut suspendre un endpoint qui échoue durablement et avertir le compte. Surveiller les échecs du webhook et le quota.
- Bornes : notification 256 Kio, métadonnées 2 Mio, MIME 40 Mio, attente fournisseur 25 s. Au-delà, échec visible et original conservé chez Resend ; récupération humaine nécessaire. Aucun succès silencieux avec pièce jointe manquante.
- Un en-tête de transfert empêche une boucle. Les messages à d'autres adresses sont ignorés. Les courriels frauduleux restent des courriels reçus : cette redirection ne valide pas leur contenu ni leur auteur.
- Arrêt : `RESEND_CONTACT_TRANSFERT_ACTIF=false` puis redéploiement, ou désactivation du webhook Resend. La réception et les autres e-mails Gerimmo restent disponibles.

## Sources vérifiées le 22 octobre 2026

- https://resend.com/docs/dashboard/receiving/forward-emails
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/retries-and-replays
- https://resend.com/docs/api-reference/emails/retrieve-received-email

## Validation

Tests locaux avec appels réseau interceptés : signatures réelles HMAC et horodatage, boîte source, destination unique, texte/HTML, pièce jointe et CID, Reply-To, reprise et clé stable, ancienneté, boucle, URL de stockage, quotas, coupure réseau, flux volumineux et exemption précise du proxy. Aucun envoi réel exécuté par ces tests.
