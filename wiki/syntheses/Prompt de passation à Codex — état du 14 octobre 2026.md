---
type: synthesis
tags: [passation, codex, déploiement, vagues]
status: in-progress
created: 2026-10-14
updated: 2026-10-14
sources: []
---

# Prompt de passation à Codex — état du 14 octobre 2026

> [!info] Mode d'emploi
> Ce texte est autonome : copier-coller tout ce qui suit la ligne « ===== DÉBUT DU PROMPT ===== » dans Codex. L'état exact de la mission change vite : la dernière entrée de `log.md` fait foi sur tout ce qui est daté d'après ce document. Voir aussi [[Dossier de validation — version candidate du 13 octobre 2026]], [[Décisions groupées — version candidate du 13 octobre 2026]] et [[Registre des anomalies — audit du 13 octobre 2026]].

===== DÉBUT DU PROMPT =====

Tu reprends une mission en cours sur **Gerimmo**, application française de gérance immobilière (Next.js 16 App Router, Supabase projet `rddlxunppddzpsaatdaz` région eu-west-3, Vercel projet `gerimmo-v4`, Stripe, Resend). Dépôt : `GERIMMO/GERIMMO_V4` (application dans `app/`, wiki métier en français à la racine, régi par `CLAUDE.md`). Le dirigeant s'appelle Brahim. Un autre agent (Claude) a conduit la mission jusqu'ici ; il a dû s'arrêter faute de budget d'usage, et certaines choses ne lui étaient de toute façon pas possibles. Tout ce qui suit est ce qui reste.

## 0. À lire d'abord, dans cet ordre
1. `CLAUDE.md` (racine) : conventions du wiki (français, liens Obsidian, frontmatter, `index.md` et `log.md` tenus à jour après chaque opération, `raw/` jamais modifié).
2. `app/AGENTS.md` et `app/CLAUDE.md` : règles du code (Next.js 16 : lire `node_modules/next/dist/docs` avant d'utiliser une API incertaine).
3. `log.md` : les dernières entrées donnent la chronologie exacte ; elles priment sur le § 2 si elles sont plus récentes.
4. `wiki/syntheses/Dossier de validation — version candidate du 13 octobre 2026.md` (§ 5 bis, § 5 ter, § 8) : état de la production, contrôles faits, limites.
5. `wiki/syntheses/Décisions groupées — version candidate du 13 octobre 2026.md`, section « Réponses du dirigeant (14/10/2026) » : chaque décision D01–D49, Q1–Q5, X01–X21 avec l'option retenue. Règle du dirigeant : « p1 bloquants, pour le reste faire en fonction des recommandations ».
6. `wiki/syntheses/Registre des anomalies — audit du 13 octobre 2026.md` (237 anomalies) et `Registre d'exécution — audit du 13 octobre 2026.md`.

## 1. Règles non négociables
- **Aucun secret recopié** (clés, jetons, mots de passe, valeurs d'environnement), ni dans le dépôt, ni dans le wiki, ni dans un message. Ne jamais déchiffrer une variable d'environnement sans demande explicite.
- **Aucun effet réel sans autorisation explicite du dirigeant** : pas de contact avec de vrais utilisateurs ou prospects, pas d'e-mail réel, pas de paiement, pas de publication hors de la mission marketing existante.
- **Autorisation de déployer donnée le 14/10/2026 (« tu as l'autorisation », puis « carte blanche »)**, limitée à : fusion, déploiement Vercel et migrations (sauvegarde, simulation, application réelle) des vagues 1 à 4, chacune seulement si : relecture indépendante sans constat bloquant, batterie complète verte sur le commit intégré, simulation réussie, aucun P0/P1 ouvert dans ce qui est livré. **Hors autorisation même avec carte blanche** : activer un module désactivé (« clients externes »), D17-B, essais de restauration et de stockage (D07/D11/D43), parties d'avis spécialisé, inventer l'identité de l'éditeur, contacter de vrais utilisateurs, rédiger des textes juridiques contraignants sans relecture, importer des données de production dans un environnement d'essai.
- **Production** : lectures seules par défaut ; toute écriture suit le protocole du § 5. Rien de destructif ni d'irréversible sans sauvegarde préalable.
- **Honnêteté** : ne jamais écrire « terminé », « vérifié » ou « déployé » sans preuve citée (commande, sortie, identifiant d'exécution, SHA). Ce qui n'a pas été testé est écrit tel quel. Ne jamais déclarer la mission « intégralement terminée » tant que les critères de clôture du dossier de validation (§ 8) ne sont pas remplis.
- **Aucune invention de fait métier ou légal** : toute règle fiscale, juridique ou assurantielle vient d'une source primaire relue (Légifrance, service-public.fr, ANIL, CNIL, conditions générales de l'assureur) avec URL et date de consultation.
- **Contradictions signalées** dans un callout `> [!warning] Points à trancher / contradictions`, jamais lissées.
- Texte visible en français avec accents ; montants jamais lus par `Number()` (utiliser `lireMontant`, `lireMontantFacultatif`, `lireDecimal` de `app/src/lib/saisie-montant.ts`, garde : `tests/lecture-saisies-sans-number.test.ts`) ; « aujourd'hui » = jour de Paris (`aujourdhuiParis()`).

## 2. État au moment de la passation (14/10/2026, soir)
**Production (vérifié par Claude le 14/10 soir)**
- `main` = `d38487a` (PR #181, vague 1), déployé : Vercel `dpl_JDcLYFMNL8qTGrn45uhHvaNfwb6v` à l'état `READY`, aucune erreur d'exécution sur les 3 heures suivantes.
- Déployés ce jour : PR #178 (`f283439`), #179 (`c99e2c6`, migrations `20261013110000` et `20261013120000`, exécution n° 72), #180 (`0f7dbd5`, point du matin), #181 (`d38487a`, migrations `20261014100000` à `20261014123000`, sauvegarde n° 24, simulation n° 73, application n° 74).
- **Vague 1 déployée mais P1 non refermés** : les quatre risques « montant faux » (VER-TS-02, PR178-B-06, CHF-01, CHF-02) sont corrigés dans le code en production, mais aucun contrôle en production n'a été fait (encaissement de test avec une virgule, impression de la ligne 250 du 2044). À faire avant de les fermer au registre.
- Recette de production n° 4 sur `d38487a` : 32 réussis, 2 échoués, 1 ignoré, nettoyage réussi. Les deux échecs sont des tests périmés (saisie de fiche masquée depuis la PR #170 ; « Total mensuel » remplacé par le récapitulatif de la grille 2026), corrigés dans `app/e2e/recette-production/admin-agence.spec.ts` et `proprietaire.spec.ts` (commit `3733624`). **Non rejoués** : relancer le chantier « Recette de production avec nettoyage » après le prochain déploiement.
- Marketing : un post du jeudi 15/10 est programmé à 09:00 Paris (préparation forcée à la demande du dirigeant) ; le plafond Facebook de deux envois par semaine fera paraître le post du vendredi 16/10 sans diffusion Facebook. **Contrôle à faire le 15/10 vers 09 h 20 Paris** : le point du matin a été régénéré, le post du jeudi est publié, les tâches `pg_cron` tournent (le point du matin avait été figé depuis le 13/10 ; correctif PR #180 non encore constaté en production).

**Branche de travail désignée** : `claude/compassionate-euler-qpqjp6`. Son historique antérieur est déjà fusionné par « squash » : elle a été repartie de `main` ; le `push --force-with-lease` est autorisé par le dirigeant sur cette seule branche. Ne pas pousser ailleurs sans autorisation. Ne pas créer de PR sans que le dirigeant l'ait demandé (il l'a demandée pour le déploiement des vagues).

**Vague 2 (supervision, sécurité, données personnelles : D06–D16, D43–D44, D46–D48, D42-B) : codée, intégrée, PAS déployée.**
- Intégrée sur la branche désignée au commit `0049044` (fusion de `main` `d38487a` comprise ; trois tests et la documentation alignés sur **neuf** tâches `pg_cron`, la neuvième étant `maintenance-artisans` ; fake de client de `arret-urgence-ecrans.test.ts` complété pour `auth.getUser`).
- Migrations à appliquer dans CET ordre (fichiers dans `app/supabase/migrations/`, tous listés dans `app/e2e/local/ordre-migrations.txt`, retours arrière dans `app/supabase/retours-arriere/`) : `20261014200000_arret_urgence_taches_planifiees`, `…210000_maintenance_artisans_expiration_cron`, `…211000_maintenance_artisans_arret_urgence`, `…220000_traversee_trace_precise`, `…221000_alerte_relais_destinataire`, `…222000_consigne_activation_approbateur_distinct`, `…223000_alerte_relais_reprise_destinataire_parti`, `…230000_faits_direction_sans_noms`, `…231000_retention_registres_execution`, `…232000_effacement_instantanes_faits_direction`, `…233000_photos_demande_devis_artisan`.
- **PR #182 ouverte** (branche désignée vers `main`). Batterie complète sur `0049044` : lint, types, build, 5 600+ tests unitaires et matrice navigateur réussis ; suite navigateur 166 réussis / 2 en échec (`audit artisan` : image `http://127.0.0.1` du banc refusée par la politique de sécurité, filtrée dans `428519c` et repassée à 768 et 1440 px ; `personne-reprise` : réussi seul en 7 s, échoué deux fois pendant la batterie).
- **Sauvegarde de production réussie** (chantier « Sauvegarde quotidienne », exécution 38645548110, ~22 h 10 UTC le 14/10).
- **Blocage 1 LEVÉ (15/10, lecture seule de la production par l'outil Supabase)** : la simulation de `20261014200000` s'arrêtait sur `generer_alertes_diagnostics()`. En production, le contrôle d'accès « réservé au cron et au super admin » EXISTE bien (pas de faille) mais `generer_alertes_{diagnostics,assurance,restitution}` l'écrivent sur UNE ligne (`... then raise exception '…'; end if;`) alors que le dépôt l'écrit sur plusieurs. La migration accepte maintenant les deux formes (commit `5bff09f`, test rouge puis vert dans `tests/arret-taches-planifiees.test.ts`). Les quatre autres ancres de la vague (`log_sa_access`, `accuser_alerte_vacances` ×2, `decider_consigne`) existent exactement une fois en production. **Simulation réussie sur la production : exécution 38653887523** (11 fichiers, annulée à la fin). Les sept migrations de la vague 1 sont bien enregistrées en base (`20261014100000` à `…123000`).
- **Blocage 2 EXPLIQUÉ (15/10)** : la CI de la PR #182 échouait à l'étape des parcours navigateur pour deux raisons. (a) `audit artisan` : la photo signée du banc est en `http://127.0.0.1`, refusée par la politique de sécurité (images en `https:`) ; la CI formule le message « Loading the image… » (le local « Refused to load the image… ») : filtre élargi dans `e2e/audit-ecrans.spec.ts`. (b) `e2e/encaissement-reste.spec.ts` (PAY01) : **défaut préexistant de fuseau horaire, sans rapport avec la vague 2**. La vue SQL de l'état des appels de loyer compare `a.date_echeance < current_date` (jour UTC de la base ; migrations `20260801_s5…`, `20260909230000…`, `20260910120000…`, `20260910140000…`, dernière définition en vigueur à retrouver) alors que l'application raisonne au jour de Paris : de 00 h à 02 h à Paris, un loyer échu la veille s'affiche « en attente » au lieu d'« impayé ». Le test échoue de 22 h à 24 h UTC et réussit ensuite (reproduit en local à 23 h 58 puis 00 h 00 UTC). **À corriger en production** par une migration qui compare au jour de Paris (`(now() at time zone 'Europe/Paris')::date`) et à auditer partout où la base utilise `current_date` pour une règle métier (convention du projet : jour de Paris). La CI n'a pas été rejouée verte à ce stade : voir `log.md`. Le reporter `github` de Playwright est maintenant actif en CI (`E2E_CI`) : les tests en échec sont annotés sur le job (lisibles par `gh api repos/…/check-runs/<job>/annotations`).

**Vague 3 (chaîne d'intervention, artisan externe, interface, éditorial : D17-A, D19–D21, D24–D31, D33, D45, D49, D32 partiel) : en cours dans l'environnement de Claude, NON poussée.** Les lots vivent dans des worktrees de son conteneur (`lot-chaine-incident` : 5 commits ; `lot-artisan-externe` : 4 commits ; `lot-interface-a` : 2 commits et des modifications non commitées ; `lot-interface-b` : 1 commit ; lot éditorial : pas démarré). Ce conteneur est éphémère : si rien n'est retrouvé sur le dépôt distant, **refaire ces lots** depuis les fiches de décision (voir § 4), sans présumer qu'ils existent. D45-A (en-têtes de cache du logo et des illustrations) est dans le lot `lot-interface-a`, donc lui aussi non poussé.

**Vague 4 (fonctions majeures D18-A devis révisable en deux livraisons, D22-B, D23-A, points X01–X21) : non démarrée.**

**Registre** : 237 anomalies (P0 0, P1 5 dont 4 reclassées par le dirigeant le 14/10, P2 66, P3 166).

## 3. Environnement et outils
- Banc local isolé (aucun effet réel) : Postgres 16 `127.0.0.1:55432` (bases jetables `gerimmo_ci_*`), émulateur d'API Supabase `:54321` (`app/e2e/local/serveur-supabase-local.mjs`), `next start` `:3100`. Préparer une base : `SUPABASE_DB_URL=postgres://postgres@127.0.0.1:55432/gerimmo_ci_<nom> node e2e/local/preparer-ci.mjs` (crée aussi `<nom>_api`). Les scripts de batterie complète de Claude ne sont pas dans le dépôt : utiliser la CI (workflow « CI ») comme porte de validation, et les commandes ci-dessous en local.
- Contrôles : `npm run lint`, `npx next typegen` puis `npm run typecheck`, `npm run build`, `npm test` (variables `SUPABASE_DB_URL`, `SUPALOCAL_DB`), `npm run test:e2e` (Playwright, Chromium `/opt/pw-browsers`), audits d'écran 768 et 1440 px. **Piège connu** : dans un worktree git, un lien `node_modules` vers un autre dossier fait échouer `next build` (Turbopack : « Symlink node_modules is invalid, it points out of the filesystem root ») ; construire depuis le dépôt principal. Autre piège : ne jamais créer de lien `node_modules/node_modules`.
- Chantiers GitHub Actions : « CI » ; « Migrations Supabase » (`migrations.yml`, déclenchement manuel sur la branche, entrées `fichiers` séparés par des espaces dans l'ordre, et `simulation` vrai/faux ; tout le lot dans UNE transaction ; refuse une version déjà enregistrée) ; « Sauvegarde quotidienne » (`sauvegarde.yml`, déclenchable à la main sur `main`) ; « Recette de production avec nettoyage » (`recette-production-autonome.yml`, crée trois comptes éphémères en production, parcourt tous les écrans, puis purge).
- Limites de l'environnement de Claude : pas d'accès réseau direct à gerimmo.app, aux sites officiels français ni aux sites d'assureurs (seulement un moteur de recherche) ; l'outil Supabase en lecture seule s'est déconnecté. Si tu as ces accès, plusieurs tâches du § 4 deviennent faisables.

## 4. Tâches restantes, par ordre de priorité (chaque tâche a son critère de réussite)
1. **Terminer le déploiement de la vague 2** (voir § 5) : CI verte sur la tête de la PR #182 (hors plage 22 h–24 h UTC à cause du défaut de fuseau ci-dessus) ; nouvelle sauvegarde si la précédente (exécution 38645548110, 14/10 vers 22 h UTC) a plus de quelques heures ; PR vers `main` depuis la branche désignée ; CI verte ; sauvegarde ; migrations en simulation puis réelles, dans l'ordre du § 2 ; fusion « squash » avec `expectedHeadSha` exact ; Vercel `READY` ; contrôles du § 5 point 5 ; rejouer la recette de production. Critère : migrations enregistrées, Vercel `READY`, recette sans échec, entrée `log.md`.
2. **Contrôles de production des P1 de la vague 1** (encaissement avec virgule, rejeu d'un envoi, ligne 250, régularisation d'un exercice non terminé) sur un compte de démonstration ; fermer les anomalies au registre seulement après. Critère : preuves consignées.
3. **Contrôle du 15/10 à 09 h 20 Paris** (point du matin, post du jeudi, `pg_cron`).
4. **Vague 3** : retrouver ou refaire les lots ; relecture indépendante ; intégration ; même protocole qu'en 1.
5. **Vague 4** : D18-A (devis révisable, en deux livraisons), D22-B, D23-A, puis X01–X21 selon la page des décisions.
6. **Ce que Claude ne pouvait pas faire** :
   - Essai de restauration de la sauvegarde RÉELLE avec les tâches `pg_cron` (neuf) et les commentaires SQL (D07, D43) : restauration complète sur projet jetable, 9 lignes `cron.job`, 152 commentaires conservés, aucune erreur `--exit-on-error`. Exige une copie de production (autorisation du dirigeant).
   - Essai de la politique de stockage sur le VRAI service Supabase (D11) et lecture signée de la photo du locataire par l'artisan (D16).
   - Mesure de la limite de dépôt de fichier Vercel (D12) : dépôt de 6 Mo par action serveur.
   - Textes juridiques (D32) : identité de l'éditeur (`app/src/lib/editeur.ts` vide), mentions légales, CGU, confidentialité. Seul le dirigeant a l'information ; ne rien inventer.
   - Sources primaires des conditions d'assurance loyers impayés pour [[Choisir son locataire selon les conditions des assurances loyers impayés]] : relire chaque seuil dans la source en vigueur, puis passer la page de « brouillon » à « stable » et, seulement alors, activer les conseils à l'écran du propriétaire.
   - Contrôles de production en lecture seule non faits faute de l'outil Supabase.
   - Parcours connectés en production (propriétaire, locataire, artisan, super-administrateur) avec de vrais comptes de test.
   - Parties différées par leur propre recommandation (avis spécialisé) : D02-B, D03-B, D38-B, D40-B, D41, D45-B, D46-B.
7. **Choix du dirigeant en attente** (à lui demander, jamais à trancher à sa place) : D17-B (ajout d'artisan par SIRET par un propriétaire), D42 (A ou B), canal/horaire/responsable du relais (D46-B), identité de l'éditeur.
8. **Réglages hors dépôt** (le dirigeant ou toi, avec accès) : durée du code à usage unique Supabase (86 400 s → 3 600 s), mode de la clé Stripe de production (test ou réel), suppression de deux dossiers de stockage d'organisations purgées.
9. **Page « prêt à démarcher »** dans le wiki, une fois la vague 2 en production : ce qui est en ligne, ce qui est fragile, ce qu'on peut et ne peut pas promettre à un prospect.

## 5. Protocole de déploiement (inchangé)
1. Intégrer en branche ; relecture indépendante sans constat bloquant ; batterie complète verte sur le commit nommé.
2. Sauvegarde (chantier « Sauvegarde quotidienne », déclenchement manuel) : succès avant toute migration.
3. `migrations.yml` en **simulation**, puis en application réelle, fichiers nommés un à un dans l'ordre. **Les migrations passent AVANT le code** (nouvelles signatures).
4. PR vers `main`, CI verte, fusion « squash » avec le `expectedHeadSha` complet exact, déploiement Vercel `READY`.
5. Contrôles non destructifs : pages publiques, erreurs d'exécution Vercel, migrations enregistrées, tâches `pg_cron`, puis la recette de production ; consignés dans `log.md` et le dossier de validation.
6. Retour arrière : revert de la fusion pour le code ; scripts de `app/supabase/retours-arriere/` pour la base, dans l'ordre inverse et après sauvegarde.
Conventions de migration : rejouable, `create or replace` avec `search_path=''`, `select public.fermer_fonctions_a_anon();`, script de retour arrière dans `retours-arriere/` (+ ligne dans son `LISEZ-MOI.md`), nom ajouté une seule fois à la fin de `app/e2e/local/ordre-migrations.txt`.

## 6. Compte rendu attendu
À chaque jalon : entrée `log.md` (préfixe `## [AAAA-MM-JJ] type | titre`), mise à jour de l'`index.md`, du dossier de validation (§ 5 bis) et du registre ; message au dirigeant en français, court, factuel, avec ce qui n'est PAS vérifié.

===== FIN DU PROMPT =====

> [!warning] Points à trancher / contradictions
> - Le § 2 décrit un état instantané : le résultat de la batterie de la vague 2 et l'avancement de la vague 3 ne sont pas connus à la date d'écriture ; `log.md` fait foi.
> - Les lots de la vague 3 ne sont pas poussés : ils peuvent avoir disparu avec le conteneur de Claude.
