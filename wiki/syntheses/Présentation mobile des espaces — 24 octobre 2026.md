# Présentation mobile des espaces — 24 octobre 2026

## Décision de présentation

Une page montre d'abord son objet et le prochain geste utile. Les détails restent accessibles par rubrique, sans répéter les caractéristiques et sans effacer une saisie lorsqu'on change de panneau.

Les couleurs accompagnent des libellés explicites : vert pour un rapport à jour, ambre doux pour une pièce à ajouter ou renouveler, neutre pour une obligation à confirmer. Un fichier déposé n'est pas une preuve de validité juridique ; un diagnostic sans échéance affichée est présenté comme disponible, sans promesse de validité illimitée.

## Périmètre

- Propriétaires et agences : fiche lot en quatre rubriques, caractéristiques uniques, bilan documentaire cohérent entre fiche bien et lot.
- Baux en cours : contrat, documents, suivi et départ séparés ; dans le suivi, états des lieux, paiements, dépôt et avenant s'ouvrent selon le besoin. Liens directs vers les loyers, les états des lieux et la restitution conservés.
- Agences : choix de document par situation et état des lieux guidé, une pièce à la fois.
- Locataires : séparer les transmissions demandées des fichiers disponibles ; assurance déjà déposée sans formulaire ouvert en permanence.
- Artisans : coordonnées, zone et métiers, personnalisation des devis dans trois rubriques.
- Tous les espaces privés : titres plus compacts, espacements mobiles et cibles tactiles conservées.
- Superadmin : simplification des huit rubriques et de leurs détails déjà publiée dans la PR #253.

## Preuves et limites

Baseline : 177 captures du banc de test précédent. L'audit couvre les sept personas, ajoute les dossiers profonds du propriétaire et contrôle chaque panneau des nouvelles fiches à onglets. Les textes légaux longs ne sont pas tronqués pour réduire artificiellement la hauteur.

Les contrôles locaux et les résultats de CI/publication sont consignés dans `log.md`. Aucun paramétrage externe ni migration ne sont nécessaires pour ces présentations. Le classement documentaire ne remplace pas les contrôles métier du bail.
