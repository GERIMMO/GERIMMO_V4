# UX 9A — Fiche logement — 18 novembre 2026

Périmètre : recommandation 12 du rapport Claude, fiche propriétaire uniquement. Branche locale `codex/ux-accueil-proprietaire-20261118`, base `a68ea9a57224f70936cb96e06dee8d1c85e55b3f`.

## Résultat

Cinq onglets : **Résumé · Location · Argent · Documents · Caractéristiques**. Le résumé conserve situation, titulaire, loyer contractuel, éléments à compléter et incidents. Les baux et occupants se retrouvent dans Location ; les loyers, dépenses, compteurs et charges dans Argent ; les diagnostics et la GED dans Documents ; le logement, le bâtiment, la propriété et l’historique dans Caractéristiques. Les anciennes ancres et tous les formulaires sont conservés. Le lien Modifier ouvre directement le bon onglet.

La carte Incidents reste neutre sans incident ouvert, y compris lorsqu’un historique clôturé existe. Une erreur de lecture demeure affichée et n’est jamais présentée comme une absence d’incident.

Les onglets occupent deux lignes sur téléphone, sans carrousel horizontal ; ils restent accessibles au clavier. Sur la fiche occupée de référence à 390 px, la vue initiale passe de **4 663 à 1 335 px**, sans retirer les contenus des autres onglets.

## Vérifications exécutées

| Contrôle | Résultat et preuve |
|---|---|
| Occupée, SCI, vacante, sans incident, incident ouvert, à 390 et 1440 px | 10 passages réussis ; cinq onglets, formulaire de modification, saisie conservée, diagnostics, rechargement et couleurs : `navigation-resultats.json` |
| Bien de deux lots fictifs, navigation d’une annexe à 390 et 1440 px | 2 passages réussis : `navigation-multi-lots-resultats.json` ; ce contrôle ne prétend pas être une recette de création de plusieurs baux |
| Comparaison avant/après, quatre fiches et deux largeurs | Mêmes formulaires, champs, liens et montants ; aucun débordement : `invariants.json` |
| Liens d’action | Ouverture effective des baux (1440 px) et formulaires de dépôt documentaire (390 px), particulier et SCI : 4 contrôles réussis, `liens-actions.json` ; aucun enregistrement effectué |
| Droits | Locataire et propriétaire d’une autre organisation refusés (404), sans fiche privée ni commande de modification : `droits-*.json` |
| Tests ciblés automatisés | **25 réussis, 0 échoué, 0 ignoré**, quatre fichiers : `tests-finaux.log` |
| TypeScript / ESLint ciblé / diff | Réussis, sans erreur |

Les tests couvrent les ancres profondes, la navigation clavier, la conservation des saisies, la révélation des champs invalides et des détails repliés, les incidents ouverts/clos/indisponibles, les accès aux identités et les montants existants. Les suites se recoupent avec la recette navigateur : aucun total de « tests uniques » n’est déduit de leur addition.

Le sélecteur de commune est chargé de façon asynchrone par le composant existant : la comparaison finale attend explicitement ce chargement. Un premier passage navigateur a attendu un raccourci pendant une recompilation locale ; le scénario a été rejoué sur la version stabilisée, avec les mêmes assertions, puis réussi. Aucune assertion désactivée. Les routes bail et documents ont nécessité une première compilation à froid du serveur de développement ; après compilation, leurs liens et contenus ont été vérifiés avec succès.

## Captures

Avant/après à **390 et 1440 px**, pour les quatre fiches : dossier `captures/`, inventaire et empreintes dans `captures.json`. Captures complémentaires des cinq onglets et de l’incident ouvert. Vérification réalisée sous Chromium, téléphone **simulé**, pas sur un appareil réel.

Exemples : [avant téléphone](captures/avant-occupe-390.png), [après téléphone](captures/apres-occupe-390.png), [avant ordinateur](captures/avant-occupe-1440.png), [après ordinateur](captures/apres-occupe-1440.png).

## Préservation et limites

Seuls l’assemblage de la présentation, ses styles et un attribut d’état visuel des incidents changent. Requêtes, calculs, fonctions serveur, règles de bail, permissions et notifications inchangés ; aucune migration. Aucune action d’écriture métier soumise pendant la recette. Les formulaires sont ouverts et testés sans enregistrer de modification. Le parcours agence existant est conservé.

Les comptes, sessions et données sont fictifs, sur le banc local isolé. Aucun accès ni changement en production. Aucun push, aucune fusion, aucun déploiement. Les sessions et secrets du banc ne sont pas committés.

## Rejouer les tests ciblés

Depuis `app` :

```sh
npx vitest run tests/ux-fiche-logement-navigateur.test.ts tests/personnes-incidents-lot.test.ts tests/fiche-lot-resume.test.ts tests/dossiers-mobiles-navigateur.test.ts
npx tsc --noEmit
```

Les scripts et preuves brutes du parcours applicatif sont conservés dans `/Users/easycash/Documents/Gerimmo V3/output/ux-fiche-logement-20261118/` ; ils utilisent exclusivement le banc local existant. Les captures `avant` sont antérieures à la modification du code.
