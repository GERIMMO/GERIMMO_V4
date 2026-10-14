# Retours arrière des migrations des 13 et 14 octobre 2026

Ce dossier **n'est pas** un dossier de migrations. Aucun chantier ne le lit : `migrations.yml` se place dans
`app/supabase/migrations/` et n'applique que les fichiers qu'on lui nomme (aucune occurrence de `retours-arriere` dans
`.github/workflows/`). Ces scripts se jouent **à la main**, après décision du dirigeant, une fois, et se consignent.

| Fichier | Défait | Objets touchés |
|---|---|---|
| `20261013120000_correctifs_audit_13_octobre.retour.sql` | `20261013120000_correctifs_audit_13_octobre.sql` | 9 fonctions, 3 déclencheurs `diagnostic_artisan_lecture`, la contrainte `incident_evenements_type_check`, 1 ligne d'historique |
| `20261013110000_marketing_preparation_du_soir_cron.retour.sql` | `20261013110000_marketing_preparation_du_soir_cron.sql` | 2 fonctions, 1 fonction supprimée, 1 ligne d'historique |
| `20261014120000_premier_terme_apres_entree.retour.sql` | `20261014120000_premier_terme_apres_entree.sql` (D01, PROP-14) | 1 fonction (`generer_appels_loyer_interne`), 1 ligne d'historique |
| `20261014121000_sortie_reelle_bail.retour.sql` | `20261014121000_sortie_reelle_bail.sql` (D34, SOR-03 et SOR-04) | 2 fonctions (`terminer_bail`, `controler_mise_en_location`), 1 ligne d'historique ; la colonne `baux.date_sortie_reelle` est **conservée** |
| `20261014122000_restitution_remise_cles.retour.sql` | `20261014122000_restitution_remise_cles.sql` (D35 (1), SOR-02) | 1 fonction (`demarrer_restitution`), 1 ligne d'historique |
| `20261014123000_restitution_alerte_apres_correction.retour.sql` | `20261014123000_restitution_alerte_apres_correction.sql` (relecture du lot, D35 (1)) | 1 fonction (`demarrer_restitution`, celle de 122000), 1 fonction interne supprimée (`rafraichir_alerte_restitution`), 1 ligne d'historique |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » |

Les deux migrations ne partagent aucune fonction : leurs retours sont indépendants (essayé dans les deux ordres et un par un).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé.

## Les quatre retours du 14 octobre 2026 (lot « bail-sortie »)

`verifier-etat.sql` ne couvre que les deux migrations du 13/10. Pour celles du 14/10, la marque du correctif se lit dans la définition
en vigueur : `select pg_get_functiondef('public.generer_appels_loyer_interne(uuid)'::regprocedure) like '%Décision D01 du 14/10 (PROP-14)%';`
(de même `Décision D34 du 14/10 (SOR-04)` pour `terminer_bail(uuid,date,boolean)`, `Décision D34 du 14/10 (SOR-03)` pour `controler_mise_en_location(uuid)`,
`Décision D35 (1) du 14/10 (SOR-02)` pour `demarrer_restitution(uuid,date,boolean)` ; la couche ajoutée par 123000 sur cette même fonction porte `Relecture du 14/10 (alerte du délai légal)`).
Les migrations 120000, 121000 et 122000 ne touchent aucune fonction en commun : leurs retours sont indépendants, dans n'importe quel ordre (essayé dans les deux sens,
122000 → 121000 → 120000 et 120000 → 121000 → 122000). **123000 s'ajoute à 122000 sur `demarrer_restitution`** : son retour se joue de préférence AVANT celui de 122000 (ordre inverse des migrations).
Dans l'autre ordre (essayé), le retour de 122000 rétablit déjà l'ancienne fonction, celui de 123000 répond « marque du correctif absente, rien à faire » puis retire la fonction interne devenue inutile : même état final.

| Script | Défaut qui revient | Ce que le retour ne défait pas |
|---|---|---|
| `20261014120000` | PROP-14 : le premier terme d'un bail qui entre en cours de mois redevient exigible le jour d'échéance du mois, donc avant l'entrée | Les appels générés pendant que la migration était en place gardent leur échéance (le 16, par exemple) : le script ne touche **aucun appel** |
| `20261014121000` | SOR-03 : un bail peut être activé avec une entrée antérieure à la sortie du bail précédent du même lot. SOR-04 : la clôture avant la fin du préavis ne demande plus de confirmation et n'enregistre plus de sortie réelle. `terminer_bail` retrouve son seul argument : **l'écran de clôture du code applicatif candidat appelle la version à trois arguments et échouera tant que le code n'est pas revenu lui aussi** | La colonne `baux.date_sortie_reelle` et les dates déjà saisies (données de gestion : elles restent, sans effet une fois les fonctions revenues). La supprimer relève d'une décision écrite du dirigeant, hors de ce script |
| `20261014122000` | SOR-02 : `demarrer_restitution` accepte de nouveau une remise des clés datée du futur, et un nouvel envoi tant que la restitution est « en cours » relit de nouveau, en silence, le dépôt, les impayés et le trop-perçu | Aucune restitution existante : dates et montants déjà enregistrés restent tels quels |
| `20261014123000` | Corriger la remise des clés ou le délai d'une restitution en cours ne remet plus l'alerte « à rendre avant le … » à la bonne date : elle peut afficher une date postérieure au vrai délai légal jusqu'à ce que le seuil change | Aucune alerte ni restitution : les alertes déjà remises à jour ou fermées (`closed_action` « Délai légal corrigé : … », seuil `corrige`) restent telles quelles ; le cron en repose une à J-7 au besoin |

Les droits des fonctions ne changent dans aucun sens (`generer_appels_loyer_interne` reste fermée aux comptes : seul `service_role` l'exécute ; la fonction interne `rafraichir_alerte_restitution` de 123000 est fermée de la même façon).

**Essai du retour de 123000** (banc local, base jetable reconstruite depuis `ordre-migrations.txt`) : A = les migrations jusqu'à 122000 ; B = avec 123000 ; C = B puis le retour. Empreinte de toutes les fonctions de `public`
(définition, droits, `security definer`, propriétaire : 554 fonctions en A, 555 en B) : **A = C**, B ≠ A ; simulation par `sed` (empreinte inchangée, identique à B), rejeu du retour (« rien à faire », empreinte identique),
marche avant (la migration rejouée sur C redonne exactement B), migration rejouée sur B (sans effet). Limites : mêmes que ci-dessous (banc, PostgreSQL 16, aucun essai sur la production).

**Preuves de l'essai** (banc local, base jetable reconstruite depuis `ordre-migrations.txt`) : A = les migrations d'origine **sans** les trois du 14/10 ; B = avec ; C = B puis les trois retours.
Comparés entre A et C : définition, drapeaux, droits et propriétaire de chacune des fonctions de `public`, contraintes, déclencheurs, politiques RLS et colonnes. **Seule différence : la colonne
`baux.date_sortie_reelle`, conservée à dessein.** Essayés en plus : simulation par `sed` (base inchangée, empreinte identique à B), rejeu des trois retours (« marque du correctif absente, rien à faire »,
empreinte identique), marche avant (les trois migrations rejouées sur C redonnent exactement B) et rejeu des migrations (sans effet). Limites : base de banc, PostgreSQL 16, aucun essai sur la production,
ni sur une copie restaurée de sauvegarde, ni avec des baux portant une sortie réelle (le script se borne alors à dire leur nombre).

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
