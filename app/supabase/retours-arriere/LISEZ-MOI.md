# Retours arrière des migrations du 13 octobre 2026

Ce dossier **n'est pas** un dossier de migrations. Aucun chantier ne le lit : `migrations.yml` se place dans
`app/supabase/migrations/` et n'applique que les fichiers qu'on lui nomme (aucune occurrence de `retours-arriere` dans
`.github/workflows/`). Ces scripts se jouent **à la main**, après décision du dirigeant, une fois, et se consignent.

| Fichier | Défait | Objets touchés |
|---|---|---|
| `20261013120000_correctifs_audit_13_octobre.retour.sql` | `20261013120000_correctifs_audit_13_octobre.sql` | 9 fonctions, 3 déclencheurs `diagnostic_artisan_lecture`, la contrainte `incident_evenements_type_check`, 1 ligne d'historique |
| `20261013110000_marketing_preparation_du_soir_cron.retour.sql` | `20261013110000_marketing_preparation_du_soir_cron.sql` | 2 fonctions, 1 fonction supprimée, 1 ligne d'historique |
| `20261014232000_effacement_instantanes_faits_direction.retour.sql` | `20261014232000_effacement_instantanes_faits_direction.sql` | **rien** : les instantanés effacés ne reviennent que d'une sauvegarde ; le script ne retire que la ligne d'historique |
| `20261014231000_retention_registres_execution.retour.sql` | `20261014231000_retention_registres_execution.sql` | 1 fonction rétablie (`appliquer_retention`), 1 fonction supprimée, 5 règles de conservation, 1 ligne d'historique |
| `20261014230000_faits_direction_sans_noms.retour.sql` | `20261014230000_faits_direction_sans_noms.sql` | 3 fonctions rétablies, 2 fonctions supprimées, 1 ligne d'historique |
| `20261014233000_photos_demande_devis_artisan.retour.sql` | `20261014233000_photos_demande_devis_artisan.sql` | 2 fonctions supprimées (rien d'antérieur à rétablir), 1 ligne d'historique |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » (migrations du 13/10 seulement) |

Les deux migrations ne partagent aucune fonction : leurs retours sont indépendants (essayé dans les deux ordres et un par un).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé.

## Comment ces scripts ont été écrits

Aucune définition n'est écrite de mémoire. Chaque fonction antérieure vient d'une base **reconstruite en rejouant les migrations
d'origine** (`app/e2e/local/ordre-migrations.txt`, sans les deux migrations du 13/10), puis lue par `pg_get_functiondef` et recopiée
par un générateur. C'est nécessaire : une fonction comme `annuler_mission` n'a pas de « version d'origine » dans un seul fichier, car
les migrations suivantes y ont injecté des gardes en relisant sa définition (c'est la raison d'être de la migration 120000 elle-même).
La contrainte antérieure est celle de `20260930220000_validation_factures_artisan.sql`.

## Quand l'utiliser, et quand ne pas le faire

À envisager **seulement** si une des deux migrations cause un dommage constaté en production et qu'une correction en avant (nouvelle
migration) est plus lente ou plus risquée. Un retour arrière **réintroduit** les défauts corrigés :

| Script | Défaut qui revient |
|---|---|
| 120000 | AUD-A-01 (un agent restreint peut modifier les équipements de tout lot), AUD-A-02 et AUD-A-04 (annulation d'écriture et suppression de détention sans trace d'audit), AUD-A-03 (pas d'événement d'incident à l'annulation d'une mission), SUP-02 (l'arrêt d'urgence est refusé pendant une session de diagnostic), SUP-08 (alerte déjà escaladée requalifiée), REP-01 (second envoi de créneaux du locataire refusé), ARC-10 (« aujourd'hui » au jour UTC : date du jour refusée entre minuit et 2 h à Paris) |
| 110000 | La préparation du soir de la publication marketing ne part plus depuis `pg_cron` (elle ne se fait plus que par le rattrapage du matin, sans fenêtre de veto la veille) |

Si un seul défaut gêne, préférer un retour d'**une** fonction (copier son bloc `select pg_temp.restaurer_fonction(...)`) ou une correction en avant.

## Ce que le retour arrière ne défait PAS

- Les **données écrites avec la nouvelle valeur** : lignes `incident_evenements.type = 'mission_annulee'` (voir la section dédiée).
- Les **lignes d'audit** déjà écrites : `audit_log` (`contre_ecriture`, `detention_supprimee`). Elles restent lisibles, jamais supprimées.
- Les créneaux passés à `caduc` par la nouvelle `contre_proposer_creneaux` (le type existe déjà dans l'énumération d'origine).
- Les journaux et notifications partis entre-temps.
- Le **code de l'application** : la compatibilité d'une application candidate servie sur une base revenue à l'état antérieur n'a pas été essayée.

## Procédure

1. **Préparer.** Lancer « Sauvegarde quotidienne » à la main (Actions, `workflow_dispatch`) et attendre son succès (le bilan ne contient que des
   nombres). Jouer `verifier-etat.sql` : tout doit se lire « migrée (B) ». Vérifier qu'**aucune migration postérieure** à 20261013120000
   n'a réécrit ces fonctions (`git log --oneline -- app/supabase/migrations | head` ; chercher leurs noms) : sinon les scripts écraseraient
   ses ajouts, il faut les régénérer.
2. **Simuler.** `sed 's/^commit;$/rollback;/' <script> | psql "$URL" -v ON_ERROR_STOP=1` : tout est joué puis annulé.
3. **Exécuter**, dans l'ordre inverse :
   ```
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261013120000_correctifs_audit_13_octobre.retour.sql
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261013110000_marketing_preparation_du_soir_cron.retour.sql
   ```
   `$URL` : le pooler en mode session (port 5432), comme `migrations.yml` ; le mot de passe par `PGPASSWORD`, jamais dans la ligne de commande ni dans un journal.
   Chaque script ouvre et ferme **sa** transaction : la moindre erreur annule tout. Il refuse de se jouer dans un lot déjà ouvert
   (`begin;` de `migrations.yml`, `psql --single-transaction`) : son `commit` validerait alors le lot entier et la simulation ne simulerait plus rien.
   **Ne jamais le passer à `migrations.yml`** (ce chantier laisse d'ailleurs passer un nom avec chemin, `../retours-arriere/...`, et inscrirait une version fantaisiste).
4. **Vérifier.** `verifier-etat.sql` : tout doit se lire « antérieure (A) » et la liste des versions doit être vide. Les scripts retirent eux-mêmes les versions
   `20261013110000` et `20261013120000` de `supabase_migrations.schema_migrations`, sans quoi `migrations.yml` refuserait de les rejouer (« version déjà enregistrée »).
5. **Consigner** la décision, l'heure, l'opérateur et le résultat (journal du wiki).

Rejeu : relancer un script sur une base déjà revenue ne change rien (chaque fonction répond « marque du correctif absente, rien à faire »).
Marche avant : après un retour, `migrations.yml` réapplique les deux migrations et redonne exactement l'état migré (essayé).

## Lignes `mission_annulee` : comportement et procédure

La contrainte antérieure ne connaît pas `mission_annulee`. Tant qu'une ligne utilise cette valeur, PostgreSQL refuse de la reposer
(`check constraint "incident_evenements_type_check" … is violated by some row`, essayé). Le script de 120000 le détecte **avant tout
travail** et s'arrête avec `RETOUR ARRIÈRE REFUSÉ, rien n'a été modifié : N ligne(s)…` (état de la base strictement inchangé, essayé).

Trois issues, à décider par un humain :

1. **Ne pas défaire 120000** (corriger en avant) : rien à faire, c'est le choix par défaut si des annulations de mission ont eu lieu.
2. **Défaire en gardant ces lignes** : jouer d'abord `set gerimmo.retour_arriere_conserver_mission_annulee = 'oui';` dans la même session, puis le script.
   Tout est rétabli sauf la contrainte, posée `NOT VALID` : elle refuse toute **nouvelle** écriture `mission_annulee` (essayé), laisse les lignes existantes
   intactes et lisibles, mais `validate constraint` échoue tant qu'elles existent. Toute mise à jour de ces lignes serait refusée. `pg_dump` émet bien la contrainte
   `NOT VALID` (essayé), donc une restauration ne bute pas dessus. `verifier-etat.sql` l'indique (« NOT VALID »). La marche avant remet une contrainte validée.
3. **Modifier ou supprimer les lignes** pour poser la contrainte validée : jamais en automatique. Ces lignes sont des traces d'audit visibles du locataire et de l'artisan
   (le fil de l'incident) ; une telle opération relève d'une décision écrite du dirigeant, hors de ce dépôt.

## Preuves de l'essai (banc local, PostgreSQL 16, base jetable)

Base reconstruite depuis `ordre-migrations.txt` : A (avant) → migrations appliquées comme `migrations.yml` (une transaction) → B → retours → C.
Comparés entre A et C, dans la même base : définition de **toutes** les fonctions de `public` (empreinte md5 de `pg_get_functiondef`, drapeaux, ACL, propriétaire),
contraintes, déclencheurs, politiques RLS, ACL des relations, index, vues, tâches `cron`, historique des migrations, nombre de lignes de chacune des 145 tables
et `pg_dump --schema-only -n public` (droits compris) : **identiques**. La suite de tests d'intégration SQL du dépôt (105 fichiers, 1329 tests) donne sur C le même
résultat qu'en A, test par test (27 échecs attendus : les tests des correctifs du 13/10 ; 0 échec en B). Essayés en plus : rejeu, un seul retour, l'ordre inverse du
recommandé, réapplication, refus avec `mission_annulee`, option `NOT VALID`, lignes d'audit conservées, refus d'un lot ouvert, simulation par `sed`,
et les retours joués sur une copie **restaurée** de la sauvegarde. Dossier de preuves de l'audit : `retour-arriere/` (journal : `essai/00_journal_essai_final.txt`).

Limites : base de banc (quelques centaines de lignes), PostgreSQL 16 (la production est en 17 : les scripts ne comparent jamais de texte pour décider, seulement la
présence de la marque du correctif) ; durée de chaque script < 0,1 s sur le banc, non mesurée sur le volume de production ; aucun essai sur la production.

## Lot « données personnelles » (14 octobre 2026) : quatre migrations, un ordre, une étape sans retour

Décisions D13 (fiche SUP-05), D48 (fiche IA-11) et D16 (fiche ART-15). Ordre d'application : `230000` (faits sans noms), `231000` (règles de
conservation), puis `232000` (effacement, **étape irréversible**, seulement après une sauvegarde) ; `233000` (photos du locataire visibles de
l'artisan) est indépendante des trois autres. Ordre de retour : l'inverse (`233000`, `232000`, `231000`, `230000`).
`233000` ne touche aucune politique de stockage ni aucune table : son retour ne fait que supprimer ses deux fonctions, mais le code de
l'application qui les appelle doit être retiré avec elles (sinon les écrans de la demande de devis et de la mission disent que les photos
n'ont pas pu être chargées).

- **`232000` n'a pas de retour arrière pour les données.** Avant de l'appliquer en production : lancer « Sauvegarde quotidienne » à la main,
  attendre son succès, puis jouer l'étape dans une session qui commence par `set local gerimmo.sauvegarde_confirmee = 'oui';` (voir l'en-tête de la
  migration). Sans cette confirmation, et s'il existe au moins un instantané de version 1, l'étape s'arrête par une erreur et rien n'est effacé.
- **`231000` : les règles naissent actives, la première purge est irrécupérable.** Le premier passage d'`appliquer_retention` après la migration
  supprime ce qui a plus de six mois dans les cinq registres (`agent_passages`, `supervision_operations`, `points_du_matin`, `decisions_du_matin`,
  `brief_direction_snapshots`). Sauvegarde d'abord. Pour différer la purge sans retirer les règles : `update public.retention_rules set actif = false where data_type = 'journal:…'`.
- Les trois scripts partagent la même garde (refus dans un lot ouvert), le même outil `pg_temp.restaurer_fonction` et la même marque de rejeu que ceux du 13/10.
  Définitions antérieures lues sur une base reconstruite sans ces migrations, recopiées par un générateur. Essayés sur une copie : définitions et droits des
  4 fonctions identiques à l'état antérieur après les trois retours ; rejeu sans effet ; marche avant ; refus dans un lot.
- `verifier-etat.sql` ne couvre pas ce lot : le contrôle se fait par `select pg_get_functiondef(…)` (marque « D13 (SUP-05) » ou « purger_registres_execution »)
  et `select data_type from public.retention_rules where data_type like 'journal:%'`.
