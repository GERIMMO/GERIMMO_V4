<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Exigences durables d’audit produit — décision utilisateur du 28 octobre 2026

Pour les audits et évolutions de Gerimmo, appliquer les règles suivantes, sauf instruction explicite contraire du porteur du projet :

- Établir le périmètre à partir des rôles, routes, menus, états et fonctionnalités réellement présents. Inclure les échanges entre rôles et ne pas confondre une route technique avec un écran ou un parcours complet.
- Identifier le commit examiné, la version publiée et les différences du banc. Préserver les travaux locaux existants. Les anciens rapports sont des éléments d’historique, pas des preuves d’une validation actuelle.
- Associer chaque écran à une preuve ordinateur et mobile ; contrôler les formats intermédiaires pertinents. Indiquer navigateur, dimensions et date. Une simulation mobile n’est pas un test sur téléphone réel.
- Vérifier les résultats des actions : enregistrement, rechargement, consultation par le destinataire autorisé. Couvrir les erreurs, données absentes, attentes, interruptions, doubles envois et changements d’état (notamment départ du locataire, fin de bail et clôture d’intervention).
- Vérifier la séparation des comptes, organisations et rôles côté serveur. Utiliser des comptes et données fictifs pour toute écriture ou action externe. Ne pas déclencher d’envoi, paiement, signature ou opération réelle dans un audit sans autorisation appropriée.
- Évaluer la clarté, la hiérarchie, les textes, les espacements, les retours d’action, les états vides, l’accessibilité et la performance perçue. Réutiliser les informations connues et rendre les informations manquantes directement corrigeables.
- Justifier chaque photo, illustration, icône, animation et transition par son bénéfice. Préserver la lisibilité, les cibles tactiles, le focus clavier et la préférence de réduction des animations. Accompagner les propositions importantes d’un exemple visuel quand il facilite une décision.
- Pour chaque constat : rôle/écran/contexte, reproduction, résultat attendu/observé, preuve, impact, priorité, correction proposée et critère de réussite. Distinguer défaut observé, risque à confirmer et proposition de conception.
- Maintenir une couverture avec les statuts « vérifié », « défaut constaté », « bloqué » et « non testé ». Préciser la portée du contrôle (affichage, interaction, résultat, code seulement). Un contrôle partiel ne valide jamais l’ensemble de la plateforme.
- Classer les recommandations par impact, urgence, effort estimé et dépendances ; signaler les incertitudes. Séparer les blocages, améliorations importantes et évolutions futures, avec une prochaine étape recommandée.
- Lorsqu’une correction est autorisée, reproduire le défaut, corriger sa cause, retester le comportement et les parcours affectés. Ne jamais désactiver un contrôle pour obtenir un résultat vert. Distinguer les défauts d’environnement des défauts applicatifs.
- Livrer une synthèse accessible à un non-développeur, les preuves et la couverture détaillée, les propositions utiles, les limites et une feuille de route. Poser uniquement les questions métier nécessaires et recommander une solution compréhensible pour les choix techniques courants.
