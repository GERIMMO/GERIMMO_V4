---
type: synthesis
tags: [lancement, recette, supervision]
status: in-progress
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
> La demande d’ouverture ne prouve ni l’activation effective des interrupteurs Vercel, ni un avis juridique sur les modèles. La page Santé de Gerimmo a pu être lue : clé Stripe réelle présente, envois clients affichés actifs, plafond mensuel de 400 crédits. Vercel et Zoho ont été reconnectés par le dirigeant. Zoho affiche l’offre API, 478 crédits restants et les alertes actives ; le contrat et le DPA restent à faire relire. La page Santé publiée ne détaille pas encore tous les interrupteurs ajoutés par ce lot. Après accord explicite « Oui, lire cet interrupteur et le mettre à false », `ZOHO_SIGN_CAUTIONNEMENT_FERME` a été enregistré ouvert dans Vercel. Le redéploiement de la version courante PR230 est lancé sous `2N73v4PcoEmhnFhfUHbvS8H7gKPJ` ; sa fin reste à contrôler à ce stade. Aucun secret d’accès n’a été révélé.

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
4. Les modules artisans « clients externes » et « règlements manuels » sont préparés pour un hébergement HTTPS. Leur activation en base était encore désactivée lors de la lecture du 21 octobre. La migration ouvre ces deux modules existants sans modifier les droits d’accès ni la propriété des dossiers. Le retour arrière ferme les nouvelles saisies en conservant les données. Les règlements restent des déclarations justifiées : aucun mouvement bancaire déclenché.
5. Les adresses des jeux locaux utilisent `example.com` au lieu d’un domaine non réservé. Aucun compte de production modifié ou supprimé.

Migrations préparées : `20261021133650_relais_point_agences.sql` puis `20261021140836_ouverture_activite_artisan.sql`, avec retours arrière, manifeste et tests des droits. Appliquées seulement à deux bases fictives locales, pas à Supabase de production. Déploiement requis : sauvegarde récente, simulation, application par chantier, squash de la tête validée, Vercel prêt, recette.

## Contrôles locaux

Compilation webpack, types et lint réussis. Suite complète avec PDF : **9 254 tests réussis, 36 non exécutés selon leurs prérequis, aucun échec** ; 636 fichiers réussis et cinq ignorés. Après ajustement du libellé Santé pour suivre la demande d’ouverture, ses tests ciblés repassent. Après ajout de l’ouverture artisan : 9 263 tests réussis et un inventaire de retours arrière à mettre à jour ; inventaire corrigé, 95 tests ciblés réussis (retours atomiques, activation et identité). Les 16 contrôles navigateur ciblés réussissent, dont la création du client artisan et du chantier/devis fictif, conservés après rechargement, ainsi que les statuts et exports de la liste d’attente. Quatre captures ordinateur/téléphone sont contrôlées visuellement sans débordement horizontal. Aucun envoi, signature ou paiement réel. La CI790 du premier lot réussit les unités et échoue sur cinq parcours utilisant deux anciennes références de domaine fictif ; ces deux références sont corrigées. Une reprise de photo d’incident a réussi seulement au second passage et reste à surveiller dans la nouvelle CI. Le banc utilise des bases UTF-8 isolées et des coordonnées fictives.

La première passe locale avait neuf échecs : trois mocks du relais omettaient le nouveau compteur et six résultats découlaient d’un Chrome de rendu absent de l’environnement du banc. Mocks corrigés et Chromium installé désigné explicitement ; la seconde passe ci-dessus réussit. Ce n’était pas une preuve d’échec en production.

## Documents remis hors dépôt

Quatre dossiers PDF : juriste, DPO, expert-comptable, décisions et étapes. Sources primaires et liens vers les fichiers du SHA `804a6da` ; aucune adresse privée ni secret. Les messages sont des brouillons prêts à transmettre par le dirigeant, pas des envois effectués. Aucune adhésion à un médiateur, souscription Vercel, signature DPA ou dépense engagée.

Comparaison datée du 21 octobre : CM2C, Med Conso Dev et Avenir Conso ; CM2C proposé sous réserve de couverture de l’abonnement SaaS. Les tarifs et limites sont détaillés dans le dossier privé, sans transformer une recommandation en décision.

## Suite

- Contrôler le redéploiement du réglage Vercel et les autres interrupteurs dans la page Santé détaillée après publication. Le plafond constaté de 400 crédits est conservé ; il n’est pas à zéro et n’a pas à être relevé pour ce lot.
- Recette de production après PR230 ; puis PR229 et préparation du déploiement de ce lot.
- Mises à jour Dependabot regroupées sur une branche séparée ; React et React DOM alignés, défauts de noms accessibles corrigés. Stripe 23 reste séparé : il change la version d’API vers `2026-09-30.endive` et nécessite l’essai du bac à sable.
- Informations juridiques complétables ultérieurement selon la demande du dirigeant ; relectures professionnelles non réalisées, fonctionnalités et validation juridique suivies séparément.
