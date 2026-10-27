---
type: synthesis
tags: [interface, mobile, personas, documents]
status: stable
created: 2026-10-24
updated: 2026-10-24
sources: []
---

# Présentation mobile des espaces — 24 octobre 2026

## Décision de présentation

Une page montre d'abord son objet et le prochain geste utile. Les détails restent accessibles par rubrique, sans répéter les caractéristiques et sans effacer une saisie lorsqu'on change de panneau.

Les couleurs accompagnent des libellés explicites : vert pour un rapport à jour, ambre doux pour une pièce à ajouter ou renouveler, neutre pour une obligation à confirmer. Un fichier déposé n'est pas une preuve de validité juridique ; un diagnostic sans échéance affichée porte désormais « Validité à vérifier », sans promesse de validité illimitée.

## Périmètre

- Propriétaires et agences : fiche lot en quatre rubriques, caractéristiques uniques, bilan documentaire cohérent entre fiche bien et lot.
- Baux en cours : contrat, documents, suivi et départ séparés ; dans le suivi, états des lieux, paiements, dépôt et avenant s'ouvrent selon le besoin. Liens directs vers les loyers, les états des lieux et la restitution conservés.
- Agences : choix de document par situation et état des lieux guidé, une pièce à la fois.
- Locataires : séparer les transmissions demandées des fichiers disponibles ; assurance déjà déposée sans formulaire ouvert en permanence.
- Artisans : coordonnées, zone et métiers, personnalisation des devis dans trois rubriques.
- Tous les espaces privés : titres plus compacts, espacements mobiles et cibles tactiles conservées.
- Superadmin : simplification des huit rubriques et de leurs détails déjà publiée dans la PR #253 ; durées de conservation présentées par six catégories avec recherche sur toutes les catégories.

## Preuves et limites

Baseline : 177 captures du banc de test précédent. L'audit couvre les sept personas, ajoute les dossiers profonds du propriétaire et contrôle chaque panneau des nouvelles fiches à onglets. Les textes légaux longs ne sont pas tronqués pour réduire artificiellement la hauteur.

Les contrôles locaux et les résultats de CI/publication sont consignés dans `log.md`. Aucun paramétrage externe ni migration ne sont nécessaires pour ces présentations. Le classement documentaire ne remplace pas les contrôles métier du bail.

## Validation finale

La [CI 40126545997](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/40126545997) est verte sur la tête `4b8bf0848906b4172cf6f5fd02d4e687ceb7745c` : 10 613 tests unitaires/intégration, 212 parcours Chromium et 54 WebKit réussis ; 17 cas unitaires et un parcours Chromium ignorés. L'audit relève 209 vues et rubriques, sans débordement, bouton sans nom, erreur de page ou de console. Les 68 vues contrôlées avec axe ne présentent aucune violation détectée. Cela ne constitue pas une certification d'accessibilité ni une refonte individuelle de chaque page.

Captures finales relues, à largeur 390 px : suivi du bail à l'ouverture 5 548 → 1 473 px ; durées de conservation 10 872 → 1 933 px. Les détails restent accessibles dans les rubriques et les pages suivantes. Les documents du propriétaire occupent leur propre panneau (1 881 px dans le dossier incomplet d'essai). La fiche entreprise artisan ouvre ses coordonnées avant les raccourcis annexes.

La [PR #254](https://github.com/GERIMMO/GERIMMO_V4/pull/254) est fusionnée avec garde sur la tête exacte, commit `ab52b77b9dea6c3a902b382710a7345493941600`, arbre identique à celui contrôlé (`400c5347bbe9bc67e4e01ad87169be5eb2b91ff5`). Les vérifications finales du déploiement sont consignées dans le journal.

Déploiement confirmé le 24 octobre à 20:12 UTC ; santé publique positive sur la révision exacte. Vérification privée effectuée après reconnexion du superadmin : quatre rubriques et liens directs fonctionnels, compteurs des diagnostics cohérents. Le bail signé et son certificat sont archivés ; les libellés mélangeant « à signer », « signé » et « Brouillon » avant activation restent à clarifier. Aucun état métier changé. Les captures de cette recette utilisent des données fictives.

## Ajustement demandé après la vérification connectée

Le dirigeant demande de distinguer le bail signé de la location encore inactive, d’expliciter la validité des documents et de rendre les cartes plus lisibles. La signature terminée avec archive donne « Bail signé » ; un bail encore en préparation dans la base conserve la mention séparée « Location non activée ». La consultation ne déclenche aucune activation. Les noms des fichiers signés sont simplifiés à l’affichage, sans modifier les originaux.

Le bilan distingue diagnostics valides (y compris une échéance proche), expirés, manquants et à vérifier. L’échéance est inclusive jusqu’à la fin du jour à Paris. Une date absente ou invalide ne permet pas d’annoncer un rapport valide. La GED affiche l’état du document ; sa durée de conservation reste dans les détails. « Signé » désigne une archive de signature et ne certifie pas la validité juridique du contenu.

Cartes du logement en bleu doux, bâtiment et diagnostics en vert, propriétaires en sable : titres, chiffres et détails séparés, sans hauteur fixe. En supervision, les entrées de modification du lot et du bâtiment ainsi que les gestes de confirmation de commune et de signalement d’intérêt sont retirés. La recherche des artisans reste disponible en lecture seule ; zéro résultat n’est pas un refus d’accès.

Le circuit détaillé reste fermé au superadmin par sa RLS. La présentation utilise une lecture serveur minimale après contrôle de la session de supervision avec second facteur et trace de traversée : organisation et références affichées, six colonnes, aucun signataire ni lien prestataire. Les propriétaires et agents conservent leur client de session et la RLS habituelle. Aucune migration ni changement de droit d’écriture.

Validation et publication de cet ajustement : voir `log.md`.
