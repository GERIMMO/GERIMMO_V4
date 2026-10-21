---
type: synthesis
tags: [maintenance, accessibilite, formulaires]
status: in-progress
created: 2026-10-21
updated: 2026-10-21
sources:
  - "Vérifications locales du 21 octobre 2026"
  - "Notes officielles des dépendances et actions GitHub"
---

# Dépendances et formulaires — 21 octobre 2026

La préparation part de main `804a6da`, après la correction des dates de créneaux. Les nouvelles versions sont regroupées pour limiter les déploiements. Voir [[Calendrier de lancement — 30 novembre 2026]] et [[Préparation fonctionnelle — 21 octobre 2026]].

## Périmètre

React et React DOM sont alignés sur 19.3.1. Supabase JS 2.118.0 et SSR 0.12.3 sont épinglés ensemble. Les outils Playwright, axe-core, pg, shadcn, Hono et Vite sont actualisés avec leur verrou npm. Next et eslint-config-next restent alignés sur 16.3.8.

Les types Node restent sur la majeure 22, correspondant aux chantiers, au lieu d’adopter la 26. Stripe reste sur 22.6.2 : la majeure 23 change la version API par défaut vers `2026-09-30.endive`. Son adoption attend une vérification dédiée du bac à sable et des événements, pas seulement une compilation. Aucun prix, mode Stripe, webhook ou paiement n’est changé.

Les actions checkout/setup-node passent en v7, upload-artifact en v7 et download-artifact en v8. Les actions du chantier de publication restent épinglées par empreinte. Déclencheurs, droits et conditions de publication conservés.

Sources : [Stripe v23](https://github.com/stripe/stripe-node/releases/tag/v23.0.0), [checkout v7](https://github.com/actions/checkout/releases/tag/v7.0.0), [setup-node v7](https://github.com/actions/setup-node/releases/tag/v7.0.0), [upload-artifact](https://github.com/actions/upload-artifact/releases), [download-artifact](https://github.com/actions/download-artifact/releases), consultées le 21 octobre 2026.

## Défauts corrigés pendant les essais

Le nouvel audit d’accessibilité a détecté des noms de commandes qui ne reprenaient pas leur libellé affiché, notamment avec les badges et les numéros d’étapes. Les liens et boutons reprennent maintenant leur texte visible ; les précisions utiles restent accessibles aux lecteurs d’écran. Les règles de contrôle axe ne sont pas désactivées.

Une saisie des charges du bail pouvait être lue trop tard depuis la cible mutable de l’événement React. La valeur est capturée au moment de la frappe, avant la mise à jour d’état différée. Un test reproduit une cible vidée avant application de la mise à jour et vérifie la conservation du montant. Aucun changement des calculs ou règles du loyer.

Une sauvegarde de frappe encore différée pouvait aussi écraser un résultat serveur déjà enregistré dans la copie locale d’un incident. L’enregistrement immédiat annule maintenant cette ancienne minuterie, tout en autorisant les nouvelles saisies ultérieures. Le test échoue sur l’ancien comportement et réussit après correction ; le cas d’effacement reste protégé contre la réapparition d’une copie.

## Preuves locales

Lint, compilation webpack, types et suite complète réussis : **9 238 tests réussis, 36 ignorés selon prérequis**, 635 fichiers réussis, cinq ignorés. Les quinze essais navigateur ciblés réussissent, dont le parcours propriétaire avec conservation des saisies et l’audit d’accessibilité. Les jeux et bases sont fictifs, isolés de la production ; aucun message ni paiement réel.

Les premières passes ont révélé un navigateur non installé, les noms accessibles incohérents et un montant de formulaire perdu. Ces écarts ont été corrigés ; seuls les résultats de la passe finale sont retenus ci-dessus. La CI distante et la recette après publication restent requises.

L’audit final couvre 68 écrans : aucune violation axe ni commande sans nom détectée. Après le correctif d’ordre des copies, 46 tests ciblés passent, ainsi que lint, compilation, types et neuf essais navigateur (reprise d’incidents et saisie propriétaire aux formats téléphone et ordinateur). La suite complète précédente précède ce dernier correctif ; la CI vérifie la tête finale.

> [!warning] Portée des preuves
> Ces résultats prouvent les scénarios testés sur l’environnement local. Ils ne constituent pas une preuve de déploiement ni une vérification de toutes les intégrations externes. La branche de suivi artisans/agences est distincte et devra être rapprochée de cette tête avant publication.
