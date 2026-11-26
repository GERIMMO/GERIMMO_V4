# Guide de reprise de Gerimmo

Ce guide sert à un informaticien qui ne connaît pas le projet. En une demi-journée, il doit pouvoir lancer Gerimmo sur sa machine, trouver où sont les choses, publier une modification et revenir en arrière.

- **Rédigé le** 24/11/2026.
- **Code lu** : branche `claude/palier-1-preproduction`, commit `fde4cbb4`.
- **Documents lus** : branche `claude/audit-final-pr335` (JOURNAL, QUESTIONS, DECISIONS, AUDIT, `log.md`, wiki).
- **Règle de rédaction** : tout ce qui est écrit ici a été lu dans le dépôt. Ce qui n'a pas pu être vérifié est dans la section 9, pas ailleurs.
- **Aucun secret dans ce guide.** Seuls les noms des variables sont cités. Leurs valeurs vivent chez Vercel, chez GitHub ou dans un fichier local `.env.local` qui n'est jamais envoyé au dépôt.

---

## 1. Gerimmo en une page

Cette section dit ce qu'est le produit, pour qui, et sur quoi il repose.

### Le produit

Gerimmo est une application web de gestion locative : biens, baux, loyers, quittances, charges, états des lieux, incidents, artisans, documents PDF.

### Les quatre publics

| Public | Où il travaille dans l'application |
|---|---|
| Propriétaire bailleur | `/agence/[orgId]/…` (l'espace de gestion est le même que celui d'une agence ; voir `app/src/lib/espace.ts`) |
| Locataire | `/locataire/[orgId]/…` |
| Artisan | `/artisan/…` |
| Super admin (le dirigeant) | `/admin/…` (la « console »), avec double vérification à la connexion |

Les **agences** (administrateur d'agence, agent) existent dans le code, mais elles relèvent du **palier 2**. Le palier 1 se limite aux quatre publics ci-dessus (voir `AUDIT.md` et `log.md`, entrée du 22/11/2026).

### Les trois briques

| Brique | Outil | Ce qu'il faut savoir |
|---|---|---|
| Application | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 | Tout le code est dans `app/`. Versions lues dans `app/package.json`. |
| Base | Supabase : Postgres, connexion des comptes, stockage des fichiers | Projet de production `rddlxunppddzpsaatdaz`, région `eu-west-3` (écrit dans `app/CLAUDE.md` et dans les workflows). |
| Hébergement | Vercel, région `cdg1` | Racine du projet Vercel : `app/`. Les tâches planifiées du site sont dans `app/vercel.json`. Site public : `https://www.gerimmo.app`. |

GitHub porte le dépôt, la vérification automatique et les workflows de publication, de migration et de sauvegarde (`.github/workflows/`).

### Les services externes branchés

Les noms viennent de `app/.env.example` et du code. La colonne « Ce qui le ferme » dit comment le service se coupe.

| Service | À quoi il sert | Variables (noms seulement) | Ce qui le ferme |
|---|---|---|---|
| **Stripe** | Paiement de l'abonnement | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRIX_BIEN`, `STRIPE_PRIX_LOT_AGENCE` | Sans clé secrète ou sans secret de webhook, l'écran n'offre pas de payer. Le verrou « pilote » et le réglage « ventes » ferment aussi (section 7). |
| **Zoho Sign** (compte Europe) | Signature électronique | `SIGNATURE_BAIL_PRESTATAIRE`, `ZOHO_SIGN_CLIENT_ID`, `ZOHO_SIGN_CLIENT_SECRET`, `ZOHO_SIGN_REFRESH_TOKEN`, `ZOHO_SIGN_ENV`, `ZOHO_SIGN_WEBHOOK_SECRET` | `ZOHO_SIGN_BAIL_ACTIF`, `ZOHO_SIGN_DOCUMENTS_ACTIF`, `ZOHO_SIGN_DEVIS_ACTIF`, `ZOHO_SIGN_RELANCES_ACTIVES`, `ZOHO_SIGN_CAUTIONNEMENT_FERME` ; plus un plafond mensuel dans la console. |
| **Resend** | Tous les e-mails, y compris ceux de connexion | `RESEND_API_KEY`, `RESEND_EXPEDITEUR`, `RESEND_REPONDRE_A`, `RESEND_DOMAIN_READ_KEY`, `RESEND_WEBHOOK_SUIVI_SECRET`, `RESEND_CONTACT_*` | Sans `RESEND_API_KEY`, aucun e-mail ne part (donc ni inscription ni mot de passe oublié). Les envois automatiques ont leurs interrupteurs dans la console. |
| **OpenAI** | Assistant, lecture de factures et de compteurs, proposition de devis, brief, veille, articles | `OPENAI_API_KEY` et les variables `OPENAI_*_MODEL` | Interrupteur « IA activée / désactivée » dans la console. Sans clé, ou en mode pilote, aucun appel ne part. |
| **Meta (Facebook)** | Publication des articles sur la page Facebook | `META_FACEBOOK_PAGE_ID`, `META_FACEBOOK_PAGE_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN`, `META_GRAPH_API_VERSION` | Réglages de la console, rubrique marketing (table `marketing_reglages`). Sans jeton, rien ne se publie. |
| **AR24** | Recommandé électronique | `AR24_ENVIRONMENT`, `AR24_TOKEN`, `AR24_PRIVATE_KEY` | Laisser vide : `.env.example` demande de ne rien renseigner tant que le contrat n'est pas validé. |
| **Scaleway** (stockage objet, Paris) | Dépôt des sauvegardes chiffrées | Secrets et variables GitHub, pas Vercel : `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_BUCKET`, `SCW_REGION` | Le workflow de sauvegarde ne tourne pas si `SCW_BUCKET` est vide. |
| **Insee** | Lecture de l'indice de référence des loyers | Aucune variable trouvée | Si l'Insee ne répond pas, l'écran le dit et la saisie reste manuelle (JOURNAL, lot 14). |

Un antivirus sur les fichiers déposés est prévu mais **n'est pas branché** (QUESTIONS, Q8).

---

## 2. Où est quoi

Cette section donne le plan du dépôt, pour trouver un fichier sans chercher.

### Le dépôt, vu d'en haut

```
GERIMMO_V4/
├── app/                    ← l'application (tout le code)
├── .github/workflows/      ← vérification automatique, migrations, publication, sauvegarde
├── wiki/                   ← base de connaissance métier (règles, processus, concepts)
├── raw/                    ← documents sources, jamais modifiés
├── index.md                ← sommaire du wiki
├── log.md                  ← journal détaillé du projet, entrée par entrée
├── livrables/              ← rapports d'audit et preuves
├── CLAUDE.md               ← règles d'entretien du wiki
└── (documents du dirigeant, voir plus bas)
```

### L'application : `app/`

```
app/
├── package.json            ← commandes et versions
├── .env.example            ← la liste de toutes les variables d'environnement, avec leur rôle
├── vercel.json             ← région et tâches planifiées du site
├── vitest.config.ts        ← tests unitaires, dont la liste des fichiers « en série »
├── src/
│   ├── proxy.ts            ← contrôle des sessions et des accès à chaque requête
│   ├── app/                ← les écrans et les routes (Next.js App Router)
│   │   ├── agence/[orgId]/     ← espace de gestion : propriétaire bailleur et agence
│   │   ├── locataire/[orgId]/  ← espace du locataire
│   │   ├── artisan/            ← espace de l'artisan
│   │   ├── admin/              ← console du super admin
│   │   ├── admin/parametres/   ← les interrupteurs (IA, envois, ventes, repères fiscaux)
│   │   ├── admin/sante/        ← état des connexions, tâches, sauvegarde, budget des signatures
│   │   ├── admin/relais/       ← vacances, arrêts d'urgence, limite d'appels à l'IA
│   │   ├── compte/             ← compte personnel, données, sécurité
│   │   ├── actions/            ← les actions serveur (112 fichiers)
│   │   ├── api/                ← routes techniques : cron/, sante/, stripe/webhook,
│   │   │                         zoho-sign/webhook, resend/
│   │   └── page.tsx, tarifs/, outils/, journal/, connexion/, inscription/,
│   │       conditions/, confidentialite/, mentions-legales/   ← site public
│   ├── components/         ← composants d'écran partagés
│   ├── lib/                ← la logique métier et technique
│   │   ├── supabase/           ← clients de la base (navigateur, serveur, clé de service)
│   │   ├── documents/          ← fabrication des PDF
│   │   │   └── modeles/        ← les modèles de documents (bail nu, meublé, colocation,
│   │   │                         quittance, état des lieux, congé, avenant, notice…)
│   │   ├── verrou-pilote.ts    ← verrou des opérations payantes
│   │   ├── etat-ia.ts          ← état de l'IA
│   │   └── envois-suspendus.ts ← envois automatiques
│   └── data/, images/
├── supabase/
│   ├── migrations/         ← toutes les modifications de la base (563 fichiers)
│   ├── retours-arriere/    ← les scripts de retour arrière (206) et leur LISEZ-MOI.md
│   ├── seed.sql            ← comptes et données de démonstration
│   └── templates/          ← modèles d'e-mails de connexion côté Supabase
├── tests/                  ← tests unitaires et tests de base (1 066 fichiers *.test.ts)
│   └── fixtures/           ← doublures et outils communs des tests
├── e2e/                    ← parcours navigateur Playwright (110 fichiers *.spec.ts)
│   ├── local/              ← la base locale et l'émulateur Supabase
│   │   └── ordre-migrations.txt   ← le manifeste : l'ordre réel des migrations
│   └── recette-production/ ← parcours joués sur le site en ligne après publication
├── scripts/
│   ├── deploiement/        ← contrôleur de publication, garde d'environnement
│   ├── sauvegarde/         ← export, chiffrement, restauration
│   └── surveillance/       ← contrôle de disponibilité
└── docs/                   ← notes techniques
```

Trois notes de `app/docs/` sont à lire en priorité :

- `sauvegarde-et-restauration.md` : sauvegarde, restauration, tâches planifiées de la base.
- `publication-controlee.md` : publication et retour à la version précédente du site.
- `recette-hors-ligne.md` : base locale et émulateur.

`app/README.md` est le texte par défaut de Next.js : il n'apprend rien sur Gerimmo.

### Les documents du dirigeant (à la racine)

| Fichier | Ce qu'il contient |
|---|---|
| `JOURNAL.md` | Le journal de la mission « palier 1 » : cinq lignes par lot (fait, vérifié, limites, reste). |
| `QUESTIONS.md` | Les questions posées au dirigeant et ses décisions, question par question. |
| `DECISIONS-2026-11-24.md` | Les réponses du dirigeant du 24/11/2026, mot pour mot. |
| `JURISTE.md` | Les points de droit à faire valider. Rien n'est noté « conforme » sans texte officiel lu. |
| `REPONSES-JURISTE.md`, `TEXTES-OFFICIELS-LUS-2026-11-24.md` | Les réponses reçues et les textes lus. |
| `AUDIT.md` et `audit-palier-1/` | L'audit du 22/11/2026 : état des modules, sécurité, écarts. |
| `log.md` | Le journal long du projet. C'est là que sont les publications passées (entrées `deploy`). |
| `wiki/` | Les règles métier. Lire `index.md` en premier. |

Pages du wiki utiles à une reprise technique :

- `wiki/regles-metier/Plan de reprise d'activité.md`
- `wiki/regles-metier/Isolation multi-organisation.md` et `Socle de sécurité.md`
- `wiki/processus/Recette de production.md`
- `wiki/syntheses/Référence des tests — commandes, volumes, durées, dépendances, limites.md`
- `wiki/syntheses/Prompt de passation à Codex — état du 16 octobre 2026.md` (environnement, pièges, protocole de déploiement ; daté, voir section 9)

---

## 3. Lancer en local

Cette section sert à faire tourner Gerimmo sur un poste, sans toucher à la production.

### Prérequis

| Outil | Version | Où c'est écrit |
|---|---|---|
| Node.js | 22 | Tous les workflows (`node-version: 22`). Le dépôt n'a ni `.nvmrc` ni champ `engines`. |
| npm | celui de Node 22 | `app/package-lock.json` |
| PostgreSQL (serveur et client `psql`) | 18 dans la vérification automatique | `ci.yml`. Le script local cherche les binaires dans `/usr/lib/postgresql/*/bin` (disposition Debian ou Ubuntu). |
| Navigateurs Playwright | Chromium, et WebKit pour une des suites | `npx playwright install --with-deps chromium webkit` (commande de `ci.yml`) |
| Docker | seulement pour quelques contrôles de la vérification automatique | `ci.yml` y lance PostgREST 14.5 et GoTrue 2.197.0 |

### Installer

```bash
cd app
npm ci
```

`npm ci` lance aussi `scripts/copier-pdfjs.mjs` (copie d'une bibliothèque PDF).

### Les variables d'environnement

Copier le modèle, puis remplir seulement ce qu'il faut :

```bash
cp .env.example .env.local
```

`.env.local` n'est jamais envoyé au dépôt. `.env.example` explique chaque variable. Le test `tests/env-example.test.ts` refuse une variable lue par le code et absente de ce fichier.

Pour un lancement local sur l'émulateur, le minimum relevé dans `ci.yml` est :

| Variable | Valeur locale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | une valeur quelconque |
| `NEXT_PUBLIC_SITE_URL` | l'adresse locale du site |
| `SUPABASE_DB_URL` | la base locale (pour `npm test`) |
| `SUPABASE_SERVICE_ROLE_KEY` | une clé de service **locale** (voir section 9, point 1) |

En local, aucun service externe n'est appelé : `lib/verrou-pilote.ts` interdit toute opération payante hors de la production commerciale.

### La base locale

Le dépôt fournit sa propre base locale et son propre émulateur de Supabase. Il n'utilise pas la commande `supabase start`.

```bash
npm run e2e:base              # crée la base, joue toutes les migrations dans l'ordre du manifeste, charge les données de démonstration
npm run e2e:emulateur         # lance l'API Supabase locale sur le port 54321 (laisser tourner)
node e2e/local/seed-parcours.mjs   # ajoute un dossier complet : bail, état des lieux, loyer, incident
```

- `e2e:base` lance `e2e/local/preparer-base.sh`. Par défaut : données dans `/tmp/gerimmo-pgdata`, port `55432`, base `gerimmo_local`. Il refuse de démarrer si une migration manque au manifeste.
- `e2e:emulateur` lance `e2e/local/serveur-supabase-local.mjs`. Il applique les vraies règles de sécurité de la base à chaque requête. Les fichiers déposés vont dans `/tmp/gerimmo-storage`.
- Les comptes de démonstration sont dans `supabase/seed.sql` (adresses en `@example.com`, listées dans `e2e/auth.setup.ts`). Leur mot de passe par défaut est décrit à la variable `E2E_MOT_DE_PASSE` de `.env.example`.

Limites écrites dans `docs/recette-hors-ligne.md` : aucun e-mail ne part, et l'émulateur ne couvre que les appels à Supabase que le code utilise.

### Les commandes

Toutes se lancent depuis `app/`. Elles viennent de `app/package.json`.

| But | Commande |
|---|---|
| Lancer l'application en développement | `npm run dev` (port 3000) |
| Construire comme en production | `npm run build` |
| Lancer la version construite | `npm run start` |
| Vérifier le style du code | `npm run lint` |
| Vérifier les types | `npm run typecheck` |
| Tests unitaires et tests de base | `npm test` |
| Parcours navigateur (gabarit téléphone) | `npm run test:e2e` |
| Parcours essentiels sur WebKit | `npm run test:e2e:webkit` |
| Matrice d'écrans pour les parcours | `npm run e2e:matrice` |

Précisions utiles :

- **`npm test` sans `SUPABASE_DB_URL`** : les tests de base se sautent d'eux-mêmes. Avec la base locale : `SUPABASE_DB_URL=postgres://postgres@127.0.0.1:55432/gerimmo_local npm test`.
- **Les tests refusent la production.** `tests/garde-base.ts` arrête tout si `SUPABASE_DB_URL` vise le projet de production.
- **La vérification automatique lance `npm test -- --maxWorkers=1`**, donc tout en série.
- **Parcours navigateur** : par défaut, Playwright lance `npm run dev` et vise `http://localhost:3000`. La vérification automatique, elle, teste la version construite : `E2E_USE_BUILD=1 E2E_BASE_URL=http://localhost:3100 npm run test:e2e`.
- **Ordre suivi par la vérification automatique** : `npm run lint`, puis `npm run build`, puis `npm run typecheck`.

---

## 4. La base de données

Cette section donne les règles à respecter avant de toucher à la base.

### La règle

**Toute modification de la base passe par un fichier de migration**, dans `app/supabase/migrations/`.

En production, une migration s'applique **uniquement** par le workflow GitHub « Migrations Supabase » (`.github/workflows/migrations.yml`). Jamais à la main, jamais par un outil SQL en écriture (`app/CLAUDE.md`).

### La convention d'une migration

Pour chaque modification, on livre ensemble :

1. **Le fichier de migration**, nommé `AAAAMMJJHHMMSS_nom.sql`. Il est **rejouable** : le rejouer ne casse rien. Il n'écrase aucune donnée existante sans décision.
2. **Le script de retour arrière**, dans `app/supabase/retours-arriere/`, nommé `…_nom.retour.sql`.
3. **Une entrée dans `app/supabase/retours-arriere/LISEZ-MOI.md`** : ce que le retour défait, ce qu'il exige avant, et sa place dans l'ordre des retours.
4. **Le nom du fichier ajouté une seule fois, à la fin de `app/e2e/local/ordre-migrations.txt`** (le manifeste).
5. **Un test de base** dans `app/tests/` (souvent `…-base.test.ts`). Il rejoue la migration et son retour dans une transaction. Il s'ajoute à la liste `FICHIERS_EN_SERIE` de `app/vitest.config.ts`.

Les six derniers fichiers de `migrations/` (24/11/2026) suivent ce modèle et peuvent servir d'exemple.

### L'ordre : le manifeste fait foi

**L'ordre des migrations n'est pas l'ordre alphabétique des fichiers.** Le bon ordre est celui de `app/e2e/local/ordre-migrations.txt`, reconstruit depuis l'historique de la production. Des fichiers ont été renommés ; leurs dates ne sont plus celles de la base.

Conséquences :

- Ne jamais « rattraper » une migration parce que son numéro manque dans l'historique de la base.
- Ne jamais comparer le nombre de fichiers au nombre de versions enregistrées.
- L'en-tête de `migrations.yml` liste quatre fichiers enregistrés en base sous un autre numéro. **Ne jamais les nommer** dans le workflow.

### Les règles de sécurité par ligne (RLS) : on ne les relâche jamais

Chaque organisation ne voit que ses données. Cette séparation est faite par la base elle-même.

- **Toute table publique a la RLS activée et au moins une politique.** `tests/socle.test.ts` le vérifie, ainsi que l'isolation entre deux agences.
- **Aucune fonction n'est appelable sans être connecté.** `tests/aucune-fonction-ouverte-a-anon.test.ts` le vérifie.
- `tests/api-isolation.test.ts` rejoue l'isolation à travers l'API.
- La règle de la mission, écrite dans `log.md` (22/11/2026) : aucun test, aucune règle de sécurité ni l'isolation RLS ne sont désactivés. `app/AGENTS.md` ajoute : ne jamais désactiver un contrôle pour obtenir un résultat vert.

### Les fonctions à droits élevés

Beaucoup de fonctions SQL sont déclarées `security definer` : elles s'exécutent avec les droits de leur propriétaire et contournent donc la RLS. Elles suivent trois règles.

1. **`set search_path = ''`** dans la déclaration, et tous les objets écrits avec leur schéma (`public.…`).
2. **La fonction contrôle elle-même qui l'appelle** (par exemple `public.is_permanent_super_admin()` en tête des réglages de la console).
3. **La migration se termine par `select public.fermer_fonctions_a_anon();`**. Recréer une fonction lui rend ses droits par défaut, donc ouverts à tous : cet appel les referme. Le piège est expliqué en tête de `tests/aucune-fonction-ouverte-a-anon.test.ts`.

### La clé de service

`SUPABASE_SERVICE_ROLE_KEY` contourne toute la RLS. Elle ne vit que côté serveur et ne porte jamais le préfixe `NEXT_PUBLIC_`. Elle sert aux tâches planifiées, aux liens de connexion et à `/api/sante`.

### Les tâches planifiées

Il y en a de deux sortes :

- **Dans la base** (pg_cron) : dix tâches (appels de loyer du 1er du mois, alertes, conservation des données…). Le tableau complet est dans `app/docs/sauvegarde-et-restauration.md`.
- **Sur le site** (Vercel Cron) : routes `/api/cron/…`, déclarées dans `app/vercel.json`. Chaque route exige le secret `CRON_SECRET` et répond 503 sans lui.

---

## 5. Publier

Cette section décrit la procédure de publication réellement suivie, étape par étape.

### La règle avant tout

**La production est gelée.** Aucune publication, aucune migration, aucune suppression sans l'accord écrit du dirigeant. Sa règle du 24/11/2026, mot pour mot : « Tu ne publies qu'après mon message "je valide la publication". »

Cet accord écrit se double d'un verrou technique : les workflows de migration et de publication tournent dans l'environnement GitHub `gerimmo-production`. Le dirigeant approuve chaque passage dans GitHub.

### Les contrôles avant

1. **Travailler sur une branche**, partie de `main`. Ouvrir une demande de fusion (PR) vers `main`.
2. **La vérification automatique** (workflow « CI », tâche « Lint, types, tests, build ») part seule sur toute PR et sur tout envoi vers `main`. Elle joue : contrôle des dépendances (`npm audit`), style, construction, types, tous les tests en série, puis les parcours navigateur (Chromium, WebKit, e-mails avec boîte fictive).
3. **Fusionner** en « squash », quand la vérification est verte sur le dernier commit de la branche. Le journal du 21/11 précise : branche à jour avec `main`.
4. **Attendre que la vérification automatique de `main` soit verte** sur le commit fusionné. Les étapes suivantes l'exigent.

### La base d'abord

**La base se met à jour avant le code** (JOURNAL, lot D1 : « À la publication, la base doit être mise à jour avant le code »).

Tout se fait dans GitHub, onglet Actions, branche `main`.

5. **Simulation.** Workflow « Migrations Supabase ». Champ `fichiers` : les noms des fichiers, séparés par des espaces, **dans l'ordre du manifeste**. Case `simulation` cochée. Tout le lot est joué dans une seule transaction, puis annulé. Rien n'est conservé.
6. **Sauvegarde.** Workflow « Sauvegarde quotidienne », lancé à la demande. Attendre son succès.
7. **Application.** Workflow « Migrations Supabase », mêmes fichiers, même ordre, case `simulation` décochée.

Le workflow refuse l'application réelle dans cinq cas :

- la vérification automatique n'est pas terminée et réussie sur le commit exact lancé ;
- aucune sauvegarde n'a réussi depuis moins de 90 minutes ;
- une version nommée est déjà enregistrée en base ;
- le même contenu est déjà appliqué sous un autre numéro ;
- un nom contient un chemin, ou n'est pas un fichier `.sql` de `migrations/`.

Si la sauvegarde date de trop, il n'y a pas de contournement : relancer la sauvegarde, attendre, relancer.

### Le site ensuite

8. **Publication contrôlée.** Workflow « Publication contrôlée Gerimmo » (`publication-controlee.yml`). Il demande :
   - `revision` : le commit complet (40 caractères) ;
   - `deploiement` : la référence Vercel `dpl_…` de la version déjà construite ;
   - `tests` : le numéro de l'exécution réussie de la vérification automatique ;
   - `publier` : décoché, il vérifie seulement ; coché, il publie ;
   - `base_compatible` : à cocher si la base actuelle fonctionne aussi avec la version précédente du site.

   Le workflow ne fait rien tant que la variable GitHub `GERIMMO_RELEASE_ENABLED` ne vaut pas `true`.

9. **Contrôles pendant.** Le contrôleur (`app/scripts/deploiement/publier.mjs`) compare le projet, la branche, le commit, la santé de la version préparée et celle de la version en ligne. Après la bascule, il vérifie trois fois de suite le commit servi et la connexion à la base. Après trois échecs, il demande le retour à la version précédente.

### Les contrôles après

10. **Lire `https://www.gerimmo.app/api/sante`** : le commit servi, la base, pas de maintenance.
11. **Ouvrir les pages publiques** : accueil, tarifs, pages légales, connexion, inscription.
12. **Recette de production.** Workflow « Recette de production avec nettoyage ». Il crée cinq comptes fictifs en production, parcourt les espaces sur un gabarit téléphone, puis supprime ces comptes. Aucun paiement réel.
13. **Surveiller les erreurs** du site dans l'heure qui suit.
14. **Consigner** dans `log.md` : une entrée `deploy`, avec les numéros d'exécution. Ce qui n'a pas été vérifié s'écrit tel quel.

### D'où vient cette procédure

Elle est reconstituée depuis les workflows et depuis `log.md`, entrée du 21/11/2026 (PR #353 à #356). Ce jour-là : fusions, vérification de `main` verte, simulation, sauvegarde, application de deux migrations, publication contrôlée, recette n° 57, le tout après trois approbations du dirigeant dans GitHub.

`JOURNAL.md` ne contient aucune publication : toute la mission « palier 1 » s'est faite production gelée.

### Les autres workflows

| Workflow | Rôle | À savoir |
|---|---|---|
| « Disponibilité publique Gerimmo » | Vérifie le site et l'âge de la sauvegarde, deux fois par heure | Ouvre un signalement GitHub après deux contrôles planifiés en échec |
| « Vérifier les paiements Stripe sans argent réel » | Recette Stripe en clés de test | À la demande |
| « Atelier de corrections Gerimmo » | Corrections préparées par un agent | Fermé tant que `GERIMMO_CODEX_ENABLED` ne vaut pas `true` |
| « Vérifier les connexions de l'atelier » | Teste des accès externes avec de vrais secrets | Ne pas lancer sans le dirigeant |

---

## 6. Revenir en arrière

Cette section dit quoi faire si une publication se passe mal. Trois niveaux, du plus léger au plus lourd.

### Avant de choisir

Un retour arrière de la base **réintroduit les défauts** que la migration corrigeait. Le `LISEZ-MOI.md` des retours recommande de l'envisager seulement si une migration cause un dommage constaté, et si une correction « en avant » (une nouvelle migration) est plus lente ou plus risquée.

Tout retour arrière en production demande une **décision du dirigeant**, et se consigne.

### Niveau 1 : remettre la version précédente du site

- **Retour automatique.** Le contrôleur de publication revient seul à la version qui était en ligne au début du contrôle, après trois vérifications en échec. Il s'arrête si la panne touche aussi l'ancienne version, ou si une réponse est incertaine. Le résultat doit être confirmé avant d'annoncer « rétabli ».
- **Retour à la main.** Vercel garde les anciennes versions. `app/docs/publication-controlee.md` renvoie à la documentation Vercel du retour à une version précédente.
- **Dans le code.** Annuler la fusion par un commit inverse (`git revert`), puis republier par la procédure normale.

**Migrations du lot D3 (24/11/2026), pas encore publiées.** Six fichiers, à nommer dans cet ordre, qui est celui du manifeste, avant de publier le code :

1. `20261124180000_notice_information_deposee.sql`
2. `20261124190000_reperes_fiscaux_source.sql`
3. `20261124200000_justificatif_retenue_piece_existante.sql`
4. `20261124210000_reperes_fiscaux_ancien_reglage_sans_source.sql`
5. `20261124220000_justificatif_retenue_dossier_du_bail.sql`
6. `20261124230000_reperes_fiscaux_ancien_reglage_journal_source.sql`

Elles viennent après celles des lots D1 et D2 dans le manifeste. Chacune a son retour arrière ; l'ordre des retours et leurs conditions sont dans le `LISEZ-MOI.md` des retours (avant de revenir au code précédent, activer ou annuler les circuits de signature de bail en cours). Le jour de la publication : saisir les repères fiscaux et leur source dans la console du super admin (aucune valeur n'est écrite par les migrations). Ces migrations n'ont été jouées que sur des bases d'essai.

**Ce circuit ne restaure jamais la base.** Si la migration publiée n'est pas compatible avec l'ancien code, remettre l'ancien site ne suffit pas.

### Niveau 2 : jouer les retours arrière de la base

Les scripts sont dans `app/supabase/retours-arriere/`. **Lire d'abord `LISEZ-MOI.md`** : chaque script y a sa ligne, ses conditions et sa place dans l'ordre.

Règles communes :

- **Ordre inverse** : le retour de la migration la plus récente passe en premier. Plusieurs scripts refusent de s'exécuter si une migration plus récente est encore en place.
- **Le code d'abord, quand le LISEZ-MOI le dit** : beaucoup de retours exigent de remettre le code précédent avant de toucher à la base.
- **À la main, jamais par le workflow.** Ces scripts ne sont pas des migrations. Ne jamais les passer à « Migrations Supabase ».

Procédure écrite dans le `LISEZ-MOI.md` :

1. **Préparer.** Lancer « Sauvegarde quotidienne » à la demande et attendre son succès. Vérifier qu'aucune migration plus récente n'a réécrit les mêmes objets.
2. **Simuler.** Jouer le script dans une transaction annulée à la fin. Depuis le 20/10/2026, chaque retour est une seule instruction atomique : il s'annule entièrement dans une transaction ouverte autour de lui.
3. **Exécuter**, dans l'ordre inverse :
   ```bash
   psql "$URL" -v ON_ERROR_STOP=1 -f <fichier>.retour.sql
   ```
   `$URL` est la connexion par le « pooler » en mode session (port 5432), comme dans `migrations.yml`. Le mot de passe passe par la variable `PGPASSWORD`, jamais dans la ligne de commande.
4. **Vérifier** l'état de la base. Les scripts retirent eux-mêmes leur version de l'historique, pour que la migration puisse être rejouée plus tard.
5. **Consigner** la décision, l'heure, l'opérateur et le résultat dans `log.md`.

Deux limites à connaître :

- **Un retour ne défait pas les données déjà écrites** (lignes de journal, notifications parties, états changés entre-temps).
- **Toutes les migrations n'ont pas de retour**, et aucun n'a été joué en production. Aucune migration d'avant le 13/10/2026 n'en a (AUDIT.md, relevé du 22/11). Pour celles-là, le filet est la sauvegarde.

### Niveau 3 : restaurer la sauvegarde

**Où est la sauvegarde.** Chez Scaleway, à Paris, dans un compte distinct de Supabase. Le workflow « Sauvegarde quotidienne » (`sauvegarde.yml`) y dépose chaque jour une copie chiffrée de la base et des fichiers, puis la relit. Chaque copie est rangée sous un préfixe `AAAAMMJJ-HHMM/`. Le nom du compartiment est dans la variable GitHub `SCW_BUCKET`.

**Ce qu'elle contient.** La base (schémas `public`, `auth`, `storage`, `support_interne`, `consommations_interne`, `supabase_migrations`), avec les droits ; les dix tâches planifiées, dans un fichier à part ; les fichiers déposés. Chiffrement AES-256-GCM.

**Comment vérifier qu'elle se restaure.** Workflow « Vérifier la restauration de la sauvegarde réelle » (`restauration-sauvegarde.yml`), à la demande, sur `main`. Il télécharge la dernière copie, la déchiffre et la restaure dans une base jetable. Il ne touche ni à Scaleway, ni à Supabase, ni au site. Il ne garde qu'un bilan sans donnée personnelle. Il manipule la copie réelle : le lancer avec l'accord du dirigeant.

**Comment restaurer pour de bon.** La procédure en sept étapes est dans `app/docs/sauvegarde-et-restauration.md`, section « Procédure en cas d'incident ». En résumé :

1. suspendre les écritures et les envois ;
2. obtenir la clé de chiffrement et télécharger les archives ;
3. contrôler la copie, puis préparer **un projet Supabase de secours distinct**, avec envois, paiements et signatures coupés ;
4. restaurer les schémas et les droits (ne jamais utiliser `--no-privileges`) ; remettre les fichiers aux mêmes chemins ;
5. vérifier des comptes, un bail, une quittance, et les refus d'accès entre organisations ;
6. faire valider la bascule, changer les connexions du site ;
7. **réactiver `pg_cron` et `pg_net`, puis recréer les tâches planifiées** avec le script `rejouer-pg-cron.sql`. Une restauration ne les recrée pas. Sans cette étape, plus aucun appel de loyer ne part, et rien ne le signale avant 32 jours.

**Ce qui n'a jamais été éprouvé** (écrit dans la même note) : la bascule complète vers un projet de secours, la remise en route des tâches planifiées sur ce projet, et une remise en service en moins de quatre heures.

### RISQUE À TRAITER : la clé de chiffrement des sauvegardes

> **Sans la clé, aucune sauvegarde ne se restaure.**
>
> La clé (`GERIMMO_BACKUP_KEY`) existe à un seul endroit : les secrets de GitHub. Un secret GitHub ne se relit pas.
>
> Le dirigeant l'a écrit le 24/11/2026 (QUESTIONS, Q9) : « je n'ai aucune copie de la clé des sauvegardes. Guide-moi pour en créer une nouvelle, puis lance une sauvegarde avec elle. » Le 24/11, ce point est noté « reste à faire ».
>
> Conséquence : si l'accès au compte GitHub est perdu, toutes les sauvegardes deviennent illisibles. Une restauration à la main, hors de GitHub, est impossible aujourd'hui.
>
> À faire : créer une nouvelle clé (32 octets aléatoires, 64 caractères hexadécimaux), en garder une copie hors de GitHub dans un gestionnaire de secrets, la poser dans le secret GitHub, lancer une sauvegarde, puis lancer le contrôle de restauration. Les copies faites avec l'ancienne clé restent liées à l'ancienne clé.

---

## 7. Les interrupteurs

Cette section dit où se règle chaque fonction qu'on peut ouvrir ou fermer. Il y a deux endroits : la console du super admin, et les variables d'environnement de Vercel.

**Une variable changée sur Vercel ne s'applique qu'à la publication suivante.** Un réglage de la console s'applique tout de suite.

### Dans la console du super admin

| Interrupteur | Où | Ce qu'il fait |
|---|---|---|
| IA activée / désactivée | `/admin/parametres`, « Fonctions assistées par l'IA » | Coupe toute l'IA d'un geste. La base refuse alors chaque appel. Chaque écran propose la saisie manuelle. |
| Envois automatiques d'e-mails | `/admin/parametres`, « Envois automatiques d'e-mails » | Quatre envois, un interrupteur chacun : avis d'échéance, relance amiable de loyer, rappel de rendez-vous, relance d'invitation. Fermés à la livraison. |
| Ventes (souscriptions payantes) | `/admin/parametres` | Ouvre ou ferme les nouveaux abonnements payants. Un second réglage bloque la vente tant que l'identité de l'éditeur est incomplète. |
| Repères fiscaux | `/admin/parametres`, « Repères fiscaux » | Plafond et abattement du micro-foncier, avec leur date de vérification. Ce n'est pas un interrupteur, mais un réglage qui évite une publication. |
| Arrêts d'urgence | `/admin/relais` | Arrête les tâches planifiées, en tout ou par famille. Neuf des dix tâches de la base sont couvertes. |
| Limite quotidienne d'appels à l'IA | `/admin/relais` | Plafonne le nombre d'appels par jour. |
| Budget des signatures | `/admin/sante`, « Budget des signatures » | Plafond mensuel des envois en signature électronique. |
| Publication des articles et de Facebook | `/admin/marketing` | Parution automatique, veto, jours et heure. |

Les réglages sensibles exigent un super admin permanent avec double vérification : la base le contrôle elle-même.

### Par variable d'environnement (Vercel)

| Variable | Effet, d'après le code |
|---|---|
| `GERIMMO_MODE` | Le **mode commercial**. Toute opération payante externe est interdite, sauf si `GERIMMO_MODE` vaut `commercial`, sur Vercel, en production, avec `NEXT_PUBLIC_SITE_URL` égal à `https://www.gerimmo.app` (`lib/verrou-pilote.ts`). La valeur `simulation` sert aux bancs d'essai et refuse une clé Stripe réelle. |
| `GERIMMO_PILOTE_LIMITE` | `true` : opérations payantes interdites. |
| `GERIMMO_PAIEMENTS_DESACTIVES` | `1` : opérations payantes interdites. |
| `GERIMMO_TRANSITION_LOTS` | `maintenance` : bloque les écritures et les tâches planifiées du site ; la lecture reste possible (`lib/transition-livraison.ts`). `/api/sante` l'annonce. Vide hors fenêtre de livraison. |
| `ZOHO_SIGN_BAIL_ACTIF` | `true` : ouvre l'envoi des baux en signature électronique. |
| `ZOHO_SIGN_DOCUMENTS_ACTIF` | `true` : ouvre les autres actes. Exige aussi le précédent et un plafond dans la console. |
| `ZOHO_SIGN_DEVIS_ACTIF` | `true` : ouvre la signature des devis. |
| `ZOHO_SIGN_RELANCES_ACTIVES` | `true` : ouvre les rappels de signature. |
| `ZOHO_SIGN_CAUTIONNEMENT_FERME` | `1` ou `true` : suspend les nouveaux envois de l'acte de cautionnement. |
| `ZOHO_SIGN_ENV` | Choisit l'environnement Zoho. Le modèle porte `sandbox`. |
| `RESEND_CONTACT_TRANSFERT_ACTIF` | Ouvre le transfert de la boîte de contact. |
| `GERIMMO_RELAIS_EMAILS` | Adresses de l'alerte du matin. Vide : aucun e-mail d'alerte ne part. |
| `GERIMMO_CODEX_ENABLED` (variable GitHub) | `true` : ouvre l'atelier de corrections. À laisser fermé. |
| `GERIMMO_RELEASE_ENABLED` (variable GitHub) | `true` : autorise la publication contrôlée. |

### Comment les verrous se combinent

- **Les ventes** sont ouvertes seulement si le mode est commercial **et** si le réglage « ventes » de la console est ouvert (`app/src/app/actions/abonnement.ts`).
- **L'IA** a trois états (`lib/etat-ia.ts`) : activée ; désactivée par le super admin ; activée mais « non connectée » quand la clé manque ou que le verrou pilote s'applique.
- **Les décisions du 24/11/2026 pour le jour de la publication** : mode commercial, ouverture des quatre envois automatiques et d'un cinquième, IA laissée activée (DECISIONS, Q6, Q12, Q16, Q37).

---

## 8. Pièges connus et conventions de tests

Cette section évite de perdre du temps sur des problèmes déjà rencontrés.

### Conventions de tests

- **Les fichiers « en série ».** `app/vitest.config.ts` tient la liste `FICHIERS_EN_SERIE`. Ces fichiers tournent après tous les autres, un par un. Raison : ils partagent une seule base, et certains posent des verrous (rejeu d'une migration, déclencheur suspendu) ou valident des données visibles de toutes les sessions. En parallèle, ils se bloquent entre eux (`deadlock detected`). Tout nouveau test qui rejoue une migration s'ajoute à cette liste. `tests/execution-en-serie.test.ts` garde la liste cohérente.
- **Des tests qui ne tournent que dans la vérification automatique.** Certains exigent des services que seul `ci.yml` installe : un vrai PostgREST, un vrai service de connexion (GoTrue), des bases jetables nommées `gerimmo_ci_…`. Sur un poste, le JOURNAL note chaque fois « 2 fichiers en échec », attendus. Un échec local de ces fichiers n'est pas une régression.
- **Les tests de rendu PDF** demandent un navigateur. La vérification automatique installe Chromium et pose `GERIMMO_CHROME`.
- **Le jour de référence est le jour de Paris.** Les tests qui dépendent de la date figent `aujourdhui_paris()` (`tests/fixtures/jour-de-paris-fige.ts`).
- **Parcours navigateur** : gabarit téléphone 390 × 844, deux exécutions en parallèle, un second essai permis (`e2e/playwright.config.ts`). Trois familles de parcours ont leur propre configuration et ne tournent pas dans la suite générale.
- **Règle tirée du JOURNAL** : un parcours qui réussit « au second essai » n'est pas compté comme propre tant que la cause n'est pas trouvée. Chaque parcours nouveau se joue seul avant le passage complet.

### Parcours instables déjà corrigés, et pourquoi

Tous viennent du JOURNAL (22 au 24/11/2026). Dans chaque cas, l'application était juste : c'est le contrôle qui était fragile.

| Symptôme | Cause | Correction |
|---|---|---|
| Un test classait des événements par heure | Tous portaient la même heure | Classement par ordre réel d'écriture |
| Un parcours comptait deux panneaux au lieu d'un | Une copie cachée existe un court instant pendant le chargement | Le parcours vise le panneau affiché |
| Un parcours vérifiait trop tôt | La page rouvre une rubrique à son démarrage, ou redirige avant la fin du chargement | Le parcours attend l'adresse ou l'état final |
| Un test de facture échouait après 23 h | Il datait « il y a 30 jours, à la même heure » | Dates posées à midi, heure de Paris |
| Deux exécutions simultanées échouaient | Elles déposaient le même fichier PDF, ou se disputaient le même réglage | Un fichier par exécution ; pas de copies en parallèle sur un même réglage |
| Deux échecs sur un passage | Données laissées par le passage précédent | Rejouer sur une base remise à neuf |

### Pièges d'environnement

- **Le serveur de développement peut mentir.** Le 12/09, des fiches renvoyaient 404 sous `npm run dev` alors que la version construite les servait. Avant de conclure qu'un écran est cassé, rejouer sur la version construite (commentaire de `e2e/playwright.config.ts`).
- **Tests sensibles à l'heure.** Entre 23 h et minuit UTC, le jour de Paris a déjà changé. Un échec dans cette plage n'est pas forcément une régression.
- **`npm run build` contrôle l'environnement.** `scripts/deploiement/garde-environnement.mjs` refuse de construire sur Vercel en production si la configuration commerciale est incohérente, ou si `COURRIELS_CHIFFREMENT_CLE` manque. Il refuse aussi les aperçus Vercel tant qu'ils n'ont pas de services isolés.
- **Les aperçus Vercel et la production.** L'audit du 22/11 relève que les aperçus recevaient l'adresse et la clé publique de la base de production. Ne pas utiliser un aperçu comme préproduction sans réglages propres.
- **`node_modules/node_modules`.** Un lien parasite de ce nom a fait échouer la construction deux fois. Le retirer s'il réapparaît.
- **Dossier `.next/dev` périmé.** Le supprimer avant une série de contrôles.
- **Les doublures de connexion ne valent pas le vrai service.** Tout parcours d'inscription, de confirmation ou de mot de passe s'éprouve sur un vrai GoTrue, comme le fait `ci.yml`.
- **La production n'est pas toujours le dépôt rejoué.** Des fonctions en production n'ont pas exactement la mise en forme du dépôt. D'où la simulation obligatoire avant toute application.
- **Horaire réel de la sauvegarde.** Planifiée à 01 h 20 UTC, elle est partie en réalité entre 05 h 56 et 07 h 49 UTC sur vingt passages (relevé du 16/10). Regarder la dernière réussite, pas l'horaire prévu.

Les cinq derniers pièges viennent de la page du wiki « Prompt de passation à Codex — état du 16 octobre 2026 », § 3.4 et § 3.5.

---

## 9. Non vérifié / à confirmer

Cette section liste ce qui n'a pas pu être vérifié dans le dépôt. Rien de ce qui suit ne doit être tenu pour acquis.

1. **Le lancement local complet n'a pas été joué pour ce guide.** Les commandes de la section 3 sont lues dans `package.json`, `ci.yml` et `docs/recette-hors-ligne.md`, pas exécutées. Deux points à confirmer sur un poste neuf :
   - `e2e/local/preparer-base.sh` cherche PostgreSQL dans `/usr/lib/postgresql/*/bin`. Sur macOS ou Windows, ce chemin n'existe pas.
   - La clé de service locale. `.env.example` dit que l'émulateur l'affiche au démarrage. L'émulateur écrit en réalité « Clé fictive configurée ; valeur non journalisée ». `ci.yml` la fabrique lui-même (étape « Démarrer l'API de test locale »). Sans elle, ni inscription ni lien de mot de passe en local.
2. **La version de PostgreSQL de la production.** Les workflows de sauvegarde et de restauration installent le client 17 « même version que le serveur ». La vérification automatique teste sur la 18. `docs/recette-hors-ligne.md` et la page de passation parlent de la 16 sur un banc local. Aucune lecture directe de la production n'a été faite.
3. **Les réglages chez Vercel.** Non lus : les valeurs réelles des variables (dont `GERIMMO_MODE`, que QUESTIONS Q16 dit masquée), et le réglage qui empêche une fusion sur `main` de changer le site toute seule. Le journal du 21/11 montre que le site a changé à la publication contrôlée, pas à la fusion ; le réglage lui-même n'a pas été lu.
4. **Les réglages chez GitHub.** Non lus : la protection de `main`, les approbateurs de l'environnement `gerimmo-production`, la valeur de `GERIMMO_RELEASE_ENABLED`, la liste réelle des secrets.
5. **Les réglages chez Scaleway.** La durée de conservation de 90 jours et la règle de cycle de vie sont écrites dans la documentation, « configurées par le porteur ». Non vérifiées.
6. **Le retour à la main vers une version précédente chez Vercel.** La documentation renvoie à celle de Vercel. Aucune trace d'un retour joué en production n'a été trouvée.
7. **Les retours arrière de la base.** Préparés et testés sur des bases d'essai. Aucun n'a été joué en production (AUDIT.md). Le compte exact des migrations sans retour n'a pas été refait pour ce guide : 206 scripts pour 563 migrations le 24/11.
8. **La restauration complète.** Seule la récupération de la base et des fichiers dans une base jetable est prouvée (27/09 et 16/10). La bascule vers un projet de secours ne l'est pas. Aucune restauration n'a été lancée pour ce guide.
9. **La nouvelle clé de chiffrement des sauvegardes.** Notée « reste à faire » le 24/11. Rien ne dit qu'elle a été créée depuis.
10. **Les noms exacts des deux fichiers de tests qui échouent hors de la vérification automatique.** Le JOURNAL en compte deux sans les nommer. Les candidats lus dans le code : `tests/auto-relation-documents-postgrest.test.ts` (vrai PostgREST exigé) et `tests/lot2-auth-reel.test.ts` (vrai service de connexion). À confirmer en lançant `npm test` sur un poste.
11. **La préproduction.** Le code prévoit un environnement Vercel « preproduction » avec une base Supabase isolée (`garde-environnement.mjs`). La décision du 24/11 est : pas de copie de base, publication directe en production. L'existence réelle de cette base isolée n'a pas été vérifiée.
12. **L'état de la branche.** La branche `claude/palier-1-preproduction` n'est pas fusionnée dans `main`. Le lot #357 est dans `main`, non publié. La production sert le commit `81740dec` selon AUDIT.md et `log.md` (22/11), non relu pour ce guide.
13. **Les lots D4 à D7** des décisions du 24/11 (cinquième envoi automatique, nouvelle version des conditions, retrait de l'ancien parcours de signature, vendeur) : le code lu porte les lots D1 à D3. Les interrupteurs de la section 7 décrivent donc quatre envois, pas cinq.
14. **Le nom du dépôt.** Les liens de la documentation pointent vers `github.com/GERIMMO/GERIMMO_V4`.

### Écarts relevés entre le code et la documentation existante

Ces écarts ne bloquent rien, mais un repreneur doit savoir quel document croire. **En cas de doute, le workflow et le code font foi.**

| Document | Ce qu'il dit | Ce que montre le code |
|---|---|---|
| `app/README.md` | Texte par défaut de Next.js | Rien sur Gerimmo |
| `app/CLAUDE.md` | « Code (identifiants, commits) : anglais » ; trois commandes | Identifiants et commits en français ; `package.json` porte quinze commandes |
| Page de passation à Codex, § 3.3 et § 6 | Migrations lancées « sur la branche de la PR », avant la fusion | `migrations.yml` ne tourne que sur `main`. Le 21/11, la fusion a précédé les migrations. |
| Même page, § 3.3 | Un workflow `recette-production.yml` | Ce fichier n'existe plus. Seul `recette-production-autonome.yml` existe. |
| `app/docs/publication-controlee.md` | Le contrôle « n'est pas activé », avec des « connexions à terminer » | `log.md` montre une publication contrôlée réussie le 21/11 |
| `app/docs/sauvegarde-et-restauration.md` | La clé « doit être conservée séparément » | Le dirigeant n'en a aucune copie (Q9) |
| `app/docs/recette-hors-ligne.md` | 128 migrations, 44 écrans | 563 migrations le 24/11 ; note datée du 10/09 |
| `app/.env.example` | « Chaque variable lue par le code figure ici » ; l'émulateur affiche la clé | Les variables propres à `ci.yml` (`GERIMMO_PILOTE_DB`, `GERIMMO_HISTORIQUE_DB`, `GERIMMO_AUTH_REEL_URL`, `SIGNATURE_TEST_API_URL`…) n'y sont pas ; l'émulateur n'affiche pas la clé |
| `sauvegarde.yml` | Un commentaire donne l'heure planifiée | L'heure réelle est plus tardive (voir section 8) |
| `CLAUDE.md` (racine) | L'arborescence décrite ne montre que le wiki | Le dépôt contient aussi `app/`, `.github/` et les documents du dirigeant |
