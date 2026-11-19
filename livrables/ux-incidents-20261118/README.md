# Incidents propriétaire — chantier UX 5

18 novembre 2026. Base `52d475db1f492819c271f8ec42e8876fed79dfbc`, branche locale `codex/ux-accueil-proprietaire-20261118`. Application du chantier 5 et de la recommandation 6 du rapport Claude, sans autre chantier. Un agent ; budget maximal de 30 minutes. Aucun push, fusion, déploiement ou migration.

## Présentation livrée

- **Ce qu’il vous reste à faire** : action principale, responsable et échéance connue, à partir des lectures déjà effectuées. La priorité tient compte des informations indisponibles, de la prise en charge, du devis reçu, de la facture, du rendez-vous et de la notation. Une seconde action utile peut rester accessible. Un simple lien ouvre le formulaire existant ; il n’exécute aucune opération.
- **Suivi · Devis et facture · Échanges · Historique** : navigation au clavier par liens natifs, anciennes ancres conservées, blocs repliés ouverts par leurs raccourcis. Les formulaires restent montés entre onglets : aucune saisie perdue par changement de rubrique.
- État lisible et rendez-vous résumé avec sa date et ses horaires. Les propositions et leurs réponses restent consultables à la demande.
- Signalement détaillé, coordonnées, pièces jointes, notation et dossier clôturé repliés pour réduire la hauteur initiale. Les avertissements de lecture restent visibles.
- **Tous** est le filtre d’entrée du propriétaire, y compris lorsqu’il ne reste que des incidents clos. Les filtres explicitement choisis et le comportement d’entrée des agences sont conservés. La file générale des interventions à noter reste sur la liste ; le dossier présente sa propre notation.

## Preuves exécutées

**68 tests ciblés réussis, 0 échec et 0 ignoré dans la commande finale**, répartis dans six fichiers : `consigne-incident`, `incidents-liste-a-traiter`, `chronologie-ecart-rendez-vous`, `invitation-artisan-fiche-incident`, `reglement-facture-ecrans`, `devis-a-decider-ecrans`. Trois nouveaux cas couvrent Tous par défaut, le filtre En cours explicite et le maintien du filtre agence. Les relances ne sont pas additionnées. TypeScript et ESLint ciblé passent.

**Huit vérifications navigateur réussies sur le banc isolé local**, avec une session propriétaire fictive, à **390 et 1440 px** :

| Dossiers | Contrôles réellement exercés | Résultat |
|---|---|---|
| Incident terminé en nom propre, puis incident terminé SCI, aux deux tailles | Quatre onglets, facture, devis, notation accessible, discussion fermée consultable, historique, ancienne ancre de clôture, propositions accessibles, filtre Tous | 4/4 |
| Rendez-vous prévu en nom propre, puis en SCI, aux deux tailles | Responsable et date affichés, raccourci vers la mission, onglet Suivi et rendez-vous visibles | 4/4 |

Le devis retenu, la facture et le reste à régler affichent chacun **100,00 € avant et après**, sur les deux dossiers terminés. Les quatre formulaires et tous leurs champs sont conservés. La saisie de 40 € reste dans le champ après un aller-retour entre onglets : **elle n’a pas été soumise**. Aucun paiement, règlement, message, avis, clôture ou notification n’a été créé pour ce chantier. Aucun débordement horizontal constaté ; aucun échec JavaScript dans les quatre parcours des dossiers terminés.

Ces vérifications portent sur la présentation et la navigation de dossiers fictifs déjà constitués. Elles ne prétendent pas rejouer un nouveau cycle complet de travaux, un paiement ou une livraison de courriel. Les vignettes de certaines pièces du banc sont indisponibles avant comme après ; leur téléchargement n’est pas requalifié ici. Le mobile est simulé dans Chromium, pas testé sur un appareil physique.

Une première commande avait inclus la suite PostgreSQL `incidents-portefeuille-agent` : ses 47 cas ont été ignorés faute de configuration dédiée. Ils ne sont pas comptés comme réussis. Les politiques d’accès, RPC et migrations ne sont pas modifiées par ce lot.

## Captures et résultats

| Dossier fictif | Avant 390 | Après 390 | Avant 1440 | Après 1440 |
|---|---|---|---|---|
| Nom propre | [Avant](captures/avant-nom-propre-390.png) | [Après](captures/apres-nom-propre-390.png) | [Avant](captures/avant-nom-propre-1440.png) | [Après](captures/apres-nom-propre-1440.png) |
| SCI | [Avant](captures/avant-sci-390.png) | [Après](captures/apres-sci-390.png) | [Avant](captures/avant-sci-1440.png) | [Après](captures/apres-sci-1440.png) |

Onglet Devis et facture SCI : [390 px](captures/apres-facture-sci-390.png), [1440 px](captures/apres-facture-sci-1440.png). Les images ont été examinées. Les fichiers `parcours-resultats.json`, `rendez-vous-resultats.json`, `invariants.json` et `tests-finaux.log` conservent les résultats. Aucune session ni clé n’est committée.

## Limites et reprise

Les règles métier, droits, calculs, écritures, montants et notifications ne sont pas modifiés. Aucun fichier d’action serveur, bibliothèque financière ou migration n’est touché. Les décisions et formulaires existants sont conservés, y compris les arbitrages avancés dans Suivi ; ils ne sont pas reconstruits dans cette amélioration limitée. Les autres espaces ne reçoivent pas la nouvelle navigation propriétaire.

Rejeu depuis `app` : `node node_modules/vitest/vitest.mjs run tests/consigne-incident.test.ts tests/incidents-liste-a-traiter.test.ts tests/chronologie-ecart-rendez-vous.test.ts tests/invitation-artisan-fiche-incident.test.ts tests/reglement-facture-ecrans.test.ts tests/devis-a-decider-ecrans.test.ts`.

Les scripts navigateur et le banc local sont conservés dans `output/ux-incidents-20261118`, sans session dans Git. Aucune CI distante lancée. Ce commit local doit être relu avec les précédents chantiers de la branche avant toute livraison autorisée.
