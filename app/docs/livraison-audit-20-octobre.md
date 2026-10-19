# Lot de vérification du 20 octobre 2026

État : préparation et contrôles locaux ; aucune application en production consignée dans ce document.

## Portée

- Durcissement de /auth/confirm (consigne hors dépôt), vérifié sur GoTrue v2.197.0 et sur le banc navigateur.
- Contrôle des sessions, avec réponse temporaire conservant les cookies renouvelés quand la lecture est indisponible.
- Association d'un client Stripe réservée au serveur après contrôle de l'organisation dans l'action.
- Historique des migrations inclus dans les nouvelles sauvegardes ; restauration vérifiant aussi son contenu. Les anciennes copies restent restaurables et signalent son absence.
- Rejet d'une analyse de veille par le contrôle des sources distingué d'une panne ; les erreurs d'enregistrement restent des échecs.
- Configuration Dependabot hebdomadaire, modèles français de notifications et actualisation technique du registre Zoho.

Les modèles de notifications ne sont pas installés par cette PR. Les options de sécurité GitHub et Supabase ne sont pas activées par le dépôt de ces fichiers.

## Ordre des migrations

1. `20261020010000_abonnement_client_service.sql`
2. `20261020011000_session_origine_verifiee.sql`

Relevé préalable : définition de `abonnement_client_pose` et droits examinés en production en lecture seule ; `ma_session_active` est une fonction nouvelle. Rejeu et retours éprouvés sur la base fictive isolée.

## Précondition impérative pour la souscription

La première migration réserve une fonction au serveur. L'ancien code utilisait la session du client : **les nouvelles souscriptions doivent rester fermées pendant l'application de la migration et le déploiement du code**. Le relevé du 20 octobre constate la garde PR212 fermée par l'identité de l'éditeur incomplète. Cette situation doit être revérifiée juste avant toute application : le relevé ancien ne vaut pas autorisation de lancer.

Si la souscription a été ouverte entre-temps, **ne pas appliquer ce lot tel quel**. Préparer deux phases compatibles : RPC serveur additive, puis code utilisateur de cette RPC, puis retrait de l'ancienne autorisation dans une livraison suivante. Ne pas lever la garde pour valider le chantier avec un paiement réel.

## Livraison

Suivre le § 6 de la passation du 16 octobre : relecture indépendante, CI sur le SHA exact, simulation des deux fichiers dans cet ordre, sauvegarde récente, application, vérification des droits, fusion en squash, déploiement READY et recette avec les comptes permanents conservés. Aucun de ces contrôles locaux ne remplace la recette de production.

La relecture indépendante a relevé deux P2, corrigés et relus : conservation des cookies sur la réponse temporaire, fidélité de la révocation dans le banc. Aucun constat bloquant résiduel identifié dans cette relecture ; le second lecteur n'a pas exécuté les tests ni interrogé la production.

## Retour

Garder la souscription fermée. Revenir au code antérieur avant de supprimer `ma_session_active`, puis appliquer les retours dans l'ordre inverse après sauvegarde :

1. `20261020011000_session_origine_verifiee.retour.sql`
2. `20261020010000_abonnement_client_service.retour.sql`

Ce retour restaure les anciens droits de l'association Stripe. Il ne remet pas en service les notifications, les accès ou les réglages externes.

## Limites

Ne sont pas clos par ce lot : délais globaux Supabase Auth, réception des notifications, validation marketing obligatoire, fermeture du cautionnement, protections de branche, renouvellement des accès, rapprochement Stripe, fichiers volumineux, retrait de l'ancien prestataire, politique de suppression et de conservation, examen juridique, identité de l'éditeur et bascule complète de secours. Aucun achat, paiement, courrier ou circuit de signature réel n'a été déclenché par ces contrôles.
