# Relecture adverse « écrans, régressions, fidélité de la fusion » — commit 3aeeee94 (base fde4cbb4)

Lecture seule. Extraction `git archive` dans `relecture-ecrans/src` (supprimée), base de sonde `gerimmo_ci_sonde_ecrans` (+ `_api`,
créée par `preparer-ci.mjs`) supprimée. Aucun port du banc, aucun processus laissé. Effet de bord : `git merge-tree --write-tree`
a écrit des objets d'arbre non référencés dans le dépôt de `fusion` (aucune branche, aucun fichier, HEAD inchangé).

**Verdict : la fusion est fidèle, rien de bloquant côté écrans. Un défaut important (hérité de l'arbre B, connu des auteurs, non corrigé).**

## Constat
**R-01 (important) : sur une base neuve, le compte qui choisit son premier mot de passe ne peut plus accepter les conditions clients (inscription bloquée, CI rouge).**
- Sonde (base neuve, 574 migrations) : `versions_conditions` vide ; `accepter_cgu('2026-11-24','compte','conditions_clients')` en `authenticated`
  → `ERROR: Version des conditions non archivée : accord non enregistré`. Source `espace_proprietaire` : acceptée.
- Code : `src/app/actions/auth.ts:179-185`, l'échec renvoie « L'acceptation des conditions n'a pas pu être enregistrée » ; garde dans
  `20261125150000_accord_conditions_version_archivee.sql:77`. Migration absente à fde4cbb4, test `premier-mot-de-passe-session-banc` présent.
- CI : `.github/workflows/ci.yml:186-188` lance vitest avec l'émulateur → ces 3 tests échouent (vu au journal `fusion-vitest-final.log`, non rejoué).
- Correction minimale (à trancher) : sans toucher à la garde, archiver la version 2026-11-24 dans la préparation du banc et de la CI, comme le
  plan de publication le fait en production avant 150000, puis relancer vitest et la suite e2e complète.

## Vérifié sans défaut
- Fusion : tous les fichiers sauf 4 sont identiques à une fusion à trois voies indépendante (`git merge-tree` base e9e46692, A=d9380013,
  B=35331720) ; les 4 fichiers en conflit (ordre-migrations, LISEZ-MOI des retours, manifeste, vitest.config) et notifications.ts : décompte
  ligne à ligne exact (0 ligne perdue, 0 doublon). Listes = union exacte de A et B ; ordre des migrations = dossier.
- Les 4 commits postérieurs (0cb05a2a à 3aeeee94) ne touchent que 9 fichiers ; aucune ligne de A ou B retirée ; les 3 tests de rang et
  T4R-10 restent exacts (liste exacte + garde ajoutée ; multiensemble).
- D5 : aucun import, lien, route, texte d'aide, e-mail ni spec restant vers `depot-signature`, `retournerDocumentSigne`,
  `envoyerPourSignature`, `annulerDemandeSignature`, `notifierSignatureDemandee`, `mes_demandes_signature`. Les mentions restantes sont
  Zoho, le bail papier du bailleur, ou un historique gardé exprès.
- Lot 60 et reprises R1 à R8, défauts majeurs E054, E056, E069, E070, E088, E089, E173, E198, E199, décisions du 25/11 : chaque correction est
  présente dans le code fusionné. Aucun h1 ajouté. Nouvelles cibles ≥ 44 px (min-h-11 ou 12), sauf les liens dans une phrase. Les specs tour5
  vérifient h1 unique et absence de débordement à 390 px (39/39 au precheck FUSION-FINAL).
- Tests : aucun `.only`, aucun skip nouveau sur un test existant (les `skipIf` nouveaux sont ceux des fichiers « avec base ») ; seule
  baisse nette d'assertions : `signature-annulation` (fonction retirée par D5, documenté) ; config vitest et Playwright non affaiblie.

## Non vérifié
- Suite e2e complète sur 3aeeee94 (9 specs seulement au precheck), notamment l'inscription d'un propriétaire.
- Rendu réel à 390 px des écrans artisan après fusion (B ne touche aucun fichier artisan : résultats de 4a410eda supposés valables).
