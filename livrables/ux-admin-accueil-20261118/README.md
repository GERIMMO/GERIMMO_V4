# Accueil du dirigeant — chantier UX 8A

18 novembre 2026. Base `228b0178b6d31846c4126e8062b4c29a12385db3`, branche locale `codex/ux-accueil-proprietaire-20261118`. Périmètre : uniquement l’accueil du chantier 8 et la recommandation 10 du plan Claude. Un seul agent, moins de 30 minutes. Aucun push, fusion, migration ou déploiement.

## Résultat

L’accueil réel de la connexion super-admin, **`/admin/brief`**, devient **Aujourd’hui**. La page `/admin` conserve intégralement ses fonctions d’abonnements et finances ; les vues Décisions et Équipes restent inchangées. Aucun regroupement du menu ni autre chantier de la console.

Six indicateurs : espaces clients, essais, abonnements actifs, paiements à suivre, assistance ouverte et points du service à vérifier. Les espaces clients sont explicitement des **organisations**, pas des personnes uniques. Les états d’essai et d’abonnement utilisent les mêmes fonctions que la page financière. Les essais proches restent des échéances, sans conversion automatique ni changement du contrat.

Le bloc **À traiter** présente au plus trois entrées, dans l’ordre du tri existant. Le total reste celui de la file et du bandeau. Les autres problèmes restent explicitement comptés avec un lien vers la file complète. Chaque action mène à sa destination existante ; les signalements utilisent aussi leur ancre de dossier. Le bouton des alertes critiques conserve l’ouverture de la fenêtre existante.

Le bandeau indique les difficultés réellement remontées ou l’absence de blocage **signalé par les contrôles disponibles**, sans certifier artificiellement une disponibilité absolue. Une donnée absente reste « À vérifier ». Un relevé non préparé ou indisponible reste annoncé. Les faits urgents, alertes critiques et échecs du relevé restent visibles avec leur date, même si les détails sont repliés ; les anciennes valeurs d’une source indisponible sont identifiées comme telles.

**Détails** conserve l’intégralité des outils, des comptes rendus, des faits, du relais et de l’historique. Les liens profonds et l’accès au clavier ouvrent le composant de repli existant. Les vues historiques conservent leur présentation détaillée. Aucune action métier, préparation de point ou automatisation n’est modifiée.

## Sources et protections

- `supervision_finances`, déjà utilisé par Abonnements et finances, lu avec la session courante.
- Nombre exact des retours d’assistance non résolus, hors idées, avec les permissions existantes. Cette lecture n’écrit rien.
- `chargerDecisionsAttendues`, son tri et ses compteurs inchangés.
- Relevés de faits et comptes rendus existants, avec indication des dates et des limites de disponibilité.

Une lecture financière partielle conserve le total connu d’espaces et présente les sous-totaux comme des minimums. Aucun montant, paiement, droit, abonnement, secret ou réglage de service modifié. Aucun accès privilégié nouveau. Le contrôle super-admin et la vérification renforcée existants restent en place.

## Vérifications exécutées

**32 tests réussis, 0 échec, 0 ignoré dans six fichiers.** Ne pas additionner les relances. Les neuf tests de présentation couvrent les six chiffres, les règles financières inchangées, les lectures absentes/partielles, le tri, les liens, les alertes, les données anciennes et l’absence de mutation des sources. Trois tests navigateur exercent chacun deux largeurs : état calme, erreur de lecture et alertes critiques. L’événement du bouton d’alertes est effectivement reçu par le banc. TypeScript et ESLint ciblé réussis.

**Deux parcours sur l’application locale authentifiée**, à 390 × 1000 et 1440 × 1000, avec le super-admin fictif et son second facteur local normal, sans désactivation du contrôle MFA :

- Connexion existante puis `/espaces` redirige vers Aujourd’hui.
- Six indicateurs visibles. Les cinq compteurs clients/essais/abonnements/paiements/assistance sont comparés aux lectures du banc : **75 / 23 / 13 / 24 / 16**. Ces chiffres sont exclusivement ceux des données fictives locales, pas de la production.
- Trois actions affichées, cinq problèmes accessibles et **22 demandes** dans la nouvelle présentation comme dans le détail existant.
- Ouverture réelle des pages Utilisateurs, Abonnements et finances, Assistance, Santé, des deux dossiers de signalement ciblés et de la file complète des décisions.
- Détails ouverts par lien profond, repliés puis rouverts au clavier ; consignes et relais toujours accessibles.
- Aucune erreur JavaScript, aucun débordement horizontal.
- Accès anonyme : redirection vers Connexion, aucun indicateur privé affiché.

Aucune décision d’approbation, restriction, publication, préparation de point, paiement ou notification déclenchée. Aucun dossier métier créé ou supprimé. Les sessions de test et la présence/journalisation habituelle restent limitées au banc fictif.

## Captures

| Situation | 390 px | 1440 px |
|---|---|---|
| Avant, accueil local authentifié | [avant](captures/avant-admin-accueil-390.png) | [avant](captures/avant-admin-accueil-1440.png) |
| Après, mêmes données locales | [après](captures/apres-admin-accueil-390.png) | [après](captures/apres-admin-accueil-1440.png) |
| Haut de page | [mobile](captures/apres-haut-390.png) | [bureau](captures/apres-haut-1440.png) |
| Détails conservés, ouverts | [mobile](captures/apres-details-390.png) | [bureau](captures/apres-details-1440.png) |
| Sans urgence, scénario isolé | [mobile](captures/apres-calme-390.png) | [bureau](captures/apres-calme-1440.png) |
| Lectures indisponibles, scénario isolé | [mobile](captures/apres-erreur-390.png) | [bureau](captures/apres-erreur-1440.png) |
| Bouton d’alertes, scénario isolé | [mobile](captures/apres-alertes-390.png) | [bureau](captures/apres-alertes-1440.png) |

Vue initiale : **3 332 → 1 923 px** à 390 px ; **2 339 → 1 402 px** à 1440 px. Les fonctions sont repliées, pas supprimées. Bleu nuit, or, typographie et gabarit existants conservés ; captures examinées visuellement.

## Limites et reprise

Les états calme/erreur/alertes utilisent le véritable composant de présentation dans Chromium, alimenté par des données fictives prédéfinies et sans accès réseau externe. Ils ne prouvent pas qu’un service de production est sain. Les deux parcours authentifiés utilisent les sources locales réellement présentes ; aucun faux indicateur n’est ajouté à l’application. Les téléphones sont simulés : aucun iPhone ou Android physique testé.

La préparation manuelle du point n’est pas rejouée ici : son action est inchangée. Le test E2E existant est adapté au nouveau titre et à l’ouverture de Détails, sans suppression d’assertion ; la suite E2E complète n’est pas exécutée. La recette ciblée vérifie les accès, pas une nouvelle campagne de sécurité multi-organisations.

Depuis `app` :

```sh
node node_modules/vitest/vitest.mjs run tests/ux-accueil-dirigeant.test.ts tests/ux-accueil-dirigeant-navigateur.test.ts tests/finances-supervision.test.ts tests/compteurs-navigation-supervision.test.ts tests/tri-decisions.test.ts tests/faits-direction.test.ts
npx tsc --noEmit
```

Preuves : `tests-finaux.log`, `parcours-resultats.json`, `acces-anonyme.json`, `verifications.json`. Les scripts et sessions de recette restent dans `output/ux-admin-accueil-20261118`, hors Git. Aucune session, clé ou donnée réelle committée. Les deux serveurs propres à cette intervention sont arrêtés après vérification. Aucun travail sur les autres espaces ni sur les autres parties du chantier 8.
