# Espace locataire — chantier UX 6

18 novembre 2026. Base `f0ee0720e88b78369b9a99eadc7309ff211df464`, branche locale `codex/ux-accueil-proprietaire-20261118`. Périmètre : chantier 6 du plan Claude. Un seul agent, intervention limitée à 30 minutes. Aucun push, fusion, migration ni déploiement.

## Changements livrés

- **Identité du bailleur** : nom du propriétaire particulier ou dénomination de la SCI, dans l’accueil, la navigation, le titre et le contact. La lecture utilise exclusivement la fonction existante `attestation_emetteur_locataire`, avec la session du locataire et ses contrôles d’organisation. Le nom interne du patrimoine ne sert jamais de solution de repli. Une identité non disponible reste explicitement « à confirmer ». Une agence conserve sa désignation de gestionnaire.
- **Documents** : onglet Mes fichiers ouvert en premier ; demandes et dépôts accessibles dans À transmettre, avec un raccourci visible. Préférences de réception après les fichiers, repliées par leur composant existant. Aucun formulaire démonté ou supprimé.
- **Dossier en préparation** : absence de bail, contrat manquant ou activation restant à effectuer expliqués séparément, avec le bailleur comme responsable de la prochaine étape. Les pièces et signatures réellement demandées restent signalées. Un bail terminé ou une erreur de lecture ne sont pas présentés comme une première location en préparation.
- **Contact humain** : accès direct depuis l’accueil et formulaire avant l’assistant existant. L’assistant reste disponible et replié, sans double niveau de repli.
- **Urgence** : lien visible dans l’en-tête de toutes les pages locataires ; consignes intégrales sur Signaler un problème, accessibles même sans bail actif. Les numéros et consignes sont conservés. Les grands encadrés identiques de l’accueil, du contact et des demandes sont retirés. L’ancre est distincte du champ de niveau d’urgence du formulaire.
- « Tout est en ordre » devient **Aucune demande en cours** : ce résumé ne prétend plus que le dossier documentaire est complet.

## Tests exécutés

**60 tests ciblés réussis, 0 échec, 0 ignoré**, dans six fichiers. Les relances ne sont pas additionnées. Onze cas de `ux-locataire-priorites.test.ts` couvrent les identités, les informations absentes, les états du bail, l’erreur de lecture, les documents par défaut et la priorité du contact humain. Les cinq suites voisines couvrent assurances, dépôts, écrans locataires, textes et consultation documentaire. TypeScript et ESLint ciblé réussis.

**Six parcours navigateur réussis** : bail actif en nom propre, bail actif SCI, compte en préparation sans bail rattaché, chacun à **390 et 1440 px**. Navigation réelle depuis l’accueil vers les fichiers et le contact ; onglet secondaire ouvert ; saisie d’un titre d’attestation conservée entre onglets ; message saisi sans envoi ; assistant ouvert ; accès aux consignes d’urgence et aux liens d’appel vérifié sans appel téléphonique. Aucune erreur JavaScript dans ces six parcours, aucun débordement horizontal.

**Trois vérifications API authentifiées réussies**, sur le banc local PostgreSQL : identité attendue pour chaque compte ; aucune donnée renvoyée pour une organisation étrangère. Les politiques et fonctions SQL n’ont pas changé. Cela ne constitue pas une nouvelle campagne complète de sécurité.

**18 comparaisons avant/après** : trois comptes × trois pages × deux largeurs. Tous les formulaires et champs sont conservés. Les montants affichés sur les accueils sont identiques. Aucune modification de calcul, de bail, de document, de droits ou de notification. Les ouvertures du fil et du fichier conservent leur journalisation habituelle, uniquement sur données fictives.

## Limites précises

Les trois dossiers principaux n’ont pas de fichier disponible : leurs états vides sont vérifiés. Un quatrième compte fictif existant a servi à contrôler une liste remplie : **Bail signé** accessible en première vue, reçu partiel correctement maintenu **En préparation**. Sa fenêtre de consultation s’ouvre, mais le contenu PDF n’est **pas validé** : la route autorisée renvoie 200, puis le stockage local répond 404 pour le fichier fictif manquant. La lecture du PDF et son téléchargement ne sont donc pas comptés comme réussis ; aucun fichier n’a été créé pour masquer cette limite. Le lecteur et la route documentaire sont identiques au commit de départ.

Le compte en préparation réel du banc est sans bail ; les variantes brouillon avec/sans contrat et bail terminé ont été exécutées dans les tests de rendu. Aucun envoi de message, dépôt de document, changement de consentement, paiement ou notification n’a été déclenché. L’état des champs est vérifié avant soumission, pas présenté comme une nouvelle recette d’envoi. Mobile simulé dans Chromium, aucun téléphone physique testé.

## Captures avant/après

| Profil et page | Avant 390 | Après 390 | Avant 1440 | Après 1440 |
|---|---|---|---|---|
| Bail actif — accueil | [avant](captures/avant-actif-accueil-390.png) | [apres](captures/apres-actif-accueil-390.png) | [avant](captures/avant-actif-accueil-1440.png) | [apres](captures/apres-actif-accueil-1440.png) |
| Bail actif — documents | [avant](captures/avant-actif-documents-390.png) | [apres](captures/apres-actif-documents-390.png) | [avant](captures/avant-actif-documents-1440.png) | [apres](captures/apres-actif-documents-1440.png) |
| Bail actif — contact | [avant](captures/avant-actif-contact-390.png) | [apres](captures/apres-actif-contact-390.png) | [avant](captures/avant-actif-contact-1440.png) | [apres](captures/apres-actif-contact-1440.png) |
| En préparation — accueil | [avant](captures/avant-preparation-accueil-390.png) | [apres](captures/apres-preparation-accueil-390.png) | [avant](captures/avant-preparation-accueil-1440.png) | [apres](captures/apres-preparation-accueil-1440.png) |
| En préparation — documents | [avant](captures/avant-preparation-documents-390.png) | [apres](captures/apres-preparation-documents-390.png) | [avant](captures/avant-preparation-documents-1440.png) | [apres](captures/apres-preparation-documents-1440.png) |
| En préparation — contact | [avant](captures/avant-preparation-contact-390.png) | [apres](captures/apres-preparation-contact-390.png) | [avant](captures/avant-preparation-contact-1440.png) | [apres](captures/apres-preparation-contact-1440.png) |
| SCI — accueil | [avant](captures/avant-sci-accueil-390.png) | [apres](captures/apres-sci-accueil-390.png) | [avant](captures/avant-sci-accueil-1440.png) | [apres](captures/apres-sci-accueil-1440.png) |
| SCI — documents | [avant](captures/avant-sci-documents-390.png) | [apres](captures/apres-sci-documents-390.png) | [avant](captures/avant-sci-documents-1440.png) | [apres](captures/apres-sci-documents-1440.png) |
| SCI — contact | [avant](captures/avant-sci-contact-390.png) | [apres](captures/apres-sci-contact-390.png) | [avant](captures/avant-sci-contact-1440.png) | [apres](captures/apres-sci-contact-1440.png) |

Liste documentaire remplie : [390 px](captures/apres-documents-disponibles-documents-390.png), [1440 px](captures/apres-documents-disponibles-documents-1440.png). Les captures utiles ont été examinées visuellement : hiérarchie, lisibilité, identité premium et navigation mobile conservées.

Les fichiers `parcours-resultats.json`, `acces-resultats.json`, `invariants.json`, `verifications.json` et `tests-finaux.log` conservent les preuves. `document-diagnostic.json` documente la limite de stockage. Aucune session, clé ou URL de fichier signée n’est enregistrée dans Git.

## Reprise locale

Depuis `app` :

```sh
node node_modules/vitest/vitest.mjs run tests/ux-locataire-priorites.test.ts tests/assurance-locataire-ecrans.test.ts tests/accueil-locataire-depot.test.ts tests/audit-proprietaire-locataire-ecrans.test.ts tests/textes-parcours-locataire-compte.test.ts tests/documents-locataire-consultation.test.ts
```

Banc et scripts de captures conservés dans `output/ux-locataire-20261118` en dehors de Git. Les sessions fictives doivent être renouvelées pour un rejeu ultérieur. Le serveur local de cette intervention est arrêté après vérification. Aucun autre chantier UX et aucune CI distante ne sont lancés. Relire ce commit local avec les chantiers précédents avant toute livraison autorisée.
