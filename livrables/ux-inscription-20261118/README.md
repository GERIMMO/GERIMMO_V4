# Inscription propriétaire simplifiée

Chantier 3 et recommandation 4 du rapport Claude, uniquement. Branche `codex/ux-accueil-proprietaire-20261118`, base `08ac5207c9368ed2db75b99c052098c005029b54`. Les chantiers 1 et 2 sont conservés. Aucun push, fusion, déploiement ou accès aux données réelles.

## Résultat

Trois champs visibles : nom, e-mail, statut. Les qualités existantes (particulier, SCI, SCI familiale, indivision, autre société) sont conservées sans conversion juridique implicite. Adresse, téléphone et prénom peuvent être complétés plus tard dans le profil existant ; les contrôles de complétude des documents restent actifs. Le parrainage est replié sauf lorsqu’un code est transmis ou doit être corrigé. Trois bénéfices concrets remplacent le long argumentaire. Deux mois calendaires, sans carte ni abonnement automatique.

Après le clic sur le lien reçu dans la boîte fictive : vérification du profil, choix du mot de passe, consentement explicite sur le document approprié, remplacement de la session de confirmation par une session de connexion, arrivée à l’accueil propriétaire. Aucun changement du parcours artisan, des invitations ou de la récupération d’un compte existant.

## Captures comparables

| Format simulé dans Chromium | Avant | Après | Arrivée réelle dans le compte fictif |
|---|---|---|---|
| 390 px | [Avant](avant-inscription-390.png) | [Après](apres-inscription-390.png) | [Accueil particulier](arrivee-proprietaire-390.png) |
| 1440 px | [Avant](avant-inscription-1440.png) | [Après](apres-inscription-1440.png) | [Accueil SCI](arrivee-proprietaire-1440.png) |

Le mobile est simulé dans un navigateur, pas sur un téléphone physique. Les captures comportent le petit indicateur du serveur local Next.js. [Confirmation à 390 px](confirmation-390.png) et [à 1440 px](confirmation-1440.png).

## Vérifications exécutées

- 171 tests distincts réussis : 113 premiers tests d’authentification, formulaires et essai ; 9 contrôles d’essai PostgreSQL ensuite exécutés ; 2 ouvertures PostgreSQL ; 33 contrôles de documents/invitations ; 14 contrôles du parrainage. Les 12 tests de reprise navigateur rejoués ne sont pas additionnés une seconde fois.
- Les 9 tests PostgreSQL initialement ignorés faute de connexion dans la première commande ont ensuite tous réussi. Les cas exclus par les filtres de ciblage restent hors périmètre et ne sont pas comptés comme exécutés.
- Deux inscriptions continues réussies depuis le navigateur : particulier à 390 px, SCI à 1440 px. Aucune préparation SQL du parcours ; le navigateur crée le compte, reçoit son lien dans la boîte fictive, accepte les conditions et rejoint son espace.
- Vérification en base des comptes obtenus : e-mail confirmé, consentement archivé, adhésion propriétaire active, coordonnées absentes sans valeur inventée, fin d’essai exacte au 18 janvier 2027, aucun client ni abonnement Stripe associé.
- Parrainage transmis par URL : code normalisé et visible ; dépliage utilisable au clavier. Les refus et reprises du formulaire conservent le statut et le code.
- Les documents incomplets restent refusés, avec renvoi vers le profil à compléter. Les tests des invitations et des changements de document de consentement restent verts.
- Vérification TypeScript, ESLint ciblé et `git diff --check` réussis. Aucune CI distante lancée.

Les preuves sont dans les fichiers de tests, `parcours-resultats.json`, `inscriptions-base.json` et `migration-preuve.json`. Le script `verifier-inscription.cjs` rejoue les deux inscriptions sur le banc local démarré à `localhost:3100`, API fictive et boîte à `127.0.0.1:55520` ; il interdit toute requête navigateur hors localhost. Aucun secret réel n’est nécessaire.

## Dépendance de livraison

Migration additive `20261118093000_inscription_proprietaire_progressive.sql`, préparée et exécutée uniquement sur PostgreSQL fictif. L’ancienne fonction refusait la création de l’espace sans adresse : retirer seulement les champs aurait laissé une impasse après confirmation de l’e-mail. La migration retire exclusivement cette exigence de l’initialisation ; comparaison exacte de la définition avant/après réussie. Aucun changement de table, donnée existante, droit, durée d’essai ou mécanisme de parrainage. L’appel anonyme reste interdit. La migration s’arrête si la définition attendue a changé.

Lors d’une future livraison autorisée, appliquer cette migration avant le code : l’ancien formulaire reste compatible. Aucun retour destructif ; les profils créés sans adresse restent à compléter via les écrans existants. Le bouton d’ouverture des ventes et les conditions déjà acceptées ne sont pas modifiés. Cette branche reste locale pour validation.
