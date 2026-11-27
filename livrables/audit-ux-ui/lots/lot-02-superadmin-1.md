# Lot 2 — Super-administrateur, partie 1 (S01–S19)

Version dca39641 · banc fictif · 390 / 768 / 1440 px · 19 écrans vus. Planches : `../captures/S01.jpg` à `S19.jpg`.

## Test des 10 secondes

Le dirigeant qui ouvre la console arrive sur **« Abonnements et finances »** (S01), et non sur une vue d'ensemble.
La première entrée du menu, « Bureau de direction » (S03), parle d'« équipes » automatiques, de « point du matin » et
de « relais ». Elle ne dit pas combien de clients sont en essai, ce qui a été encaissé, ni quel incident attend.
**Résultat : « Où suis-je ? » oui ; « Que dois-je faire ? » rarement évident ; « Où cliquer ? » dans un menu de
17 entrées à plat.**

## Ce qui fonctionne

- Un vrai système graphique, cohérent avec le reste de Gerimmo : bleu nuit et or, cartes, titres à empattements.
- Des états vides bien écrits : réseau d'artisans (S02), demandes de contact (S08), liste d'attente (S10).
- Les pages simples sont lisibles : articles (S14), création d'article (S16), inscriptions d'artisans (S02).
- Les actions sensibles sont encadrées : confirmation à cocher, motif obligatoire, mention du journal d'audit.
- Aucun débordement horizontal ; les listes deviennent des cartes au téléphone.

## Ce qui complique l'utilisation

- **Pas de vraie page d'accueil décisionnelle.** S01 est une liste d'abonnements, S03 un tableau d'automatismes. Il n'y
  a aucune page qui réponde à « Comment va Gerimmo aujourd'hui ? » : clients, essais qui finissent, revenus,
  incidents, alertes du service.
- **Menu de 17 entrées sans groupes**, avec des doublons d'accès (Utilisateurs / Clients ; Historique, Paramètres et
  Conservation pour les durées ; Améliorations à deux endroits).
- **Vocabulaire d'automatisation** pour un dirigeant non développeur : équipes, passage de nuit, consigne versionnée,
  relais, intention, synchronisation.

## Ce qui surcharge les écrans

- **S18 Santé** : une liste brute d'identifiants techniques et de codes internes (« c14c3187-… · devis_demande ·
  a_preparer · 0 tentative(s) », « lib/notifications », « Pilote limité : intervention humaine requise »). Elle
  occupe 3 000 px au téléphone, avec des mots coupés en deux.
- **S19 Développement commercial** : trois niveaux de tuiles chiffrées, une dizaine de blocs et de volets. Au
  téléphone, l'étiquette « Nom, e-mail ou origine » s'empile mot par mot.
- **S01** : chaque client porte quatre mentions vides (« Pas d'offre souscrite », « Aucun montant facturé connu »,
  « Essai sans carte », « Aucune synchronisation reçue »). Le filtre existe deux fois (liste déroulante et
  9 pastilles).

## Incohérences de design

- Compteurs isolés sans libellé dans une barre grise (« 1 », « 0 », « 5 ») sur S06, S07, S11.
- Tuile « À préparer » écrite en très gros à la place d'un nombre (S03), coupée en deux lignes au téléphone.
- Pastille « À vérifier » en vert, couleur de la réussite (S09).
- Triangles de dépliage natifs (▶) à côté des volets maison (S12, S19).
- Retour « Tous les clients » depuis une fiche artisan ouverte via « Réseau d'artisans » (S07).
- Valeurs par défaut tournées vers les agences alors que l'offre ouverte vise les propriétaires : « Agence de gestion »
  coché (S13), public « Agences et professionnels » (S16).

## Défauts significatifs

| Page | Capture | Problème observé | Conséquence | Solution proposée | Priorité |
|---|---|---|---|---|---|
| S01, S03 | `S01.jpg`, `S03.jpg` | Aucune page d'accueil ne résume l'état de Gerimmo. L'entrée « Vue d'ensemble » ouvre les abonnements, le « Bureau de direction » parle d'automatismes. | Le dirigeant doit ouvrir 4 ou 5 pages pour savoir si tout va bien ; une urgence peut passer inaperçue. | Une page « Aujourd'hui » unique, avec 4 à 6 chiffres qui appellent une décision (essais qui finissent sous 7 jours, paiements à suivre, demandes d'assistance ouvertes, incidents urgents, services en panne). Puis la liste « À traiter », triée par urgence. Le reste passe derrière des liens. | P1 |
| S18 Santé | `S18.jpg` | Liste technique brute : identifiants, codes internes, chemins de code. | Écran illisible pour un non-développeur ; ce qui est grave ne se distingue pas du bruit. | Un résumé par type, en français (« 32 notifications en attente d'envoi », « 2 courriels bloqués »), avec le nom du client et une action. Le détail technique va dans un volet « Pour le développeur ». | P1 |
| Menu (toutes) | `S01.jpg` | 17 entrées à plat, avec des doublons d'accès. | On hésite, on ne sait pas par où commencer chaque jour. | Cinq groupes : Aujourd'hui · Clients et abonnements · Assistance · Croissance (marketing, développement) · Exploitation et sécurité. Supprimer les doublons. | P2 |
| S19 | `S19.jpg` | Écran de pilotage commercial surchargé ; étiquette cassée au téléphone. | Lecture longue, décisions noyées. | Garder les prospects et les demandes à qualifier en haut. Les études de marché et le classement des départements vont dans un onglet « Études ». Corriger la largeur du champ au téléphone. | P2 |
| S01 | `S01.jpg` | Mentions vides répétées sur chaque ligne ; filtre en double. | 5 200 px de défilement pour 8 clients au téléphone. | Ligne compacte : nom, statut, échéance. N'afficher que les informations non vides. Un seul filtre. | P2 |
| S03 | `S03.jpg` | « À préparer » écrit en grand à la place d'un chiffre. | Bandeau déséquilibré dès le premier écran. | Un nombre (« 3 comptes rendus à lire »), ou une action. | P3 |
| S06, S07, S11 | `S06.jpg`, `S11.jpg` | Compteurs isolés et « 1 rôles ». | Impression de produit inachevé. | Intégrer le compteur au titre (« Comptes rattachés (5) ») et accorder le pluriel. | P3 |
| S11 | `S11.jpg` | La fiche client n'affiche ni offre, ni montant, ni échéance ; elle donne une date en guise de « grille tarifaire ». | Pour répondre à un client sur sa facture, il faut changer de page. | Un bloc « Abonnement » en tête : offre, montant, prochaine échéance, dernier paiement. | P2 |
| S13, S16 | `S13.jpg` | Valeurs par défaut « Agence de gestion » et « Agences et professionnels ». | Erreurs de saisie ; contenus mal ciblés. | Mettre « Propriétaire » et « Propriétaires bailleurs » par défaut. | P3 |
| S15 | `S15.jpg` | Au téléphone, les boutons de publication passent avant le titre et le texte de l'article. | On publie avant d'avoir relu. | Placer les actions après le contenu, ou dans une barre fixée en bas. | P3 |
| S17 | `S17.jpg` | Suffixe technique dans les titres (« · da2230 ») ; pastille « Résolu » avec une décision préremplie « En examen ». | Doute sur l'état réel de la demande. | Titre lisible (client et date) ; décision préremplie selon l'état actuel. | P3 |
