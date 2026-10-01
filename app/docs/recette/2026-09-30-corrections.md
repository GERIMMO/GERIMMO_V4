# Corrections de recette agence et locataire — 30 septembre 2026

## Changements
- Mandat : date de prise d'effet demandée à la création et modifiable sur les brouillons existants. Contrôle serveur de la date, de l'agence, de la personne et de l'état brouillon. Aucun mandat activé automatiquement.
- Propriétaire rapide : champs de naissance à la suite du prénom, validation de tous les champs avant fermeture (clic et Entrée).
- Abonnement agence : distinguer socle/capacité de lots et volume réellement sous mandat. Aucun changement de prix ni de prélèvement.
- Adresse : suggestions fermées en quittant le champ ; réponse tardive ignorée hors champ. Saisie libre explicitée.
- Bien : texte adapté à plusieurs lots ; commune présentée comme contrôle de couverture, jamais ouverture automatique.
- Répartition : confirmation remplace le formulaire validé ; préparation explicite d'une autre répartition.
- Diagnostics : gaz, électricité et termites présentés comme applicabilité à vérifier, sans inventer l'absence de gaz à partir du chauffage. Date d'expiration exigée côté formulaire et serveur pour les diagnostics à durée limitée.
- Fiches : message de rattachement plus explicite, invitation locataire retirée des garants, explication pour les fiches sans rôle. Mandats en préparation distingués des actifs.
- Alertes : pas d'ouverture automatique à l'arrivée de la première alerte pendant le travail.
- Pièces et diagnostics : succès précédent masqué dès nouvelle saisie.
- Locataire : demandes de pièces cohérentes entre carte, badge et priorités ; assurance manquante remontée avant bail actif ; absence de bail actif expliquée avant formulaire d'incident ; pièce conservée après erreur.
- Congé : réception effective de la LRAR, et non première présentation (FAQ et carte logement). Source : https://www.service-public.gouv.fr/particuliers/vosdroits/F1168 (vérifié le 30/09/2026).
- Veille : les consignes techniques et multi-profils ne sont plus présentées comme actions personnelles du locataire ; renvoi à la source et au gestionnaire. Les textes publiés en base restent inchangés ; leur réécriture ciblée demeure un travail éditorial.

## Vérifications et limites
Lint et types réussis ; 24 tests ciblés réussis, dont nouveau contrôle de modification du mandat (droits, dates invalides, limites agence/personne/état). Suite générale : 1588 tests réussis avant les derniers ajustements ; tests PostgreSQL non exécutables localement, à vérifier dans la CI.

La restriction serveur d'activation du bail sans mandat actif est conservée : c'est un contrôle attendu, pas une anomalie à contourner. Les informations contractuelles absentes ne sont pas inventées.
L'adresse manuelle fonctionne déjà. L'ouverture/téléchargement PDF reste un essai non concluant dans le navigateur utilisé : aucune panne serveur établie.
Les parcours complets après activation, la réception dans les boîtes e-mail et le paiement bancaire restent à tester. Cette correction ne vaut pas validation exhaustive du site.
