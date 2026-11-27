# Vitrine et tarifs au 27 novembre 2026

Contrôles indépendants sur le SHA servi `77e33d7061a507f039768ccc5535244b0768362e`. Navigateur neuf Chromium 156.0.8078.4, ordinateur à 1440 × 1000, téléphone simulé à 390 × 844 et simulateur de prix également à 768 × 1024. Requêtes hors Gerimmo et méthodes autres que GET et HEAD bloquées. Aucun formulaire transmis, aucun compte créé, aucun prestataire appelé.

## Couverture et preuves

| Écran | Statut et portée | Ordinateur | Mobile 390 px |
|---|---|---|---|
| Accueil | Vérifié, affichage HTTP 200 et liens visibles | [Capture](accueil-ordinateur.jpg) | [Capture](accueil-mobile-390.jpg) |
| Tarifs | Défaut constaté dans le texte d'ouverture. Simulateur et lien d'inscription vérifiés | [Capture](tarifs-ordinateur.jpg) | [Capture](tarifs-mobile-390.jpg) |
| Inscription | Vérifié, entrée du parcours et choix particulier ou SCI. Envoi et confirmation non testés en production | [Capture](inscription-ordinateur.jpg) | [Capture](inscription-mobile-390.jpg) |
| Agences | Vérifié, liste d'attente annoncée. Envoi de la demande non testé | [Capture](agences-ordinateur.jpg) | [Capture](agences-mobile-390.jpg) |
| Mentions légales | Vérifié pour l'affichage. La présence des mentions ne tranche pas leur conformité | [Capture](mentions-ordinateur.jpg) | [Capture](mentions-mobile-390.jpg) |
| Conditions | Vérifié pour la version affichée et l'accès au texte. Paiement, acceptation et rétractation non testés en production | [Capture](conditions-ordinateur.jpg) | [Capture](conditions-mobile-390.jpg) |
| Outils gratuits | Vérifié pour le catalogue. Résultats des simulateurs spécialisés non testés | [Capture](outils-ordinateur.jpg) | [Capture](outils-mobile-390.jpg) |
| Inscription artisan | Vérifié pour l'ouverture du formulaire. Inscription et qualification non testées en production | [Capture](artisan-ordinateur.jpg) | [Capture](artisan-mobile-390.jpg) |

Les 16 visites ont répondu HTTP 200. Aucune page visitée n'a débordé horizontalement aux deux largeurs. Le [menu à 390 px](menu-ouvert-mobile-390.jpg) s'ouvre au toucher simulé et se referme par Échap en rendant le focus au bouton. L'accès à Tarifs depuis ce menu fonctionne et referme le menu. [Mesures des pages](mesures.json) · [Interactions menu](interactions-mobile-390.json)

Le simulateur donne les prix attendus pour 1, 7, 8, 20, 21 et 100 biens aux trois largeurs, en mensuel et en annuel. Pour 21 biens, 20,89 € par mois et 208,90 € en une fois par an. Le bouton d'essai mène à l'inscription sur les trois formats et l'inscription annonce deux mois d'essai, sans carte ni abonnement automatique. La logique de prix de la vitrine appelle `montantAbonnementUnique`, que la commande utilise via `offreAbonnementUnique`. Le montant de la première facture reste à vérifier séparément. [Résultats](interactions-tarifs.json) · [1440 px](simulateur-21-ordinateur.jpg) · [768 px](simulateur-21-intermediaire.jpg) · [390 px](simulateur-21-mobile-390.jpg)

## Constats

### V1 — La page Tarifs parle encore d'une ouverture future

- **Statut et gravité** — défaut constaté, important pour l'acquisition.
- **Reproduction** — ouvrir [Tarifs](https://www.gerimmo.app/tarifs) sur ordinateur et à 390 px, lire l'introduction.
- **Attendu** — expliquer comment souscrire maintenant depuis « Mon abonnement » et rappeler le rôle de l'essai.
- **Observé** — « estimer un futur abonnement » et « Lorsque les souscriptions sont ouvertes » restent affichés après la décision d'ouverture du 27/11. Le lien principal mène bien à l'inscription gratuite.
- **Preuves** — [texte public](tarifs-ordinateur.txt), [ordinateur](tarifs-ordinateur.jpg), [390 px](tarifs-mobile-390.jpg), `app/src/app/tarifs/page.tsx:34-37` et journal du 27/11.
- **Correction, effort faible** — aligner le texte sur l'état réel des ventes et distinguer l'essai de la souscription facultative. Critère de réussite : le texte est exact pour les ventes ouvertes comme fermées, et le chemin jusqu'à « Mon abonnement » est clair.

### V2 — Après l'essai, un espace vide ne propose aucune action de reprise

- **Statut et gravité** — défaut constaté au rendu local sur données fictives, important. Le parcours réel en navigateur et avec base reste non testé pour ce cas.
- **Reproduction** — rendre « Mon abonnement » pour un propriétaire fictif dont l'essai est expiré, en lecture seule, sans bien actif, avec vente ouverte et prestataire de paiement simulé prêt.
- **Attendu** — une suite explicite et réalisable lorsque l'utilisateur veut reprendre, par exemple demander une prolongation depuis l'encadré.
- **Observé** — « Votre essai gratuit est arrivé à son terme » et « Aucun bien actif à facturer » sont affichés. La page ne propose ni bouton d'ajout, ni démarrage du paiement, ni demande ciblée de prolongation. Un essai encore en cours sans bien propose bien « Ajouter mon premier bien » dans le test existant du SHA audité.
- **Preuves** — [test de constat et sortie](reproduction-essai-expire-sans-bien.txt), [scénario](scenario-essai-expire-sans-bien.ts.txt), `app/src/app/agence/[orgId]/abonnement/abonnement-2026.tsx:150,183,353–360`, `app/src/app/agence/[orgId]/abonnement/formulaire-souscription.tsx:173–183,275`. La commande refuse aussi zéro unité à `app/src/app/actions/abonnement.ts:288–291`.
- **Correction, effort faible à moyen** — proposer un parcours de reprise spécifique, sans rouvrir toutes les écritures. Vérifier sur ordinateur et mobile qu'un espace sans bien après l'essai a une action valide, tout en refusant toujours le paiement d'une offre à zéro bien.

### V3 — Le nombre de biens est difficile à ajuster finement au téléphone

- **Statut et gravité** — défaut constaté de conception, mineur. La difficulté sur matériel réel reste à éprouver.
- **Reproduction** — ouvrir le simulateur sur 390 px et repérer la commande « Nombre de biens ».
- **Attendu** — pouvoir entrer directement une quantité exacte ou avancer et reculer d'une unité à l'écran.
- **Observé** — l'unique contrôle est un curseur de 316 × 44 px de 1 à 100, soit environ 3,2 px par unité sur la longueur totale. Pas de champ numérique ni de commande visible par pas. Le clavier fonctionne dans le navigateur simulé.
- **Preuves** — [capture](simulateur-21-mobile-390.jpg), [mesure](interactions-mobile-390.json), `app/src/components/cartes-offres-publiques.tsx:16–24`.
- **Correction, effort faible** — ajouter une saisie chiffrée accessible, synchronisée au curseur. Vérifier que l'on peut choisir 7, 8, 20 et 21 au doigt et que les prix restent exacts.

## Promesses et limites

La vitrine annonce les baux préparés en PDF, l'enregistrement des loyers, l'espace locataire et le suivi des interventions. Les tarifs précisent le PDF pour les relances, l'initiative du bailleur pour l'IRL, le périmètre de l'aide fiscale, la disponibilité conditionnelle de la signature et la couverture variable des artisans. Ces textes ne prouvent pas l'exécution complète d'un bail, d'un incident, d'un envoi ou d'une signature. La valeur fiscale déclarée dans la page ne constitue pas une vérification du régime réel de l'éditeur. Les paiements, les courriels réels, la signature et les actes en production restent hors du contrôle public.

Les tests locaux ciblés de tarifs, d'abonnement unique, de rendu de l'abonnement propriétaire et de la vitrine agences ont donné 114 réussites sur 114. Le scénario indépendant de l'essai expiré confirme le défaut observé, il n'atteste pas son absence. [Sortie des tests](tests-locaux.txt)

Aucun iPhone ni téléphone Android réel utilisé. Les appareils réels devront couvrir au minimum Safari iOS et Chrome Android, le lien de confirmation d'inscription, les champs de formulaire, l'ouverture des PDF, le paiement sécurisé et le retour à Gerimmo. Ces contrôles sont distincts des captures Chromium simulées ci-dessus.

## Rejouer

Depuis `app/` de la branche d'audit, après installation des dépendances et de Chromium, utiliser Node.js avec les fichiers `../livrables/audit-codex-20261127/preuves/vitrine/rejouer-affichages.cjs`, `rejouer-tarifs.cjs` et `rejouer-menu-mobile.cjs`. Ils n'écrivent que les preuves locales. Pour le cas de reprise après essai, copier le scénario dans `app/tests/` avec l'extension `.test.ts`, exécuter Vitest sur ce seul fichier et retirer le fichier de test temporaire.
