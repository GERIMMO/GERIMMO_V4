# Finances propriétaire — chantier UX 4A

18 novembre 2026. Branche locale `codex/ux-accueil-proprietaire-20261118`, base `b45c43443d35fc51d399e3764e33c167b48d045c`. Première partie du chantier 4 de `livrables/audit-ux-ui/plan.md` sur la branche Claude. Travail limité à la présentation et à la navigation ; un agent, moins de 30 minutes. Aucun push, fusion ou déploiement.

## Ce qui change

- Trois entrées : **Loyers**, **Dépenses**, **Bilan de l’année**. Les liens directs et l’historique des périodes sont conservés.
- **Ajouter une dépense** rejoint le formulaire existant, avec « Dépense » déjà sélectionné. Il n’enregistre rien automatiquement.
- Les filtres Patrimoine et Bien s’appliquent directement, en conservant la rubrique. L’année garde son bouton Afficher. Un patrimoine indisponible sur une année reste explicitement signalé ; aucun total trompeur ne le remplace.
- **Pour mon comptable** rassemble livre et exports, saisie d’écriture, clôture, reprise des comptes et récapitulatifs fiscaux. Les totaux du livre sont repliés pour le propriétaire, toujours disponibles. Les écrans agence ne changent pas.
- Le compte sans patrimoine reçoit une prochaine action : **Ajouter un bien**, avec une explication courte, au lieu de plusieurs séries de zéros.

Les libellés précisent la portée des montants : « Encaissé ou compensé » conserve les compensations existantes ; le bilan annuel et les échéances du mois ne sont pas confondus. Une dépense enregistrée n’est pas présentée comme payée. Le livre complet indique explicitement qu’il ne reprend pas les filtres de la vue Finances.

## Vérifications réellement exécutées

**29 tests ciblés réussis, 0 échec, 0 ignoré**, dans quatre fichiers : `finances.test.ts`, `finances-titulaire-ecran.test.ts`, `navigation-espace.test.ts`, `ventilation-titulaires.test.ts`. Les relances ne sont pas additionnées. TypeScript, ESLint ciblé et `git diff --check` réussis.

Cas chiffrés : 1 200 € attendus, 950 € couverts, 250 € restant dus, sans compter une avance deux fois ; facture de 180 € antérieure à la détention SCI maintenue à part ; dépenses certaines de 40 € identiques dans Dépenses et Bilan, avec 210 € incertains exclus ; créance de 640 € réservée au titulaire à l’échéance ; écritures annulées et autres organisations exclues. Les échecs de lecture ne sont pas convertis en état vide.

**Six parcours navigateur réussis** : particulier, SCI nouvellement créée et compte neuf, chacun à 390 et 1440 px. Trois entrées, conservation des anciennes ancres, ouverture des outils comptables, accès au livre et à ses totaux repliés, retour aux Finances, accès au formulaire de dépense. Filtres patrimoine/année et récupération après sélection indisponible exercés avec le particulier. Aucun débordement constaté ni erreur JavaScript. Aucune écriture financière créée.

Limite explicite : les dossiers navigateur réutilisés n’ont pas d’opérations financières sur la période affichée ; la SCI est encore neuve. Les montants non nuls et la séparation SCI/nom propre ont été vérifiés par les tests de rendu du composant serveur et de ventilation, avec données fictives, pas par une nouvelle saisie comptable dans le navigateur. Le mobile est simulé dans Chromium, pas sur un téléphone physique.

La partie lecture, permissions et calculs de `PageFinances`, avant son rendu, est identique à la base. Aucune bibliothèque financière, action serveur ou migration n’est modifiée. Le résumé du livre est déplacé sans modification de ses expressions. La migration d’inscription héritée du chantier précédent reste inchangée.

## Captures avant / après

| Profil fictif | Avant 390 | Après 390 | Avant 1440 | Après 1440 |
|---|---|---|---|---|
| Particulier | [Avant](captures/avant-particulier-390.png) | [Après](captures/apres-particulier-390.png) | [Avant](captures/avant-particulier-1440.png) | [Après](captures/apres-particulier-1440.png) |
| Compte neuf | [Avant](captures/avant-neuf-390.png) | [Après](captures/apres-neuf-390.png) | [Avant](captures/avant-neuf-1440.png) | [Après](captures/apres-neuf-1440.png) |
| SCI neuve | [Avant](captures/avant-sci-390.png) | [Après](captures/apres-sci-390.png) | [Avant](captures/avant-sci-1440.png) | [Après](captures/apres-sci-1440.png) |

Le bilan est également capturé à [390 px](captures/bilan-390.png) et [1440 px](captures/bilan-1440.png). Les images ont été vérifiées visuellement. Les sommes affichées avant/après figurent dans les deux fichiers `*-montants.json` ; `navigation-resultats.json`, `tests-finaux.log`, `verifications.json` et `invariants.json` conservent les résultats. Aucun fichier de session n’est committé.

## Rejeu et livraison

Depuis `app` : `node node_modules/vitest/vitest.mjs run tests/finances.test.ts tests/finances-titulaire-ecran.test.ts tests/navigation-espace.test.ts tests/ventilation-titulaires.test.ts`.

La recette navigateur utilise le banc isolé local existant, sans communication externe. Le script de navigation conservé dans le dossier de sortie local ne publie rien et ne soumet aucune écriture. Cette livraison reste un commit local pour validation. Aucune CI distante lancée ; une future livraison devra conserver les contrôles et approbations habituels ainsi que les dépendances de la branche.
