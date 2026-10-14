# Retours arrière des migrations des 13 et 14 octobre 2026

Ce dossier **n'est pas** un dossier de migrations. Aucun chantier ne le lit : `migrations.yml` se place dans
`app/supabase/migrations/` et n'applique que les fichiers qu'on lui nomme (aucune occurrence de `retours-arriere` dans
`.github/workflows/`). Ces scripts se jouent **à la main**, après décision du dirigeant, une fois, et se consignent.

| Fichier | Défait | Objets touchés |
|---|---|---|
| `20261013120000_correctifs_audit_13_octobre.retour.sql` | `20261013120000_correctifs_audit_13_octobre.sql` | 9 fonctions, 3 déclencheurs `diagnostic_artisan_lecture`, la contrainte `incident_evenements_type_check`, 1 ligne d'historique |
| `20261013110000_marketing_preparation_du_soir_cron.retour.sql` | `20261013110000_marketing_preparation_du_soir_cron.sql` | 2 fonctions, 1 fonction supprimée, 1 ligne d'historique |
| `20261014102000_cle_envoi_ecriture_libre.retour.sql` | `20261014102000_cle_envoi_ecriture_libre.sql` | la colonne `ecritures.cle_envoi` (et son droit d'insertion), 1 index unique partiel, 1 ligne d'historique. Aucune fonction. |
| `20261014101000_cle_envoi_depot_garantie.retour.sql` | `20261014101000_cle_envoi_depot_garantie.sql` | la fonction `encaisser_depot` à sept paramètres (remplacée par celle à six), la colonne `depot_encaissements.cle_envoi`, 1 index unique partiel, 1 ligne d'historique |
| `20261014100000_cle_envoi_encaissement_loyer.retour.sql` | `20261014100000_cle_envoi_encaissement_loyer.sql` | la colonne `encaissements.cle_envoi`, 1 index unique partiel, 1 ligne d'historique. Aucune fonction. |
| `20261014120000_premier_terme_apres_entree.retour.sql` | `20261014120000_premier_terme_apres_entree.sql` (D01, PROP-14) | 1 fonction (`generer_appels_loyer_interne`), 1 ligne d'historique |
| `20261014121000_sortie_reelle_bail.retour.sql` | `20261014121000_sortie_reelle_bail.sql` (D34, SOR-03 et SOR-04) | 2 fonctions (`terminer_bail`, `controler_mise_en_location`), 1 ligne d'historique ; la colonne `baux.date_sortie_reelle` est **conservée** |
| `20261014122000_restitution_remise_cles.retour.sql` | `20261014122000_restitution_remise_cles.sql` (D35 (1), SOR-02) | 1 fonction (`demarrer_restitution`), 1 ligne d'historique |
| `20261014123000_restitution_alerte_apres_correction.retour.sql` | `20261014123000_restitution_alerte_apres_correction.sql` (relecture du lot, D35 (1)) | 1 fonction (`demarrer_restitution`, celle de 122000), 1 fonction interne supprimée (`rafraichir_alerte_restitution`), 1 ligne d'historique |
| `20261014210000_maintenance_artisans_expiration_cron.retour.sql` | `20261014210000_maintenance_artisans_expiration_cron.sql` | 1 tâche `pg_cron` retirée, 1 fonction rétablie, 1 fonction supprimée, 1 ligne d'historique |
| `20261014211000_maintenance_artisans_arret_urgence.retour.sql` | `20261014211000_maintenance_artisans_arret_urgence.sql` | 1 fonction rétablie (`maintenance_artisans_interne()` sans lecture de l'arrêt d'urgence), la ligne de la tâche dans `supervision_taches_arret` si le lot D06 est là, 1 ligne d'historique |
| `releve-devis-perimes.sql` | rien (lecture seule) | **à jouer AVANT la première exécution** de la tâche `maintenance-artisans` : liste ce qu'elle va passer à « expiré » |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » |

**Clés d'envoi des encaissements (14/10, D05).** Les trois migrations `20261014100000`, `20261014101000` et `20261014102000` n'ajoutent
qu'une colonne facultative et un index unique partiel chacune (plus, pour le dépôt, un septième paramètre facultatif à `encaisser_depot`) ;
elles ne réécrivent aucune donnée financière. Leurs retours sont indépendants et se jouent dans l'ordre inverse (102000, 101000, 100000) ;
chacun dit combien de clés disparaissent (ce sont des références techniques : les encaissements, dépôts et écritures restent). Le retour
**réintroduit** le défaut PR178-B-06 (un encaissement rejouable après une réponse perdue) et **ne défait pas le code de l'application** :
l'application candidate écrit `cle_envoi` (et appelle `encaisser_depot` avec `p_cle_envoi`) ; sur une base revenue en arrière, ces saisies
échoueraient. Revenir au code précédent **avant** de jouer ces scripts. Ils se rejouent sans effet.

Les deux migrations ne partagent aucune fonction : leurs retours sont indépendants (essayé dans les deux ordres et un par un).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé.
| `20261014200000_arret_urgence_taches_planifiees.retour.sql` | `20261014200000_arret_urgence_taches_planifiees.sql` (D06 : l'arrêt d'urgence couvre les 8 tâches `pg_cron`) | 8 fonctions planifiées (l'appel au prédicat est retiré), 1 fonction et 1 table supprimées, 1 ligne d'historique. Refuse de s'exécuter si une autre fonction appelle encore le prédicat. Aucune donnée métier touchée. |
| `verifier-etat.sql` | rien (lecture seule) | dit pour chaque objet s'il est « migré (B) » ou « antérieur (A) » |

Les deux premières migrations ne partagent aucune fonction : leurs retours sont indépendants (essayé dans les deux ordres et un par un).
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé. Le retour de `20261014200000` ne touche aucune de leurs fonctions : il se joue seul,
avec la même procédure (essayé sur une copie de la base de recette : fonctions rétablies à l'identique, rejeu sans effet, marche avant
redonnant exactement l'état migré, refus dans un lot ouvert).

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
L'ordre inverse (120000 puis 110000) reste l'ordre recommandé. `20261014210000` (caducité des devis d'artisan) ne partage aucune
fonction avec elles : son retour est indépendant des deux autres, dans n'importe quel ordre.
`20261014211000` (lecture de l'arrêt d'urgence par la caducité des devis) réécrit la même fonction interne que `20261014210000` : son retour se joue
**avant** celui de `20261014210000` (l'ordre inverse reste sans erreur : la fonction étant déjà supprimée, le script ne fait que retirer la ligne de
correspondance et l'historique).

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
| 20261014210000 | AUT-01 : plus rien ne passe les devis périmés à « expiré » ; leur sollicitation reste « vivante » et garde l'une des deux places de la mise en concurrence (RM-9.1.1) ; l'artisan ne peut ni décliner ni redéposer ; `maintenance_artisans()` redevient la seule voie (à la main, super-administrateur, jour du serveur et non jour de Paris) |

| 20261014211000 | L'arrêt d'urgence (global ou « rappels ») n'arrête plus la caducité des devis d'artisan, une fois le lot D06 intégré : la tâche continue de passer des devis à « expiré » pendant un arrêt. Sans le lot D06, aucun effet visible. |

Si un seul défaut gêne, préférer un retour d'**une** fonction (copier son bloc `select pg_temp.restaurer_fonction(...)`) ou une correction en avant.

## Ce que le retour arrière ne défait PAS

- Les **données écrites avec la nouvelle valeur** : lignes `incident_evenements.type = 'mission_annulee'` (voir la section dédiée).
- Les **lignes d'audit** déjà écrites : `audit_log` (`contre_ecriture`, `detention_supprimee`). Elles restent lisibles, jamais supprimées.
- Les créneaux passés à `caduc` par la nouvelle `contre_proposer_creneaux` (le type existe déjà dans l'énumération d'origine).
- Les journaux et notifications partis entre-temps.
- Les devis passés à `expire` et les sollicitations passées à `expiree` par la tâche `maintenance-artisans` (20261014210000) : la base ne garde
  pas l'état d'avant, le retour ne les touche pas (ils restent « expirés », ce qui est exact). Voir « Avant la première exécution de la tâche
  `maintenance-artisans` » ci-dessous.
- Le **code de l'application** : la compatibilité d'une application candidate servie sur une base revenue à l'état antérieur n'a pas été essayée.

## Procédure

1. **Préparer.** Lancer « Sauvegarde quotidienne » à la main (Actions, `workflow_dispatch`) et attendre son succès (le bilan ne contient que des
   nombres). Jouer `verifier-etat.sql` : tout doit se lire « migrée (B) ». Vérifier qu'**aucune migration postérieure** à 20261013120000
   n'a réécrit ces fonctions (`git log --oneline -- app/supabase/migrations | head` ; chercher leurs noms) : sinon les scripts écraseraient
   ses ajouts, il faut les régénérer.
2. **Simuler.** `sed 's/^commit;$/rollback;/' <script> | psql "$URL" -v ON_ERROR_STOP=1` : tout est joué puis annulé.
3. **Exécuter**, dans l'ordre inverse :
   ```
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261014211000_maintenance_artisans_arret_urgence.retour.sql     # seulement si cette migration est en cause (avant 210000)
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261014210000_maintenance_artisans_expiration_cron.retour.sql   # seulement si cette migration est en cause
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261013120000_correctifs_audit_13_octobre.retour.sql
   psql "$URL" -v ON_ERROR_STOP=1 -f 20261013110000_marketing_preparation_du_soir_cron.retour.sql
   ```
   `$URL` : le pooler en mode session (port 5432), comme `migrations.yml` ; le mot de passe par `PGPASSWORD`, jamais dans la ligne de commande ni dans un journal.
   Chaque script ouvre et ferme **sa** transaction : la moindre erreur annule tout. Il refuse de se jouer dans un lot déjà ouvert
   (`begin;` de `migrations.yml`, `psql --single-transaction`) : son `commit` validerait alors le lot entier et la simulation ne simulerait plus rien.
   **Ne jamais le passer à `migrations.yml`** (ce chantier laisse d'ailleurs passer un nom avec chemin, `../retours-arriere/...`, et inscrirait une version fantaisiste).
4. **Vérifier.** `verifier-etat.sql` : tout doit se lire « antérieure (A) » et la liste des versions doit être vide. Les scripts retirent eux-mêmes les versions
   `20261013110000`, `20261013120000`, `20261014210000` et `20261014211000` de `supabase_migrations.schema_migrations`, sans quoi `migrations.yml` refuserait de les rejouer (« version déjà enregistrée »).
5. **Consigner** la décision, l'heure, l'opérateur et le résultat (journal du wiki).

Rejeu : relancer un script sur une base déjà revenue ne change rien (chaque fonction répond « marque du correctif absente, rien à faire »).
Marche avant : après un retour, `migrations.yml` réapplique les deux migrations et redonne exactement l'état migré (essayé).

## Avant la première exécution de la tâche `maintenance-artisans` (20261014210000)

La migration ne réécrit **aucune donnée** : c'est le premier passage de la tâche (04 h 30 UTC, le lendemain de l'application) qui passe d'un coup à « expiré »
tous les devis encore « déposés » dont la validité est dépassée, et à « expirée » leur sollicitation. Ces statuts ne se restaurent pas automatiquement.
Un relevé de production, **en lecture seule**, doit donc être pris **avant** d'appliquer la migration (il n'a pas été fait par l'agent : la production n'a pas été consultée) :

1. `psql "$URL" -v ON_ERROR_STOP=1 -f releve-devis-perimes.sql` (le mot de passe par `PGPASSWORD`). Le fichier ne contient que des `select`.
2. Il répond à cinq questions : combien de devis « déposés » sont périmés (et dans combien d'agences et d'incidents) ; la liste exacte, avec l'état de leur sollicitation
   et de leur mise en concurrence ; les incidents dont les deux places sont tenues par des devis périmés (ceux que la tâche débloque) ; combien de sollicitations restées
   sans réponse la tâche ne traitera pas ; et si une tâche `maintenance-artisans` existe déjà hors dépôt.
3. Garder la liste (2e requête) avec la décision : `\copy (…) to 'releve-devis-perimes.csv' csv header`. Elle ne contient que des identifiants et des dates.
4. Si le nombre de devis est élevé ou si une date de validité paraît mal saisie, **décider avant** d'appliquer la migration : la tâche applique la règle RM-9.2.3 sans exception.

Pour défaire après coup (cas exceptionnel, décision humaine, identifiant par identifiant) : remettre `incident_devis.statut = 'depose'` et
`incident_sollicitations.statut = 'devis_depose'` pour les identifiants du relevé, **seulement si** le devis est toujours `expire` et que la sollicitation est toujours `expiree`
(un autre artisan a pu être sollicité sur la place libérée, un autre devis retenu). Jamais en masse, jamais sans le relevé.

La tâche n'appelle **pas** la purge des motifs de liste noire (reportée avant septembre 2029, durées à faire valider) ; elle ne traite pas non plus les sollicitations
restées sans réponse (voir le rapport du lot).

## Avec le lot « arrêt d'urgence » (D06, migration `20261014200000`) : ordre et points à reprendre à l'intégration

`20261014211000` fait lire l'arrêt d'urgence à la caducité des devis (décision D42, point 5, avec D06 option A). Elle n'a besoin d'aucun objet du lot D06 pour
s'appliquer : sans le prédicat `tache_planifiee_autorisee`, la fonction ne lit rien et la migration n'inscrit rien. Dès que le lot D06 est là, l'arrêt agit.

- **Ordre.** `20261014200000` (D06) d'abord, puis `20261014210000`, puis `20261014211000` : c'est l'ordre de `ordre-migrations.txt`. Si D06 arrive
  **après** `20261014211000`, la tâche manque dans la table de correspondance et le prédicat refuse la tâche (« Tâche planifiée inconnue de la table
  d'arrêt ») : elle échoue à chaque passage. Inscrire alors la ligne avant le prochain passage (04 h 30 UTC) :
  `insert into public.supervision_taches_arret (tache, cle) values ('maintenance-artisans', 'rappels') on conflict do nothing;`
- **Clé « rappels » : à confirmer par le dirigeant** (« Rendez-vous et suivi des dossiers », équipe « Incidents et artisans »). Aucune clé d'arrêt n'est propre à la
  tâche ; l'arrêt « global » l'arrête dans tous les cas. Changer la clé = changer la ligne de la table.
- **La tâche est la neuvième.** Dans le lot D06, à mettre à jour à l'intégration (vérifié sur une fusion d'essai : tout passe ensuite) :
  `tests/arret-taches-planifiees.test.ts` (table `CORRESPONDANCE`, 9 tâches), `tests/sauvegarde-taches-planifiees.test.ts` (deux cas : 9 tâches, `taches_planifiees` à 9),
  `src/lib/nom-arret-supervision.ts` (`TACHES_SQL` : l'écran « Relais et arrêts » doit citer la caducité des devis parmi les tâches arrêtées) et les tests qui comptent
  ces tâches (`tests/arret-urgence-ecrans.test.ts`), `docs/sauvegarde-et-restauration.md` (« Huit tâches SQL »). Deux conflits d'ajout en fin de fichier à résoudre :
  `ordre-migrations.txt` (garder `200000`, `210000`, `211000` dans cet ordre) et ce LISEZ-MOI.
- **Ce que l'arrêt ne couvre pas ici** : la purge manuelle des motifs de liste noire de `maintenance_artisans()` (usage manuel du super-administrateur, non planifiée).
  Appelée pendant un arrêt, la version publique rend `devis_expires = 0` (la caducité est arrêtée) et fait sa purge.

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
