# Lot de vérification du 20 octobre 2026

État : préparation et contrôles locaux ; aucune application en production consignée dans ce document.

## Portée

- Durcissement de /auth/confirm (consigne hors dépôt), vérifié sur GoTrue v2.197.0 et sur le banc navigateur.
- Contrôle des sessions, avec réponse temporaire conservant les cookies renouvelés quand la lecture est indisponible.
- Association d'un client Stripe réservée au serveur après contrôle de l'organisation dans l'action.
- Historique des migrations inclus dans les nouvelles sauvegardes ; restauration vérifiant aussi son contenu. Les anciennes copies restent restaurables et signalent son absence.
- Rejet d'une analyse de veille par le contrôle des sources distingué d'une panne ; les erreurs d'enregistrement restent des échecs.
- Réceptions Stripe durables, reprises bornées, contrôle des écarts et supervision ; aucun nouveau paiement ni remboursement créé par le rapprochement.
- Vérification des dépôts locataire et artisan, sans déplacement ni suppression de pièces.
- Recette en lecture seule des 17 rubriques superadmin ; en-tête corrigé et vérifié à 320, 390 et 1 440 pixels.
- Retrait du connecteur et du webhook Youtrust ; types historiques conservés et aucune purge de circuits.
- Configuration Dependabot hebdomadaire, modèles français de notifications et actualisation technique du registre Zoho.

Les modèles de notifications ne sont pas installés par cette PR. Les options de sécurité GitHub et Supabase ne sont pas activées par le dépôt de ces fichiers.

## Ordre des migrations

1. `20261020010000_abonnement_client_service.sql`
2. `20261020011000_session_origine_verifiee.sql`
3. `20261020020000_stripe_reprises_durables.sql`
4. `20261020030000_stockage_gabarits_roles.sql`
5. `20261020011556_signature_preparation_abandon.sql`
6. `20261020083058_signature_suivi_reprises_relances.sql`
7. `20261020084651_depots_directs_temporaires.sql`

Relevé préalable : définition de `abonnement_client_pose` et droits examinés en production en lecture seule ; `ma_session_active` est une fonction nouvelle. Rejeu et retours éprouvés sur la base fictive isolée.

## Précondition impérative pour la souscription

La première migration réserve une fonction au serveur. L'ancien code utilisait la session du client : **les nouvelles souscriptions doivent rester fermées pendant l'application de la migration et le déploiement du code**. Le relevé du 20 octobre constate la garde PR212 fermée par l'identité de l'éditeur incomplète. Cette situation doit être revérifiée juste avant toute application : le relevé ancien ne vaut pas autorisation de lancer.

Si la souscription a été ouverte entre-temps, **ne pas appliquer ce lot tel quel**. Préparer deux phases compatibles : RPC serveur additive, puis code utilisateur de cette RPC, puis retrait de l'ancienne autorisation dans une livraison suivante. Ne pas lever la garde pour valider le chantier avec un paiement réel.

## Livraison

Suivre le § 6 de la passation du 16 octobre : relecture indépendante, CI sur le SHA exact, simulation des sept fichiers dans cet ordre, sauvegarde récente, application, vérification des droits, fusion en squash, déploiement READY et recette avec les comptes permanents conservés. Aucun de ces contrôles locaux ne remplace la recette de production.

La relecture indépendante a relevé deux P2, corrigés et relus : conservation des cookies sur la réponse temporaire, fidélité de la révocation dans le banc. Aucun constat bloquant résiduel identifié dans cette relecture ; le second lecteur n'a pas exécuté les tests ni interrogé la production.

## Retour

Garder la souscription fermée. Revenir au code antérieur avant de supprimer `ma_session_active`, puis appliquer les retours dans l'ordre inverse après sauvegarde :

1. `20261020084651_depots_directs_temporaires.retour.sql`
2. `20261020083058_signature_suivi_reprises_relances.retour.sql`
3. `20261020011556_signature_preparation_abandon.retour.sql`
4. `20261020030000_stockage_gabarits_roles.retour.sql`
5. `20261020020000_stripe_reprises_durables.retour.sql`
6. `20261020011000_session_origine_verifiee.retour.sql`
7. `20261020010000_abonnement_client_service.retour.sql`

Le retour Stripe refuse toute réception durable non traitée. Il conserve les reçus et les résultats de rapprochement. Les sept retours sont chacun une instruction atomique, sans validation de la transaction appelante ; leurs rejeux et leur annulation en cas d’erreur sont éprouvés sur la base fictive.

Ce retour restaure les anciens droits de l'association Stripe. Il ne remet pas en service les notifications, les accès ou les réglages externes.

## Limites

Ne sont pas clos par ce lot : délais globaux Supabase Auth, réception des notifications, fermeture du cautionnement, protections de branche, renouvellement des accès, recette Stripe externe, recette Storage réelle et Safari iPhone, retrait des anciennes variables Vercel, politique de suppression et de conservation, examen juridique, identité de l'éditeur et bascule complète de secours. Aucun achat, paiement, courrier ou circuit de signature réel n'a été déclenché par ces contrôles.

## Reprises et rapprochement Stripe

La file conserve seulement les références Stripe nécessaires, le nombre de tentatives et un motif générique. Un verrou par client et un jeton vérifié dans la transaction de chaque écriture empêchent un travailleur expiré de modifier le miroir. Les doubles livraisons déjà traitées sont acquittées. Les anciennes références devenues indisponibles sont signalées sans bloquer les suivantes.

La tâche Abonnements reprend jusqu'à 10 réceptions et contrôle jusqu'à 20 dossiers par passage, les plus anciens en premier. Elle signale une lecture partielle et les écarts ; ce plafond ne constitue pas une garantie de contrôle quotidien de tous les comptes si le volume dépasse 20. Les écarts ne sont pas corrigés automatiquement. L'écran Santé rend visibles les attentes, contrôles dus et écarts.

L'avis de fin d'essai conserve sa clé d'idempotence et revérifie l'arrêt immédiatement avant l'envoi. Au-delà de 23 heures depuis la première tentative (ou la réception historique), un avis ambigu passe à l'examen manuel : la [durée d'idempotence Resend est de 24 heures](https://resend.com/docs/dashboard/emails/idempotency-keys). Les échecs d'envoi restent dans la file. Aucun courrier réel n'a été envoyé pour ces essais.

Relecture indépendante : blocage de file historique, classement incomplet des échecs, garde du retour, avis ignoré et contrôle d'arrêt tardif corrigés puis relus. Aucun défaut concret résiduel identifié dans le dernier delta ; cette lecture ne remplace pas les essais externes.

## Retrait de Youtrust

Le relevé de production en lecture seule ne trouve aucun circuit ni demande Youtrust. Le code actif n'envoie plus à cet ancien prestataire ; une configuration ancienne est signalée, jamais basculée implicitement vers Zoho. Les lignes et types historiques restent lisibles. Les variables d'hébergement anciennes sont encore à retirer après vérification de la livraison, sans révéler leurs valeurs.

## Complément de vérification

La relecture indépendante des dépôts n’a pas relevé de défaut de compatibilité résiduel. Le défaut de composition des retours a été corrigé par une instruction atomique : essais intacts en autocommit sur copie locale, dans une transaction séparée et avec une erreur dans le même message SQL. Comptes et objets conservés. Les 71 retours historiques utilisant l’ancienne garde temporelle ont également été convertis sans changement de leur corps métier (comparaison indépendante). Sur les 76 fichiers exacts, 70 atteignent l’erreur finale volontaire et six refusent explicitement leurs dépendances encore présentes ; chaque cas annule les écritures témoins. Les essais historiques vérifient aussi les retours réussis puis leurs réapplications. Cela ne dispense pas du contrôle des préconditions métier avant un retour réel.


## Fichiers et taille des transferts

Les formulaires documentaires activés déposent désormais directement jusqu'à 10 Mio par fichier dans un compartiment privé temporaire (dix fichiers et 50 Mio par formulaire). Les logos, images de signature, CSV et formulaires non activés gardent leurs limites propres. Le transport des actions reste borné à 4 500 000 octets : il reçoit des références de dépôt, pas les octets du document. Les PDF produits côté serveur et les archives existantes conservent leur plafond antérieur.

Cinq routes de lecture des documents utilisent un lien Storage d’une minute après les contrôles d’accès et la trace existants. La visionneuse reçoit le fichier directement depuis Storage et conserve une URL Gerimmo actualisable ; les téléchargements et miniatures utilisent une redirection. Le titre est échappé, les formats actifs ne sont pas affichés, l’origine du stockage est vérifiée et les réponses sont privées sans cache. Les PDF proposent une ouverture native en plein écran sur téléphone.

Banc navigateur : PNG de 6 Mio, réponse initiale indisponible puis reprise, miniature, téléchargement par redirection et PDF de deux pages. Essai local du formulaire : refus avant tout POST et conservation de la pièce et de la date. **Complément G5 :** les dépôts directs signés sont désormais implémentés et testés sur la copie locale (section finale). Les gros fichiers déjà archivés dans les routes devis, preuve de signature et pièces privées utilisent désormais la même visionneuse après contrôle de leur empreinte. Les anciennes générations sans archive restent hors de ce complément. Le CORS du stockage réel et Safari iPhone doivent encore être vérifiés avant de clôturer ce point.

## Préparation et annulation des signatures

Une validation refusée ou une panne OAuth avant toute création distante libère la préparation. Le marqueur d’incertitude est posé immédiatement avant la requête de création, après la connexion : réponse perdue, refus HTTP ou réponse illisible restent à vérifier sans second envoi automatique. L’abandon certain annule la préparation, libère sa consommation et journalise dans une même transaction réservée au serveur, après contrôle de l’acteur. Une panne de l’une des trois écritures ne conserve aucune modification partielle.

Une annulation fondée sur l’état « prêt » ne réussit que si cet état est encore présent sans référence externe : si un envoi a réservé entre-temps, la page demande de relire le suivi. Les autres annulations vérifient aussi la référence distante et une ligne effectivement modifiée. Les deux défauts ont été reproduits puis corrigés ; les pannes, droits, rejeux et entrelacements sont testés localement et relus.

Le complément ci-dessous prépare le rapprochement et le suivi. **E5 reste à éprouver chez le prestataire réel** ; aucun rappel externe n'a été activé ni envoyé pendant cette recette.


## Vérification de la consultation PDF

Le contrat navigateur de consultation comprend un aperçu HTML et un chargement direct Storage : le test de navigation vérifie les deux réponses, le contenu PDF exact, la stabilité de l’alias et le téléchargement après autorisation. Le banc conserve le type déclaré lors du dépôt ; les 17 scénarios de navigation et d’isolation passent localement. La CI744 a révélé l’ancienne assertion de MIME, corrigée sans retirer le contrôle des octets. La CI complète sur le dernier SHA reste obligatoire avant livraison.

Le banc honore également le paramètre de téléchargement en renvoyant une pièce jointe au nom encodé. Le test contrôle l’en-tête Storage et un téléchargement navigateur réel, son nom et ses octets, après reproduction rouge de l’en-tête absent. Aucun changement de configuration du stockage réel n’en découle.


## Complément — archives volumineuses

Les trois routes spécialisées conservent leur réponse PDF/image pour les fichiers de 4 Mio ou moins. Au-delà, après autorisation et vérification SHA-256 côté serveur, elles renvoient une visionneuse légère : transfert direct depuis le compartiment privé autorisé et seconde vérification SHA-256 dans le navigateur avant aperçu ou téléchargement. Une archive remplacée entre les deux lectures est ainsi refusée. Les compartiments autorisés sont explicitement bornés.

Le chargement navigateur est limité à 50 Mio pendant la lecture du flux, avec ou sans Content-Length. Un fichier altéré, vide ou excessif n’ouvre aucun aperçu ni lien de téléchargement. La validation d’un devis de plus de 4 Mio retourne un petit accusé de réception avec sa révision : l’enregistrement ne devient plus une erreur de transport alors que le PDF est déjà conservé. Le formulaire garde son contrôle de révision et de saisie concurrente.

Validation ciblée : 123 tests réussis, deux tests de navigateur réussis (6 Mio, reprise, pièces jointes, PDF mobile, archive altérée, longueur excessive déclarée et flux excessif sans longueur), types et lint réussis. Aucun dépôt direct, envoi externe ou changement en production. La CI du nouveau SHA doit encore confirmer l’ensemble du lot ; CI747 concerne le SHA précédent.

La CI748 a réussi compilation, types et lint, puis 8 989 tests de logique ; un contrôle syntaxique a classé Content-Length comme une saisie de formulaire. L’exception est maintenant bornée à cet appel exact et documente la limite de 50 Mio vérifiée aussi sur le flux. Les 43 tests ciblés réussissent après correction. Les essais navigateur complets ont été ignorés dans la CI748 : attendre la CI de la version corrigée avant livraison.

## Complément — dépôts directs privés et suivi des signatures

La CI749 du commit `66ce9d6875a0b88604af545265cfe8caf5d59804` a ensuite réussi : 8 990 tests de logique, 17 non exécutés, 200 tests navigateur, un non exécuté, compilation, types et lint. Elle précède le présent complément et ne le valide pas.

Le dépôt direct réserve avec la session de l'utilisateur un chemin immuable et un jeton de deux heures. La base refuse la réservation au nom d'un autre compte, la lecture croisée et le remplacement ; vingt réservations et 100 Mio par compte et par heure. Le serveur relit les octets, leur taille, le format réel et le SHA-256 avant le circuit métier habituel. La sélection et la saisie survivent à une panne ; un transfert confirmé est réutilisé pendant 90 minutes après un refus métier. La purge nocturne attend trois heures après la fin de réservation pour couvrir aussi un jeton délivré tardivement. Elle vérifie le retrait ou l’absence de l’objet avant d’effacer la réservation ; jusqu’à dix lots de 500, avec arrêt du démarrage de nouvelles opérations après vingt secondes. Le reliquat et les réservations en attente depuis plus de 48 heures remontent dans son bilan.

Recette réelle sur copie locale : PDF de 6 Mio enregistré, coupure du transfert puis reprise, confirmation et consultation aux largeurs 390 et 1 440 pixels. Les 13 autres tests de conservation de saisie et de refus d'attestation ont également réussi. Le contrôle de l'aperçu a reproduit une CSP générale écrasant la CSP autonome après réécriture ; les routes fichier nommées conservent maintenant leur CSP à nonce et n'admettent qu'un parent de même origine. Les autres pages restent non encadrables. L'aperçu intégré étroit sur ordinateur n'est plus traité comme un téléphone.

Le rapprochement recherche un brouillon Zoho unique par marqueur de circuit, vérifie la liste complète, les signataires, leur ordre, l'authentification SMS et les empreintes de tous les PDF et annexes. Une absence, ambiguïté ou demande déjà activée reste à examiner ; aucun nouvel envoi n'en découle. Références retrouvées et trace sont écrites dans une même transaction sous verrou.

Les rappels J+7 et J+21 disposent d'un registre durable avant le POST : une réponse perdue interdit tout second envoi et tout rappel suivant jusqu'à examen. J+28 produit une alerte interne, sans troisième rappel externe. Refus, expiration et incertitude sont signalés une fois au créateur. Les états terminaux déjà signalés sortent de la file. Les dates suivent Paris ; la passe est bornée à dix circuits et 50 secondes.

`ZOHO_SIGN_RELANCES_ACTIVES` reste **false**. Avant toute activation : terminer la recette Zoho sur comptes fictifs autorisés et contrôler les destinataires et le coût. Le CORS Storage réel, Safari iPhone et la livraison des sept migrations restent à vérifier. Les comptes permanents et la production n'ont pas été modifiés par ces nouveaux essais locaux.

## Dernière contre-relecture

Quatre défauts concrets ont été reproduits puis corrigés : suivi d’une signature sur abonnement suspendu, jeton de dépôt délivré tardivement, reliquat de nettoyage et arrêt d’un rappel pendant le renouvellement OAuth. Les 128 tests ciblés réussissent ; le second lecteur ne relève plus de défaut concret dans ce delta, sur lecture statique. Le chemin de retour complet du LISEZ-MOI passe également ses 45 tests après ajout des trois dernières dépendances.

Le suivi serveur peut renseigner `envoye_le` et archiver une signature engagée avant la suspension, sans permettre de nouvel envoi. Le contrôle d’arrêt est revérifié après OAuth, immédiatement avant le POST de rappel. Le registre conserve une tentative incertaine et interdit son double envoi.

Précontrôle de production en lecture seule : les sept versions nouvelles sont absentes ; huit faits d’identité de l’éditeur restent manquants et maintiennent la souscription fermée. `refuser_ecriture_si_fermee` porte exactement les deux ancres attendues, empreinte MD5 `832d25f725ba6e21389b0bdaadd67a63`. Ce relevé doit être actualisé si la production change avant livraison.

Validation locale finale du complément : 9 079 tests réussis, 45 non exécutés (633 fichiers). Compilation, types et lint réussis. Le dépôt de 6 Mio avec interruption/reprise et consultation passe sur le build à 390 et 1 440 pixels ; les douze autres scénarios ciblés de protection de saisie et de refus d’attestation passent également. Ces contrôles ne sont pas des essais Zoho ou Stripe réels.

## Reprise après CI750

La CI750 (`39405740956`, SHA `9afe86342759bd6c15ba615d7c57e450e5fb852d`) réussit 9 107 tests de logique, 17 non exécutés, mais trois parcours navigateur échouent (198 réussis, un non exécuté et un repris avec succès). Ce SHA n’est pas livré.

Corrections : le message de progression disparaît à la fin du transfert, indépendamment du mode de soumission ; le champ photo du signalement refuse PDF et formats invalides avant réservation, y compris un PDF déjà transféré ; le test de réponse perdue vise la déclaration métier et non la réservation préalable. Le parcours d’invitation attend le succès propre à chaque attestation et cible l’article de l’artisan concerné, même après un essai précédent. Les 25 tests client/serveur ciblés réussissent ; la relecture statique du dernier delta ne relève plus de défaut concret. La compilation, les essais navigateur ciblés et la CI complète du nouveau SHA restent à confirmer avant publication.

Validation du delta CI750 : compilation, types et lint réussis ; 25 tests ciblés et les 10 scénarios navigateur (dont préparation des sessions) réussissent sur le build corrigé. Le parcours artisan va jusqu’à la sollicitation, les deux reprises d’incident conservent l’unicité et les dépôts de 6 Mio passent à 390 et 1 440 pixels. La CI du nouveau SHA reste requise avant livraison.
