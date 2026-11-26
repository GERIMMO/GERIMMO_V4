# Lot 4 — Propriétaire, partie 1 (P01–P19) — compte avec SCI et plusieurs biens

Version dca39641 · banc fictif (Parc de Claire Moreau : nom propre et SCI des Amandiers, 4 biens, 2 locations) ·
390 / 768 / 1440 px · 19 écrans vus. Planches : `../captures/P01.jpg` à `P19.jpg`.

> Données du banc : les baux de ce compte ont été créés directement en base, sans échéancier. C'est pourquoi on voit
> « 0,00 € » partout dans les loyers et les finances. Je ne le compte pas comme un défaut de l'interface, mais je
> retiens le message « Aucun loyer attendu » affiché alors qu'il y a des locations en cours (voir lot 6). Les
> montants aberrants des Statistiques viennent de l'émulateur du banc et ne sont pas retenus.

## Test des 10 secondes

| Écran | Où suis-je ? | Que faire ? | Où cliquer ? |
|---|---|---|---|
| Tableau de bord (P07) | Oui (« Bonjour Claire ») | Partiellement : le bandeau « suspendus », 3 tuiles, 5 actions rapides et 10 événements se disputent l'attention | Les actions rapides sont claires |
| Biens (P08) | Oui | Oui (« Ajouter un bien ») | Oui |
| Finances (P11, P12) | Deux pages pour la même chose | Non évident : filtres, « Afficher », « Clôturer un mois » | Pas évident |
| Incidents (P13) | Oui | Non : la vue par défaut est vide alors que des incidents existent | Il faut changer de filtre |
| Déclarer un incident (P14) | Oui | Oui | Oui |
| Abonnement (P01) | Oui | Non : un récapitulatif de paiement sans bouton pour payer | Seulement « Contacter Gerimmo » |

## Ce qui fonctionne

- **Identité premium réelle** : photo d'accueil, « Bonjour Claire », titres à empattements, cartes, menu latéral
  sombre.
- **Navigation par le bas au téléphone** (Accueil, Biens, Finances, Incidents, Menu) : bien choisie et constante.
- **Actions rapides** sur l'accueil : Ajouter un bien, Créer une location, Ajouter une opération, Déclarer un
  incident, Ajouter un document. Exactement ce qu'il faut à un débutant.
- **Formulaires courts et bien expliqués** : déclaration d'incident (P14), profil en 3 étapes (P19).
- **Aide (P05)** : FAQ filtrable, contact guidé, suivi des demandes, sur la même page.
- **États vides clairs** : rétractation, résiliation (P02, P03).

## Ce qui complique l'utilisation

- **Le bandeau ambre** « Vos relances de loyer se préparent en PDF. Les relances locatives et les avis d'échéance par
  courriel restent suspendus. » La formulation a progressé depuis la version précédente. Mais il occupe toujours
  3 lignes en haut de **chaque** page au téléphone, et le mot « suspendus » reste.
- **Finances en double** : « Loyers » ouvre « Finances » (P11), qui présente déjà recettes et dépenses ; le
  « Livre recettes-dépenses » (P12) refait les mêmes totaux avec un vocabulaire de comptable (écriture, clôture,
  « novembre 2026 ouvert », quittancement).
- **Incidents** : la vue s'ouvre sur « En cours : 0 — Rien dans cette vue » alors que deux incidents existent.
- **Accueil contradictoire** : « Terminer votre première location (3/6) » avec 2 locations en cours ; « 6 demandes »
  à vérifier mais « Mes événements : 10 ».
- **Alertes sans nom de logement** : « DPE absent ou expiré — Maison des Amandiers » apparaît deux fois sans dire
  quel logement (P07, P15) ; « Résoudre » ne dit pas ce qu'il fait.
- **Abonnement (P01)** : un « Récapitulatif avant paiement » complet, avec un long pavé juridique, mais aucun bouton
  de paiement ; seule issue : « Contacter Gerimmo ».

## Ce qui surcharge les écrans

- Accueil : bandeau + bonjour + 3 tuiles + 5 actions + parcours guidé + 10 événements + articles. Au premier écran du
  téléphone, on ne voit que le bandeau, le bonjour et une tuile.
- Abonnement : 6 puces juridiques en petits caractères avant les inclusions.
- Aide fiscale (P04) : une carte par propriétaire, avec « Référence de vérification » et « Je confirme cette situation
  pour 2026 » ; « déclaration 2026 » pour des revenus déclarés en 2027.

## Incohérences de design

- Panneaux vides « Sélectionnez un bien » et « Ouvrez une conversation » sur la moitié de l'écran à 1440 (P08, P18).
- « Moreau Claire » (Nom Prénom) dans Personnes ; « Bonjour Claire » sur l'accueil.
- Triangles de dépliage natifs dans Paramètres (Parrainage, Signature) à côté des volets maison.
- « Les règles à connaître » (P06) sort du gabarit de l'espace, sans menu.

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| Toutes (bandeau) | `P07.jpg` | Bandeau ambre permanent « … restent suspendus », 3 lignes au téléphone. | Le client lit « service en panne » avant toute action. | L'afficher une seule fois (puis masquable), formulé comme un service : « Vos relances se préparent en PDF ». Le détail va dans Paramètres. | P1 |
| P07 Accueil | `P07.jpg` | Trop d'éléments au même niveau, avec des chiffres contradictoires (première location 3/6 avec 2 locations ; 6 contre 10). | Le propriétaire ne sait pas par quoi commencer. | Un seul bloc « À faire maintenant » (3 tâches au plus, avec le nom du logement), puis les tuiles. Masquer le parcours « première location » dès qu'un bail est actif. Un seul compteur. | P1 |
| P11, P12 Finances | `P11.jpg`, `P12.jpg` | Deux pages pour les mêmes chiffres, vocabulaire comptable, filtres à valider. | « Ça ressemble à un logiciel de comptabilité » : exactement ce qu'il faut éviter. | Une page « Finances » avec trois onglets : Loyers · Dépenses · Bilan de l'année. Filtres appliqués à la volée. Le livre et la clôture vont dans un sous-onglet « Pour mon comptable ». | P1 |
| P13 Incidents | `P13.jpg` | Vue par défaut vide (« Rien dans cette vue ») alors que des incidents existent. | Le propriétaire croit avoir perdu ses incidents. | Ouvrir sur « Tous », ou sur le premier filtre non vide. | P2 |
| P07, P15 Alertes | `P15.jpg` | Libellés identiques sans nom de logement ; « Résoudre » vague. | Impossible de savoir quel logement traiter. | « DPE manquant — Maison des Amandiers, logement 2 », avec une action précise : « Déposer le DPE ». | P2 |
| P01 Abonnement | `P01.jpg` | Récapitulatif de paiement sans bouton de paiement ; pavé juridique. | Confusion : « Comment je paie ? » | Tant que le paiement est fermé, remplacer le récapitulatif par « Votre essai est prolongé, rien à faire ». Les mentions juridiques vont dans un volet. | P2 |
| P04 Aide fiscale | `P04.jpg` | « Préparer ma déclaration 2026 » pour des revenus de 2026 ; « Référence de vérification » ; « ne télédéclare pas » en petit. | Confusion d'année ; jargon. | « Revenus 2026 — à déclarer au printemps 2027 » ; supprimer ou expliquer la référence ; afficher la limite en clair sous le titre. | P2 |
| P08, P18 | `P08.jpg` | Panneau vide sur la moitié de l'écran à 1440. | Impression de page inachevée. | Ouvrir le premier élément par défaut, ou élargir la liste quand rien n'est sélectionné. | P3 |
| P06 Règles | `P06.jpg` | Hors du gabarit, vide. | Impasse. | Masquer l'entrée tant que la page est vide, ou l'afficher dans le gabarit. | P3 |
