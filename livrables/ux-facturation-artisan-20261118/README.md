# Facturation artisan — chantier UX 7

18 novembre 2026. Base `7acc8064650575918907b7f04fbd0bb55d310c43`, branche locale `codex/ux-accueil-proprietaire-20261118`. Périmètre strict : chantier 7 du plan Claude, recommandations 9 et 23. Un agent, moins de 30 minutes. Aucun push, fusion, migration ou déploiement.

## Résultat

- **Mes factures** s’ouvre par défaut : total restant à recevoir, nombre de factures et indication de celles qui attendent la validation du client. Une ligne par facture : client, intervention, montant TTC, règlement déclaré par l’artisan, solde et état.
- États lisibles : attente de validation, à régler, partiellement réglée, réglée ; un paiement déclaré uniquement par le client reste **Réception à confirmer**. Les deux déclarations ne sont jamais additionnées. Une lecture client indisponible ne devient pas une validation acquise.
- **Déclarer un règlement reçu** mène au formulaire existant. La déclaration ne vaut pas confirmation bancaire. Les contrôles d’activation, justificatifs, annulations et historiques sont conservés. Aucune action serveur ni règle métier n’est modifiée.
- **Mon registre** contient le registre détaillé et son export intégral existants. Les interventions à facturer, dossiers à compléter et explications détaillées restent accessibles dans une section repliable, avec leurs anciens liens. Une panne de lecture des interventions reste visible, sans prétendre qu’il n’y a rien à facturer.
- Navigation mobile : Aujourd’hui, Agenda, Devis, **Factures**, **Menu**. Le menu conserve entreprise, attestations, clients externes, évaluations, règles et aide. Navigation de bureau conservée.

## Montants et protections

La synthèse réutilise `bilanReglements` sans le modifier. Le total présente la somme des soldes positifs de factures distinctes ; il ne compense pas une dette d’un client avec un trop-perçu d’un autre. Les annulations de déclarations et les avoirs continuent à suivre le calcul existant. Aucune déclaration de règlement du client n’est ajoutée au registre de l’artisan.

Les 20 factures fictives initiales conservent chacune **100 € facturés, 0 € déclaré reçu, 100 € de solde**, soit **2 000 €**. Le registre avant/après contient les mêmes numéros. Les chiffres des deux présentations sont réconciliés. Aucune migration, modification de permissions, notification ou écriture comptable applicative.

## Vérifications exécutées

**100 tests réussis, 0 échec, 0 ignoré dans 7 fichiers**, sans additionner les relances. Dix cas nouveaux couvrent la synthèse, la séparation des déclarations, les doublons de facture, les annulations, les avoirs, les erreurs de lecture, l’activation et les accès mobiles. Les tests existants conservent toutes leurs assertions ; seuls leurs mocks de lecture/navigation sont adaptés à la nouvelle présentation. TypeScript et ESLint ciblé : réussite.

**Deux parcours navigateur authentifiés**, à **390 × 1000 et 1440 × 1000**, sur Next.js et PostgreSQL locaux, avec trafic externe bloqué. Trois dossiers fictifs temporaires préparés sur le banc :

| Client fictif | Montant | Déclaré reçu | Solde | Résultat |
|---|---:|---:|---:|---|
| Élise Morel, particulier externe | 100 € | 0 € | 100 € | À régler |
| SCI des Amandiers, entreprise externe | 200 € | 50 € | 150 € | Partiellement réglée |
| Atelier des Lilas, client externe | 300 € | 300 € | 0 € | Réglée, aucun bouton de nouveau règlement |

Avec les 20 factures Gerimmo déjà présentes : 23 lignes, 22 soldes positifs, **2 250 € restant à recevoir**, sans double comptabilisation. Cinq factures Gerimmo en attente de validation restent identifiées. Les cas particulier et SCI de l’origine Gerimmo sont également couverts dans les tests de rendu/calcul de présentation.

Actions réellement exercées : onglets, lien vers le formulaire de règlement, ouverture du formulaire d’annulation, historique, téléchargement et lecture de l’export JSON (23 factures, 350 € de déclarations fictives). À 390 px : ouverture du Menu, lien Clients externes puis retour par Factures. Aucun formulaire de règlement ou d’annulation n’a été soumis.

Après nettoyage, deux contrôles complémentaires vérifient les 20 factures initiales, les montants identiques, la conservation de l’onglet après rechargement et l’accès direct à l’ancienne ancre des factures déposées. Aucune erreur JavaScript dans les parcours ; aucun débordement horizontal.

## Captures et lisibilité

| Vue | 390 px | 1440 px |
|---|---|---|
| Avant, 20 factures initiales | [avant mobile](captures/avant-artisan-facturation-390.png) | [avant bureau](captures/avant-artisan-facturation-1440.png) |
| Après, mêmes 20 factures | [après mobile](captures/apres-artisan-facturation-390.png) | [après bureau](captures/apres-artisan-facturation-1440.png) |
| Résumé et cas de règlement | [résumé mobile](captures/apres-resume-390.png) | [résumé bureau](captures/apres-resume-1440.png) |
| Cas fictifs, page entière | [cas mobile](captures/apres-cas-fictifs-390.png) | [cas bureau](captures/apres-cas-fictifs-1440.png) |
| Mon registre | [registre mobile](captures/apres-registre-390.png) | [registre bureau](captures/apres-registre-1440.png) |

Pour les mêmes 20 factures, hauteur de la vue principale : **12 169 → 6 126 px sur mobile**, **8 555 → 3 231 px sur bureau**. Les détails sont repliés, pas supprimés. Résumé, hiérarchie, couleurs et navigation ont été examinés visuellement. Mobile simulé dans Chromium, pas de test sur téléphone physique.

## Nettoyage et limites

Trois clients, chantiers, devis et factures externes ainsi que deux règlements déclaratifs ont été préparés exclusivement sur la base locale fictive. Ils ont ensuite été retirés par leurs identifiants précis : retour à zéro facture externe et zéro déclaration dans ce compte, comme au départ. Aucun compte ou droit modifié, aucun document partagé supprimé. Preuve dans `nettoyage.json`.

Il s’agit d’une recette de présentation et de navigation, pas d’une nouvelle validation de création de facture, de paiement bancaire, de génération ou de lecture PDF. Les dossiers préparés réutilisent les pièces fictives existantes du banc. Les actions financières ne sont pas exécutées dans le navigateur ; leurs règles restent inchangées. Aucun compte ni donnée de production consulté ou modifié.

## Rejeu et reprise

Depuis `app` :

```sh
node node_modules/vitest/vitest.mjs run tests/ux-facturation-artisan.test.ts tests/suivi-facturation-artisan.test.ts tests/reglement-facture.test.ts tests/artisan-prive-affichage.test.ts tests/reglement-facture-ecrans.test.ts tests/artisan-avoir-ecran.test.ts tests/audit-oct28-rendu.test.ts
npx tsc --noEmit
```

Les preuves sont `tests-finaux.log`, `verifications.json`, `parcours-resultats.json`, `registre-invariants.json`, `fixtures-manifeste.json` et `nettoyage.json`. Scripts de banc et captures conservés dans `output/ux-facturation-artisan-20261118` hors Git ; renouveler la session fictive avant tout rejeu. Aucune session ni clé committée. Les serveurs propres à cette intervention sont arrêtés après vérification. Relire ce commit local avec les chantiers précédents avant toute livraison autorisée.
