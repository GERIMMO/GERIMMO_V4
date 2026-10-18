# Signature électronique du bail — préparation du 18 octobre 2026

## État réel

Le circuit est développé et vérifié en local. Le titulaire a créé son compte **Zoho Sign Europe**, actuellement en essai Enterprise, puis autorisé la connexion OAuth et une invitation fictive sur ses coordonnées contrôlées. Les deux rôles ont signé avec authentification SMS ; le PDF final et le certificat ont été téléchargés et relus. Les identifiants sont conservés dans une configuration locale privée exclue de Git. Le suivi, l’archivage et les reprises après incident ont ensuite été testés sur la base et le stockage fictifs locaux, avec les réponses Zoho simulées. **Le retour HTTPS réel n’est pas encore configuré et les envois depuis l’application restent désactivés.** Les anciens circuits Youtrust restent compatibles, chaque circuit conservant son prestataire.

Les modèles français d’invitation, rappel, confirmation avec lien ou pièce jointe, refus et retrait sont personnalisés dans Zoho. Aucun abonnement acheté, aucune nouvelle invitation pendant la dernière passe de contrôles, aucune publication ni migration de production dans ce chantier. Le détail chronologique ci-dessous distingue les essais préparatoires de l’essai externe effectivement signé.

L’envoi reste désactivé par défaut (`ZOHO_SIGN_BAIL_ACTIF=false`). Une clé seule n’active rien. Les validations locales avec prestataire simulé ne prouvent pas la délivrabilité des e-mails/SMS, le placement réel des signatures ou la validité d’un dossier de preuve émis par le prestataire.

## Parcours livré

À l’étape 7 d’un bail brouillon, dans l’espace du propriétaire direct :

1. Vérifier toutes les parties (locataires, colocataires, garants, propriétaires) et leurs coordonnées. Tous les propriétaires sont placés en dernier. Téléphone international obligatoire pour le code SMS, sans dégradation silencieuse vers un autre mode.
2. Préparer le PDF et son circuit. Le document contient une page de signature par personne et l’inventaire des annexes avec leurs empreintes.
3. Relire le PDF et les annexes, confirmer la relecture, puis demander explicitement l’envoi lorsque le service est activé.
4. Consulter la progression par personne. Les événements sont authentifiés puis l’état courant est relu auprès du prestataire ; le corps brut reçu n’est pas conservé.
5. Après toutes les signatures, archiver le bail signé et le certificat de réalisation commun, rattaché à chaque personne. Le certificat Zoho est téléchargé et stocké une seule fois ; chaque signataire est lié au même document de preuve en GED. Les anciens circuits Youtrust gardent leurs preuves individuelles. Une reprise conserve les mêmes chemins de fichiers, sans nouvelle invitation.
6. Activer le bail signé avec les contrôles de mise en location existants. **L’activation métier reste explicite** : la réception du signé n’active pas automatiquement un échéancier.

Les diagnostics du logement/bâtiment, la notice et le règlement de copropriété renseigné sont joints. Une annexe requise absente, périmée ou sans PDF bloque la préparation. Les justificatifs privés des personnes ne sont pas transmis automatiquement. Une nouvelle version des données ou des annexes impose une nouvelle préparation et une nouvelle relecture.

La signature sur papier et le dépôt du PDF signé restent disponibles, clairement nommés. Leurs invitations ne peuvent pas concurrencer un circuit électronique déjà en cours. Les états des lieux conservent leur signature sur place.

## Limites de cette première version

- Personnes physiques dans l’espace propriétaire direct. La représentation d’une SCI/personne morale et le mandat d’agence exigent un circuit dédié et restent bloqués.
- Le cautionnement reste un acte distinct : la signature du bail par le garant ne le remplace pas. Mandats et avenants ne sont pas intégrés dans ce circuit.
- Expiration à 30 jours après préparation ; une préparation proche de son échéance doit être refaite avant l’envoi.
- Les relances précises J+7/J+21 et l’alerte J+28 du référentiel métier ne sont pas encore automatisées. Ne pas les annoncer comme livrées. Le suivi est actualisable et les événements perdus sont rapprochés par la tâche des signatures.
- Aucun automatisme de production n’est activé avant la recette du prestataire.

## Connexion de test à réaliser avec le titulaire

Documentation officielle vérifiée le 18 octobre : [API Zoho Sign](https://www.zoho.com/sign/api/), [offre API et essais](https://www.zoho.com/sign/pricing-api.html), [authentification des retours](https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/webhooks/articles/securing-zoho-sign-webhooks-with-hmac-authentication).

1. Le titulaire crée son compte depuis [Zoho Sign Europe](https://sign.zoho.eu/), accepte les conditions et configure ses accès. Vérifier que le compte est bien hébergé en région Europe. L’offre cible est **API-only**, sous réserve de confirmation des conditions d’intégration dans un SaaS tiers ; les options OEM/marque blanche peuvent relever d’un contrat distinct. Aucun achat avant cette vérification et l’essai.
2. Créer un client OAuth dans la console européenne `api-console.zoho.eu`. Utiliser les permissions `ZohoSign.documents.CREATE`, `.READ`, `.UPDATE` et `.DELETE` (annulation des brouillons). Obtenir le refresh token par le parcours OAuth officiel ; ne jamais coller de clé dans le chat ou dans Git.
3. Dans la configuration serveur sécurisée : `SIGNATURE_BAIL_PRESTATAIRE=zoho`, `ZOHO_SIGN_ENV=sandbox`, `ZOHO_SIGN_CLIENT_ID`, `ZOHO_SIGN_CLIENT_SECRET`, `ZOHO_SIGN_REFRESH_TOKEN`, `ZOHO_SIGN_WEBHOOK_SECRET`. L’adaptateur contacte exclusivement `accounts.zoho.eu` et `sign.zoho.eu`. Il renouvelle le jeton, borne les appels et ne relance pas automatiquement les mutations.
4. Sur la base fictive locale uniquement, après configuration : `ZOHO_SIGN_BAIL_ACTIF=true` et liste des organisations fictives autorisées dans `ZOHO_SIGN_ORGS_TEST`. Le paramètre `testing=true` est transmis lors de la création **et** de l’envoi. Le mode test est refusé avec une base distante ou sur Vercel. Les invitations de test peuvent être délivrées : destinataires contrôlés requis.
5. Définir le retour HTTPS `/api/zoho-sign/webhook` dans les paramètres Développeurs de Zoho Sign et activer impérativement sa signature HMAC-SHA256. Le serveur vérifie l’en-tête `X-ZS-WEBHOOK-SIGNATURE`, en base64 sur le corps brut. Ne pas exposer le poste ou sa base de données pour cet essai ; toute exposition temporaire requiert son périmètre convenu.
6. Choisir les événements `RequestSubmitted`, `RequestViewed`, `RequestSigningSuccess`, `RequestCompleted`, `RequestRejected`, `RequestRecalled`, `RequestForwarded`, `RequestExpired`. Aucun corps de webhook ni identité reçue n’est conservé. L’état est toujours relu chez Zoho avant classement. Les erreurs sont signalées et la tâche périodique reprend les circuits dont le retour a été perdu.

Le démarrage de l’essai annonce 14 jours / 10 documents ; la documentation indique ensuite 50 documents de test par mois pour les offres compatibles. Les documents portent un filigrane. Les conditions courantes et le fonctionnement SMS restent à confirmer sur le compte effectif. La présence de clés n’active pas à elle seule les envois.

## Recette externe obligatoire avant activation

- Deux puis plusieurs locataires, plusieurs propriétaires ; confirmer l’ordre et l’absence d’invitation au propriétaire avant son tour.
- Réception de l’invitation, lecture de toutes les annexes, code SMS et rendu visuel des signatures sur les pages dédiées.
- Téléchargement du contrat réellement signé et d’une preuve pour **chaque** personne ; vérification des rattachements GED et des droits locataires/propriétaires.
- Refus avec motif, expiration, annulation confirmée chez le prestataire, coupure pendant la création ou l’activation, webhook absent/dupliqué/désordonné et reprise sans second envoi.
- Arrêt de supervision, environnement incorrect, contrôle des données réelles bloquant une sandbox.
- Activation métier après signature, en environnement de recette autorisé ; un circuit sandbox est explicitement refusé par l’activation.

## Exploitation et reprise

Un envoi réservé est exclusif par bail. Dès la création distante, son identifiant est enregistré avant l’activation des invitations. Chez Zoho, le PDF et ses annexes sont téléversés au moment de la création du brouillon ; aucune invitation ne part à cette étape. Si l’issue n’est pas confirmée, l’état devient « Envoi à vérifier » : actualiser le suivi et rapprocher le dossier prestataire, **ne pas recréer une demande**.

Si une coupure empêche même de connaître l’identifiant distant, rechercher la référence du circuit (`description = gerimmo:circuit:<UUID>` chez Zoho ; `external_id` chez Youtrust) côté prestataire et constater son état avant toute correction du registre. Ne pas libérer artificiellement la réservation : une création distante peut avoir réussi.

L’annulation doit être confirmée chez le prestataire avant de libérer le circuit local. Un document déjà signé se récupère et ne s’annule pas par cette commande. Les documents et annexes envoyés sont protégés contre le remplacement pendant le circuit.

Le rapprochement automatique traite dix circuits par passe, en privilégiant les plus anciens contrôles. Il est borné par l’arrêt de supervision. Désactiver les nouveaux envois avec `*_BAIL_ACTIF=false` conserve le suivi des circuits existants tant que les identifiants du prestataire et le secret du webhook restent configurés. Retirer ces accès interrompt le suivi : conserver le registre et rétablir le rapprochement avant toute purge. Les barrières séparant les bases fictives et la production restent appliquées.

## Validation locale et fichiers

Migrations : `supabase/migrations/20261018085521_circuit_signature_bail.sql`, `20261018100243_prestataire_signature_bail.sql` et `20261018143644_certificat_commun_zoho.sql`, ajoutées à l’ordre de préparation CI. Exécutées uniquement sur les bases fictives locales du chantier ; aucune n’est déclarée appliquée en production. Le correctif du certificat commun est appliqué à `gerimmo_ci_supervision_octobre_api`.

Tests : parties et coordonnées, configuration, contrôles des actions serveur, webhook, reprise des preuves, permissions SQL, réservation exclusive, archives atomiques, annulation des anciennes demandes et régression des modèles PDF. L’analyse Supabase locale des nouveaux objets n’a signalé aucune erreur de sécurité ; les index composites manquants signalés ont été ajoutés. Les index neufs encore inutilisés sont normaux sur ce jeu d’essai.

La vérification visuelle utilise un bail fictif sur le port 3505, sans clés externes : préparation réelle du PDF (8 pages, trois emplacements distincts), annexes, mise à jour après modification, ordinateur et téléphone 390 × 844. Le dossier de preuves local est `outputs/signature-bail-20261018/` à la racine de l’espace de travail. Aucun compte d’essai permanent n’a été supprimé ou réinitialisé.

## Adaptation Zoho — preuves et limites du 18 octobre

Les contrôles locaux couvrent les domaines européens, le renouvellement OAuth, les erreurs métier même avec HTTP 200, l’absence de relance automatique, les numéros internationaux, les destinataires, l’ordre, le SMS obligatoire, les pages individuelles, la séparation des prestataires, le HMAC, les doublons et la reprise. Le bail signé et le certificat sont archivés séparément, dans la limite GED existante de 10 Mo par fichier. Les annexes originales restent liées au circuit avec leurs empreintes ; aucune limite globale de stockage n’est élargie. Le PDF de préparation existant a été relu pour le placement des champs (pages finales dédiées, zone libre). Le placement réel et une correction de hauteur issue de la recette mobile sont décrits ci-dessous.

Les premiers essais locaux n’avaient appelé aucun compte Zoho. La connexion réelle, les essais de brouillon puis l’invitation autorisée sont décrits ci-dessous. L’analyse de sécurité de la base fictive locale n’a relevé aucun avertissement ni erreur. Les comptes permanents sont conservés. Aucun déploiement n’a été lancé.

Validation locale initiale Zoho : **188 tests réussis**, puis **199** après les corrections issues du compte réel ; TypeScript et ESLint ciblé réussis. Résultats dans `outputs/signature-zoho-20261018/` à la racine de l’espace de travail.

## Connexion réelle et essai sans invitation — 18 octobre 2026

- OAuth européen créé après autorisation explicite du titulaire ; quatre scopes documentaires uniquement. Renouvellement du jeton et lecture API réussis. Configuration locale privée, exclue de Git, permissions fichier 0600 ; envoi applicatif désactivé.
- Confirmation de l’e-mail du compte prise en compte : le refus 8044 a disparu.
- Trois incompatibilités relevées puis corrigées sur l’API réelle : `recipient_countrycode_iso` obligatoire pour le SMS, extension `.pdf` retirée du nom du document, paramètre `testing` refusé lors de la mise à la corbeille. Le pays est déduit du numéro international avec une bibliothèque de numérotation ; un pays ambigu est refusé. La vérification avant envoi compare également le pays ISO.
- Le brouillon final contient trois pages et deux personnes fictives, dans l’ordre, avec OTP SMS. Création et relecture par les fonctions applicatives réussies. Le premier brouillon est dans la corbeille, récupérable ; aucune purge définitive ni suppression de compte.
- Contrôles après corrections : 170 tests applicatifs et 29 tests sur la base fictive locale réussis, soit **199 tests**, ainsi que TypeScript et ESLint ciblé. Les 29 tests de base ont été relancés avec l’accès réseau local après l’échec d’accès initial du bac à sable.
- Preuves : `connexion-compte.json`, `brouillon-api-reel-valide.json`, `nettoyage-premier-brouillon.json`, `tests-apres-connexion.json`, `tests-base-apres-connexion.json` dans `outputs/signature-zoho-20261018/`.
- **Restent à vérifier avant activation** : réception d’une invitation sur des coordonnées contrôlées, code SMS, signatures, PDF signé et certificat ; retour webhook réel sur une adresse HTTPS autorisée ; droit d’intégration SaaS et offre retenue. À ce stade initial, aucune invitation ni aucun paiement ou déploiement n’avait été effectué. L’essai autorisé qui suit remplace cet état de préparation.

## Invitation de test autorisée — 18 octobre 2026 à 15 h 19 (Paris)

- Le titulaire a fourni et autorisé une adresse et un mobile sous son contrôle pour une invitation fictive et son code SMS. Les coordonnées ne sont pas inscrites dans les preuves techniques ni dans le dépôt.
- Un nouveau PDF de trois pages, « GERIMMO - ESSAI DE SIGNATURE SANS ENGAGEMENT », a été créé et relu visuellement. Il ne contient aucun bail réel ni engagement, et ne réutilise pas les brouillons avec destinataires inexistants.
- Création puis envoi via l’adaptateur réel réussis, avec `testing=true` aux deux étapes. Deux rôles fictifs distincts utilisent les mêmes coordonnées autorisées : « Essai Locataire », puis « Essai Propriétaire ». Chaque rôle conserve une authentification SMS et sa propre page de signature.
- La relecture API confirme `ongoing` : premier rôle `notified`, second `initiated`. L’interface Zoho confirme la présence du document en cours. Il s’agit d’un envoi accepté par le prestataire ; la réception effective de l’e-mail, du SMS et la signature ne sont pas encore confirmées par le titulaire.
- Aucune relance automatique, aucun paiement, aucun déploiement. Les envois aux clients dans l’application restent désactivés. Le retour webhook réel reste à configurer après validation de son adresse HTTPS.
- Preuve : `outputs/signature-zoho-20261018/essai-invitation-reelle.json`, avec identifiants et états uniquement. Attendre les signatures personnelles du titulaire avant de vérifier le PDF final et le certificat.

## Deux signatures et archives reçues — 18 octobre 2026 à 15 h 30 (Paris)

- Le titulaire a effectué les deux signatures sur mobile. L’API renvoie `done` et deux personnes `signed`. Le certificat confirme l’authentification SMS pour chacune, l’ordre séquentiel, puis la fin à 15 h 29 min 50 s. L’invitation au second rôle est horodatée après la signature du premier.
- Les deux fonctions applicatives de téléchargement ont récupéré le PDF signé de trois pages et le certificat de deux pages. Les cinq pages ont été relues visuellement : signatures sur les pages dédiées, filigrane « For demo purpose only / Powered by Zoho Sign » présent. Les fichiers sont conservés dans un dossier local privé (0700, fichiers 0600), hors du dépôt source. Aucune archive signée n’a été modifiée.
- Le contrôle mathématique des quatre signatures CMS embarquées réussit. Il ne constitue pas une validation de confiance de la chaîne de certificats ni un audit complet des révisions PDF : le fournisseur ajoute un dictionnaire DSS après la dernière signature. Ces limites restent explicites dans les preuves.
- Défaut visuel constaté : malgré une largeur déclarée de 190 pt, les apparences mobiles s’étendent à environ 493 et 504 pt avec une hauteur de 80 pt. La hauteur par défaut de l’adaptateur a été réduite à 30 pt ; les proportions réellement observées tiennent alors dans 190 pt. Le test de régression couvre ces deux proportions et les marges. **Ce réglage doit encore être revu sur un prochain PDF signé chez Zoho.** Aucune deuxième invitation n’a été envoyée pour ce réglage.
- Après correction : **41 tests ciblés réussis**, TypeScript et ESLint ciblé réussis. Le total antérieur de 199 tests correspond à la passe avant cette correction ; les autres suites n’ont pas été inutilement relancées.
- Restent avant mise en service : contrôle du réglage visuel, parcours depuis un bail fictif Gerimmo avec annexes et classement GED, retour HTTPS/HMAC réel, confirmation de l’offre et du droit d’intégration SaaS, puis activation de production. Les envois applicatifs restent désactivés ; aucun achat ni déploiement.
- Preuves : `essai-signatures-terminees.json`, `controle-integrite-pdf.json` et `tests-apres-signatures.json` dans `outputs/signature-zoho-20261018/`.

## Invitation Gerimmo personnalisée — 18 octobre 2026

La personnalisation Zoho a été activée et le modèle français « Envoi d’un document pour signature » enregistré, puis relu dans l’interface. Le logo officiel transparent a été ajouté à l’organisation, avec le nom et la devise conservés dans le cadrage. Le modèle reprend le bleu marine et l’or de Gerimmo, le document et son échéance, un bouton « Consulter et signer » et trois étapes simples. Le texte ne promet pas un classement Gerimmo qui n’est pas encore activé. L’authentification SMS est décrite conditionnellement pour rester compatible avec d’autres circuits.

Objet soumis : « Gerimmo | À signer : $DOCUMENT_NAME$ ». La lecture textuelle de ce champ est masquée par l’outil navigateur ; le corps a été relu après enregistrement. Les variables du destinataire, du document, de l’échéance et des notes sont conservées. Le lien `$LINK_TO_SIGN$`, le pied de page obligatoire et la désactivation des rappels ont été vérifiés dans le rendu Zoho. Aucune modification de la divulgation juridique, de l’authentification, des identifiants ou des adresses d’expédition/réponse. Les autres notifications ont ensuite été harmonisées, comme indiqué ci-dessous.

Aucun nouvel e-mail n’a été envoyé. La lecture sur une messagerie réelle, notamment sur téléphone, reste à vérifier. L’aperçu local autonome n’a pas pu être ouvert par le navigateur de contrôle, dont la politique bloque le protocole `file:` ; aucun contournement tenté. Les fichiers d’aperçu locaux utilisent des coordonnées fictives. Le modèle reste soumis aux fonctionnalités de l’offre Zoho finalement retenue.

Preuves et copie du modèle d’origine : `outputs/signature-zoho-20261018/emails/`. La configuration de l’expéditeur sur un domaine Gerimmo reste à finaliser.

## Suivi, incidents et notifications — contrôles complémentaires du 18 octobre

À la demande de traiter les points 1, 3 et 5, sans nouveau déploiement :

- **Archivage corrigé** : l’essai intégré sur la vraie base fictive a révélé que dupliquer le même certificat par signataire violait l’unicité GED des empreintes. La nouvelle migration lie tous les signataires Zoho à une seule preuve commune, sans affaiblir cette unicité. Une preuve commune dont le chemin, la taille ou l’empreinte divergent est refusée. Les preuves individuelles Youtrust sont conservées.
- **Suivi indépendant des nouveaux envois** : webhook, rapprochement périodique, actualisation et annulation peuvent suivre les demandes existantes lorsque les nouvelles invitations sont désactivées. Le secret HMAC et les identifiants restent requis.
- **Annulation vérifiée** : un refus ou une expiration déjà constaté conserve son état exact ; un document terminé est récupéré. Un retrait ou une mise à la corbeille Zoho n’est enregistré localement qu’après relecture de la même demande et confirmation de son état. Une panne conserve le circuit pour reprise.
- **Recette locale** : 187 contrôles applicatifs, 31 contrôles SQL et 7 essais d’intégration passent, soit **225 réussites, zéro échec et zéro test ignoré dans ces suites**. TypeScript, ESLint ciblé et vérification des différences passent. Le conseiller de sécurité Supabase local ne relève aucune anomalie ; la fonction d’archivage reste réservée au rôle serveur et n’obtient aucun privilège supplémentaire.
- **Portée des sept essais intégrés** : base PostgreSQL et stockage HTTP locaux réels, avec uniquement les réponses du prestataire simulées ; HMAC falsifié refusé, retours dupliqués ou désordonnés, refus/retrait/expiration, téléchargement protégé, pannes du PDF ou du stockage et reprise sans nouvelle invitation. Le bail reste brouillon après archivage. Cela ne constitue pas une recette de ces incidents sur le compte externe Zoho.
- **Cinq modèles supplémentaires enregistrés** : rappel au signataire, confirmation avec lien, confirmation avec pièce jointe, refus et retrait. Corps relus après navigation et réouverture dans Zoho, logo officiel chargé, liens et variables conservés. Les objets ont été soumis et enregistrés mais leur relecture textuelle est masquée par l’outil. Aucun nouveau courriel/SMS ni rappel automatique envoyé ou activé.
- **Expéditeur** : l’écran « SMTP personnalisé » du compte demande une mise à niveau. Aucun achat ni changement d’adresse n’a été effectué ; l’adresse de réponse Gmail actuelle reste en place. Une offre compatible et une boîte Gerimmo autorisée devront être vérifiées avant modification. Le rendu des nouveaux modèles dans une messagerie réelle reste à contrôler.

Les comptes d’essai permanents sont conservés. Seuls les comptes et organisations temporaires créés par ces essais ont été nettoyés. La migration est locale uniquement. Preuves : `tests-retours-regressions.json`, `tests-retours-base.json`, `tests-retours-integration.json`, `emails/verification-suite-emails.json` et `bilan-retours-emails.json` dans `outputs/signature-zoho-20261018/` du workspace.

Restent avant mise en service : retour HTTPS/HMAC réel, essai complet externe depuis un bail Gerimmo avec annexes, contrôle du nouveau format des signatures et des e-mails, confirmation de l’offre et du droit d’intégration SaaS, puis publication et activation explicites. Les relances métier J+7/J+21/J+28 restent hors de ce travail de personnalisation.
