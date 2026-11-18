# Accueil propriétaire — chantiers UX 1 et 2

Correction du 18 novembre 2026 sur la branche codex/ux-accueil-proprietaire-20261118, à partir de dca396418053c9edb01351a6dd5b39dd9a087dc4. Référence : livrables/audit-ux-ui/plan.md, recommandations et constats P07/P15/P38/P44 de claude/audit-final-pr335 (684a7f58eb7e2d205d66c2997c5c636b873a9271).

## Corrections

- Accueil : « À faire maintenant » précède les chiffres ; trois tâches visibles au maximum, les suivantes restent accessibles. Priorités, réception des loyers, actions rapides et dossiers conservés. Compteur concurrent et fenêtre automatique retirés pour les propriétaires seulement.
- Compte neuf : prochaine étape et premier bien immédiatement accessibles, six étapes reconsultables, sans indicateurs à zéro ni raccourcis prématurés. Aucun encaissement masqué après archivage du dernier bien. Le tutoriel disparaît avec un bail actif ou en préavis.
- Information de service : un message explicite à l’accueil sur les envois suspendus, acquittable et toujours reconsultable. Choix conservé par compte et espace dans ce navigateur. Lien vers les préférences. Aucune règle d’envoi modifiée ; comportement des agences conservé.

## Vérifications

**91 tests ciblés réussis, 0 échec, 0 ignoré**, dans cinq fichiers : accueil, racines et rôles, pilotage, tâches et grands patrimoines. Incluent priorités, montants, erreurs de lecture, compte neuf, guide masqué avec bail actif et conservation des tâches. Les assertions sur l’ancienne fenêtre sont remplacées par des contrôles de la liste réellement rendue ; les vérifications financières et de lecture seule sont conservées.

**4 scénarios navigateur réussis** : compte neuf et patrimoine fictif à **390 et 1440 px**, Chromium local, mobile simulé. Inscription du compte neuf via l’interface et la boîte fictive ; accès au formulaire de premier bien, ouverture d’une tâche, six étapes au clavier, absence de fenêtre automatique, acquittement/rechargement/réouverture de l’information, accès aux préférences, absence de bandeau répétitif sur le patrimoine. Aucun débordement horizontal ni erreur JavaScript.

Typage et lint ciblé réussis. Premier contrôle de typage interrompu par la limite mémoire de 2 Go ; contrôle avec 6 Go terminé sans erreur. Aucune CI hébergée lancée.

| État | Avant 390 px | Après 390 px | Avant 1440 px | Après 1440 px |
|---|---|---|---|---|
| Compte neuf | [Avant](captures/avant-neuf-390.png) | [Après](captures/apres-neuf-390.png) | [Avant](captures/avant-neuf-1440.png) | [Après](captures/apres-neuf-1440.png) |
| Patrimoine fictif | [Avant](captures/avant-patrimoine-390.png) | [Après](captures/apres-patrimoine-390.png) | [Avant](captures/avant-patrimoine-1440.png) | [Après](captures/apres-patrimoine-1440.png) |

Comparaison sur les mêmes dossiers. Le retrait du tutoriel avec contrats actifs est vérifié par les tests de rendu ; le dossier photographié est en préparation. Les captures avant peuvent montrer l’indicateur du serveur local. Une recapture avant pendant le rechargement à chaud est restée sur « Chargement » ; les captures avant déjà réussies sont conservées. Les quatre scénarios ont ensuite réussi sur le correctif final.

Preuves : [tests](tests-cibles.log), [résultats navigateur](resultats-navigateur.json), [journal](verification-navigateur.log). Le script verification-navigateur.cjs prend en argument le répertoire privé des sessions fictives du banc (session-locale.json, session-neuf.json, compte-neuf.json). Ces sessions ne sont pas commitées. Le script cible uniquement localhost:3100 et bloque les requêtes externes.

## État de livraison

Aucune migration, donnée réelle modifiée, fusion ou publication. Calculs et identité visuelle conservés. Autres chantiers exclus. Revue et validations requises avant mise en ligne. La compréhension « en dix secondes » reste un objectif ergonomique, sans étude chronométrée auprès de vrais propriétaires.
