# UX 12B — Harmonisation finale ciblée

18 novembre 2026. Branche `codex/ux-accueil-proprietaire-20261118`, base `d2bffd4f140353348e104f7d9813e8e16f2f478f`. Un seul agent, plafond de 30 minutes. Aucun push, fusion, migration ou déploiement.

## Constats et corrections

| Constat confirmé | Correction | Critère vérifié |
|---|---|---|
| Les quatre composants de chargement ne montrent aucun texte visible ; leur indication accessible varie selon l’espace. | Même phrase « Chargement de la page… », état accessible, squelettes décoratifs masqués aux lecteurs d’écran. Les gabarits et le repère principal restent présents. | Phrase visible, état occupé et aucun montant/statut fictif, aux deux largeurs. |
| L’erreur annonce « L’incident est noté » alors que l’action de signalement ne garantit pas sa réussite et ne consigne rien pour un visiteur anonyme. L’assistance est citée sans lien. | Message court, réessai conservé, lien direct vers `/assistance`, référence disponible dans un volet. Même formulation dans l’erreur racine autonome. | Réessai déclenché, référence ouverte au clavier, message technique privé non exposé, aucune affirmation de signalement réussi. |
| Sur un formulaire sans libellé d’attente personnalisé, seul le petit indicateur animé change. | « Traitement en cours… » et état occupé accessible ; les libellés personnalisés, la validation native, l’attente de l’hydratation et le verrou de soumission restent inchangés. | Une seule exécution simulée malgré les clics répétés ; aucune confirmation avant réussite ; bouton réactivé après traitement. |
| Le bouton de fermeture du message de confirmation mesure 13 × 24 px ; son texte prend une colonne étroite sur téléphone. | Cible 44 × 44 px, largeur adaptée à l’écran, retour à la ligne des textes longs. | Mesure réelle 44 × 44 px, fermeture clavier et expiration après 6 secondes, aucun débordement. |
| Libellés déjà signalés par Claude : « 1 rôles » et « Gerimmo — les 7 prochains jours ». | Accord du compteur et « Mes 7 prochains jours ». | Rendus avec 0/1/2 rôles et sept jours de l’agenda inchangés. |

Les droits, la journalisation, les mécanismes d’authentification, les prix, Stripe, les contrats, les calculs et les traitements métier ne sont pas modifiés. Le signalement d’erreur reste appelé dans les mêmes conditions. Aucun changement des statuts d’abonnement ou ouverture des ventes.

## Vérifications exécutées

- **39 tests distincts réussis, 0 échec final** : 36 tests dans `ux-harmonisation.test.ts`, `bouton-envoi-hydratation.test.ts`, `erreurs-ecran.test.ts`, `artisan-agenda-jour-paris.test.ts`, puis les trois cas `UX 12B` de `supervision-defauts-audit.test.ts`. Les **41 autres tests de cette dernière suite ne sont pas exécutés**, car hors sélection ciblée ; ils ne sont pas comptés comme réussis.
- TypeScript et ESLint ciblé : succès. Le premier contrôle TypeScript a atteint la limite locale de 2 Go ; le contrôle a réussi avec 6 Go, sans modifier la configuration du dépôt. Deux assertions de chargement ont initialement détecté l’absence de texte dans les espaces locataire/artisan ; ajout corrigé puis tests rejoués. Le premier passage est conservé.
- **14 scénarios de composants dans Chromium** à 390 et 1440 px : cinq chargements (quatre espaces et racine), erreur et formulaire. Rendu des composants réels, CSS et polices existantes. Validation native, attente, doubles clics, fin de traitement, confirmation, fermeture clavier et expiration vérifiées. Aucun débordement ou erreur JavaScript observé dans ces scénarios.
- **24 captures avant/après** ; la référence avant correspond au code du commit de base et la même composition locale est utilisée après. Les composants n’ont pas été remplacés par des maquettes.
- `git diff --check` : succès. Aucun serveur de production, compte réel, destinataire réel ou paiement utilisé.

## Portée et limites

Il s’agit d’un **banc isolé de composants**, pas d’une nouvelle recette connectée des quatre portails. Son en-tête indique le contexte de rôle ; il n’installe pas les gabarits métier complets. L’enregistrement du formulaire et le capteur d’erreurs sont simulés uniquement dans le banc, aucune route de démonstration n’est ajoutée à l’application. Le lien d’assistance pointe vers la route existante ; son parcours métier n’est pas rejoué. L’erreur racine sans CSS, les libellés d’agenda et les compteurs de rôles sont couverts en rendu serveur. Le téléphone est simulé, pas un appareil physique.

Aucun nouveau défaut bloquant constaté dans ce périmètre. Les pages hors gabarit, la navigation tablette commune et les autres finitions secondaires du rapport initial ne sont pas développées ici : leur portée dépasse cette harmonisation ciblée. La consolidation des commits UX et sa validation de livraison restent à faire séparément ; aucune validation globale de la plateforme n’est annoncée.

## Reproduction

Dans `app` :

```sh
node node_modules/vitest/vitest.mjs run tests/ux-harmonisation.test.ts tests/bouton-envoi-hydratation.test.ts tests/erreurs-ecran.test.ts tests/artisan-agenda-jour-paris.test.ts
node node_modules/vitest/vitest.mjs run tests/supervision-defauts-audit.test.ts -t 'UX 12B'
node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit
```

Les scripts du banc utilisent les dépendances du worktree local et le port `127.0.0.1:3182`. Lancer `lancer.mjs`, puis `captures.cjs apres` et `gestes.cjs`. Les requêtes externes sont refusées ; `signaler.ts` et `navigation.ts` remplacent uniquement les dépendances serveur dans ce banc. Ne jamais brancher ce banc à une base ou à des services réels.

## Captures

| Composant | Largeur | Avant | Après |
|---|---|---|---|
| proprietaire | 390 px | [Avant](captures/avant-proprietaire-390.png) | [Après](captures/apres-proprietaire-390.png) |
| proprietaire | 1440 px | [Avant](captures/avant-proprietaire-1440.png) | [Après](captures/apres-proprietaire-1440.png) |
| locataire | 390 px | [Avant](captures/avant-locataire-390.png) | [Après](captures/apres-locataire-390.png) |
| locataire | 1440 px | [Avant](captures/avant-locataire-1440.png) | [Après](captures/apres-locataire-1440.png) |
| artisan | 390 px | [Avant](captures/avant-artisan-390.png) | [Après](captures/apres-artisan-390.png) |
| artisan | 1440 px | [Avant](captures/avant-artisan-1440.png) | [Après](captures/apres-artisan-1440.png) |
| admin | 390 px | [Avant](captures/avant-admin-390.png) | [Après](captures/apres-admin-390.png) |
| admin | 1440 px | [Avant](captures/avant-admin-1440.png) | [Après](captures/apres-admin-1440.png) |
| erreur | 390 px | [Avant](captures/avant-erreur-390.png) | [Après](captures/apres-erreur-390.png) |
| erreur | 1440 px | [Avant](captures/avant-erreur-1440.png) | [Après](captures/apres-erreur-1440.png) |
| formulaire | 390 px | [Avant](captures/avant-formulaire-390.png) | [Après](captures/apres-formulaire-390.png) |
| formulaire | 1440 px | [Avant](captures/avant-formulaire-1440.png) | [Après](captures/apres-formulaire-1440.png) |
