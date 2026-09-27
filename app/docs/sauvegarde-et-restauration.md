# Sauvegarde et restauration de Gerimmo — état réel au 27/09

Ce document dit ce qui existe, ce qui a été essayé, et ce qui **n'existe pas encore**. Il ne promet rien que le dépôt ne fasse. La page Confidentialité a retiré le 20/09 la mention « restauration testée » : elle ne reviendra qu'après l'exercice décrit en fin de page.

## Ce qui est fait

| Élément | État | Preuve |
|---|---|---|
| Copie chiffrée des fichiers du Storage (`scripts/sauvegarde/fichiers.mjs`) | Programme prêt, **jamais lancé sur le projet réel** | test automatique sur 205 fichiers fictifs (`fichiers.test.mjs`, CI) |
| Export logique de la base (`scripts/sauvegarde/base.mjs`, `pg_dump` des schémas `public`, `auth`, `storage`, chiffré AES-256-GCM) | Programme prêt, **essayé une fois sur la base locale de recette** (1,3 Mo, 111 tables, vérification et déchiffrement corrects), jamais sur la production | `tests/sauvegarde-base.test.ts` |
| Chiffrement | AES-256-GCM, en-tête `GERIMMO1`, clé de 32 octets hors de la copie | les deux programmes partagent le code |
| Manifeste | date, tailles, empreintes SHA-256 ; aucun secret | `verifier` refuse une archive altérée ou une mauvaise clé |
| Droits sauvegardés (27/09) | `--no-privileges` retiré de `pg_dump` : les GRANT/REVOKE (fonctions fermées à `anon`, droits de colonnes) font partie de la copie. Mesuré sur le banc : un dump sans droits, restauré, rouvrait **412 fonctions** à `anon` ; avec les droits, **0** | `tests/sauvegarde-base.test.ts`, `tests/exercice-restauration.test.ts` |
| Passage **quotidien** (27/09) | le Plan de reprise d'activité fixe un RPO de 24 h (RM-A4.11) : le chantier GitHub passe chaque nuit à 01:20 UTC ; Santé le compte en retard au-delà de 26 h (point bloquant) | `.github/workflows/sauvegarde.yml`, `src/lib/sante-service.ts` |
| Exercice de restauration de la base, automatisé sur le banc local (27/09) | **joué le 27/09/2026** : voir § « L'exercice de restauration » | `scripts/sauvegarde/exercice-restauration.mjs` |

## Ce qui n'est pas fait

- **Première sauvegarde réelle prise le 25/09/2026 à 23:08 (Paris)** par le chantier GitHub, préfixe `20260925-2108/` du bucket Scaleway `gerimmo-sauvegardes` : base 1,58 Mo (pg_dump 17, intégrité vérifiée), 62 fichiers du Storage (intégrité vérifiée), relecture depuis Scaleway vérifiée. Cette copie a été prise **sans les droits** (`--no-privileges`) : la restaurer demanderait de rejouer les migrations de droits ; les copies prises après le déploiement du 27/09 les portent. Le passage est **quotidien depuis le 27/09** (il était hebdomadaire). Règle de cycle de vie posée le 25/09 sur le bucket par le porteur : expiration des objets après 90 jours, envois incomplets purgés après 7 jours.
- **Conservation : 90 jours**, règle de cycle de vie du compartiment Scaleway, actée par le porteur le 27/09 (wiki « Plan de reprise d'activité » et « Socle de sécurité » mis à jour).
- **Planification** : le chantier GitHub `sauvegarde.yml` lance les deux programmes chaque nuit (quotidien depuis le 27/09). Vercel n'héberge pas ce genre de tâche (durée, `pg_dump` absent).
- **Destination choisie le 25/09 : Scaleway Object Storage (Paris), compte séparé** ; à configurer par le porteur (§ ci-dessous).
- **Les sauvegardes de la plateforme Supabase** (quotidiennes ou PITR selon le plan) ne sont pas vérifiées par le code : leur existence dépend du plan du projet et se lit dans le tableau de bord Supabase (Database > Backups). L'écran Santé ne les connaît pas.
- **La restauration de la base est outillée et exercée sur le banc local** (27/09, ci-dessous). Restent **manuels et jamais exercés** : la restauration sur un projet Supabase de secours, et la réimportation des **fichiers** (l'archive se vérifie et se déchiffre — `fichiers.test.mjs` — mais aucun programme ne les renvoie dans un Storage avec leurs chemins).
- Les variables `GERIMMO_BACKUP_*` sont documentées dans `.env.example` mais **ne sont posées nulle part**.

## Les programmes

Depuis `app/`, avec `GERIMMO_BACKUP_KEY` (64 caractères hexadécimaux) fourni par un gestionnaire de secrets — jamais en argument, jamais dans le dépôt :

```
# Fichiers du Storage (GERIMMO_BACKUP_SOURCE_URL, GERIMMO_BACKUP_SERVICE_KEY)
node scripts/sauvegarde/fichiers.mjs sauvegarder /dossier/prive/fichiers-AAAAMMJJ
node scripts/sauvegarde/fichiers.mjs verifier    /dossier/prive/fichiers-AAAAMMJJ
node scripts/sauvegarde/fichiers.mjs extraire    /dossier/prive/fichiers-AAAAMMJJ /dossier/prive/clair-fichiers

# Base (GERIMMO_BACKUP_DB_URL : chaîne Postgres directe, pg_dump 15+ installé)
node scripts/sauvegarde/base.mjs exporter /dossier/prive/base-AAAAMMJJ
node scripts/sauvegarde/base.mjs verifier /dossier/prive/base-AAAAMMJJ
node scripts/sauvegarde/base.mjs extraire /dossier/prive/base-AAAAMMJJ /dossier/prive/clair-base
```

Règles communes : le dossier de destination doit être neuf (rien n'est écrasé) ; un fichier de plus de 64 Mo arrête la copie des fichiers ; le bilan affiché ne contient que des nombres et des empreintes ; le mot de passe de la base est transmis à `pg_dump` par l'environnement du processus enfant, pas en argument. Les deux copies ne sont pas une capture instantanée commune : les prendre pendant une période sans écriture, et noter l'heure.

Le dump est au format `custom` de PostgreSQL, sans propriétaires (`--no-owner`) mais **avec les droits** (depuis le 27/09) : il se réimporte avec `pg_restore --no-owner --dbname=…` — **ne pas** ajouter `--no-privileges` à la restauration, sinon chaque fonction retrouve le droit `EXECUTE` de `PUBLIC`. Après restauration, lancer le test `tests/aucune-fonction-ouverte-a-anon.test.ts` sur la base restaurée (`SUPABASE_DB_URL=… npx vitest run tests/aucune-fonction-ouverte-a-anon.test.ts`). Les schémas internes de Supabase ne sont pas exportés : ils appartiennent au projet cible.

## L'exercice de restauration (27/09)

`scripts/sauvegarde/exercice-restauration.mjs` rejoue la chaîne complète **sur le banc local**, avec les vrais programmes : export chiffré (clé jetable) → `verifier` → `extraire` → base cible neuve (`gerimmo_restauration…`, seuls les rôles et le schéma `extensions` préparés, comme un projet Supabase neuf) → `pg_restore --no-owner` → comparaison source (lue dans l'instantané même de `pg_dump`) / cible du **nombre de lignes de chaque table** (`public`, `auth`, `storage`), des **politiques RLS**, des **tables sous RLS**, des **droits** d'`anon`, `authenticated` et `service_role` sur les tables, colonnes et fonctions, et contrôle « aucune fonction ouverte à `anon` » sur la base restaurée. La base cible est supprimée à la fin (sauf `--garder`). Garde-fous : source et cible locales uniquement, identifiant de la production refusé, cible obligatoirement nommée `gerimmo_restauration…`.

```
# depuis app/, base locale du banc démarrée (npm run e2e:base)
node scripts/sauvegarde/exercice-restauration.mjs --source postgres://postgres@127.0.0.1:55432/gerimmo_ci_neuf_api
```

Le test `tests/exercice-restauration.test.ts` le rejoue à chaque passage de la suite (base `SUPABASE_DB_URL` locale).

**Premier exercice : 27/09/2026, 07:47 UTC**, source `gerimmo_ci_neuf_api` (banc local, migrations jusqu'aux correctifs du 27/09, données de démonstration), la source lue dans le même instantané que `pg_dump` : archive de 1,72 Mo, **114 tables, 591 lignes restaurées à l'identique**, **aucun écart** de politiques ni de droits, **0 fonction ouverte à `anon`**, durée totale **3,2 s** (export 0,2 s, restauration 2,6 s, comparaison 0,3 s). Contre-épreuve : le même dump pris avec `--no-privileges` rouvrait 412 fonctions à `anon`.

Ce que l'exercice local **ne prouve pas** : la restauration sur un projet Supabase réel (schémas `auth`/`storage` gérés par la plateforme, version 17), la réimportation des fichiers, la durée à l'échelle de la production (RTO 4 h). Ces trois points relèvent de l'exercice sur un projet de secours (point 6 ci-dessous), toujours à faire.

## La destination choisie (25/09) : Scaleway Object Storage, Paris

Décision du porteur : la copie (quotidienne depuis le 27/09) part chez **Scaleway** (stockage
objet compatible S3, région `fr-par`), sur un **compte séparé** de tout le
reste. Le chantier GitHub `.github/workflows/sauvegarde.yml` s'en charge
chaque nuit et à la demande (onglet Actions → « Sauvegarde
quotidienne » → Run workflow). Il ne fait rien tant que la variable
`SCW_BUCKET` n'est pas posée.

Ce que le porteur fait une fois, dans cet ordre (une demi-heure) :

1. **Compte Scaleway** à son nom, double authentification activée.
2. **Compartiment** (Object Storage → Créer un bucket) : région Paris,
   visibilité privée, nom par exemple `gerimmo-sauvegardes`. Dans les
   réglages du bucket : **règle de cycle de vie** « expirer les objets après
   90 jours » (durée actée par le porteur le 27/09) ; pas de versionnage.
3. **Clé d'API** (IAM → Clés d'API) rattachée à une application IAM dédiée,
   avec une politique limitée à ce seul bucket (ObjectStorageFullAccess sur le
   projet suffit ; plus fin si l'écran le permet). Noter la clé d'accès et la
   clé secrète : la secrète ne se réaffiche pas.
4. **Secrets GitHub** (dépôt → Settings → Secrets and variables → Actions) :
   `GERIMMO_BACKUP_KEY` (64 caractères hexadécimaux, `openssl rand -hex 32`,
   à conserver aussi dans un gestionnaire de mots de passe : sans elle, rien ne
   se restaure), `GERIMMO_BACKUP_SERVICE_KEY` (clé service_role du projet
   Supabase, tableau de bord → Project Settings → API), `SCW_ACCESS_KEY`,
   `SCW_SECRET_KEY`. `SUPABASE_DB_PASSWORD` existe déjà (chantier des
   migrations).
5. **Variables GitHub** (même écran, onglet Variables) : `SCW_BUCKET` (le nom
   du bucket) ; `SCW_REGION` seulement si différent de `fr-par`.
6. **Premier passage à la main** : Actions → Sauvegarde quotidienne → Run
   workflow. Le journal affiche les tailles, le nombre de fichiers et la
   relecture depuis Scaleway. Noter la date ici.
7. **Exercice de restauration** sur un projet Supabase de secours (§ suivant,
   point 6) avant de rétablir la mention sur la page Confidentialité.

Chaque passage crée un préfixe daté `AAAAMMJJ-HHMM/` contenant
`base-…/` et `fichiers-…/` ; rien n'est jamais écrasé. En cas d'échec, GitHub
envoie un e-mail au propriétaire du dépôt.

## Ce qu'il reste à faire, dans l'ordre

1. **Confirmer le plan Supabase** et lire l'onglet Backups du projet : y a-t-il des sauvegardes quotidiennes ? jusqu'à quand ? Noter la réponse ici, avec la date.
2. **Choisir une destination privée indépendante** (autre compte, autre fournisseur), une durée de conservation et les personnes autorisées à restaurer.
3. **Poser les secrets** `GERIMMO_BACKUP_*` dans un gestionnaire de secrets (jamais Vercel : ces programmes n'y tournent pas), et créer un utilisateur Postgres en lecture seule pour `GERIMMO_BACKUP_DB_URL`.
4. **Première sauvegarde réelle** : `base.mjs exporter` puis `fichiers.mjs sauvegarder`, `verifier` sur les deux, transfert du seul dossier chiffré, nouvelle vérification après transfert. Noter date, tailles, nombre de fichiers.
5. **Planifier** (par exemple un workflow GitHub hebdomadaire sur un runner qui a `pg_dump`, ou une machine du porteur), avec alerte sur échec et conservation de plusieurs versions ; ne jamais remplacer la dernière copie saine.
6. **Exercice de restauration** sur un projet Supabase de secours, jamais la production : tâches planifiées et connexions (e-mail, paiement, signature, publication) désactivées ; `pg_restore --no-owner` de la base (droits compris) ; test `aucune-fonction-ouverte-a-anon` sur la base restaurée ; import des fichiers avec leurs chemins, propriétaires et règles d'accès ; ouverture d'un bail, d'une quittance, d'une photo d'incident ; refus d'accès vérifié depuis une autre agence, un locataire, un artisan. Relever la durée. Dater l'exercice ici. (L'exercice local automatisé du 27/09 couvre la base ; il ne remplace pas celui-ci.)
7. Ensuite seulement : afficher la date de dernière sauvegarde dans l'écran Santé, et rétablir la mention sur la page Confidentialité.

## Précautions

La clé de chiffrement vit séparée de la copie ; sans elle, rien ne se restaure. Une copie déchiffrée est une donnée sensible : accès limité, suppression après usage, jamais dans GitHub, Vercel, un dossier public ou une synchronisation non autorisée. Ne pas rendre publics les espaces privés du Storage lors d'un import ; ne pas activer de remplacement automatique de fichiers existants.
