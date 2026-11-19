# UX 11A — Invitations et première connexion

18 novembre 2026. Recommandations **32 et 33 uniquement**, lues dans `origin/claude/audit-final-pr335:livrables/audit-ux-ui/recommandations.md`. Base `7c64a9a21b60d4feace1900138002f92146f3537`, branche `codex/ux-accueil-proprietaire-20261118`. Travail d’un seul agent, limité à trente minutes ; commit local, aucun push.

## Résultat

- **Invitation locataire** : rôle, organisation invitante, validité et action attendue sont explicites. Après acceptation, le lien mène à l’organisation autorisée. Le nom de l’invitant reste fourni par la lecture autorisée existante, jamais par un paramètre libre.
- **Invitation artisan anonyme** : « Vérifier votre invitation artisan », sans affirmer que le lien est valide avant sa vérification. Connexion mise en évidence ; création du compte toujours accessible dans « Première visite ? ». Identité invitante uniquement après les contrôles existants d’adresse vérifiée.
- **Premier mot de passe** : « Choisir mon mot de passe » pour une activation ; récupération ordinaire distincte. La création de l’espace propriétaire garde son libellé. La destination de l’invitation est conservée pendant le choix du mot de passe et la connexion.
- **Garant** : message court selon l’état du lien, aucune donnée de dossier pour un lien clos. Le lien déjà utilisé confirme uniquement le numéro de mobile ; il ne prétend pas qu’une signature ou un envoi a eu lieu.
- **Sortie utile** : message à copier dans une réponse à l’expéditeur, retour visible après copie et solution manuelle si le navigateur la refuse. Assistance existante pour un compte connecté ; formulaire de contact public sinon. Aucun envoi implicite.

## Vérifications exécutées

| Contrôle | Résultat et portée |
|---|---|
| Tests automatisés ciblés | **228 réussis, 0 échoué, 0 ignoré**, 11 fichiers dans une même exécution finale ; `tests.log` |
| Locataire, navigateur local | Choix du mot de passe → connexion → invitation → acceptation → portail de la bonne organisation → rechargement : réussi. État `acceptee` et adhésion `locataire/active` vérifiés ensuite en base |
| Invitations, navigateur | Locataire expirée / déjà acceptée ; artisan valide / expirée / déjà acceptée ; artisan anonyme avec création repliée et retour de connexion : réussis à 390 et 1440 px |
| Garant | Lien inconnu et aide exercés dans le navigateur aux deux largeurs ; liens valides (bail et cautionnement), expiré, annulé, utilisé et suspendu vérifiés par rendu serveur et tests des actions avec prestataire simulé |
| Première activation, sécurité | Session email fraîche, nouveau mot de passe, rotation de session, fermeture de l’ancienne session et refus de rejouer le choix : banc Auth local. Destinations, consentements, erreurs de saisie et conservation du profil : tests ciblés existants rejoués |
| Permissions | Tests PostgreSQL des invitations : adresse vérifiée, bon destinataire, absence de droit avant acceptation, refus/expiration, double acceptation et absence de doublon. Tests des routes artisan et garant conservés |
| Aide | Copie testée avec presse-papiers simulé ; refus de copie testé ; vraie navigation vers l’assistance connectée et le formulaire public. Aucun formulaire de contact envoyé |
| Présentation | **28 captures avant/après à 390 et 1440 px**, index `captures.json`. Chromium, téléphone simulé ; aucun essai revendiqué sur appareil physique |
| TypeScript / ESLint | Réussis, journaux conservés |
| Nettoyage | 6 invitations, 1 personne, 1 compte fictif et 1 adhésion créés pour cette recette supprimés ; zéro résidu pour ces identifiants. Comptes/artisans/organisations préexistants conservés |

Les onze séquences de `navigation-resultats.json` et les deux vérifications de `aide-resultats.json` ne sont pas ajoutées au nombre de tests automatisés. Elles comprennent plusieurs assertions ; elles ne représentent pas treize parcours métier complets.

Les premiers essais ont révélé un lien d’assistance redirigeant un utilisateur connecté vers ses espaces : corrigé par la destination adaptée à sa session. Cinq tests navigateur attendaient encore « Changer le mot de passe » : sélecteur adapté aux libellés d’activation, toutes les assertions de sécurité, consentement et conservation des saisies conservées ; huit tests de ce fichier finalement réussis.

## Limites et protections

- La **connexion directe déjà existante** est conservée uniquement quand Auth reconnaît le profil d’activation prévu. Le circuit d’invitation/récupération sans ce profil redemande la connexion avec le mot de passe choisi : ce garde-fou n’est pas étendu ou contourné pour supprimer un clic.
- Une invitation artisan anonyme n’est pas déclarée valide ou invalide avant la connexion : cela préserverait mal la confidentialité si l’identité du destinataire était révélée sans vérification. L’écran l’explique et permet de poursuivre.
- Le renouvellement d’une invitation nécessite toujours une réponse de son expéditeur. Le bouton copie un message ; il ne prétend jamais avoir créé ou expédié un lien. Le lien « Recevoir un nouveau lien » de récupération du mot de passe reste disponible.
- Aucun e-mail réel, SMS ou prestataire de signature sollicité. Le parcours de signature complète du garant n’est pas rejoué : seuls ses écrans d’entrée et les tests ciblés existants sont concernés. Aucun nouvel espace garant créé.
- Aucune action serveur d’authentification, permission, durée de lien, signature, bail ou migration modifiée. `integrite.json` vérifie les fichiers sensibles inchangés. Les pages consultent la session uniquement pour présenter le bon lien d’assistance ; une panne de cette lecture ne bloque pas l’acte du garant.
- Le banc utilise exclusivement PostgreSQL, Auth et les données fictives locaux. Aucun contrôle de production, fusion ou déploiement réalisé. Les cookies et clés ne sont pas archivés dans Git.

## Rejeu ciblé

Depuis `app`, lancer Vitest sur les onze fichiers figurant dans `tests.log` / `validation.json`. Les trois suites d’intégration nécessitent le banc local et ses variables `SUPABASE_DB_URL`, `SIGNATURE_TEST_DB_URL`, `SIGNATURE_TEST_API_URL` et `SUPABASE_SERVICE_ROLE_KEY` ; ne jamais les configurer vers une production. Les tests PostgreSQL annulent leurs transactions et le test Auth supprime son compte fictif.

Le scénario locataire du navigateur nécessite une invitation fictive en attente, une adresse confirmée et une session email fraîche. Choisir le mot de passe, se connecter si demandé, accepter, contrôler l’adresse `/locataire/<organisation>` puis recharger. Pour les liens expirés et déjà acceptés, utiliser des invitations distinctes et ne jamais changer leur durée pour forcer l’acceptation.
