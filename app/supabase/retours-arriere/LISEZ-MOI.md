# Retours arrière des migrations du 13 octobre 2026

Ce dossier **n'est pas** un dossier de migrations. Aucun chantier ne le lit : `migrations.yml` se place dans
`app/supabase/migrations/` et n'applique que les fichiers qu'on lui nomme (aucune occurrence de `retours-arriere` dans
`.github/workflows/`). Ces scripts se jouent **à la main**, après décision du dirigeant, une fois, et se consignent.

| Fichier | Défait | Objets touchés |
|---|---|---|
| `20261013120000_correctifs_audit_13_octobre.retour.sql` | `20261013120000_correctifs_audit_13_octobre.sql` | 9 fonctions, 3 déclencheurs `diagnostic_artisan_lecture`, la contrainte `incident_evenements_type_check`, 1 ligne d'historique |
| `20261013110000_marketing_preparation_du_soir_cron.retour.sql` | `20261013110000_marketing_preparation_du_soir_cron.sql` | 2 fonctions, 1 fonction supprimée, 1 ligne d'historique |
| `20261014310000_artisan_facture_numero_unique.retour.sql` | `20261014310000_artisan_facture_numero_unique.sql` (D24-B, ARC-04) | 1 bloc retiré de `artisan_externe_ecrire`, 1 index unique supprimé, 1 ligne d'historique (voir la section « Lot artisan-externe » plus bas) |
| `20261014311000_artisan_exclusion_ecritures.retour.sql` | `20261014311000_artisan_exclusion_ecritures.sql` (D25-B, ARC-08) | 1 bloc retiré de `artisan_externe_ecrire`, 1 clé retirée de `mon_activite_artisan_privee`, 1 fonction supprimée, 1 ligne d'historique |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » |

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

## Lot artisan-externe — migrations du 14 octobre 2026 (D24-B et D25-B)

Deux migrations du lot « clients externes » (module désactivé en production), avec leur retour arrière dans ce dossier. Même procédure que ci-dessus
(préparer, simuler, exécuter, vérifier, consigner), avec ces particularités.

| Migration | Ajoute | Le retour retire |
|---|---|---|
| `20261014310000` (D24-B, ARC-04) | l'index unique `artisan_factures_externes_numero_normalise_key` sur `(artisan_id, lower(btrim(numero)))` ; un bloc entre `-- >> Audit du 14/10 (ARC-04)` et `-- << Audit du 14/10 (ARC-04)` dans `artisan_externe_ecrire` | exactement ce bloc et cet index |
| `20261014311000` (D25-B, ARC-08) | la fonction `artisan_exclusion_plateforme()` ; un bloc entre `-- >> Audit du 14/10 (ARC-08)` et `-- << Audit du 14/10 (ARC-08)` dans `artisan_externe_ecrire` ; la clé `'exclusion'` dans `mon_activite_artisan_privee` | exactement ces trois ajouts |

**Méthode chirurgicale.** Ces retours ne recopient pas une ancienne définition : ils relisent la définition **d'aujourd'hui** (`pg_get_functiondef`) et en retirent le bloc
marqué que la migration avait ajouté. Ils n'effacent donc pas ce qu'une autre migration aurait modifié dans la même fonction depuis. Si une marque est présente
mais que le bloc n'est plus intact (marque retouchée, répétée), le script s'arrête **sans rien modifier** (`Retour arrière refusé… le bloc … n'est plus intact`).
Sans marque, il ne fait rien (rejouable). Les deux retours sont indépendants : dans l'un ou l'autre ordre, la base revient au même état.

**Aucune donnée n'est touchée**, ni par les migrations ni par les retours : pas de facture modifiée, pas de statut d'artisan lu ou changé. Ce que le retour réintroduit :
après `…310000.retour`, deux factures de numéros « ART-1 » et « art-1 » peuvent de nouveau coexister (celles déjà déposées restent ce qu'elles sont) ; après
`…311000.retour`, un artisan refusé ou sur liste noire globale peut de nouveau créer clients, chantiers, devis et factures. Avant de jouer le retour de `…311000`, le script vérifie
qu'**aucune autre fonction** ne cite `artisan_exclusion_plateforme()` (sinon il refuse : la supprimer la casserait).

**Migration `…310000` et numéros déjà en double.** Si deux factures d'un même artisan ne différaient que par la casse ou les espaces de bord, la migration **s'arrête avant de créer l'index**,
sans rien modifier, en donnant le nombre de numéros concernés : garder l'une ou l'autre est une décision du dirigeant (fiche ARC-04). Le module étant désactivé en production, aucune facture externe n'est attendue.

Vérifier l'état (lecture seule) : « vrai » = migrée (B), « faux » = antérieure (A).

```sql
select position('-- >> Audit du 14/10 (ARC-04)' in pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure)) > 0 as arc04_bloc_dans_la_fonction,
       to_regclass('public.artisan_factures_externes_numero_normalise_key') is not null as arc04_index_unique,
       position('-- >> Audit du 14/10 (ARC-08)' in pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure)) > 0 as arc08_bloc_dans_la_fonction,
       position('''exclusion'',public.artisan_exclusion_plateforme()' in pg_get_functiondef('public.mon_activite_artisan_privee()'::regprocedure)) > 0 as arc08_cle_de_lecture,
       to_regprocedure('public.artisan_exclusion_plateforme()') is not null as arc08_fonction;
select version from supabase_migrations.schema_migrations where version in ('20261014310000', '20261014311000') order by 1;
```

Essais du 14/10/2026 (base de banc jetable, copie de la base migrée) : état A mesuré avant les migrations (empreinte md5 des définitions et ACL), migrations, retours dans les **deux** ordres →
définitions et droits **identiques** à l'état A ; marche avant (migrations rejouées) → identique à l'état B ; rejeu de chaque retour → « rien à faire » ; refus dans un lot
(`psql --single-transaction`) ; marque de fin retouchée → refus et base inchangée ; numéros déjà en double → la migration s'arrête, aucune ligne modifiée. Les tests
`tests/artisan-externe-migrations-rejeu.test.ts` (rejeu, définitions inattendues, cohérence des marques entre migration et retour) et
`tests/artisan-externe-numero-et-exclusion.test.ts` (comportement) couvrent le reste. Limites : base de banc, PostgreSQL 16 ; aucun essai sur la production.
