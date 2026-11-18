# Console du dirigeant — chantier UX 8B

18 novembre 2026. Base `debd04abaa563f06360143617b6ed443d0b1803f`, branche `codex/ux-accueil-proprietaire-20261118`. Recommandations 11, 27 et 28 du rapport Claude, relues depuis `origin/claude/audit-final-pr335`. Un seul agent. Aucun push, fusion, migration ni déploiement.

## Livré localement

- Cinq catégories : Aujourd’hui, Clients et abonnements, Assistance, Croissance, Exploitation et sécurité. Les 17 destinations sont chacune présentes une seule fois. Groupe actif ouvert, compteurs d’attention visibles même lorsqu’un groupe est fermé, sous-pages conservées.
- Santé : résumé des contrôles existants, files de courriels/factures/notifications en français, erreurs et résultats incertains signalés avant les sections repliées. Limite de 50 résultats par file explicite ; aucune affirmation de livraison à partir d’une simple acceptation du fournisseur. Les identifiants, motifs, états bruts et références restent accessibles dans « Détails techniques ».
- Automatismes : nom, état, dernière exécution et commandes sur une même ligne sur ordinateur, empilés sur téléphone. Horaire, rôle, résultat détaillé et historique repliés. Les commandes existantes, consignes, atelier, mesures et accès à l’arrêt d’urgence sont conservés.
- Aujourd’hui (8A), les lectures serveur, les autorisations, les conditions d’affichage des commandes et les traitements métier restent inchangés. Aucun réglage activé ou désactivé. Aucun autre espace modifié.

## Preuves exécutées

**68 tests réussis, 0 échoué, 0 ignoré**, dans six fichiers (ne pas additionner les relances). TypeScript et ESLint ciblé réussis.

Les trois scénarios navigateur isolés couvrent les états normal, dégradé et indisponible, chacun à **390 et 1440 px** : cinq groupes, 17 destinations sans doublon, compteurs inconnus distincts de zéro, détails au clavier, preuves d’envoi incertain et filtres des tâches. Les données de ces scénarios sont fictives ; elles ne prouvent pas l’état de production.

Sur l’application locale et sa base fictive, avec session super-admin et second facteur normal : captures Santé, Automatismes et menu aux deux largeurs ; **17 destinations principales ouvertes par clic à 390 px**, titre attendu et absence de débordement. Des sous-pages ont été ouvertes, mais le parcours complet des liens secondaires et le parcours connecté à 1440 px ne sont pas clôturés. Voir `navigation.json` et `parcours-stable.log`. Les captures ne sont pas présentées comme une recette complète des fonctions des pages.

Le propriétaire fictif est refusé sur Aujourd’hui, Santé et Automatismes, sans contenu de supervision (`permissions.json`). Deux tests supplémentaires refusent toute lecture des files si l’autorisation super-admin est absente ou illisible. Aucune modification de droit ni désactivation du second facteur.

Comparaison avant/après : **12 formulaires Santé et 11 formulaires Automatismes conservés**, mêmes champs métier aux deux largeurs. Les boutons de lancement/pause restent présents ; ils ne sont pas exécutés pour cette modification de présentation. Aucun envoi, paiement ou traitement réel déclenché.

## Captures avant / après

| Écran | 390 px | 1440 px |
|---|---|---|
| Menu et Aujourd’hui | [avant](captures/avant-admin-menu-390.png) · [après](captures/apres-admin-menu-390.png) | [avant](captures/avant-admin-menu-1440.png) · [après](captures/apres-admin-menu-1440.png) |
| Santé | [avant](captures/avant-admin-sante-390.png) · [après](captures/apres-admin-sante-390.png) | [avant](captures/avant-admin-sante-1440.png) · [après](captures/apres-admin-sante-1440.png) |
| Automatismes | [avant](captures/avant-admin-automatismes-390.png) · [après](captures/apres-admin-automatismes-390.png) | [avant](captures/avant-admin-automatismes-1440.png) · [après](captures/apres-admin-automatismes-1440.png) |

Santé : **7 124 → 2 574 px** sur téléphone et **3 793 → 1 918 px** sur ordinateur. Automatismes : **6 082 → 5 141 px** et **3 252 → 3 079 px**. Détails conservés et repliés, pas supprimés. Chromium, téléphone simulé ; aucun appareil physique testé. Captures inspectées visuellement, zéro débordement horizontal sur les trois écrans.

## Limites et reprise ciblée

Le budget de 30 minutes a été dépassé pendant les attentes d’exécution : arrêt des contrôles et sauvegarde locale, sans élargir le périmètre. Aucun travail complémentaire engagé.

Les premiers essais ont rencontré : une assertion de badges obsolète (désormais vérification des deux sources dans leurs groupes et liens), un sélecteur de groupe du banc incorrect (corrigé), un redémarrage mémoire du serveur local, puis des interruptions de navigation et une erreur JavaScript « Invalid or unexpected token » sur un parcours antérieur. La dernière navigation stabilisée confirme les 17 pages principales mobiles ; la recette complète n’est **pas** déclarée verte. Les journaux sont conservés. L’origine exacte de l’erreur JavaScript antérieure reste à confirmer si elle se reproduit ; aucune correction hors périmètre n’a été improvisée.

Avant toute intégration : terminer uniquement les liens secondaires et la navigation connectée à 1440 px, vérifier la disparition de cette erreur avec une session stable, puis obtenir l’autorisation utilisateur. Aucun nouveau chantier UX requis. Les serveurs de ce chantier sont arrêtés ; la base locale préexistante est conservée. Sessions et secrets fictifs restent hors Git dans `output/ux-console-20261118`.

Rejeu depuis `app` :

```sh
node node_modules/vitest/vitest.mjs run tests/ux-console-direction-navigateur.test.ts tests/ux-console-suivi.test.ts tests/rubriques-supervision.test.ts tests/sante-service.test.ts tests/ux-accueil-dirigeant.test.ts tests/compteurs-navigation-supervision.test.ts
npx tsc --noEmit
```

Preuves : `tests-finaux.log`, `verifications.json`, `comparaison-avant-apres.json`, `navigation.json`, `permissions.json`, captures et journaux des essais. Les relances ne sont pas comptées comme des tests distincts.
