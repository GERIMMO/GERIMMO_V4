# Exécutions indépendantes sur la version compilée

27 novembre 2026, Chromium, 1440 × 1000 et mobile simulé 390 × 844. Les deux scénarios de colocation imposent chacun leur largeur. Les tests et le produit sont ceux du SHA audité.

| Fichier | Scénario | Projet | Issue |
|---|---|---|---|
| `abonnement.spec.ts` | ventes fermées : les deux lots affichent le tarif mensuel de 7,98 € sans commande | ordinateur | Échec |
| `abonnement.spec.ts` | ventes fermées : les deux lots affichent le tarif mensuel de 7,98 € sans commande | telephone | Échec |
| `artisan-fin-mission.spec.ts` | intervention acceptée : démarrage, photo, bilan, facture (creation) et réception gestionnaire | ordinateur | Réussi |
| `artisan-fin-mission.spec.ts` | intervention acceptée : démarrage, photo, bilan, facture (sci) et réception gestionnaire | ordinateur | Réussi |
| `artisan-fin-mission.spec.ts` | intervention acceptée : démarrage, photo, bilan, facture (creation) et réception gestionnaire | telephone | Réussi |
| `artisan-fin-mission.spec.ts` | intervention acceptée : démarrage, photo, bilan, facture (sci) et réception gestionnaire | telephone | Réussi |
| `compte-supervision.spec.ts` | depuis une organisation, la fiche d'un compte dit son état, ses rôles et ses journaux | ordinateur | Réussi |
| `compte-supervision.spec.ts` | la recherche de la console trouve un compte par son adresse | ordinateur | Réussi |
| `compte-supervision.spec.ts` | depuis une organisation, la fiche d'un compte dit son état, ses rôles et ses journaux | telephone | Réussi |
| `compte-supervision.spec.ts` | la recherche de la console trouve un compte par son adresse | telephone | Réussi |
| `incident-gerant-colocation.spec.ts` | incident en colocation : la chambre est demandée, la cuisine reste proposée (390px) | ordinateur | Réussi |
| `incident-gerant-colocation.spec.ts` | incident en colocation : la chambre est demandée, la cuisine reste proposée (1440px) | ordinateur | Réussi |
| `incident-gerant-colocation.spec.ts` | incident en colocation : la chambre est demandée, la cuisine reste proposée (390px) | telephone | Réussi |
| `incident-gerant-colocation.spec.ts` | incident en colocation : la chambre est demandée, la cuisine reste proposée (1440px) | telephone | Réussi |
| `parcours-artisan.spec.ts` | le portail s'ouvre sans organisation dans l'adresse | ordinateur | Réussi |
| `parcours-artisan.spec.ts` | l'agenda montre la mission acceptée, avec l'adresse du chantier | ordinateur | Réussi |
| `parcours-artisan.spec.ts` | le portail s'ouvre sans organisation dans l'adresse | telephone | Réussi |
| `parcours-artisan.spec.ts` | l'agenda montre la mission acceptée, avec l'adresse du chantier | telephone | Réussi |
| `parcours-locataire.spec.ts` | déclarer un incident : la photo est le premier champ, l'envoi aboutit | ordinateur | Réussi |
| `parcours-locataire.spec.ts` | mes loyers : échéancier lisible à 390px, quittance/reçu accessible | ordinateur | Réussi |
| `parcours-locataire.spec.ts` | mes documents : le titre ouvre l'aperçu en fenêtre, un seul geste pour toutes les pièces | ordinateur | Réussi |
| `parcours-locataire.spec.ts` | déclarer un incident : la photo est le premier champ, l'envoi aboutit | telephone | Réussi |
| `parcours-locataire.spec.ts` | mes loyers : échéancier lisible à 390px, quittance/reçu accessible | telephone | Réussi |
| `parcours-locataire.spec.ts` | mes documents : le titre ouvre l'aperçu en fenêtre, un seul geste pour toutes les pièces | telephone | Réussi |
| `parcours-locataire.spec.ts` | mes documents : le même geste de consultation à l'ordinateur | ordinateur | Réussi |
| `parcours-locataire.spec.ts` | mes documents : le même geste de consultation à l'ordinateur | telephone | Réussi |
| `premiere-location-continue.spec.ts` | Résidence des Acacias : de la première inscription à la quittance du même logement | ordinateur | Échec |
| `premiere-location-continue.spec.ts` | Résidence des Acacias : de la première inscription à la quittance du même logement | telephone | Échec |

Première passe compilée sur ce sous-ensemble. **24 réussites et 4 échecs**. Deux échecs sont dus à un compte de test partagé modifié par les autres parcours, qui contenait 4 biens pour l’essai ordinateur et 6 pour l’essai téléphone, au lieu de 2. Les montants observés étaient de 11,96 € / 119,60 € et 15,94 € / 159,40 € respectivement, ce qui correspond à ces parcs. Le contrôle à 2 biens avait réussi dans la première passe avant modification du compte. Les deux autres échecs sont intervenus après la demande de confirmation e-mail, sans message dans la boîte fictive. La configuration de transport de la CI a été reprise pour le rejeu Acacias, indiqué dans le rapport.

La passe préliminaire sur le serveur de développement est distincte. Elle a établi les sessions fictives, puis a été interrompue sous pression mémoire. Ses échecs de navigation ne constituent pas des constats sur le produit compilé.

### Rejeu du premier bail avec la configuration courriels de la CI

Deux réussites, 13,7 s sur ordinateur et 13 s sur mobile simulé. Le compte est inscrit par le formulaire. Le lien est récupéré uniquement dans la boîte fictive. Le test contrôle le dépôt plafonné, les diagnostics fictifs, le dépôt d’un contrat papier spécimen, l’appel de loyer, l’encaissement déclaré, le document imprimable et un PDF valide. Les identifiants de la boîte et les liens de confirmation ne sont pas conservés dans ces preuves. [Contrôle du dépôt à 390 px](acacias-controle-depot-390.png) · [Quittance à 1440 px](acacias-quittance-1440.png) · [PDF spécimen](acacias-quittance-specimen.pdf)
