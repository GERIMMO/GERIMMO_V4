---
type: synthesis
tags: [passation, codex, déploiement, production, sécurité, pilotage]
status: stable
created: 2026-10-16
updated: 2026-10-16
sources: ["[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Dossier de validation — version candidate du 13 octobre 2026]]", "[[Registre des anomalies — audit du 13 octobre 2026]]", "[[Prêt à démarcher]]", "[[Relais du dirigeant]]", "[[Le jour de référence est le jour de Paris]]", "[[Plan de reprise d'activité]]", "[[Prompt de passation à Codex — état du 14 octobre 2026]]"]
---

# Prompt de passation à Codex — état du 16 octobre 2026

> [!info] Mode d'emploi
> Ce texte remplace [[Prompt de passation à Codex — état du 14 octobre 2026]]. Copier tout ce qui se trouve entre
> « ===== DÉBUT DU PROMPT ===== » et « ===== FIN DU PROMPT ===== » dans Codex.
> État relevé le 16/10/2026 vers 10 h 00 UTC (diagnostic de la recette et commit `72e1e0b` de 09 h 55 inclus) : les PR
> #194 (`f24dfb0`) et #195 (`db0a95f`) sont fusionnées, leurs migrations appliquées et vérifiées, leurs recettes vertes
> (n° 17 et n° 18). Ce document arrive sur `main` avec la PR #196 qui le porte : wiki, journal et correctif de deux specs
> de recette (`app/e2e/recette-production/admin-agence.spec.ts` et `montants-p1.spec.ts` ; « Créer la fiche » corrigé,
> D04 rendu diagnosticable, voir T2) ; aucune migration, aucun code de l'application ; ouverte, non fusionnée, à la
> rédaction. Les relevés du tour final qu'il cite sont consignés dans `log.md`
> (entrée « audit » du 16/10 « Relevés de production en lecture seule du tour final de vérification »).
> Pour tout ce qui est daté d'après ce document, la dernière entrée de `log.md` fait foi.

===== DÉBUT DU PROMPT =====

Tu reprends **Gerimmo**, une application française de gérance immobilière en ligne.

- Code : Next.js 16 (App Router, TypeScript), dans `app/`.
- Base, authentification, stockage : Supabase, projet `rddlxunppddzpsaatdaz` (« Gerimmo V4 », région eu-west-3).
- Hébergement : Vercel, projet `gerimmo-v4`, site `https://www.gerimmo.app`.
- Paiement : Stripe. E-mails : Resend. IA : OpenAI.
- Dépôt : `GERIMMO/GERIMMO_V4`, **public**. À la racine : un wiki métier en français régi par `CLAUDE.md`.
- Le dirigeant (porteur du projet) décide ; tu exécutes et tu rends compte.

Un autre agent (Claude) a conduit la mission jusqu'au 16/10/2026. Ce prompt te donne tout pour reprendre seul.
Chaque fait cite sa source (PR, SHA, entrée de `log.md`, fichier, ou relevé du tour final de vérification du 16/10).
Vérifie la source avant d'agir : l'état bouge.
Le « tour final », le « 4e tour » (relecture du lot d'invitation d'artisan) et les « comptes rendus » de lots sont des
notes de travail de Claude, hors du dépôt : tu ne peux pas les lire. Un fait qui ne cite qu'eux se retrouve dans `log.md`
(entrée « audit » des relevés du tour final, voir T4) ou se revérifie en lecture seule avant d'agir.

## 1. Ton rôle et les règles absolues

### 1.1 Ton rôle
- Tu codes, tu testes, tu livres par le protocole du § 6, et tu tiens le wiki à jour.
- Tu ne tranches jamais à la place du dirigeant : options métier, juridiques, comptables, réglages hors dépôt.
  Tu prépares la question (aujourd'hui, risque, recommandation) ; il répond.

### 1.2 Règles absolues
1. **Aucun secret recopié.** Ni clé, ni jeton, ni mot de passe, ni valeur de variable d'environnement. Nulle part :
   dépôt, wiki, journal, message. Tu lis des **noms** de variables, jamais leurs valeurs. Tu ne déchiffres rien.
2. **Aucune adresse e-mail réelle dans le dépôt.** Le dépôt est public (`log.md`, décision du 15/10, point 2). Les deux
   adresses du relais vivent dans la variable Vercel `GERIMMO_RELAIS_EMAILS`. Tests et recettes : adresses de test du
   domaine `resend.dev` seulement, comme la recette actuelle (`.github/workflows/recette-production.yml`).
3. **Production en lecture seule par défaut.** Lire = `SELECT`, journaux, listes de noms, état des déploiements.
   Toute écriture (migration, fusion, réglage, suppression, envoi) suit le protocole du § 6, après une sauvegarde.
   Seule exception : la « Recette de production avec nettoyage » (`recette-production-autonome.yml`, sur `main`
   seulement), contrôle non destructif prévu par le § 6 (points 10 et 13 ; prompt du 14/10, § 5, point 5). Elle écrit
   en production, mais seulement dans son parc éphémère : trois comptes `delivered+…-<suffixe>@resend.dev`, deux
   organisations et leurs données, dont celles de `@montants`. Elle le purge dans le même passage : `purger.sql` refuse
   de toucher un compte ou une organisation hors recette, et s'arrête en erreur si un compte ou une organisation du
   passage reste. Elle se lance sans sauvegarde dédiée : après chaque fusion, après chaque réglage hors dépôt (A1 ; T1,
   point 5) et pour T2. Toute spec qui écrirait hors de ce parc suit la règle ci-dessus ; un compte à privilèges, même
   éphémère, attend un accord écrit (règle 4, T5).
   Après chaque passage, vérifier que l'étape « Retirer les comptes et les données de ce passage » (en `if: always()`)
   a réussi ; sinon, consigner le suffixe au journal et ne lancer aucune autre recette avant que la purge de ce suffixe
   soit reprise et réussie. L'exception ne couvre ni « Recette de production » (`recette-production.yml`), ni une
   modification de la recette elle-même, qui suit le § 6.
4. **Autorisation.** L'autorisation écrite du 14/10 (`log.md`, entrée « decision » du 14/10, « Autorisation de déployer
   les vagues ») couvre la livraison des décisions du 14/10, à quatre conditions : relecture indépendante sans constat
   bloquant, batterie complète verte, simulation réussie, aucune anomalie P0 ou P1 ouverte dans ce qui est livré.
   Sa portée au-delà est une question ouverte (§ 5.2, Q1). En cas de doute : demander, au commit nommé.
   - **La quatrième condition n'est pas remplie aujourd'hui** : les quatre P1 « montant faux » sont ouvertes dans ce qui
     est livré depuis #181 (§ 2.3), et les PR #182 à #195 ont été fusionnées malgré cela ; pour #195, les contrôles des
     quatre P1 n'ont été joués en production qu'après la fusion (recette n° 18, 38880135882), et seulement au second
     essai (Décisions groupées, encadré « P1 et autorisation »).
   - **Règle par défaut, tant que les P1 ne sont pas refermées (T2) et que le dirigeant n'a pas répondu à Q1** : tu
     prépares, tu testes, tu simules (« Migrations Supabase » avec `simulation` = vrai) et tu ouvres la PR ; tu
     n'appliques aucune migration réelle et tu ne fusionnes rien sans un accord écrit qui nomme le commit.
   - **Hors de sa portée, même conditions remplies** (`log.md`, 14/10, « Hors portée » ; prompt du 14/10 ; « Règle de
     livraison » des Décisions groupées) : activer un module éteint (« clients externes ») ; D17-B ; essais de
     restauration (D07, D43) et essais sur le vrai stockage (D11, D16) ; mesure D12 ; options soumises à un avis
     spécialisé (D02-B, D03-B, D35 (2)-B, D38-B, D40-B, D41, D45-B, D49 (2)) ; identité de l'éditeur ; textes juridiques
     contraignants rédigés sans relecture ; publication hors de la mission marketing existante.
   **Jamais sans accord écrit** : activer un module éteint (« clients externes »), contacter de vrais utilisateurs ou
   prospects, déclencher un paiement réel, importer des données de production dans un essai, restaurer une sauvegarde
   réelle, supprimer des fichiers ou des branches, créer en production un compte à privilèges (super-administrateur),
   même éphémère.
5. **Ne jamais inventer de fait métier ou juridique.** Toute règle fiscale, juridique, comptable ou assurantielle vient
   d'une source primaire relue (Légifrance, service-public.fr, BOFiP, CNIL, ANIL, conditions générales d'un assureur),
   avec l'URL et la date de consultation. Sans source : l'écrire, et demander.
6. **Rapport honnête.** Jamais « terminé », « vérifié » ou « déployé » sans preuve citée : commande, sortie, identifiant
   d'exécution, SHA. Ce qui n'est pas testé est écrit tel quel. Ne jamais déclarer la mission terminée tant que les
   critères du dossier de validation (§ 8) ne sont pas remplis.
7. **Wiki en français, selon `CLAUDE.md`.** Frontmatter YAML, liens `[[…]]`, contradictions signalées dans un callout
   `> [!warning] Points à trancher / contradictions`, jamais lissées. `log.md` en ajout seulement (préfixe
   `## [AAAA-MM-JJ] type | titre`). `index.md` mis à jour à chaque page créée ou changée. `raw/` jamais modifié.
8. **Règles du code.** Texte visible en français avec accents. Montants jamais lus par `Number()` : utiliser
   `lireMontant`, `lireMontantFacultatif`, `lireDecimal` (`app/src/lib/saisie-montant.ts` ; garde
   `app/tests/lecture-saisies-sans-number.test.ts`). « Aujourd'hui » = le jour de Paris : `aujourdhuiParis()` côté
   application, `public.aujourdhui_paris()` côté base ([[Le jour de référence est le jour de Paris]]).
9. **Git.** Travaille sur ta propre branche, partie de `origin/main`. Ne force jamais sur `main`. Ne réécris pas
   `claude/compassionate-euler-qpqjp6` (branche de Claude ; la PR #196 en part). Messages de commit et de fusion
   factuels : le message de fusion de la PR #182 citait une « exécution n° 8 » qui n'existe pas (`log.md`, 15/10,
   « Vague 2 en production »).

### 1.3 À lire d'abord, dans cet ordre
1. `CLAUDE.md` (racine), puis `app/AGENTS.md` et `app/CLAUDE.md`. Next.js 16 diffère de ce que tu connais : lire
   `app/node_modules/next/dist/docs/` avant toute API incertaine. Là où `app/CLAUDE.md` diverge de ce prompt, ce
   prompt prévaut : les migrations passent uniquement par le chantier « Migrations Supabase » selon le § 6, jamais par
   l'outil MCP `apply_migration` ni par un outil SQL en écriture (le chantier lit les fichiers du dépôt au lieu de les
   recopier dans un outil : `.github/workflows/migrations.yml`, commentaire d'en-tête) ; messages de commit en
   français, comme l'historique de `main` depuis le 1er octobre 2026 (hors messages de fusion automatiques de GitHub).
2. `log.md` : entrées des 14, 15 et 16/10 (chronologie exacte), puis `index.md`.
3. `wiki/syntheses/Décisions groupées — version candidate du 13 octobre 2026.md` : tableau « État au 16/10/2026 »,
   réponses du 15/10, encadré « Points à trancher ».
4. `wiki/syntheses/Dossier de validation — version candidate du 13 octobre 2026.md` : § 5 quater (tableau des
   déploiements), § 6, § 8 (critères de clôture).
5. `wiki/syntheses/Registre des anomalies — audit du 13 octobre 2026.md`.
6. `wiki/syntheses/Prêt à démarcher.md`, `wiki/processus/Relais du dirigeant.md`,
   `wiki/regles-metier/Le jour de référence est le jour de Paris.md`.
7. `app/supabase/templates/LISEZ-MOI.md`, `app/supabase/retours-arriere/LISEZ-MOI.md`,
   `app/docs/sauvegarde-et-restauration.md`, `wiki/syntheses/Référence des tests — commandes, volumes, durées,
   dépendances, limites.md`.

## 2. État de la production au 16/10/2026

### 2.1 En production
`main` = `db0a95f855652250636e6c470bd0fe89ef81e7f7` (PR #195, fusionnée le 16/10 à 09:22:17 UTC) à la rédaction, puis la
PR #196 qui porte ce document (wiki, journal et correctif de deux specs de recette,
`app/e2e/recette-production/admin-agence.spec.ts` et `montants-p1.spec.ts` ; aucune migration, aucun code de
l'application ; ouverte, non fusionnée, à la rédaction).
Source : `git log origin/main`, API GitHub (`pulls/194`, `actions/runs`, statut de commit « Vercel »), `log.md` (entrées
« deploy » et « audit » des 14 à 16/10), Dossier de validation § 5 quater.
Colonnes : PR, SHA de fusion, contenu, migrations, recette de production (« Recette de production avec nettoyage »).

| PR | SHA | Contenu | Migrations | Recette |
|---|---|---|---|---|
| #181 | `d38487a` | Vague 1 : P1 « montant faux », finance, bail et sortie | `20261014100000` à `…123000` | n° 4 (2 tests périmés) |
| #182 | `8c4aed6` | Vague 2 : arrêt d'urgence, supervision, sécurité, données personnelles, sauvegarde de `cron.job` | `20261014200000` à `…233000` | n° 5 : 1 échec (test périmé) |
| #183 | `a471512` | Test de recette et wiki | aucune | n° 6 (38661886020) verte |
| #184 | `fac0105` | Vague 3 : chaîne d'incident, artisan externe, interface, éditorial | `20261014300000` à `…330000` | 38686435654 |
| #185 | `5ff849b` | Vague 4a : X01 (wiki), X02 à X04, X07, X09 à X12, X13 restreint à « Encaisser », X14, X15, X17, X20, X21 ; X16 réduit à l'amendement du wiki (hors vague 4a : X05, X06, X08, X18, X19) | `20261014400000` à `…420000` | 38712773640 |
| #186 | `6b2a130` | Jour de Paris pour les règles de loyer | `20261014500000` à `…504000` | 38720668132 |
| #187 | `8a168dd` | D18 : devis refusable avec motif, puis révisable en versions | `20261014600000` à `…602000` | 38767814840 |
| #188 | `98f3fd7` | D23-A règlement déclaratif (avec X06) ; D22-B report ou annulation par le locataire | `…610000`, `…620000` | 38775647416 |
| #189 | `0c9328a` | Jour de Paris, suite : dépôt, journal, IRL, terme, charges, rapports, « Fait le » | `…820000`, `…821000` | 38802750219 |
| #190 | `f93ec6e` | X16 relances J+3/J+10, X18 recherche par référence, X19 plafond IA, D24-C avoir | `…710000`, `…720000`, `…730000`, `…830000` | 38809953785 |
| #191 | `d55f87b` | D27-B : propriétaire direct sous `/espace/<id>`, 308 depuis `/agence` | aucune | 38818788671 |
| #192 | `a722f94` | D46-B, partie alerte : relais du dirigeant par e-mail | `…810000`, `…811000`, `…812000` | 38854421819 |
| #193 | `bdaf755` | Tests de racine D27-B ; repère juridique de la qualification | aucune | 38858371065 |
| #194 | `f24dfb0` | Invitation d'un artisan par un propriétaire direct (décision du 15/10, point 1, qui remplace D17-B) ; fermeture de la prise de compte par pré-inscription (règle de la « première confirmation ») ; wiki à l'état du 16/10 | `20261014840000` à `…849000` (dix) | 38875612888 (n° 17, verte ; 1 test instable, voir § 2.3) |
| #195 | `db0a95f` | Correctifs du tour final : rétention D48 des registres du relais et de `ia_appels_jour` ; restitution du dépôt au jour de Paris ; écran des arrêts ; chantiers sur `ubuntu-24.04` ; e-mail de 5 h borné sous 60 s ; `.env.example` Stripe ; recette `@montants` des P1 | `20261014850000`, `20261014851000` | 38880135882 (n° 18, verte ; 2 tests réussis au second essai, voir § 2.3) |

Précisions sourcées :
- #192 : 10 tâches `pg_cron` depuis ce déploiement (nouvelle tâche `relais-urgences`, toutes les 10 minutes). Variable
  `GERIMMO_RELAIS_EMAILS` posée **hors dépôt** dans Vercel (production) le 16/10 (`log.md`, 16/10, « deploy »).
- Module « clients externes » de l'artisan **éteint** (décision du 15/10, point 4) : l'outil privé est coupé hors
  `localhost` par le code (`app/src/lib/artisan-prive.ts`). D24-B et D25-B (#184, `fac0105`) et D24-C (#190) sont donc
  déployés mais sans effet en production.
- #194 : simulation 38869684158, CI 38869727484 (verte sur `f8be051`), sauvegarde 38874805980, application réelle
  38875231468, fusion « squash » `f24dfb0` (arbre identique à `f8be051`), statut GitHub « Vercel » = succès à 08:43:28 UTC,
  recette 38875612888 verte, CI de `main` 38875363389 verte (08:53 UTC). Vérifié en lecture seule par Claude après
  application : dix versions, table `invitations_artisans`, `statut_motif` fermé à `authenticated`, 10 tâches `pg_cron`,
  aucune fonction ouverte à `anon` ; aucune ligne `artisan_agences` (carnet) en production avant le déploiement. L'entrée
  « deploy » de #194 est arrivée sur `main` avec la PR #195.
- #195 : relevé de production avant simulation (`finaliser_decompte` 5 et `marquer_decompte_envoye` 2 occurrences de
  `current_date`, sans tenir compte de la casse ; aucune des quatre règles présente), simulation 38875594376, CI
  38875647225 et batterie locale complète vertes sur `625a2c1`, sauvegarde 38875875213, application 38879864823, fusion
  « squash » `db0a95f`, Vercel en succès à 09 h 23 UTC, recette 38880135882. Vérifié en lecture seule après application :
  les deux versions (369 au total), 4 règles de 6 mois actives, 0 `current_date` restant dans les deux fonctions (5 et 2
  jours de Paris), purge `purger_registres_relais_ia()` branchée une fois sur `appliquer_retention()`, 10 tâches
  `pg_cron`, aucune fonction concernée ouverte à `anon`. Entrées `deploy` et `audit` dans `log.md` du 16/10.

### 2.2 En cours de mise en production
- Aucune migration ni aucun code de l'application en cours de mise en production au 16/10, 10 h 00 UTC. Seule la
  PR #196 (ouverte le 16/10 à 10:00 UTC : wiki, journal, correctif de deux specs de recette) attend sa fusion. Les PR
  anciennes #94, #133 et #167, ouvertes et en conflit, ne sont pas en cours de mise en production (§ 5.1, D2). Les
  branches d'intégration `integ-c`, `lot-correctifs-base`,
  `lot-correctifs-app` et `lot-invitation-artisan` sont dépassées par `main` (§ 5.1 D3).
- **Interprétation à faire ratifier** : la migration `20261014851000` (PR #195, en production) applique à la restitution
  du dépôt le point 1 de la décision du 15/10 (jour de Paris). Le tour final en faisait une question au dirigeant ; le
  wiki l'écrit comme une interprétation en attente de ratification (Décisions groupées, réponse (3) ; [[Prêt à
  démarcher]] § 2). Voir Q1.

### 2.3 Éteint, partiel ou jamais vérifié en production
- **Faille de prise de compte par pré-inscription (P13)** : la PR #194 (en production depuis le 16/10, `f24dfb0`) applique
  la règle de la première confirmation aux liens de Gerimmo. Le chemin reste ouvert tant que le dirigeant n'a pas collé
  les trois modèles de courrier et fermé l'inscription publique (§ 5.1, A1 et A3) : un courrier envoyé par Supabase avec
  son lien par défaut (`/recover`, `/resend`, `/otp`) confirme l'adresse sans passer par le bouton de Gerimmo (prouvé sur
  GoTrue réel v2.197.0, scénario n° 11 du 4e tour, notes hors dépôt ; `app/supabase/templates/LISEZ-MOI.md`). Même
  après ces deux gestes, P13 garde des restes : fenêtre d'un aller-retour entre la confirmation et la pose du mot de passe provisoire,
  changement d'adresse (`email_change`), ancien flux `?code=`, métadonnées et acceptation des CGU d'un tiers (T7, Q12).
  Aucune victime au 16/10 : 0 compte non confirmé.
- **Quatre P1 « montant faux »** (D04, D05, D37, D38-A ; fiches VER-TS-02, PR178-B-06, CHF-01, CHF-02) : code en
  production depuis #181 ; **contrôlés pour la première fois en production le 16/10** par la recette n° 18
  (38880135882, `montants-p1.spec.ts`, données éphémères purgées) : les quatre contrôles réussissent, mais **au second
  essai**. Au premier, D04 a reçu « Montant invalide » après la saisie de « 840,00 » (le serveur a reçu un texte vide
  ou illisible ; rien n'est enregistré dans ce cas) et les trois autres ont été sautés. Limites : PDF 2044 non généré,
  chemin confirmé de D38 non joué. Voir T2.
- **Test de recette faux depuis le 15/10, corrigé le 16/10** : « crée la fiche d'un locataire à une adresse
  resend.dev » (admin d'agence, mobile) échouait au premier essai à chaque recette depuis la n° 6 (38661886020, 15/10),
  soit les recettes n° 6 à 18 (« 1 flaky », même expiration de `waitForURL`, dans le journal de job de chacune), et
  « passait » au second par sa branche de reprise, sans vérifier l'ouverture de la fiche. Cause prouvée au banc :
  depuis #170, la création reste sur place (« La fiche est créée ») alors que le test, recâblé par #183, attendait une
  redirection. Test corrigé (commit `72e1e0b` de la PR #196 ; après une fusion « squash », ce SHA n'est pas sur
  `main`) ; la branche de reprise ouvre désormais la fiche depuis la liste (PR #196) ; la recette qui suit la fusion de
  la PR #196 doit le confirmer (T2). Les entrées n° 6 et n° 8 à 16 de `log.md` ne mentionnaient pas l'échec au premier
  essai, pas plus que la mention de la n° 7 (38686435654) dans l'entrée « Vague 3 en production ».
- **D18-A partiel** : pas d'alerte au gérant quand l'artisan devient non affectable pendant la révision ; pas de PDF par
  version (Décisions groupées, ligne D18).
- **D22-B partiel** : pas de relance de l'artisan avant l'échéance de 48 h ; pas de geste « J'en prends acte » ; pas de
  badge dans l'agenda de l'artisan (ligne D22).
- **D46-B partiel** : seule la partie alerte est livrée. Une « urgence » n'est qu'une alerte interne du mode vacances ;
  les incidents urgents des clients n'alimentent pas le relais ([[Relais du dirigeant]]).
- **Non livrés** : D08-C (traversée en lecture seule), D36-C (pièce « décompte » du locataire, reportée), X08
  (cohérence des loyers de référence), D32 (textes légaux, identité de l'éditeur absente), D45-B (logo allégé).
- **Soumis à un avis** : D02-B, D03-B, D35 (2)-B, D38-B, D40-B, D41, D49 (2). **Reporté par sa recommandation** : X05.
- **Essais jamais faits** : restauration d'une sauvegarde réelle (D07, D43), politique de stockage sur le vrai service
  (D11, D16), dépôt de 6 Mo (D12).
- **Jamais vu en production** : un e-mail du relais (aucun le 16/10, le relais n'était pas en ligne à 5 h) ; une relance
  X16 ; un appel IA compté par X19 (`ia_appels_jour` vide au relevé du 16/10 vers 06 h 40 UTC).
- **Conseils « choisir son locataire »** affichés au propriétaire depuis #182, alors que leur page source est un brouillon
  non relu sur les sources primaires (Décisions groupées ; [[Prêt à démarcher]] § 3).
- **Signature électronique** : coupée tant que `YOUTRUST_ENV` ≠ `production` (`app/src/lib/sante-service.ts`).
- **Données réelles** (relevé en lecture seule du 16/10 vers 06 h 40 UTC, tour final) : 6 comptes, 0 non confirmé,
  2 organisations (propriétaires directs), 7 baux tous en brouillon ; aucun appel de loyer, encaissement, devis,
  créneau ni invitation de locataire. Les relevés conditionnels D01-B et D21-C donnent 0 : options sans objet. Aucune
  ligne `artisan_agences` (carnet d'artisans) avant le déploiement de #194 (`log.md`, entrée « deploy » de #194).
- **Automatismes** : 13 entrées Vercel (`app/vercel.json`) ; 10 tâches `pg_cron`, dont 9 sous l'arrêt d'urgence et
  `relais-urgences` hors arrêt à dessein (`app/docs/sauvegarde-et-restauration.md`).

## 3. Environnement et outils

### 3.1 Dépôt et commandes (dans `app/`)
- `npm ci`, puis `npm run lint`, `npx next typegen` puis `npm run typecheck`, `npm run build`.
- `npm test` (Vitest ; variables `SUPABASE_DB_URL` et `SUPALOCAL_DB` vers une base jetable).
- `npm run test:e2e` (Playwright, `e2e/playwright.config.ts`, Chromium). Audits d'écran à 768 et 1440 px
  (`e2e/audit-ecrans.spec.ts`).
- Migrations : `app/supabase/migrations/` ; ordre unique : `app/e2e/local/ordre-migrations.txt` ; retours arrière :
  `app/supabase/retours-arriere/` et son `LISEZ-MOI.md` (ordre complet des retours).

### 3.2 Banc local (aucun effet réel)
- Postgres local (16 sur le banc de Claude, 18 en CI). Base jetable :
  `SUPABASE_DB_URL=postgres://…/gerimmo_ci_<nom> node e2e/local/preparer-ci.mjs` (crée aussi `gerimmo_ci_<nom>_api` ;
  372 migrations sur `main` à `db0a95f`).
- **Ne compare jamais les décomptes.** `app/supabase/migrations/` compte 372 fichiers à `db0a95f`, contre 369 versions
  enregistrées en production après la PR #195 (367 avant le lot : journal du chantier 38879864823). Les deux listes ne
  se correspondent pas une à une. Des fichiers ont été renommés et leurs horodatages ne sont plus ceux de la base
  (en-tête de `migrations.yml` ; exemple du 11/09 : `20260911124500_restitution_rearrete…` est enregistrée sous
  `20260911014814`). De plus, 69 fichiers de fin juillet à mi-août portent une date sans heure, et 68 d'entre eux se
  partagent 9 préfixes : on compte 313 préfixes distincts pour 372 fichiers. La cause exacte de l'écart de 3 n'est pas
  vérifiée : ni le dépôt ni `log.md` ne l'établissent. Ne « rattrape » jamais une migration d'après ce décompte ou
  d'après une version absente de `schema_migrations`. La garde du chantier refuse une version déjà enregistrée, pas un
  fichier renommé : celui-ci serait rejoué. Une migration ne se dit manquante qu'après un relevé en lecture seule de ses
  objets en production (§ 6, étape 2).
- Émulateur de l'API Supabase : `e2e/local/serveur-supabase-local.mjs`. Serveur : `next start` sur un port libre.
- Les scripts de batterie de Claude et ses bancs GoTrue vivaient hors du dépôt : considère-les perdus.
  La CI (chantier « CI ») est la porte de validation commune.

### 3.3 Chantiers GitHub Actions (`.github/workflows/`)
- « CI » (`ci.yml`) : sur push vers `main`, sur toute pull request et à la demande. Lint, build, types, tests, parcours
  navigateur. Le reporter `github` de Playwright annote les échecs (`E2E_CI`) : lire les annotations du job par l'API.
- « Migrations Supabase » (`migrations.yml`) : à la demande, sur la branche de la PR. Entrées `fichiers` (noms séparés
  par des espaces, dans l'ordre) et `simulation` (vrai : tout est annulé à la fin). Tout le lot dans UNE transaction.
  Refuse une version déjà enregistrée.
- « Sauvegarde quotidienne » (`sauvegarde.yml`) : planifiée et à la demande sur `main`. Chiffrée, vers Scaleway,
  `cron.job` comprise.
- « Recette de production avec nettoyage » (`recette-production-autonome.yml`) : **sur `main` seulement**. Crée des
  comptes éphémères en production, parcourt les espaces, puis purge. C'est la seule recette qui a la connexion à la base
  (variables `PG*`) : la seule qui joue `montants-p1.spec.ts`, donc la seule qui peut refermer les P1.
- « Recette de production » (`recette-production.yml`) : manuelle. Comptes préparés à la main par
  `app/e2e/recette-production/preparer-comptes.sql`, adresses et **mot de passe passés en entrées `workflow_dispatch`**,
  lisibles par qui lit les exécutions de ce dépôt public (en-tête du fichier, l. 25-31). Sans connexion à la base :
  `montants-p1.spec.ts` y est sauté. Ne jamais l'utiliser pour un compte à privilèges.
- « Vérifier la restauration de la sauvegarde réelle » (`restauration-sauvegarde.yml`) : **à ne pas lancer sans
  autorisation** (copie réelle, § 5.2 Q6). Dernière exécution le 13/10, avant D07 (tour final).
- Autres : `stripe-bac-a-sable.yml` (refuse une clé réelle) ; `atelier-code.yml` (sur `main`, réglé par
  `GERIMMO_CODEX_ENABLED`) et `publication-controlee.yml` (réglé par `GERIMMO_RELEASE_ENABLED`) ;
  `connexions-atelier.yml` (à la demande, **sans** garde de variable : il appelle des services extérieurs avec les
  secrets de l'atelier). Ne lancer ni activer aucun des trois sans le dirigeant.

### 3.4 Horaires réels (relevés du tour final, 16/10)
- Les tâches Vercel partent à un décalage fixe après l'heure de `vercel.json` (10 jours observés) : signatures +15 min,
  purge +5, abonnements +30, territoire +58, rappels +46, quittances +32, appels +58, relances +56, veille +11,
  marketing +36 au moins. Le décalage des deux entrées du relais est encore inconnu.
- Conséquence : les relances X16 partent vers 07 h 46 (hiver) ou 08 h 46 (été), heure de Paris ; l'e-mail « de 5 h »
  arrivera à 5 h et quelques minutes. S'il arrive après 6 h à Paris, rien ne part ce jour-là ([[Relais du dirigeant]]).
- La sauvegarde, planifiée à 01 h 20 UTC, part en réalité entre 05 h 56 et 07 h 49 UTC (20 passages du 27/09 au 16/10 ;
  échec le 05/10). La page [[Plan de reprise d'activité]] le dit déjà (encadré « Horaire réel », entré avec #194) ; le
  commentaire « 03:20 à Paris » de `sauvegarde.yml` (l. 50) ne donne que l'heure planifiée et reste à corriger (T13).

### 3.5 Pièges connus
- **Lien parasite `node_modules/node_modules`** : recréé deux fois par un agent, il fait échouer `next build`
  (`log.md`, 15/10, vague 3 et #189). Le chercher et le retirer avant chaque batterie. N'en crée jamais.
- **Worktree git** : un `node_modules` en lien symbolique vers un autre dossier fait échouer Turbopack (« Symlink
  node_modules is invalid »). Construire depuis le dépôt principal, ou `next build --webpack`.
- **Dossier `.next/dev` périmé** : a fait échouer une batterie de la vague 4a (`log.md`, 15/10). Le supprimer avant.
- **Tests sensibles à l'heure** : entre 22 h et minuit UTC (après le 25/10 : entre 23 h et minuit UTC), le jour de Paris
  a déjà changé. 30 essais ont échoué ainsi (CI 38814554637), corrigés dans #191. 172 fichiers de test lisent l'horloge
  réelle sans la figer (tour final). Un échec dans cette plage n'est pas forcément une régression : le prouver.
- **Captures de Chromium sous forte charge** : l'audit à 1440 px a échoué une fois puis réussi seul (`log.md`, #189).
  `personne-reprise.spec.ts` est instable sous charge. Rejouer seul avant de conclure.
- **Tests en série** : certains fichiers ne tournent pas en parallèle (liste dans `app/vitest.config.ts`).
- **Reprise de workflow** : le conteneur de Claude s'est arrêté de 23 h 10 à 05 h 00 UTC dans la nuit du 15 au 16/10
  (`log.md`, #192) : aucun e-mail de 5 h n'est parti le 16/10.
  Après une coupure, repars de l'état réel (git, GitHub Actions, base), jamais de mémoire. Un chantier interrompu se
  relance par un nouveau déclenchement ; vérifie d'abord ce qu'il a écrit (`migrations.yml` est transactionnel).
- **Doublures d'Auth** : les doublures des tests (`app/tests/lien-mot-de-passe.test.ts`, émulateur local) ne reflètent
  pas GoTrue (expiration des jetons non modélisée, métadonnées ajoutées à la confirmation, etc. : relecture du 4e tour).
  **Tout parcours d'inscription, de confirmation, de mot de passe ou d'invitation s'éprouve sur un GoTrue réel**
  (Claude a utilisé la version v2.197.0, base jetable, puits SMTP local, `GOTRUE_DISABLE_SIGNUP` vrai puis faux)
  **ou sur une branche Supabase** (accord du dirigeant : elle peut être facturée).
- **Production ≠ rejeu du manifeste** : des fonctions de production n'ont pas la mise en forme du dépôt (vague 2,
  ancres sur une ligne ; lot fuseau, forme X13). D'où le relevé en lecture seule avant toute simulation (§ 6).

### 3.6 Accès
- Claude lisait la production par un outil Supabase (SQL en lecture), un outil Vercel (déploiements, erreurs,
  **noms** de variables) et l'API GitHub. Il n'avait accès ni à `gerimmo.app` en direct, ni aux sites officiels
  français (moteur de recherche seulement). `GET /auth/v1/settings` a été refusé par son mandataire réseau.
- Si tu as ces accès, plusieurs vérifications du § 4 deviennent faisables. Sinon, écris ce que tu n'as pas pu vérifier.
- La console `/admin` (dont `/admin/sante` et `/admin/relais`) exige une session de super-administrateur avec second
  facteur : tu n'en as pas. Ce qui ne se lit qu'à l'écran, c'est le dirigeant qui le lit, ou il te fournit un accès
  nommé.

## 4. Tâches restantes pour Codex, par priorité

Chaque tâche : ce qu'il faut faire, les fichiers, le critère de réussite. Toute livraison suit le § 6.

### Priorité 0 — finir les mises en production en cours et surveiller

**T1. PR #194 (invitation d'artisan, première confirmation) : clore après la mise en production.**
- Fait (§ 2.1) : sauvegarde, simulation, application, fusion `f24dfb0`, Vercel, recette 38875612888 verte, vérification en
  lecture seule. L'inventaire des carnets recommandé par le tour final est fait : aucune ligne `artisan_agences` en
  production avant le déploiement, donc aucun artisan au carnet sans consentement (rien à marquer, désactiver ni
  supprimer).
- Reste :
  1. Fait : l'entrée « audit » de la recette n° 17 (38875612888) est au journal du 16/10.
  2. Relire en lecture seule (`pg_get_functiondef`) les fonctions que les migrations réécrivent par ancre, et vérifier
     que chacune porte le texte de sa dernière migration : `artisan_definir_metiers_zones` (`…841000`),
     `artisan_blacklist_locale` (`…843000` puis `…849000`), `limiter_envoi_invitation_artisan` (`…844000`),
     `preparer_invitation_artisan` (`…845000`), `repondre_invitation_artisan` (`…845000` puis `…849000`),
     `refuser_ecriture_si_fermee` (`…846000`), `artisan_lever_blacklist_locale` et `artisan_statut_local` (`…849000`).
     Consigner le relevé.
  3. Présenter au dirigeant les gestes A1 et A3 du § 5.1.
  4. Vérifier le lien des modèles collés. Ce n'est pas faisable en lecture seule : un renvoi de confirmation suppose un
     compte non confirmé en production et un appel `/resend`, donc une écriture ; les boîtes `resend.dev` jettent le
     courrier, et le lire par l'API Resend demande une clé secrète. Deux voies : **le dirigeant**, sur son propre
     compte, fait envoyer par Supabase un lien de récupération ou de connexion (par exemple *Authentication → Users*,
     libellé à confirmer), ne le clique pas et relève seulement son adresse : cela prouve `recovery.html` et
     `magic_link.html` ; pour `confirmation.html`, qui ne part que vers un compte non confirmé, il relit le modèle collé
     dans le tableau de bord ; **ou** une spec de recette éphémère, avec son accord écrit, par le protocole du § 6.
     Attendu : un lien vers `https://www.gerimmo.app/auth/confirm?token_hash=…`.
  5. Puis relancer « Recette de production avec nettoyage » (`inscription-recuperation.spec.ts`).
  6. Fait par la PR #196 : page [[Invitation d'un artisan par un propriétaire]] créée (brouillon, relue à
     trois angles), pages qui la disaient « en cours, non livrée » corrigées. À tenir à jour (T15).
- Fichiers : migrations `20261014840000` à `…849000`, `app/src/lib/lien-mot-de-passe.ts`,
  `app/src/app/auth/confirm/route.ts`, `app/supabase/templates/`, `app/e2e/invitation-artisan.spec.ts`.
- Critère : relevé des fonctions consigné, modèles collés et lien vérifié, recette verte après les réglages, entrées
  `log.md`.

**T2. Recette : confirmer le correctif du test et élucider D04.** Fait avant toi (§ 2.1, § 2.3, `log.md` du 16/10,
entrée « Échecs au premier essai de la recette ») : PR #195 appliquée, fusionnée, recettée ; registre, Décisions
groupées et [[Prêt à démarcher]] à jour avec la recette n° 18 ; « Créer la fiche » diagnostiqué (défaut du test) et
corrigé (commit `72e1e0b`, PR #196 ; branche de reprise corrigée dans la même PR) ; D04 non reproduit en 20 essais au
banc, test rendu diagnosticable (saisie dès que le champ est là, comme au premier essai en échec, puis lecture du champ
après l'activation d'« Encaisser » et avant l'envoi ; annotation « saisie avant / après hydratation »).
- Vérifier, sur la ou les recettes jouées sur `main` après la fusion de la PR #196 (son SHA de fusion sur `main`, lu
  par `gh api repos/GERIMMO/GERIMMO_V4/pulls/196` ; `72e1e0b` n'est pas sur `main` après une fusion « squash »), que
  « Créer la fiche » et D04 passent **au premier essai** (journal du job : aucune ligne « flaky »). Consigner au
  journal.
- Télécharger l'artefact `recette-production-38880135882` (traces du premier essai de D04, **conservé jusqu'au
  30/10/2026** ; l'environnement de Claude n'a pas pu le télécharger) : instantané DOM de `#enc-montant` au clic,
  console (#418, #421, #423), corps de la requête de l'action.
- Si D04 échoue de nouveau avec le test corrigé : `toHaveValue("840,00")` dira si la saisie est perdue dans le
  navigateur (alors corriger le composant `app/src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx`, test rouge
  puis vert, § 6) ou si le serveur refuse une valeur intacte (alors `lireMontant`, `app/src/lib/saisie-montant.ts`).
- Fermeture des quatre P1 au registre : à faire trancher par le dirigeant (contrôlés au second essai, limites :
  PDF 2044 non généré, chemin confirmé de D38 non joué).
- Critère : trois recettes de suite sans test instable, ou cause de D04 écrite au journal avec la preuve.

**T3. Calendrier de surveillance (lecture seule).** Consigner chaque constat dans `log.md`.
- **17/10, après 04 h 30 UTC** : premier e-mail de 5 h. Attendu : `envoye` ou `rien_a_signaler`, 2 destinataires.
  Relever l'heure réelle (`commence_le`). Si `non_configure` : le dirigeant pose `GERIMMO_RELAIS_EMAILS` (Vercel,
  Production), puis redéploie (§ 5.1, C5).
  ```sql
  select jour, statut, tentatives, destinataires, envoyes, points, commence_le, termine_le
  from public.relais_alertes_envois order by jour desc limit 3;
  ```
- **Chaque jour** : `pg_cron` sans échec, passage fréquent du relais reçu, comptes non confirmés (0 au 16/10).
  ```sql
  select j.jobname,
    count(d.*) filter (where d.start_time > now() - interval '24 hours') as passages,
    count(d.*) filter (where d.start_time > now() - interval '24 hours' and d.status <> 'succeeded') as echecs
  from cron.job j left join cron.job_run_details d on d.jobid = j.jobid group by 1 order by 1;
  select dernier_appel_le, dernier_passage_le from public.declencheur_relais_urgences;
  select count(*) from auth.users where email_confirmed_at is null;
  ```
- **16/10 et jours suivants** : X19 enfin exercé. Attendu : une ligne par jour avec des appels dans `ia_appels_jour`.
  Cette table n'a que `jour`, `appels` et `refus`, et `refus` ne compte que la limite atteinte : un refus
  « indisponible » n'y est jamais écrit (migration `20261014730000`, l. 58-62 ; `app/src/lib/plafond-ia.ts`, l. 48-75).
  Pour s'assurer qu'aucun appel n'a été refusé ainsi, lire le bilan des passages des missions `marketing` et `veille`
  (`agent_passages`, colonnes `etat` et `bilan`) et les journaux Vercel (message « Le contrôle des appels à l'IA est
  indisponible »). Lire aussi le bilan de la mission `veille` (« à reprendre » les 13 et 15/10, non expliqué).
  ```sql
  select * from public.ia_appels_jour order by jour desc limit 3;
  select mission, debut, etat, bilan from public.agent_passages
  where mission in ('marketing', 'veille') order by debut desc limit 10;
  ```
- **18/10 et après, vers 06 h 46 UTC** : une relance X16 n'est possible que pour une invitation envoyée après le 15/10 à
  21 h 25 UTC. Au 16/10, il n'y en a aucune.
- **19/10 et après** : `ubuntu-latest` commence à migrer vers Ubuntu 26 (annotation GitHub du 16/10, présente
  notamment sur l'application 38879864823). CI, sauvegarde et restauration sont figés sur `ubuntu-24.04` par la
  PR #195 : non concernés. Restent sur `ubuntu-latest` : `migrations.yml` (installe `postgresql-client` par apt puis
  écrit en production par `psql`), `publication-controlee.yml` (publication en production), `recette-production*.yml`,
  `stripe-bac-a-sable.yml` et les chantiers de l'atelier (`atelier-code.yml`, `connexions-atelier.yml`). Après le
  19/10, faire une simulation (`simulation` = vrai) avant toute application réelle de migration, et surveiller la
  première recette et la première publication contrôlée ; ou figer `migrations.yml` sur `ubuntu-24.04` par PR. Autre
  annotation du même jour : Node.js 20 est déprécié pour `actions/checkout@v4`, `actions/setup-node@v4` et
  `actions/upload-artifact@v4` (déjà forcées sous Node.js 24 ; annotation de la CI 38879993866) ; vérifier aussi
  `actions/download-artifact@v4` (`atelier-code.yml`) et les versions v4 épinglées par SHA de
  `publication-controlee.yml` ; mettre à jour par PR, avant que GitHub ne l'impose.
- **25/10 et 26/10** (changement d'heure) : le relais bascule sur l'entrée de 04 h UTC. Une ligne par jour de Paris
  dans `relais_alertes_envois`, terminée.
- **31/10 vers 23 h 30 UTC** : lancer la CI à la main (le mois de Paris a déjà changé). Voir T13.
- **01/11** : premier cycle mensuel des appels de loyer après les lots du jour de Paris.
- **Vers le 26/11** : jeton `META_ADS_ACCESS_TOKEN` à renouveler. **Avant le 24/12** : `VERCEL_TOKEN` et
  `GITHUB_AGENT_TOKEN` (commentaires des variables Vercel, tour final). **Septembre 2027** : clé d'API Scaleway de la
  sauvegarde (`log.md`, 25/09/2026, « Sauvegardes armées »). Prévenir le dirigeant 15 jours avant chaque échéance.

**T4. Journal : relevés du tour final.** Fait : `log.md`, entrée « audit » du 16/10 « Relevés de production en lecture
seule du tour final de vérification ». Les rejouer en lecture seule à ta reprise et consigner ce qui a changé (comptes,
`ia_appels_jour`, passages du relais, avis de sécurité).

### Priorité 1 — preuves et sécurité avant le démarchage

**T5. La recette fait entrer un artisan et un super-administrateur.**
- Aujourd'hui, la recette n'a aucun compte artisan ni super-administrateur : l'espace artisan et `/admin` ne sont
  jamais parcourus (tour final). Côté artisan, seule `/artisan/inscription` est visitée.
- Ajouter dans `app/e2e/recette-production/preparer-comptes.sql` un artisan éphémère et un super-administrateur de
  recette (second facteur compris, ou parcours en lecture seule), purgés par `purger.sql`. Specs : espace artisan
  (devis, agenda, factures) ; `/admin/relais`, `/admin/sante`, recherche par référence (X18).
- **Le super-administrateur éphémère est un compte à privilèges créé en production** : accord écrit du dirigeant avant
  tout passage, et contre-relecture de sécurité du lot (création, droits, second facteur, purge garantie même en cas
  d'échec). Uniquement par « Recette de production avec nettoyage » (`recette-production-autonome.yml`), jamais par le
  chantier manuel, qui fait passer le mot de passe par les entrées `workflow_dispatch`, lisibles dans ce dépôt public
  (`recette-production.yml`, l. 25-31). L'artisan éphémère suit le même chemin.
- Fichiers : `app/e2e/recette-production/` (`preparer-comptes.sql`, y compris son `select` final qui publie les
  adresses ; `purger.sql` ; `cible.ts`, dont le type `Persona` et `lireComptes()`, qui ne lisent aujourd'hui que
  `RECETTE_EMAIL_ADMIN`, `_PROPRIETAIRE` et `_LOCATAIRE` ; `playwright.config.ts` ; nouveaux `*.spec.ts`),
  `app/scripts/recette-production-comptes.mjs`, `.github/workflows/recette-production-autonome.yml`. Le chantier ne
  lance pas le SQL directement : l'étape « Préparer uniquement les trois comptes du passage » (l. 36-44) et l'étape de
  nettoyage (l. 63) passent par `node scripts/recette-production-comptes.mjs preparer|purger`. Ce script ne publie
  dans `GITHUB_ENV` que les clés de sa table `noms` (trois adresses, deux organisations). Il doit exporter aussi les
  adresses de l'artisan et du super-administrateur (par exemple `RECETTE_EMAIL_ARTISAN`, `RECETTE_EMAIL_SUPERADMIN`),
  avec le même contrôle `-<suffixe>@resend.dev`, puis `verifierEmail` dans `cible.ts`. Adapter le message « Trois
  comptes de recette préparés » et le libellé de l'étape du chantier. Ce script est aussi le point à durcir et à faire
  contre-relire pour le compte à privilèges.
- Critère : accord écrit cité, contre-relecture de sécurité sans constat bloquant, exécution verte sur `main`, aucun envoi
  réel (domaine `resend.dev`), bilan de purge à 0 (aucun compte de recette restant, super-administrateur compris).

**T6. Parcours navigateur complets de D18, D22-B, D23-A et de l'invitation d'artisan.**
- Le journal les renvoie à une « préproduction » qui n'existe pas (`log.md`, #187, #188).
- Parcours attendus : refus motivé d'un devis puis nouvelle version par l'artisan (D18) ; report demandé par le
  locataire puis accepté par l'artisan, et annulation (D22-B) ; règlement noté par le gérant et vu par l'artisan
  (D23-A) ; invitation, inscription de l'artisan, validation par Gerimmo, sollicitation (invitation d'artisan).
- Où : dans la recette à comptes éphémères (après T5), ou sur une préproduction réelle (déploiement de prévisualisation
  Vercel + branche Supabase : accord du dirigeant). Pour l'invitation : GoTrue réel obligatoire (§ 3.5).
- Fichiers : `app/e2e/` (`devis-reprise.spec.ts`, `parcours-artisan.spec.ts`, `parcours-locataire.spec.ts`,
  `invitation-artisan.spec.ts`), `app/e2e/recette-production/`.
- Critère : chaque parcours joué de bout en bout, identifiant d'exécution cité, données retirées.

**T7. Restes de sécurité de l'authentification (après la PR #194).** Tous « à vérifier » ou « mineurs » au 4e tour.
Éprouver chacun sur GoTrue réel avant de corriger.
- Durcissement de la confirmation des liens (`/auth/confirm`) : consigne détaillée transmise hors dépôt ; à traiter en
  premier dans T7.
- Changement d'adresse (`email_change`) hors de la règle de la première confirmation.
- Ancien flux `?code=` (PKCE, liens d'avant le 30/09) : `/auth/confirm` l'accepte encore, sans la règle de la première
  confirmation (la vérification a déjà eu lieu chez Supabase).
- Inscription : un cas de réponse différenciée à éprouver (détail transmis hors dépôt).
- Règle de la première confirmation : un cas limite du type de lien `email` à éprouver (détail transmis hors dépôt).
- Artisan invité qui a déjà un compte confirmé : le courrier « Vous avez déjà un compte » perd l'invitation.
- Deux inscriptions strictement simultanées : « Inscription impossible : {} » (scénario 5b du 4e tour, notes hors
  dépôt ; sans effet de sécurité).
- Métadonnées et acceptation des CGU d'un tiers gardées après la première confirmation : attendre la réponse du
  dirigeant (§ 5.2, Q12).
- Fenêtre d'un aller-retour entre la confirmation et la pose du mot de passe provisoire : le jeton d'accès d'une session
  ouverte dans cet intervalle reste valable jusqu'à son échéance. La mesurer sur GoTrue réel ; présenter au dirigeant
  l'option d'une durée de jeton d'accès plus courte (réglage d'Auth du projet) ou d'un mécanisme en base (Q12). Ne rien
  régler toi-même.
- Connexions anonymes : faire relever par le dirigeant si elles sont activées en production (§ 5.1, A5).
- Doublures (`authSimulee`, `app/tests/lien-mot-de-passe.test.ts`) : quatre écarts avec GoTrue relevés au 4e tour, à
  aligner : expiration des liens (24 h) non modélisée ; `email_verified: true` ajouté aux métadonnées par la
  confirmation ; politique de mot de passe d'Auth non modélisée ; type `email`
  qui cherche aussi le jeton de confirmation.
- Fichiers : `app/src/lib/lien-mot-de-passe.ts`, `app/src/app/auth/confirm/route.ts`, `app/src/app/actions/auth.ts`,
  `app/src/proxy.ts`, `app/tests/lien-mot-de-passe.test.ts`.
- Critère : un test rouge puis vert par point, preuve GoTrue réel jointe, relecture de sécurité indépendante.

### Priorité 2 — parties ratifiées non livrées

**T8. D18-A : les deux manques** (ratifié le 14/10 ; Décisions groupées, ligne D18).
- (A.7) Alerte au gérant quand l'artisan devient non affectable pendant la révision (au refus de dépôt d'une version).
- (A.9) PDF par version : `/api/devis/[sollicitationId]/pdf` ne sert que la dernière ; côté artisan, les anciennes
  versions ne se lisent qu'en texte.
- Fichiers : `app/src/app/api/devis/[sollicitationId]/pdf/route.ts`, `app/src/lib/devis-pdf-stockage.ts`,
  `app/src/lib/parcours-devis-serveur.ts`, `app/src/lib/parcours-devis-artisan.ts`, référence
  `app/supabase/migrations/20261014601000_devis_revision_versions.sql`.
- Critère : tests rouge puis vert ; l'alerte part une fois (idempotente) ; chaque version a son PDF, droits respectés.

**T9. D22-B : les trois manques** (ligne D22).
- Relance de l'artisan avant l'échéance de 48 h, dans la mission « rappels » (clé d'arrêt `rappels`, clé
  d'idempotence). Geste « J'en prends acte » sur une annulation (non bloquant). Badge dans l'agenda de l'artisan.
- Fichiers : `app/src/lib/missions-planifiees/rappels.ts`, `app/src/lib/rendez-vous-locataire.ts`,
  `app/src/app/artisan/agenda/page.tsx`, référence `app/supabase/migrations/20261014620000_rendez_vous_locataire_report_annulation.sql`.
- Critère : une relance au plus par demande, coupée par l'arrêt « rappels » ; geste et badge testés.

**T10. D08-C : traversée du super-administrateur en lecture seule** (« A tout de suite, puis C », ratifié le 14/10 ;
A livré dans #182, C ni planifiée ni abandonnée).
- Lecture seule pendant la traversée d'un espace client ; toute écriture passe par un geste de support distinct,
  motivé et borné. Le constat d'origine (SA-01) : un encaissement de 10 € écrit sans auteur ni motif.
- Estimation de la fiche : 3 à 5 jours ; migration qui change des droits. Protocole complet, relecture de sécurité.
- Fichiers : `app/src/lib/traversee.ts`, `app/src/lib/entetes-traversee.ts`, `app/src/proxy.ts`, référence
  `app/supabase/migrations/20261014220000_traversee_trace_precise.sql`, fonctions financières concernées.
- Critère : toute écriture en traversée refusée par la base (test), geste de support tracé (auteur, motif, durée),
  aucune régression de la console. À défaut : faire acter par écrit que le dirigeant renonce à C.

**T11. X08 : cohérence loyer, loyer de référence et loyer majoré** (fiche PROP-16 ; ratifié, jamais réalisé).
- D'abord la source : la règle d'encadrement des loyers n'a jamais été lue (fiche X08). La trouver sur Légifrance,
  créer une page `wiki/regles-metier/` avec URL et date. Puis seulement l'avertissement non bloquant prévu.
- Fichiers : `app/src/app/actions/baux.ts`, `app/src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx`,
  `app/src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/page.tsx`.
- Critère : page de règle sourcée, avertissement testé, aucun blocage de saisie.

### Priorité 3 — robustesse et rangement

**T12. Relais : robustesse et rangement** (ce qui reste après la PR #195).
- La sentinelle ne filtre pas les tâches désactivées : une tâche coupée exprès serait annoncée « absente » chaque jour.
- Purger `cron.job_run_details` : environ 144 lignes de plus par jour pour `relais-urgences`, 180 pour le marketing.
- Décompter le temps de `prendre_urgences_relais` dans le délai d'un tour (sinon l'e-mail de 5 h peut tomber à son
  plancher d'une seconde sur une base lente ; constat du lot `correctifs-app`, à revérifier dans
  `envoyerUrgencesRelais`, `app/src/lib/relais-urgences-envoi.ts`).
- Les purges à 6 mois codées en dur dans `reserver_alerte_relais` et `prendre_urgences_relais` ignorent le catalogue
  `retention_rules` : les y rattacher.
- Si l'e-mail de 5 h arrive avec plus de 50 min de décalage (T3, 17/10) : le programmer à 02 h 30 et 03 h 30 UTC, ou le
  passer sur `pg_cron`.
- Signaler chaque choix au dirigeant dans le compte rendu. Fichiers : `app/src/lib/relais-alerte-envoi.ts`,
  `app/src/lib/relais-urgences-envoi.ts`, `app/src/app/api/cron/relais/route.ts`, `app/vercel.json`, migrations
  `20261014810000` à `…812000` en référence.
- Critère : tests rouge puis vert ; passage du relais sous 60 s même sur base lente ; registres purgés par le catalogue.

**T13. Petites corrections** (tour final, « sans décision du dirigeant »).
- X19 : un refus « limite atteinte » consomme à tort l'un des deux essais de visuel d'un post (`app/src/lib/plafond-ia.ts`
  et la mission marketing).
- X16 : le temps des relances (60 s) ignore les 180 s de la route ; donner une échéance absolue
  (`app/src/lib/relances-invitations.ts`, `app/src/lib/missions-planifiees/rappels.ts`).
- D27-B : une panne de lecture du type d'organisation affiche « introuvable » sur toutes les pages `/espace`
  (`app/src/proxy.ts`). Réécrire quand même vers `/agence` (la garde de page et la RLS restent les portes) ou servir
  une page réessayable. Acter dans le journal l'ajout de `espace` à `SEGMENTS_CONNUS`.
- D27-B côté agence : vérifier dans le navigateur qu'aucun lien `/espace/` n'apparaît sur la fiche du bail, Incidents,
  Loyers, Alertes, Documents (aujourd'hui seul `/parc` l'est ; `app/e2e/alias-espace.spec.ts`).
- Renommer la clé d'arrêt « Rendez-vous et suivi des dossiers », qui coupe aussi les relances X16
  (`app/src/lib/missions.ts`, `app/src/lib/nom-arret-supervision.ts`).
- Commentaire d'en-tête de `app/src/lib/stripe.ts` (« trois variables ») : périmé.
- Heure de la sauvegarde : corriger le commentaire de `.github/workflows/sauvegarde.yml` (l. 50, « 03:20 à Paris »,
  encore présent dans la PR #195) : « planifiée à 01 h 20 UTC, départ réel observé entre 06 h et 08 h UTC ». La page
  [[Plan de reprise d'activité]] donne déjà l'horaire réel (encadré « Horaire réel », #194) : n'y toucher que pour
  l'actualiser. Garder le seuil d'alerte de 26 h.
- Tests sensibles à l'heure : lancer la CI à la main un soir entre 22 h et minuit UTC (23 h et minuit après le 25/10),
  et le 31/10 vers 23 h 30 UTC. Corriger au cas par cas. Candidats non prouvés : bords de mois en UTC
  (`encaissement-compte-rendu.test.ts`, `quittances-suivent-encaissements.test.ts`), jour UTC par défaut
  (`mentions-bail-actif.test.ts`, `contrats-individuels.test.ts`).
- Critère par point : test rouge puis vert, ou constat daté au journal.

**T14. Dette notée, sans correction sans relecture ciblée** (avis de sécurité Supabase du 16/10).
- `pg_net` installé dans le schéma `public` (déplacement à étudier sans casser les déclencheurs marketing et relais).
- 335 fonctions `security definer` exécutables par `authenticated` (conception du projet : fonctions gardées).
- 9 tables à RLS sans politique, dont `declencheur_relais_urgences` (voulu).
- X01 : déclencheur d'audit générique, prévu « plus tard » par sa recommandation. D45-B : produire la comparaison
  visuelle avant/après (WebP ou AVIF) et la soumettre au dirigeant.

**T15. Wiki à tenir après chaque livraison.**
- Décisions groupées (colonne « État »), Registre des anomalies, Dossier de validation (§ 5 quater, § 8),
  [[Prêt à démarcher]], [[Relais du dirigeant]], personas et processus touchés. Ne décrire comme livré que ce qui est en
  production, avec PR et SHA.
- Fait par la PR #196 (vérifie-le, ne le refais pas) : invitation d'artisan décrite comme livrée partout
  (page [[Invitation d'un artisan par un propriétaire]] créée, index, [[Ouverture du réseau d'artisans]],
  Décisions groupées, [[Prêt à démarcher]], personas [[Artisan]] et [[Propriétaire bailleur]] ; Accueil : seule la
  phrase sur le carnet personnel et la zone d'intervention a changé) ; état après #195 (P1 contrôlés au second essai,
  rétention D48, restitution au jour de Paris écrite comme interprétation à ratifier, relais borné) ; diagnostic de la
  recette.
- Si la PR #196 n'est pas fusionnée à ta reprise, les « Fait par la PR #196 » ne sont pas encore sur `main` :
  vérifie-les dans la PR (branche `claude/compassionate-euler-qpqjp6`). Ne la fusionne pas sans un accord écrit du
  dirigeant qui nomme son commit de tête (lu par l'API, champ `head.sha`) (§ 1.2, règle 4).
- À chaque réponse du dirigeant (§ 5.2) : entrée « decision » au journal, puis report dans les pages concernées.

## 5. Ce que le dirigeant doit faire lui-même

Tu lui présentes ces gestes. Tu ne les fais pas sans son accord écrit. Les libellés des tableaux de bord sont ceux connus
au 16/10 ; s'ils ont changé, chercher le nom du réglage.

### 5.1 Réglages hors dépôt, avec le chemin exact

**A. Supabase** — `https://supabase.com/dashboard`, projet « Gerimmo V4 » (`rddlxunppddzpsaatdaz`).
1. **Fermer l'inscription publique — maintenant, avant tout démarchage.** *Authentication → Sign In / Providers →*
   « Allow new users to sign up » : **désactiver**. Gerimmo crée ses comptes par l'API d'administration, que ce réglage
   ne bloque pas (vérifié sur GoTrue réel v2.197.0 au 4e tour ; `app/supabase/templates/LISEZ-MOI.md`).
   Ensuite, Codex relance aussitôt la recette (`inscription-recuperation.spec.ts`).
2. **Vérifier « Confirm email »** : *Authentication → Sign In / Providers → Email* : doit rester **activé**.
3. **Coller les trois modèles de courrier — maintenant** : la PR #194 est en production depuis le 16/10 (`f24dfb0`).
   *Authentication → Emails* (modèles ; ancien nom « Email Templates ») :
   - « Confirm signup » ← `app/supabase/templates/confirmation.html`, sujet « Confirmez votre adresse — Gerimmo » ;
   - « Reset password » ← `recovery.html`, sujet « Réinitialisation de votre mot de passe Gerimmo » ;
   - « Magic link » ← `magic_link.html`, sujet « Votre lien de connexion — Gerimmo ».
   Sans ce geste, un renvoi de confirmation permet encore une prise de compte, même inscription publique fermée
   (vérification finale du 4e tour, scénario n° 11, notes hors dépôt). Ne pas toucher « Change email address » (déjà
   utilisé). Vérification du lien ensuite : T1, point 4.
4. **Durée du code à usage unique** : *Authentication → Sign In / Providers → Email* → « Email OTP Expiration »
   (emplacement à confirmer). Aujourd'hui 86 400 s. Sur décision (Q13) : 3 600 s.
5. **Relever** la notification « mot de passe modifié » (*Authentication → Emails*, notifications de sécurité),
   *URL Configuration* (Site URL `https://www.gerimmo.app`, Redirect URLs `https://www.gerimmo.app/**`) et l'état des
   connexions anonymes (*Authentication → Sign In / Providers*, emplacement à confirmer ; relevé demandé au 4e tour).
6. **Stockage** : *Storage* → bucket `documents` : supprimer les 31 fichiers laissés par la purge des comptes de test
   du 01/10 (dossiers des deux organisations de test ; `log.md`, entrée « ops » du 01/10 : `storage.objects` refuse la
   suppression directe). Les 61 fichiers de la purge du 25/09 sont déjà supprimés (`log.md`, entrée du 25/09 « Fin de
   soirée »). Jamais par SQL. Codex vérifie d'abord en lecture seule (`storage.objects`) ce qui reste et en fournit la
   liste ; le dirigeant confirme.

**B. Stripe** — `https://dashboard.stripe.com`.
1. **Dire le mode de la clé de production** (test ou réel). Le dirigeant le lit sur `/admin/sante` (« clé réelle » ou
   « clé de test »), qui exige sa session de super-administrateur avec second facteur (§ 3.6) ; Codex n'y a pas accès,
   sauf accès nommé fourni par lui. Recommandation : rester en test jusqu'à l'ouverture de la vente.
2. **Webhook** : *Developers → Webhooks* (selon l'interface : *Workbench → Webhooks*) → point de terminaison
   `https://www.gerimmo.app/api/stripe/webhook`, **dans le même mode que la clé**, abonné aux **7 événements** :
   `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`,
   `customer.subscription.trial_will_end`, `invoice.paid` (`app/src/app/api/stripe/webhook/route.ts`).
3. Passage au réel, le jour venu, en un seul geste : clé réelle, secret du point de terminaison réel, 7 événements,
   puis redéploiement. Le secret GitHub `GERIMMO_STRIPE_TEST_KEY` reste une clé de test.

**C. Vercel** — `https://vercel.com`, projet `gerimmo-v4` → *Settings → Environment Variables* (cible Production).
1. Présentes au 16/10 (noms seulement, tour final) : `GERIMMO_RELAIS_EMAILS`, `CRON_SECRET`, `RESEND_API_KEY`,
   `RESEND_EXPEDITEUR`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `STRIPE_*`, `YOUTRUST_*`, `META_*`,
   `OPEN_AI_KEY`, `GERIMMO_CODEX_ENABLED`.
   Clé OpenAI : le nom attendu est `OPENAI_API_KEY` ; la production n'a que l'ancien nom `OPEN_AI_KEY`, que le code
   accepte en repli (`app/.env.example`, section « Intelligence artificielle »). Ne jamais garder les deux. Pour
   renommer (geste du dirigeant) : poser `OPENAI_API_KEY`, retirer `OPEN_AI_KEY`, puis redéployer.
2. Absentes : `GERIMMO_SESSION_SECRET` (repli sur une clé dérivée de la clé `service_role` : une rotation de celle-ci
   invaliderait les témoins d'inactivité), `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`,
   `RESEND_DOMAIN_READ_KEY`. À décider : poser `GERIMMO_SESSION_SECRET` (aléatoire, 32 caractères ou plus).
3. Confirmer que `GERIMMO_CODEX_ENABLED` n'est pas `true` (atelier désactivé, audit O11, `.env.example`).
4. Renouveler : `META_ADS_ACCESS_TOKEN` vers le 26/11/2026 ; `VERCEL_TOKEN` et `GITHUB_AGENT_TOKEN` avant le 24/12/2026.
5. Toute modification demande un redéploiement (les variables `NEXT_PUBLIC_*` sont figées au build).

**D. GitHub** — `https://github.com/GERIMMO/GERIMMO_V4` → *Settings → Secrets and variables → Actions*.
1. Secrets attendus : `GERIMMO_BACKUP_KEY`, `GERIMMO_BACKUP_SERVICE_KEY`, `SUPABASE_DB_PASSWORD`, `SCW_ACCESS_KEY`,
   `SCW_SECRET_KEY`, `GERIMMO_STRIPE_TEST_KEY`, `GERIMMO_CODE_WRITER_TOKEN`, `OPENAI_API_KEY`, `VERCEL_TOKEN`,
   `VERCEL_AUTOMATION_BYPASS_SECRET`. Variables : `SCW_BUCKET`, `SCW_REGION`, `GERIMMO_CODEX_ENABLED`,
   `GERIMMO_RELEASE_ENABLED`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`. La sauvegarde du 16/10 prouve que les siens sont posés.
2. PR anciennes, ouvertes et en conflit : #94, #133, #167. Pour chacune : fermer, ou faire reprendre depuis `main`.
3. Branches (relevé `git ls-remote` du 16/10, 08 h 50 UTC, 140 branches) : 18 `lot-*`, `integ-*` et
   `tests-racine-pages`, dont `integ-c`, `lot-correctifs-base`, `lot-correctifs-app` et `lot-invitation-artisan` (dépassées
   par `main` depuis la fusion de la PR #195) ; 111 `codex/*` ; 6 anciennes `claude/*` (`ecstatic-knuth-pcoqz0`,
   `ecstatic-pasteur-wn87s9`, `inspiring-heisenberg-xy4xxq`, `lucid-dijkstra-kvsoho`, `reprise-mobile-docs-x6ku40`,
   `vibrant-johnson-3uotjt`) ; `fix/pdf-fields-required`, `recette-s0-s6`, `sprint7-incidents`. Supprimer sur accord
   seulement, et jamais `claude/compassionate-euler-qpqjp6` tant qu'une PR en part.
4. **Adresse des commits** (geste du dirigeant, avant toute nouvelle fusion). Sur GitHub, dans les réglages de son
   compte (*Settings → Emails*), cocher **Keep my email addresses private** : les fusions et modifications faites par
   GitHub prendront alors l'adresse `noreply` du compte, affichée sur la même page. Cocher aussi **Block command line
   pushes that expose my email**. Dans tout poste ou environnement Codex qui commite, régler `git config user.email`
   sur cette adresse `noreply`. Ne jamais recopier l'adresse personnelle dans un message, un commit ou une page (Q15).

### 5.2 Questions ouvertes (à poser en un seul message)
Pour chacune : ce qui s'applique aujourd'hui (réglage prudent) et la recommandation. Ne rien trancher à sa place.

- **Q1. Portée de l'autorisation.** Aujourd'hui : l'autorisation écrite du 14/10 couvre les décisions du 14/10, exclut
  D17-B, et exige « aucune anomalie P1 ouverte dans ce qui est livré », condition non remplie depuis #181 (les quatre P1,
  T2). Ont été déployés sans entrée qui dise qu'ils sont couverts : #186 (« corrige proprement », 15/10), #189, #190 et
  #192 (décisions du 15/10), #194 (l'invitation d'artisan, qui remplace D17-B) et #195, dont la
  migration `20261014851000` étend le point 1 du 15/10 à la restitution du dépôt (interprétation de Claude ; le tour
  final en faisait une question). D'ici la réponse, Codex applique la règle par défaut (§ 1.2, règle 4) : il prépare,
  teste et simule, sans appliquer ni fusionner.
  Recommandation : confirmer après coup #186, #189, #190, #192, #194 et #195 (la restitution au jour de Paris
  comprise) ; dire ce que Codex peut livrer avant que les P1 soient refermées, et s'il peut livrer ensuite les restes
  ratifiés (§ 4, priorité 2) aux mêmes quatre conditions.
- **Q2. Relais : ratifier les choix faits sans lui, en ligne depuis le 16/10 (#192).** Aujourd'hui : l'arrêt d'urgence
  ne coupe ni l'e-mail de 5 h, ni l'e-mail immédiat, ni le passage toutes les 10 minutes (exception à D06-A) ; pour faire
  taire le relais, on vide la variable `GERIMMO_RELAIS_EMAILS` (puis redéploiement) ; « immédiat » = au plus
  11 minutes ; ce passage fait aussi avancer les escalades et la lecture des consignes toutes les 10 minutes ;
  plafonds : 6 e-mails immédiats par heure, 50 urgences par envoi, 3 essais, reprise après 10 minutes ; e-mail de 5 h
  répété chaque jour tant qu'un arrêt ou une alerte non accusée persiste ; les signalements que le dirigeant fait
  lui-même dans la console lui envoient aussi un e-mail ; urgence = alerte interne du mode vacances seulement.
  Recommandation : ratifier tel quel ; ajouter les incidents urgents pendant des vacances programmées dans un lot
  séparé, sans nom ni adresse (option B de D46) ; hors vacances, garder 5 h pour le reste.
- **Q3. Jour de Paris, suite.** Aujourd'hui, au jour UTC du serveur : factures d'honoraires, appels de charges de
  copropriété, clés de répartition, indicateur « expirée » du rappel d'assurance, `org_ecriture_ouverte`, seuil des
  alertes de restitution, priorité de pilotage. Entre minuit et 1 h (hiver) ou 2 h (été) à Paris, ces dates prennent
  la veille. Recommandation : oui, même méthode à compte exact, sans montant modifié.
- **Q4. D42 (maintenance des artisans).** Aujourd'hui : B en production depuis #182 sans choix tracé (expiration des
  devis, clé d'arrêt « rappels ») ; purge des motifs de liste noire non planifiée (rien avant 2029).
  Recommandation : ratifier B ; purge des motifs avant septembre 2029, après avis DPO.
- **Q5. D36-C (pièce « décompte » dans « Mes documents » du locataire).** Aujourd'hui : B seul ; C reportée par la
  relecture (effet d'une créance publiée au locataire) ; le bandeau du locataire promet un « décompte de restitution ».
  Recommandation de l'agent : trancher entre maintenant (1 à 1,5 j) et après avis juridique ; d'ici là, vérifier que
  le bandeau ne promet rien d'indisponible.
- **Q6. Essais à autoriser.** Aujourd'hui : aucun fait, hors autorisation. (a) Restaurer une copie réelle sur un projet
  jetable, avec ses 10 tâches `pg_cron` (D07, D43 ; puis retirer `--no-comments`). (b) Politique de stockage et lecture
  signée de la photo du locataire sur le vrai service (D11, D16). (c) Dépôt de 6 Mo (D12 : les formulaires annoncent
  10 Mo, la documentation Vercel borne le corps à 4,5 Mo). (d) Générer le PDF 2044 dans la recette (D37 ; fichier à
  retirer à la main). Recommandation : oui pour (a), (b), (c), sur un projet jetable supprimé après ; (d) facultatif.
- **Q7. Identité de l'éditeur (D32).** Aujourd'hui : champs vides dans `app/src/lib/editeur.ts`, pages légales qui le
  disent. Demandé : dénomination, forme, capital, siège, RCS, SIRET, TVA, directeur de la publication, contact,
  médiateur. Recommandation : les fournir, puis relecture par un juriste avant les premiers inscrits (toute modification
  des CGU ensuite demande un mois de préavis, art. 16).
- **Q8. Expert-comptable.** (a) Forme de l'avoir D24-C : mentions (ni HT, ni TVA, ni identité du client aujourd'hui),
  numérotation « AV-0001 » par artisan, PDF Gerimmo ou outil de l'artisan, avoir partiel, facture déjà réglée, numéro
  libéré ou non, artisan refusé. (b) Points différés D02-B (avant la campagne du printemps 2027), D03-B, D38-B, D40-B,
  D41. (c) Ajout du lot D24-C, à ratifier par le dirigeant : tout règlement est refusé sur une facture annulée.
  Aujourd'hui : module « clients externes » éteint ; options prudentes A en ligne.
  Recommandation : un seul rendez-vous avant le printemps 2027 ; module éteint jusqu'à la réponse.
- **Q9. Juriste et DPO.** (a) D49 (2) : mention « généré par IA » sur les posts (ils paraissent sans). (b) Durées D13
  (6 mois « sauf avis contraire »), D14, D48, D42 ; registre des traitements. (c) Seuils des assurances loyers impayés
  et conseils déjà affichés au propriétaire. (d) D35 (2)-B. Recommandation : (a) en priorité ; d'ici la relecture des
  sources, masquer les conseils (c) ou retirer leur qualification de « règle légale ».
- **Q10. Plafond des appels IA (X19).** Aujourd'hui : 50 appels payants par jour de Paris, réglable dans « Relais en mon
  absence » ; l'atelier compte pour un appel ; usage réel jamais mesuré. Recommandation : garder 50, Codex mesure une
  semaine.
- **Q11. Invitations de locataires antérieures au 15/10.** Aujourd'hui : non relancées par X16. Sans objet au 16/10 :
  aucune invitation en base. Recommandation : garder la règle.
- **Q12. Invitation d'artisan : réglages du lot.** Aujourd'hui (défauts prudents) : zone d'intervention exigée ; la
  supervision n'invite pas à la place du propriétaire ; 30 envois par heure et par organisation, 3 par heure et 5 sur
  24 h par adresse, 50 par organisation et par compte sur 24 h ; les agences ne voient plus le motif d'un refus ;
  confirmation sur un autre appareil = nouveau mot de passe ; pas de « ne plus recevoir », pas de « Réactiver ».
  Fenêtre résiduelle (un aller-retour) entre la confirmation et la pose du mot de passe provisoire.
  Aucune ligne de carnet (`artisan_agences`) n'existait en production avant #194 : la question « que faire des artisans
  déjà au carnet sans consentement » (marquer, désactiver, supprimer) est sans objet aujourd'hui.
  Recommandation : confirmer, avec deux changements : (a) d'une inscription confirmée ailleurs que dans son navigateur,
  effacer et redemander l'espace (donc la destination choisie), le nom et le code de parrainage, ainsi que l'acceptation
  des CGU, peut-être déclarée par un tiers (la ligne `acceptations_cgu` est créée à l'insertion du compte, migration
  `20260927148000`) ; (b) n'autoriser une agence à modifier zone et métiers que sur les fiches sans compte qu'elle a
  créées. Accepter la fenêtre résiduelle, ou demander un mécanisme en base, ou une durée de jeton d'accès plus courte
  (T7).
- **Q13. Durée du code à usage unique.** Aujourd'hui : 86 400 s (24 h) ; l'avis de sécurité Supabase
  `auth_otp_long_expiry` le signale. À 3 600 s, tous les liens de Gerimmo (inscription, mot de passe, invitations,
  relances X16) ne valent plus qu'1 h. Recommandation : 3 600 s, en connaissant cet effet (le renvoi et les relances
  apportent un lien neuf).
- **Q14. Petites confirmations.** (a) X18 : la référence d'un bien est son nom complet, chaque recherche est tracée :
  garder. (b) Règles « ce qui peut continuer seul » (D46-C) : après le lancement, par étapes. (c) Six articles réécrits
  le 07/10 : valider ou rejeter. (d) Démarchage d'artisans : ni autorisé ni interdit par le wiki ([[Prêt à démarcher]]).
  (e) D09 : écart à D09-A livré par #182 : quand le destinataire d'une alerte du mode vacances n'est plus habilité, un
  autre superviseur permanent la reprend, sinon nul ne pourrait la fermer (`app/src/app/admin/relais/vacances.tsx` ;
  migrations `20261014221000`, `…223000` ; registre, SUP-03). Recommandation : ratifier.
- **Q15. Adresse e-mail personnelle déjà publiée dans le dépôt public.** Aujourd'hui : une adresse personnelle du
  dirigeant figure dans `app/docs/recette-autonome-s0-s6.md` (10 lignes) et dans une entrée ancienne de `log.md`
  (septembre 2026) ; elle est aussi l'adresse d'auteur de 438 commits de l'historique de `main` au 16/10 (relevé de
  l'API GitHub ; un clone superficiel n'en montre qu'une partie) : 190 fusions faites par GitHub (du 11/09 au 16/10,
  dont #194 et #195) et 248 commits poussés depuis un poste ou une session de travail (le dernier le 13/10, branches
  `codex/*` des PR #177 et #178). Toute fusion ou tout commit à venir la publiera encore tant que les réglages du
  § 5.1 D, point 4, ne sont pas faits ; elle reste dans l'historique git quoi qu'on fasse. `log.md` est en ajout seul
  (`CLAUDE.md`).
  Recommandation : faire d'abord le point 4 du § 5.1 D ; puis remplacer l'adresse par une adresse de test dans
  `app/docs/recette-autonome-s0-s6.md` (PR simple), ce qui ne suffit pas seul ; ne pas réécrire l'historique ni
  `log.md`. L'adresse publiée est l'identifiant de connexion du compte super-administrateur, resté seul actif après le
  19/09 (`log.md`, 19/09, « Un seul super admin, et son mot de passe renouvelé ») ; le second facteur reste exigé
  (§ 3.6) : le dirigeant juge s'il change l'adresse de connexion de ce compte. Ne jamais recopier l'adresse dans un
  message, un commit ou une page.

## 6. Protocole de déploiement (mis à jour le 16/10)

1. **Branche et relecture.** Lot sur ta branche, partie de `origin/main`. Tests rouge puis vert. Relecture indépendante
   sans constat bloquant (contre-relecture de sécurité dès que le lot touche `proxy.ts`, l'Auth ou des droits).
   **Ouvrir la PR vers `main`** (la CI part sur toute pull request) ; son corps liste les migrations dans l'ordre, ce qui
   n'est pas vérifié, et les gestes hors dépôt qu'elle suppose.
2. **Relevé de production en lecture seule, avant toute simulation.** Pour chaque fonction ou défaut que la migration
   modifie : `pg_get_functiondef`, nombre exact d'occurrences attendu, ancres présentes une fois. La production peut
   différer du dépôt (§ 3.5). Consigner le relevé.
3. **Simulation.** « Migrations Supabase », `simulation` = vrai, fichiers nommés un à un dans l'ordre du manifeste.
4. **CI et batterie.** CI verte sur le SHA de tête exact. Batterie locale : lint, `next typegen` + typecheck, build,
   Vitest complet, parcours navigateur, audits 768 et 1440 px. Pièges du § 3.5 écartés avant de conclure.

4 bis. **Feu vert écrit (§ 1.2, règle 4 ; § 5.2, Q1).** Tant que la règle par défaut s'applique (P1 ouvertes, Q1 sans
   réponse), ou si le lot sort de la portée d'une autorisation écrite : accord écrit du dirigeant qui nomme le SHA de
   tête. Sans lui, s'arrêter ici : PR ouverte, relevé consigné, simulation et CI vertes ; ni sauvegarde à la demande,
   ni application, ni fusion.

5. **Sauvegarde.** « Sauvegarde quotidienne » à la demande sur `main` : succès avant toute migration réelle.
6. **Application.** « Migrations Supabase », `simulation` = faux, mêmes fichiers, même ordre. **Les migrations passent
   avant le code** (nouvelles signatures).
7. **Vérification en lecture seule.** Versions enregistrées (`supabase_migrations.schema_migrations`) (les versions du
   lot, une à une ; ne pas comparer le total au nombre de fichiers du dépôt, voir § 3.2), fonctions et
   tables attendues, 10 tâches `pg_cron` (`select jobname, schedule, active from cron.job`), aucune fonction nouvelle
   ouverte à `anon`. Pour chaque fonction réécrite par ancre ou à compte exact, `pg_get_functiondef` nommé un à un :
   le texte attendu est présent (exemple : la liste de T1, point 2).
8. **Fusion.** « Squash » avec le SHA de tête exact (API GitHub : `merge_method=squash`, `sha=<tête>` ; outil MCP :
   `expectedHeadSha`). Message factuel.
9. **Vercel.** Déploiement `READY` ; contrôle des pages publiques (accueil, tarifs, pages légales, inscription,
   connexion : réponse 200, rien de cassé) ; aucune erreur d'exécution dans l'heure qui suit.
10. **Recette.** « Recette de production avec nettoyage » sur `main`. Noter l'identifiant. Échec : analyser (test périmé
    ou régression) avant toute autre livraison.
11. **Journal.** Entrées `deploy` puis `audit` dans `log.md`, avec tous les identifiants. Ligne du tableau § 5 quater
    du dossier de validation. Registre et Décisions groupées mis à jour. Ce qui n'est pas vérifié, écrit tel quel.
12. **Retour arrière.** Code : revert de la fusion. Base : scripts de `app/supabase/retours-arriere/`, dans l'ordre
    inverse, après une sauvegarde.
13. **Après un réglage hors dépôt** (Auth, Stripe, variable) : redéploiement si nécessaire, puis recette.

Conventions de migration : rejouable ; `create or replace` avec `search_path = ''` ; `select public.fermer_fonctions_a_anon();`
en fin ; remplacement à compte exact d'occurrences qui accepte la forme déjà convertie et s'arrête en nommant la
fonction sinon ; aucune donnée existante réécrite sans décision ; script de retour arrière, ligne dans son `LISEZ-MOI.md`
et dans l'ordre complet des retours ; nom ajouté une seule fois à la fin de `app/e2e/local/ordre-migrations.txt` ;
tests de manifeste à jour (`relais-migrations-manifeste.test.ts` liste les lots postérieurs).

## 7. Rendre compte

- **À chaque jalon** : une entrée `log.md` (`## [AAAA-MM-JJ] deploy | …`, `audit | …`, `decision | …`), avec PR,
  SHA, identifiants d'exécution, et ce qui n'est **pas** vérifié.
- **`index.md`** : une ligne par page créée ou changée (lien + résumé d'une ligne, date, statut).
- **Wiki** : pages métier touchées (section « Ce que fait le code aujourd'hui », PR et SHA), Décisions groupées,
  Registre des anomalies, Dossier de validation, [[Prêt à démarcher]]. Contradictions dans un callout warning.
- **Réponses du dirigeant** : entrée « decision » au journal, puis report dans Décisions groupées.
- **Message au dirigeant** : en français, court, factuel. Ce qui est fait (preuves), ce qui ne l'est pas, ce qui attend
  sa réponse (questions numérotées, recommandation pour chacune).
- **Ne jamais** écrire « mission terminée » tant que le § 8 du dossier de validation n'est pas rempli.

===== FIN DU PROMPT =====

> [!warning] Points à trancher / contradictions
> - **Échecs au premier essai de la recette** : « Créer la fiche » = défaut du test, corrigé (`72e1e0b`, PR #196), à
>   confirmer par la recette qui suit sa fusion ; D04 : cause non établie, traces non lues (T2). Les recettes n° 6 et
>   n° 8 à 16 étaient écrites « tous les parcours réussis » (la n° 7 « verte ») sans le mentionner.
> - **Libellés des tableaux de bord** (Supabase, Stripe) : repris du `LISEZ-MOI` des modèles et du tour final ;
>   l'emplacement de « Email OTP Expiration », de la notification « mot de passe modifié », des connexions anonymes et
>   de l'envoi d'un lien depuis *Authentication → Users* n'est pas confirmé.
> - **Relevés de production cités** : consignés dans `log.md` le 16/10 (entrée « audit » des relevés du tour final),
>   faits en lecture seule entre 06 h 18 et 06 h 45 UTC ; ils vieillissent : les rejouer (T4).
> - **Restitution du dépôt au jour de Paris** (`20261014851000`, PR #195) : interprétation du point 1 de la décision
>   du 15/10, pas encore ratifiée (Q1) ; les Décisions groupées (réponse (3)), [[Prêt à démarcher]] (§ 2),
>   [[Le jour de référence est le jour de Paris]] et [[Restitution du dépôt de garantie]] l'écrivent comme une
>   interprétation à faire ratifier ; dans la restitution, seules les alertes du délai (seuils J-7 et J+0) restent hors
>   décision, au jour de la session.
> - **X19 et premier e-mail de 5 h** : jamais observés à la rédaction ; voir T3.
