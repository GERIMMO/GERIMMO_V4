# UX 10B — Devis et créneaux artisan

18 novembre 2026. Recommandations 25/A05 et 26/A11 uniquement. Base : `46b858a7f611d08ae18a7f0e8eeea86e27146e79`, branche `codex/ux-accueil-proprietaire-20261118`. Un seul agent ; commit local, sans push ni livraison.

## Résultat

- **Devis** : le HT est visible dès que les quantités et prix permettent son calcul. Le TTC reste « À compléter » tant que la TVA ou une autre information nécessaire manque. Le taux manquant est signalé et aucun taux n’est choisi à la place de l’artisan. Bouton de progression bleu nuit et texte blanc.
- **Créneaux** : trois dates à choisir, raccourcis Matin (09:00–11:00) et Après-midi (14:00–16:00), horaires précis dans un volet. Les plages sont celles qui existaient déjà. Trois champs visibles par défaut au lieu de neuf. Chaque proposition peut être modifiée ou effacée ; l’ajout de propositions supplémentaires reste disponible.
- **Avant envoi** : récapitulatif des dates et heures, doublons explicitement signalés. Le remplacement de propositions existantes reste annoncé. Les explications sur les chevauchements et l’arbitrage restent dans le volet d’aide.

## Preuves

| Vérification | Résultat |
|---|---|
| Tests ciblés | **96 réussis, 0 échoué, 0 ignoré**, cinq fichiers, dont dix nouveaux cas d’affichage |
| Calculs | 65 € HT sans TVA : TTC à compléter ; 20 % : 78 € TTC ; plusieurs lignes : 148,51 € HT et 174,51 € TTC ; cinq taux et arrondis au demi-centime vérifiés |
| Devis navigateur | Sans TVA, avec TVA, plusieurs lignes, prix incorrect, navigation aller-retour et conservation des saisies : réussis à **390 et 1440 px** |
| Créneaux navigateur | Trois propositions, heures précises, modification, effacement, doublon, date passée, fin avant début, ajout/retrait d’une quatrième proposition et accès aux règles : réussis aux deux largeurs |
| Valeurs préparées | Instants ISO du champ envoyé contrôlés : 10:15 à Paris reste 09:15 UTC en novembre ; aucun rendez-vous envoyé ni confirmé |
| Présentation | Douze captures avant/après, aucun débordement horizontal, zéro erreur JavaScript ; navigateur Chromium, mobile simulé |
| TypeScript / ESLint | Réussis ; journaux et bilan dans ce dossier |
| Intégrité | Préparation, filtrage et envoi des créneaux inchangés ; moteur de calcul, actions serveur et protection des soumissions identiques au commit de départ (`integrite.json`) |

Les scénarios navigateur sont quatre séquences (deux écrans × deux largeurs), avec plusieurs vérifications par séquence : ils ne constituent pas quatre nouveaux parcours métier complets. Les 96 tests ne comprennent pas ces quatre séquences.

## Limites et protection

Les scénarios réutilisent des dossiers et une session **fictifs sur le banc local**. Toutes les écritures réseau sont bloquées ; aucune tentative d’écriture n’a été relevée pendant les séquences finales. Aucun devis transmis, créneau envoyé, rendez-vous confirmé, paiement, notification réelle ou donnée client modifiée. Aucun dossier temporaire créé : pas de nettoyage métier nécessaire.

L’envoi serveur et la livraison des notifications ne sont pas rejoués dans ce chantier de présentation. Les droits, règles de disponibilité, confirmations, reports, calculs, statuts et migrations ne sont pas modifiés. L’aperçu HT amélioré est activé uniquement dans le formulaire A05 ; les autres usages du composant de lignes restent inchangés.

La sélection utilise le calendrier natif et trois cartes de propositions, avec les raccourcis existants ; aucune grille de calendrier supplémentaire n’a été développée. Les heures exactes restent facultatives à saisir manuellement, mais elles sont toujours explicites dans les propositions.

## Rejeu et captures

- `navigation.cjs` : banc local `localhost:3100`, même jeu fictif ; passer le chemin de la session par `GERIMMO_SESSION_FICTIVE`. Aucune session ni clé conservée dans Git.
- `captures.json` : index des douze captures ; `captures/` : avant/après à 390 et 1440 px.
- `navigation-resultats.json`, `tests.log`, `validation.json` : résultats finaux.
- Tests : `tests/ux-devis-totaux.test.ts`, `tests/devis-structure.test.ts`, `tests/devis-affichage-fr.test.ts`, `tests/brouillon-devis-local.test.ts`, `tests/saisie-devis-artisan-jour-paris.test.ts`.

Ne pas utiliser ces scripts avec une session de production. Les essais mobiles sont simulés, sans revendication de validation sur un téléphone physique.
