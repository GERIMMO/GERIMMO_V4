---
type: synthesis
tags: [lancement, recette, supervision]
status: active
created: 2026-10-21
updated: 2026-10-21
sources:
  - "Messages directs du dirigeant du 21 octobre 2026"
  - "PR230 ; CI 39606406311"
  - "Préparation locale du 21 octobre 2026"
---

# Préparation fonctionnelle — 21 octobre 2026

## Orientation confirmée

Le dirigeant demande une version de base totalement fonctionnelle, puis la finalisation des informations juridiques. Les fermetures préventives proposées dans le document de passation sont remplacées par la préparation de l’ouverture des fonctions métier. Les contrôles d’accès, l’isolement des comptes d’essai, les confirmations de paiement et de signature restent nécessaires au fonctionnement normal.

Il précise : « les agences ont possibilité seulement de s'inscrire sur liste d'attente du site vitrine le temps de tout finir ». Leur offre n’est donc pas ouverte. Voir [[Liste d'attente des agences]], [[Calendrier de lancement — 30 novembre 2026]] et [[Signature électronique]].

> [!warning] Orientation du 21 octobre, distincte de l’état publié
> La demande d’ouverture ne prouve ni l’activation effective des interrupteurs Vercel, ni un avis juridique sur les modèles. Les sessions Gerimmo, Vercel et Zoho ont expiré pendant ce contrôle. La lecture des réglages et leur modification restent à faire après reconnexion du titulaire. Aucun réglage de production n’a été changé dans ce lot.

## Preuves acquises

- PR230 fusionnée en `804a6da5fdf8f74baf63d64224fa633f30451ec1` ; CI de main [39606406311](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/39606406311) réussie. Elle confirme la correction des fixtures de dates après la CI rouge 39505731602.
- Vercel [64Kj2KzDs2cWLKrnfGmpSz2rEJ8A](https://vercel.com/gerimmo/gerimmo-v4/64Kj2KzDs2cWLKrnfGmpSz2rEJ8A) annoncé réussi. La recette de production après cette fusion reste en attente du contrôle temporaire autorisé à l’exécution ; aucune nouvelle recette revendiquée.
- PR229 relue, composée de huit fichiers de journal/wiki ; pas fusionnée dans ce relevé. CI 39551681690 réussie.

> [!warning] Couverture de la recette à rectifier après PR229
> La recette de production lit `/agences` mais ne teste pas la console `/admin/liste-attente`, ses statuts et son export. Les assertions correspondantes existent dans la recette locale. L’extension de la recette de production à une inscription fictive dédiée reste proposée, sans élargissement effectué.

## Corrections préparées dans ce lot

1. L’export CSV exclut les inscriptions retirées par défaut ; la case « Inclure les retirées » permet leur inclusion explicite. Le journal indique ce choix, sans données personnelles.
2. Le relais de 5 h peut compter les agences au statut `en_attente`. La fonction SQL ne rend qu’un nombre, réservé au rôle serveur. Aucun nouveau cron ni destinataire. Une lecture impossible est signalée comme telle.
3. Santé affiche séparément la connexion Zoho et les interrupteurs d’envoi des baux, autres actes, devis, relances, cautionnements et essais. Aucun secret ni identifiant d’organisation n’est affiché. Un interrupteur ouvert n’est pas une validation de tout le circuit.
4. Les adresses des jeux locaux utilisent `example.com` au lieu d’un domaine non réservé. Aucun compte de production modifié ou supprimé.

Migration préparée : `20261021133650_relais_point_agences.sql`, avec retour arrière, manifeste et tests des droits. Appliquée seulement à deux bases fictives locales, pas à Supabase de production. Déploiement requis : sauvegarde récente, simulation, application par chantier, squash de la tête validée, Vercel prêt, recette.

## Contrôles locaux

Compilation webpack, types et lint réussis. Suite complète avec PDF : **9 254 tests réussis, 36 non exécutés selon leurs prérequis, aucun échec** ; 636 fichiers réussis et cinq ignorés. Après ajustement du libellé Santé pour suivre la demande d’ouverture, ses tests ciblés repassent. Scénario navigateur de la liste d’attente et préparation des six sessions locales réussis ; capture mobile sans débordement horizontal, contrôlée visuellement. Le banc utilise des bases UTF-8 isolées et des coordonnées fictives.

La première passe locale avait neuf échecs : trois mocks du relais omettaient le nouveau compteur et six résultats découlaient d’un Chrome de rendu absent de l’environnement du banc. Mocks corrigés et Chromium installé désigné explicitement ; la seconde passe ci-dessus réussit. Ce n’était pas une preuve d’échec en production.

## Documents remis hors dépôt

Quatre dossiers PDF : juriste, DPO, expert-comptable, décisions et étapes. Sources primaires et liens vers les fichiers du SHA `804a6da` ; aucune adresse privée ni secret. Les messages sont des brouillons prêts à transmettre par le dirigeant, pas des envois effectués. Aucune adhésion à un médiateur, souscription Vercel, signature DPA ou dépense engagée.

Comparaison datée du 21 octobre : CM2C, Med Conso Dev et Avenir Conso ; CM2C proposé sous réserve de couverture de l’abonnement SaaS. Les tarifs et limites sont détaillés dans le dossier privé, sans transformer une recommandation en décision.

## Suite

- Reconnexion du titulaire puis relevé des interrupteurs et plafonds réels avant activation des fonctions métier.
- Recette de production après PR230 ; puis PR229 et préparation du déploiement de ce lot.
- Mises à jour Dependabot regroupées sur une branche séparée ; React et React DOM alignés, défauts de noms accessibles corrigés. Stripe 23 reste séparé : il change la version d’API vers `2026-09-30.endive` et nécessite l’essai du bac à sable.
- Informations juridiques complétables ultérieurement selon la demande du dirigeant ; relectures professionnelles non réalisées, fonctionnalités et validation juridique suivies séparément.
