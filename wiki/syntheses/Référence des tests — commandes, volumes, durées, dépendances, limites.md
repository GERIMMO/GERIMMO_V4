---
type: synthesis
tags: [tests, reference, vitest, playwright, ci]
status: draft
created: 2026-10-14
updated: 2026-10-14
sources: []
---

# Référence des tests — commandes, volumes, durées, dépendances, limites

> [!info] Provenance et rejeu
> - Version du code : `9396669` (branche `claude/compassionate-euler-qpqjp6`), relevé le 2026-10-14 04:42:30 +0000.
> - Arbre de travail : propre sur app/src, app/supabase, app/e2e, app/tests au moment du relevé.
> - Scripts : `scripts/07_tests.py`, `scripts/10_pages_couverture_tests.py` (rejeu complet : `bash scripts/rejouer.sh`).
> - Contrôle croisé (commande indépendante des scripts) : `ls tests/*.test.ts | wc -l` = 366 ; `ls e2e/*.spec.ts | wc -l` = 37 ; `playwright test --list` = 164 tests (fichier `donnees/playwright-list.txt`).


**Les journaux sont lus, pas rejoués** : la cartographie est en lecture seule et ne relance ni build ni test. Les chiffres viennent de `/tmp/cand5-*.log` (chaîne `scratchpad/outils/candidat5.sh`, exécutée le 14/10/2026 entre 03:38 et 04:02 sur le SHA
`b9a7107`, arbre propre) et de `/tmp/ref-*.log` (référence `e9f31ac`, 13/10). La tête actuelle est `9396669` : la seule différence est `app/e2e/personne-reprise.spec.ts` (voir §2 et CAR-01).

## 1. Commandes

| Suite | Commande | Prérequis |
|---|---|---|
| Lint | `npm run lint` (eslint) | Node 22, dépendances installées |
| Types | `npm run typecheck` (tsc --noEmit) | idem |
| Build | `npm run build` (Next 16.3.8, Turbopack) | variables Supabase publiques ; produit le `ƒ Proxy (Middleware)` |
| Vitest | `npm test -- --maxWorkers=2` (`vitest run`, `include: tests/**/*.test.ts`, délai de 30 s) | `SUPABASE_DB_URL` vers une base Postgres reconstruite par `node e2e/local/preparer-ci.mjs` (105 fichiers de test la mentionnent) ; `GERIMMO_CHROME` et `GERIMMO_TEST_PDF=1` pour les tests de PDF (9 fichiers) ; l'émulateur sur 54321 pour 6 fichiers |
| Matrice d'écrans | `npm run e2e:matrice` (`e2e/local/generer-matrice.mjs`) | base API du banc ; écrit `e2e/matrice-ecrans.json` (ignoré par git) avec des identifiants réels |
| Parcours navigateur | `npm run test:e2e` (`playwright test --config e2e/playwright.config.ts`) | `E2E_CI=1 E2E_USE_BUILD=1 E2E_BASE_URL=http://127.0.0.1:3100`, `PLAYWRIGHT_CHROMIUM`, serveur `next start` sur 3100, émulateur Supabase sur 54321, base API remise à neuf (`banc-up.sh`), session des personas (`auth.setup.ts`, MFA super-admin) |
| Audit des écrans | `E2E_AUDIT_WIDTH=768\|1440 npx playwright test --config e2e/playwright.config.ts e2e/audit-ecrans.spec.ts` | idem ; la largeur 390 est celle de la suite e2e |
| Recette de production | `e2e/recette-production/` (configuration propre) | comptes réels de production : **jamais** lancée par la suite (exclue par `testIgnore`) |

## 2. Résultats de la chaîne de référence candidate (`cand5`, SHA `b9a7107`)

| Étape | État de sortie (`cand5-etat.log`) | Résultat des journaux | Référence e9f31ac |
|---|---|---|---|
| Lint | code 0 | sortie vide (aucun avertissement) | ref : code 0 |
| Types | code 0 | sortie vide | ref : code 0 |
| Build | code 0 | 146 routes listées (15 statiques, 131 dynamiques), proxy présent | ref : 146 routes |
| Vitest | code 0 | 365 fichiers passés + 1 ignoré / 366 ; 3889 tests passés + 14 ignorés / 3903 ; 79.36 s | ref : 324 fichiers, 3347 tests, 74.83 s |
| Parcours navigateur | code 1 | 164 tests, 2 workers : 161 réussis, 1 en échec, 1 instable, 1 ignoré ; 8.3m | ref : aucun journal e2e |
| Audit des écrans 768 px | code 0 | 157 écrans, 5.0m | ref : aucun journal |
| Audit des écrans 1440 px | code 0 | 157 écrans, 6.0m | ref : aucun journal |

Échec et instabilité du parcours navigateur (journal `cand5-e2e.log`) : `e2e/personne-reprise.spec.ts:9:37 › fiche personne et justificatif : fermeture et création à 1440px`; `e2e/personne-reprise.spec.ts:9:37 › fiche personne et justificatif : fermeture et création à 390px`. Cause relevée dans le journal : `getByText('justificatif-fictif.pdf')` non trouvé après « Reprendre ma saisie » (délai 15 s) ; le commit suivant `9396669` modifie ce parcours (attendre une copie réellement écrite) mais **n'a pas été rejoué** (CAR-01).

État final de la chaîne : banc remonté (`BANC_UP`), sessions des personas rouvertes (`cand5-sessions.log` : 1 passé), base API restituée depuis la photographie « avant parcours » (`restitution:0`).

## 3. Ce que chaque suite couvre

- **Vitest** : 366 fichiers dans `app/tests/` (le journal dit 366 fichiers et 3903 tests ; le comptage statique des appels `it(`/`test(` n'en voit que 3178 car il ignore `it.each` et les générateurs). Répartition (un fichier peut cumuler) : 76 importent du code de `src/lib`, 60 du code de `src/app`, 52 lisent le texte de fichiers sources (`readFileSync`) ; 105 fichiers (garde `describe.skipIf(!SUPABASE_DB_URL)`, 135 blocs) vérifient les migrations, la RLS et les fonctions SQL sur la base réelle reconstruite, dans des transactions annulées.
  Familles de noms de fichiers les plus fournies : `audit` 12, `cron` 11, `artisan` 10, `outils` 9, `documents` 8, `devis` 7, `edl` 5, `creation` 5, `sprint3` 5, `marketing` 5, `mfa` 4, `abonnement` 4.
- **Playwright** : 164 tests dans 37 fichiers (1 fichier d'amorçage `auth.setup.ts` + 36 parcours ; `visuel.spec.ts` est exclu par `E2E_CI=1`, `recette-production/` aussi). Tout tourne au **gabarit téléphone 390×844** (tactile). Plus gros fichiers : `menu-compte.spec.ts` 17, `fenetre-lot.spec.ts` 12, `parcours-artisan.spec.ts` 12, `abonnement.spec.ts` 10, `navigation-matin.spec.ts` 10, `protection-saisie.spec.ts` 10, `fiches-parc.spec.ts` 8, `audit-ecrans.spec.ts` 7.
- **Audit des écrans** (`audit-ecrans.spec.ts`) : ouvre les 157 écrans de la matrice avec la session de chaque profil, mesure débordement, erreurs console/page, boutons sans nom, soft-404 ; échoue si l'un d'eux est cassé. Il tourne aux trois largeurs (390 dans la suite, 768, 1440). C'est de l'**ouverture**, pas un parcours métier.
- **Accessibilité** (`a11y.spec.ts`, axe-core) : balaie la matrice et écrit `rapport-a11y.json` ; aucune conformité complète n'est revendiquée.
- **Lint / types / build** : qualité statique et compilation ; une compilation réussie ne prouve pas un produit utilisable.

## 4. Durées

| Étape | Durée relevée | Source |
|---|---|---|
| Vitest | 79.36 s (transform 9,28 s, import 28,56 s, tests 71,50 s) | cand5-vitest.log |
| Parcours navigateur | 8.3m | cand5-e2e.log (dont ~32 s d'amorçage des sessions) |
| Audit 768 px | 5.0m | cand5-audit-768.log |
| Audit 1440 px | 6.0m | cand5-audit-1440.log |
| Chaîne complète | du 03:38 au 04:02, soit environ 24 minutes | cand5-etat.log (début) et horodatage de FINI |

## 5. Dépendances et isolation

- Base : Postgres 16 local, deux bases distinctes (`gerimmo_ci_integ` pour vitest et le catalogue, `gerimmo_ci_integ_api` pour l'émulateur et le banc) ; `tests/garde-base.ts` refuse toute URL contenant l'identifiant du projet de production.
- Émulateur Supabase maison (`e2e/local/serveur-supabase-local.mjs`, port 54321) : auth, REST, stockage ; `pg_cron`, envoi d'e-mails, Stripe, YouTrust, OpenAI et Meta n'existent pas sur le banc.
- Navigateur : Chromium préinstallé (`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium`) ; Chrome pour les PDF (`GERIMMO_CHROME`).
- Variables du banc posées par la chaîne : `GERIMMO_ARTISAN_CLIENTS_LOCAUX=1`, `GERIMMO_ARTISAN_REGLEMENTS_LOCAUX=1`, `PLANNING_CONFLITS_CONCURRENCE=1` (modules « clients externes » et « règlements manuels » activés sur le banc seulement).
- Concurrence : 2 workers vitest, 2 workers Playwright, `retries: 1` (un test qui réussit au second essai est compté « instable », pas en échec).

## 6. Ce que les suites ne couvrent pas

- **Services externes** : paiement (Stripe), e-mails (Resend), signature (YouTrust), IA (OpenAI), publication (Meta) : aucune clé sur le banc ; seuls les chemins « sans clé » (refus propre, message) sont exercés. Un test Stripe « bac à sable » existe (`tests/stripe-bac-a-sable.test.ts`, `GERIMMO_STRIPE_TEST_KEY`, workflow CI séparé) : non lancé ici.
- **Planification** : les crons Vercel et `pg_cron` ne tournent pas sur le banc ; les routes `/api/cron/*` ne sont pas appelées avec un secret par la suite (hypothèse à vérifier : tests unitaires seulement).
- **Largeurs et appareils** : parcours seulement à 390 px ; 768 et 1440 px = ouverture des écrans ; pas de Safari/Firefox, pas d'appareil réel, pas de lecteur d'écran réel.
- **Production** : `recette-production/` exclue ; aucun test contre la production.
- **Écrans** : 4 pages du code hors matrice ; écrans « ouverts » en état vide (voir [[Inventaire de couverture]]).
- **Restauration / sauvegarde** : scripts `scripts/sauvegarde/` non exercés par ces suites.

## 7. Comparaison avec la référence `e9f31ac`

| Mesure | e9f31ac (référence, 13/10) | cand5 (14/10) | Écart |
|---|---|---|---|
| Fichiers vitest | 324 | 366 | +42 |
| Tests vitest | 3347 | 3903 | +556 |
| Tests ignorés | 14 | 14 | 0 |
| Durée vitest (s) | 74.83 | 79.36 | +4.5 |
| Routes du build | 146 | 146 | ajoutées 0, retirées 0 |
| Lint / types | code 0 / code 0 | code 0 / code 0 | identique |
| Parcours navigateur | aucun journal | 164 tests : 161 réussis, 1 échec, 1 instable | non comparable (CAR-04) |
| Audit des écrans | aucun journal | 157 écrans aux deux largeurs | non comparable (CAR-04) |

Le jeu de routes du build est identique entre les deux références (mêmes 146 routes listées) ; les changements portent sur des contenus de pages et de composants, non sur l'arborescence.

`/tmp/ref-global.log` est vide (0 octet) et aucun journal e2e ni d'audit n'existe pour `e9f31ac` : la comparaison ne porte que sur lint, types, build et vitest.

## 8. Historique des séries sur la branche candidate

| Série | Début (journal d'état) | Vitest | Parcours navigateur | Audit 1440 |
|---|---|---|---|---|
| cand | debut 20:44:54 | 3345/3436 en 80.12 s | journal incomplet ou format différent | - |
| cand2 | debut 21:04:47 | 3422/3436 en 68.4 s | 146 ok, 1 échec, 0 instable | - |
| cand3 | debut 21:19:32 5d15b4d | 3460/3474 en 68.26 s | 163 ok, 0 échec, 0 instable | 157 écrans |
| cand4 | debut 00:42:41 375af42 arbre-propre:0 | 3776/3790 en 72.86 s | 156 ok, 7 échec, 0 instable | 157 écrans |
| cand5 | debut 03:38:13 b9a7107 arbre-propre:0 | 3889/3903 en 79.36 s | 161 ok, 1 échec, 1 instable | 157 écrans |

Les séries intermédiaires (`cand` à `cand4`) sont conservées comme historique ; seule `cand5` est la référence.

