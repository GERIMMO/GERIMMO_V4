---
type: synthesis
tags: [sauvegarde, restauration, retour-arriere, securite, pra, audit-2026-10-13]
status: draft
created: 2026-10-14
updated: 2026-10-14
sources: ["[[Plan de reprise d'activité]]", "[[Socle de sécurité]]", "[[Registre des anomalies — audit du 13 octobre 2026]]"]
---

# Dossier sécurité et restauration — retour arrière des migrations du 13 octobre 2026

> [!info] Portée et honnêteté des preuves
> Tout ce qui est marqué **observé** a été exécuté le 14/10/2026 sur le banc local (PostgreSQL 16, bases jetables, aucun service externe).
> **Lu** = relevé dans le code ou la documentation, non rejoué. **Non vérifié** = hors de portée du banc.
> **Aucune restauration de production n'a été tentée ni n'est possible depuis le banc** (accès à la production, à GitHub Actions et à Scaleway interdits).
> Aucune sauvegarde de production n'est donc qualifiée de « valide » dans ce dossier.

## 1. Ce qu'il faut retenir

1. Les deux migrations du 13/10 (`20261013110000`, `20261013120000`) **ont un retour arrière écrit et essayé** : `app/supabase/retours-arriere/` (deux scripts, `verifier-etat.sql`, `LISEZ-MOI.md`).
   Sur le banc, l'état revenu est **identique** à l'état d'avant sur 13 catalogues et sur la suite de tests SQL du dépôt (observé).
2. Le retour arrière **ne défait pas les données** (événements `mission_annulee`, lignes d'audit) ; une ligne `mission_annulee` interdit de reposer la contrainte antérieure
   et arrête le script avant tout changement, sauf décision explicite (observé, procédure au `LISEZ-MOI.md`).
3. La sauvegarde quotidienne couvre la base (schémas `public`, `auth`, `storage`, droits compris) et les fichiers, chiffrés, chez un autre fournisseur (lu).
   Elle **ne couvre pas** les tâches `pg_cron`, l'historique des migrations, les commentaires SQL ni les secrets (observé pour les trois premiers sur une copie restaurée du banc).
4. Un essai de restauration **documenté** existe pour une copie du 27/09/2026 (lu, non revérifié) ; **aucun** n'est documenté depuis, ni depuis les migrations d'octobre.
   Une restauration complète du service (Auth, Storage, bascule) n'a jamais été éprouvée.
5. **AUD-C-02 et SUP-01 restent ouvertes** ; l'essai du banc confirme la partie « sauvegarde » d'AUD-C-02.

## 2. Ce qui est sauvegardé (lu : `.github/workflows/sauvegarde.yml`, `app/scripts/sauvegarde/`, `app/docs/sauvegarde-et-restauration.md`)

| Élément | Comment | Précisions |
|---|---|---|
| Base PostgreSQL | `pg_dump` format custom, schémas **`public`, `auth`, `storage`**, `--no-owner`, `--no-comments`, **droits (GRANT/REVOKE) compris** depuis le 27/09 | Les droits sont la défense principale (fonctions fermées à `anon`) ; leur conservation est **observée** sur le banc (§5.2) |
| Fichiers du Storage | téléchargement par l'API, contrôle de taille et empreinte SHA-256 | Limite de 64 Mo par fichier (interrompt toute la copie) ; les compartiments sont limités à 10 Mo dans les migrations : marge confortable |
| Chiffrement | AES-256-GCM, clé de 64 caractères hexadécimaux dans le secret `GERIMMO_BACKUP_KEY` | Perdre la clé rend **toutes** les copies illisibles |
| Dépôt | Scaleway Object Storage (Paris), compte distinct de Supabase, préfixe daté jamais écrasé, **relecture** après dépôt | Clé d'accès limitée au compartiment |
| Fréquence / objectif | quotidienne, 01:20 UTC ; **RPO 24 h**, RTO 4 h (wiki) | GitHub peut retarder un passage planifié |
| Conservation | 90 jours glissants, règle de cycle de vie posée par le porteur côté Scaleway | **Non vérifiable depuis le dépôt** |
| Surveillance | chaque passage est consigné dans `tech_log` (`tache_sauvegarde`) ; retard > 26 h = point bloquant dans Santé | Non observé en production |

## 3. Ce qui n'est pas sauvegardé

| Élément | Constat | Conséquence en cas de reprise |
|---|---|---|
| **Tâches `pg_cron`** (8 : cycle mensuel des appels de loyer, alertes d'impayés, rétention, propositions de publication, déclencheur marketing…) | **Observé** : le schéma `cron` de la base source (8 tâches) est absent de la copie restaurée. Lu : `SCHEMAS = ['public','auth','storage']` | Après restauration, les tâches ne repartent pas, **sans signal** : à recréer en rejouant les `cron.schedule` des migrations et en activant `pg_cron`/`pg_net` (non écrit dans la procédure). Écart possible avec la production réelle (non lue). Voir AUD-C-02 |
| Historique des migrations (`supabase_migrations`) | **Observé** : absent de la copie restaurée | Un projet de secours ne sait plus quelles migrations sont appliquées ; `migrations.yml` exige une liste explicite, donc pas de rejeu automatique, mais l'opérateur doit reconstituer l'historique |
| Commentaires SQL | **Observé** : 152 `COMMENT ON` sur 152 perdus (`--no-comments`), dont celui de `fermer_fonctions_a_anon()` qui porte la convention « à appeler en fin de toute migration ». Fiche RET-02 | Documentation seulement ; aucun droit ni donnée touchés |
| Configuration Supabase Auth (fournisseurs, SMTP, MFA, durée des jetons), extensions activées, domaines | Lu : hors des trois schémas dumpés | À reconstituer à la main dans le projet de secours ; non documenté |
| **Secrets** | Hors copie, par conception : GitHub (`GERIMMO_BACKUP_KEY`, `SUPABASE_DB_PASSWORD`, `GERIMMO_BACKUP_SERVICE_KEY`, clés Scaleway) ; Vercel (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GERIMMO_SESSION_SECRET`, Stripe, Resend, Yousign/Youtrust, OpenAI, Meta, `VERCEL_TOKEN`…, noms lus dans `.env.example`) | Sans gestionnaire de secrets indépendant, la perte du compte Vercel ou GitHub emporte les clés. Où les valeurs sont conservées en dehors de ces comptes : **non vérifié** |
| Données chez des tiers | Stripe (abonnements), Resend, Yousign/Youtrust (documents signés), Meta | Hors périmètre de la copie ; leur propre rétention : non vérifiée |
| Instantané commun base + fichiers | Lu (doc 27/09) : deux exports successifs | Écart possible entre `storage.objects` et les octets restaurés pendant une activité d'écriture |

## 4. Procédure de restauration documentée

Sources : [[Plan de reprise d'activité]] (wiki), `app/docs/sauvegarde-et-restauration.md`, workflow `restauration-sauvegarde.yml` (lu).
Règle forte : **aucun bouton applicatif ne restaure directement la production** ; toute restauration exige une validation humaine.
Étapes : (1) suspendre les écritures et les envois, identifier la dernière copie saine ; (2) obtenir la clé et télécharger les archives nécessaires ; (3) exercer la copie dans un PostgreSQL 17 jetable
(`restaurer-archive.mjs`, qui refuse toute destination autre que `gerimmo_restauration_…` locale) puis préparer un projet Supabase de secours aux envois désactivés ; (4) restaurer schémas et droits, réimporter les fichiers
aux mêmes chemins ; (5) vérifier comptes, un bail, une quittance, une photo, les refus entre organisations ; (6) faire valider la bascule.
Lacunes : aucune étape pour `pg_cron`/`pg_net`, l'historique des migrations, la configuration Auth, la remise des secrets ; la page du wiki cite `docs/plan-reprise-activite.md` (présent seulement dans `raw/Gerimmo-V3`)
et une table `backup_registry` qui n'existe pas dans V4 (0 occurrence) : fiche RET-03.

## 5. État d'essai de restauration

### 5.1 Documenté, non revérifié
`app/docs/sauvegarde-et-restauration.md` rapporte une sauvegarde réelle puis une restauration réelle le 27/09/2026 (copie `20260927-1856`) : **146 tables, 601 lignes, 1 fichier**, 6 secondes, fonctions
privilégiées fermées à `anon`, base temporaire supprimée. Je n'ai pas pu consulter ces exécutions (GitHub Actions interdit). Cette copie est la **seule** à avoir un essai documenté ; elle précède les migrations
du 28/09 (tarification), du 07/10 (marketing), du 12/10 et du 13/10. Le texte lui-même précise que l'essai ne prouve ni la bascule d'Auth/Storage, ni la remise en service en moins de 4 h.

### 5.2 Observé le 14/10 sur le banc (état B, base de banc, volumes minuscules)
Sauvegarde par `base.mjs exporter` (archive de 2 633 891 octets, intégrité `vérifiée`, clé d'essai jetable) puis restauration `pg_restore --no-owner --exit-on-error` dans une base neuve, comme `restaurer-archive.mjs` :
- restauration sans erreur ; **mêmes nombres de lignes** sur les 148 tables de `public`, `auth`, `storage` ;
- `pg_dump --schema-only` de `public` (droits compris) : **identique** hors commentaires et hors trois contraintes `CHECK` dont PostgreSQL redessine les parenthèses (équivalentes) ;
- contrôles de `restaurer-archive.mjs` : fonctions `SECURITY DEFINER` exécutables par `anon` = 0, tables sans RLS = 0, clés étrangères non validées = 0 ;
- **absents** de la copie : schéma `cron`, `supabase_migrations`, 152 commentaires ;
- les deux scripts de retour arrière joués sur cette copie restaurée : 120000 **refusé** sans option (la copie contient la ligne `mission_annulee`), accepté avec l'option, 110000 accepté ; schéma final identique à l'état d'origine hors la contrainte `NOT VALID` et les parenthèses.
Preuves : `restauration/R1…R5`, `restauration/volumes_*.txt`.

### 5.3 Tests automatiques du dépôt (observé)
`exercice-restauration.test.ts`, `restauration-archive.test.ts`, `sauvegarde-base.test.ts` : 13 tests passés (données fictives, aucun lien avec la production).

### 5.4 Verdict
| Question | Réponse |
|---|---|
| La sauvegarde du jour en production est-elle valide ? | **Non qualifiable** : aucun essai de restauration documenté sur une copie postérieure au 27/09, et exécutions réelles non consultées |
| Le mécanisme (export, chiffrement, restauration PostgreSQL, droits) fonctionne-t-il ? | Oui sur le banc, avec les réserves du §3 |
| Une reprise complète est-elle prouvée (Auth, Storage, bascule, 4 h) ? | **Non**, jamais essayée |
| Le test de restauration est-il périodique ? | Le wiki hésite entre trimestriel (code) et annuel (A4) ; aucun calendrier n'est tenu |

## 6. Retour arrière des migrations, ou restauration ?

| Situation | Outil |
|---|---|
| Un correctif du 13/10 fait un dommage fonctionnel, données intactes | Retour arrière (`app/supabase/retours-arriere/`), après sauvegarde fraîche et `verifier-etat.sql` ; ou correction en avant |
| Données altérées ou perdues | Restauration dans un projet isolé (§4) ; le retour arrière ne répare aucune donnée |
| Les deux (migration appliquée puis corruption) | Restaurer d'abord la copie saine dans un projet isolé, **ré-appliquer** les migrations voulues par `migrations.yml` (historique à reconstituer), puis seulement comparer |

Défauts réintroduits par un retour arrière : AUD-A-01 à A-04, SUP-02, SUP-08, REP-01, ARC-10 (120000) ; préparation du soir du marketing (110000). Détail et procédure : `LISEZ-MOI.md`.

## 7. Matrice d'accès existante (rapports `auditeur/a`, banc e9f31ac, **lue, non rejouée**)

| Contrôle | Résultat |
|---|---|
| Lecture : 9 comptes × 141 relations de `public` par l'API | 0 ligne d'une organisation étrangère ; `audit_log` et `tech_log` : 0 ligne visible hors super-administrateur |
| Écritures croisées (PATCH, DELETE, POST avec `organization_id` étranger) | 692 tentatives, 0 ligne touchée (417 × 403, 275 × 200 à 0 ligne) |
| Appels RPC : 354 fonctions exécutables par `authenticated`, 5 intrus | aucune écriture inter-organisations (seule `acceptations_cgu`, propre au compte) |
| Escalade intra-organisation | locataire et artisan : 0 table modifiable directement ; **agent restreint : `definir_equipements_lot` hors portefeuille (AUD-A-01, P2)** — corrigée par 120000, **revient si on le défait** |
| Stockage | 13 objets × 7 comptes + anonyme : 0 fuite |
| Fonctions : 0 sur 554 exécutables par `anon` ; 0 `SECURITY DEFINER` sans `search_path` sur 479 ; 145 tables sur 145 avec RLS | conforme |
| Traçabilité | trois lacunes (AUD-A-02, A-03, A-04), corrigées par 120000 ; **reviennent** avec le retour arrière |
Non couvert par cette matrice : locataire ↔ locataire et artisan ↔ artisan d'une même organisation, compte cumulant les rôles, fonctions de supervision sous MFA, et **toute mesure sur la version candidate ou sur la production**.

## 8. Risques résiduels

| N° | Risque | Gravité estimée | État |
|---|---|---|---|
| 1 | Perte de `GERIMMO_BACKUP_KEY` ou du compte GitHub : copies illisibles / plus de workflow | élevée | lu ; conservation indépendante de la clé non vérifiée |
| 2 | Tâches `pg_cron` non recréées après reprise, sans alerte (appels de loyer, impayés, rétention) | élevée | AUD-C-02 ouverte, observé sur le banc |
| 3 | Aucun essai de restauration documenté depuis le 27/09 ; reprise complète (Auth, Storage, bascule, 4 h) jamais éprouvée | élevée | §5 |
| 4 | Historique des migrations absent de la copie : projet de secours sans mémoire de son schéma | moyenne | observé |
| 5 | Un retour arrière sur une base qui contient des `mission_annulee` ne peut pas poser la contrainte validée | moyenne | maîtrisé (refus + option `NOT VALID`) |
| 6 | Retour arrière à côté d'une migration plus récente qui réécrit les mêmes fonctions : écrasement | moyenne | à vérifier avant usage (étape 1 du LISEZ-MOI) |
| 7 | Retour arrière joué par `migrations.yml` : commit du lot entier, simulation inopérante, version fantaisiste enregistrée | moyenne | gardé dans les scripts ; fiche RET-01 pour le chantier |
| 8 | Commentaires SQL perdus à la restauration | faible | RET-02 |
| 9 | Arrêt d'urgence sans effet sur les 8 tâches SQL | moyenne | SUP-01 ouverte |
| 10 | Base et fichiers copiés sans instantané commun | faible | lu |
| 11 | Compatibilité application candidate / base revenue à l'état antérieur non essayée | à vérifier | hypothèse |

## 9. AUD-C-02 et SUP-01

- **AUD-C-02** (P2, ouverte, reproduite) : les 8 tâches `pg_cron` ne sont ni sauvegardées, ni décrites dans la procédure de restauration, ni surveillées. **Mon essai** confirme l'exclusion du schéma `cron` de la copie (le banc ne
  porte qu'une table de substitution de `pg_cron`, donc l'effet réel sur la production reste une hypothèse). Correction proposée par la fiche : étape « rejouer les `cron.schedule` des migrations et activer `pg_cron`/`pg_net` »,
  export de `cron.job` dans la sauvegarde, signal si le cycle mensuel ne tourne pas. Aucune n'est faite à ce jour (registre : *ouverte, complète SUP-01*).
- **SUP-01** (P2, ouverte) : l'arrêt d'urgence ne couvre que les routes Next/Vercel ; `pg_cron` continue (rétention, cycle mensuel, alertes, publications). Le retour arrière de 120000 **ne change rien** à SUP-01 (autre mécanisme), mais
  réintroduirait SUP-02 (arrêt refusé pendant un diagnostic). Décision du dirigeant requise (prédicat interne lu par chaque tâche, ou documenter la limite).
- Lien entre les deux : même cause (`pg_cron` s'exécute hors du circuit applicatif), côté contrôle pour SUP-01, côté reprise pour AUD-C-02.

## 10. À faire en lecture seule en production (par le dirigeant)

1. `select jobname, schedule, active from cron.job order by jobname;` et comparer aux `cron.schedule` des migrations (écart = tâche créée ou retirée à la main, absente de toute sauvegarde).
2. Dernière réussite de « Sauvegarde quotidienne » et de « Vérifier la restauration de la sauvegarde réelle » ; relancer ce dernier après une nouvelle copie, puis consigner le bilan dans le wiki.
3. Règle de cycle de vie Scaleway (90 jours) et copie hors-compte de `GERIMMO_BACKUP_KEY`.
4. `select version from supabase_migrations.schema_migrations where version in ('20261013110000','20261013120000');` avant tout retour arrière.

> [!warning] Points à trancher / contradictions
> - Fréquence du test de restauration : trimestrielle (code) ou annuelle (A4) — le wiki l'a déjà noté, rien n'est planifié.
> - La page [[Plan de reprise d'activité]] décrit une sauvegarde Supabase et une table `backup_registry` ; la réalité V4 est une copie Scaleway chiffrée tracée dans `tech_log`.
> - Les scripts de retour arrière ont été essayés sur PostgreSQL 16 ; la production est annoncée en 17 (workflows) : aucun essai sur cette version.
