# UX 12A — Abonnements super-admin

18 novembre 2026. Branche locale `codex/ux-accueil-proprietaire-20261118`, base `c0811456f535f757ba945b8f19b4e4920fd65e3a`.
Périmètre : recommandation 29 (S01/S11) de `livrables/audit-ux-ui/recommandations.md`, référence `origin/claude/audit-final-pr335`. Un seul agent ; aucun push, fusion ou déploiement.

## Modifications

- Liste : une ligne par organisation avec nom, formule connue, situation commerciale, montant contractuel et date connue. Les valeurs absentes ne deviennent ni un zéro ni une offre inventée. Le montant d’un contrat résilié est présenté comme son dernier montant connu.
- Un seul filtre de situation commerciale, avec tous les choix existants ; filtre distinct et nommé pour le type de client. Les quatre compteurs restent informatifs et ne constituent plus une seconde série de filtres. Recherche, pagination et réinitialisation conservées.
- Fiche : bloc « Abonnement » avant l’identité, avec essai gratuit, actif, paiement en attente, retard/impayé et résiliation clairement distingués. Une organisation dont l’accès est actif n’est pas présentée pour autant comme un abonnement payant.
- Les paiements à suivre et erreurs de synchronisation restent visibles. Le montant du contrat n’est pas présenté comme le solde de la dette. Aucun essai n’est prolongé dans l’affichage sans donnée correspondante.
- Détails secondaires repliables : coordonnées, grille, unités, synchronisation, changements programmés, contrat et vérification des courriers. Factures, historique, justificatifs et toutes les actions existantes restent accessibles. Le lien de la synthèse ouvre directement l’historique de facturation.
- Accueil « Aujourd’hui », permissions, journalisation, requêtes, actions serveur, règles contractuelles, tarifs et calculs financiers inchangés. Aucun changement de base ou migration.

## Vérifications exécutées

- **82 tests distincts réussis, 0 échec, 0 ignoré, 4 suites**, dont 15 tests de présentation ajoutés. Fichiers : `ux-abonnements-admin.test.ts`, `finances-supervision.test.ts`, `racine-rendus-serveur.test.ts`, `supervision-defauts-audit.test.ts`. Ne pas additionner les relances aux 82 tests. Journal : `tests.log`.
- TypeScript (`tsc --noEmit`), ESLint ciblé et `git diff --check` : succès. Les avertissements de configuration Vitest/Vite du journal sont préexistants ; aucun réglage n’a été modifié pour les masquer.
- Chromium local à **390 et 1440 px** : recherche puis ouverture de quatre fiches fictives (essai, actif, retard de paiement, résilié), soit huit parcours. Montants de 599 centimes vérifiés dans liste et fiche ; essai sans montant inventé. Ouverture/fermeture des détails, clavier, accès aux actions de vérification et aux factures contrôlés. Aucun débordement ni erreur JavaScript observé.
- À chaque largeur : filtre des 13 actifs, des 24 paiements à suivre, pagination 20 + 4, réinitialisation, accueil « Aujourd’hui » conservé. Les deux écrans refusent un visiteur anonyme et redirigent vers la connexion.
- Tests serveur : refus sans rôle super-admin avant lecture, refus si journalisation impossible, panne de lecture visible sans faux statut. Montant absent/0 réel/annuel, essai expiré, paiement en attente, impayé et résiliation programmée contrôlés.
- **20 captures avant/après** réalisées sur les mêmes dossiers du banc fictif ; résultats détaillés dans les JSON joints. Authentification locale avec vérification du second facteur du compte de recette ; sessions non commitées.

## Limites et précautions

Mobile simulé dans Chromium, aucun téléphone physique. Les états `incomplete` et `unpaid` sont couverts par les tests de rendu ; le navigateur couvre le retard `past_due`. Les liens et sections de facturation sont vérifiés, pas la récupération d’une facture Stripe réelle. Les confirmations des actions sensibles sont ouvertes pour vérifier leur accessibilité, mais aucun envoi, paiement, changement d’abonnement, suspension ni reprise de courrier n’est exécuté. Les appels externes sont bloqués par le banc. Aucun accès à la production ni ouverture des ventes.

## Reproduction locale

Dans `app`, exécuter `node node_modules/vitest/vitest.mjs run tests/ux-abonnements-admin.test.ts tests/finances-supervision.test.ts tests/racine-rendus-serveur.test.ts tests/supervision-defauts-audit.test.ts`, puis TypeScript et ESLint sur les fichiers modifiés.
Les scripts navigateur utilisent le banc fictif local existant sur `localhost:3100`, l’émulateur sur `localhost:54297`, les quatre identifiants fictifs de `fixtures.json` et une session locale super-admin avec second facteur dans `session-admin.json` (jamais commiter ce fichier). Ils refusent les destinations externes. Les chemins de dépendances sont ceux du worktree utilisé ; aucune connexion de production ne doit être substituée.

## Captures

| Écran | Largeur | Avant | Après |
|---|---|---|---|
| liste | 390 px | [Avant](captures/avant-liste-390.png) | [Après](captures/apres-liste-390.png) |
| liste | 1440 px | [Avant](captures/avant-liste-1440.png) | [Après](captures/apres-liste-1440.png) |
| essai | 390 px | [Avant](captures/avant-essai-390.png) | [Après](captures/apres-essai-390.png) |
| essai | 1440 px | [Avant](captures/avant-essai-1440.png) | [Après](captures/apres-essai-1440.png) |
| actif | 390 px | [Avant](captures/avant-actif-390.png) | [Après](captures/apres-actif-390.png) |
| actif | 1440 px | [Avant](captures/avant-actif-1440.png) | [Après](captures/apres-actif-1440.png) |
| impaye | 390 px | [Avant](captures/avant-impaye-390.png) | [Après](captures/apres-impaye-390.png) |
| impaye | 1440 px | [Avant](captures/avant-impaye-1440.png) | [Après](captures/apres-impaye-1440.png) |
| resilie | 390 px | [Avant](captures/avant-resilie-390.png) | [Après](captures/apres-resilie-390.png) |
| resilie | 1440 px | [Avant](captures/avant-resilie-1440.png) | [Après](captures/apres-resilie-1440.png) |
