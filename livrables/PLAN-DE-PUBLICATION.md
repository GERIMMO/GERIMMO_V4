# Plan de publication en production — version préparée `062296e2`

- **Rédigé le** 25/11/2026 par l'agent. **Rien de ce plan n'a été exécuté.**
- **À exécuter seulement après votre message écrit « je valide la publication ».** Avant ce message, la production reste gelée.
- **Aucun point juridique n'est présenté ici comme conforme.** Les points de droit ouverts sont cités avec leur renvoi à `JURISTE.md`.
- **Aucun secret ni mot de passe dans ce document.** Seuls les noms des variables sont cités.
- **Règle d'or du jour J : si une étape échoue, on s'arrête. On ne saute aucune étape.**

**Légende**

- **VÉRIFIÉ** : je l'ai lu ou rejoué. Je dis comment.
- **SUPPOSÉ** : je le déduis. Je ne l'ai pas constaté.
- **À FAIRE** : pas encore fait.

**Petits mots utiles**

- *Migration* : un fichier qui change la structure de la base de données.
- *Retour (arrière)* : le fichier qui défait une migration.
- *CI* : la vérification automatique de GitHub (tests, construction du site).
- *PR* : la demande de fusion d'une branche dans `main`.
- *Fusion « squash »* : la branche entre dans `main` en un seul commit.
- *Simulation* : la base joue les migrations, puis annule tout.
- *Approbation* : le bouton que GitHub vous montre pour l'environnement `gerimmo-production`.
- *Console* : l'espace du super admin, `/admin`.

---

## 1. Où on en est (25/11/2026)

| Fait | Statut | Comment je le sais |
|---|---|---|
| La version préparée est le commit `062296e236aa3b52660f2214fda20bedeaac24a1`, sur la branche `claude/palier-1-preproduction` (envoyé le 25/11). Il ajoute six commits au-dessus de `89cb87ff` : `140f4216` (les 11 retours qui gardaient leur version au registre la retirent, constat RET-01), `f78e3a3f` (défaut majeur L-01 de la seconde passe, carte « Mon logement » du locataire), `ee28d874` (trois tests rendus indépendants de la machine), `becd15c0` (défaut d'écran trouvé par la CI sur WebKit mobile : arrivé sur une rubrique du bail par son ancre, l'écran y revenait à chaque rafraîchissement de la page ; corrigé dans `rubrique-dossier.tsx`, avec un test ; deux parcours rendus indépendants), `e821bb49` (un parcours attend que la page ait retrouvé son titre avant l'analyse d'accessibilité ; aucune logique de l'application touchée), `062296e2` (défaut trouvé par la CI : sur la fiche de mission de l'artisan, l'avertissement « Le locataire a annulé le rendez-vous » était un paragraphe qui portait un formulaire ; la page ne correspondait plus à celle de React et toute la fiche était redessinée à l'ouverture, bouton « J'en prends acte » compris ; l'avertissement devient un bloc, avec un test et une garde dans le parcours). | VÉRIFIÉ | `git log 89cb87ff..062296e2` ; `git branch -r --contains 062296e2` : la branche distante contient ce commit. Avant le 25/11 au matin, la version préparée était `89cb87ff3074235fbd28867155edb7d619bc3f46` : les vérifications datées ci-dessous qui la citent portent sur elle. |
| Elle contient `main` (`e1e442dc`) et la version en ligne (`81740dec`). | VÉRIFIÉ | `git merge-base --is-ancestor` pour les deux (refait sur `062296e2`). |
| La production sert `81740dec`. | SUPPOSÉ | Dernier relevé : `AUDIT.md` (22/11) et `log.md` (21/11). Non relu : aucune requête vers la production. |
| `main` est à `e1e442dc` (lot #357, non publié). | VÉRIFIÉ en local | Référence `origin/main` de la copie locale. À relire sur GitHub le jour J. |
| 866 fichiers changent entre la version en ligne et la version préparée (859 avec `ee28d874`, 856 avec `89cb87ff`). | VÉRIFIÉ | `git diff --stat 81740dec 062296e2`. |
| **52 migrations** à appliquer. Chacune a son retour. | VÉRIFIÉ | `git diff --name-status 81740dec 062296e2 -- app/supabase/migrations` : 52 ajouts. Aucune migration ne change entre `89cb87ff` et `062296e2` : dans `app/supabase`, seuls 11 fichiers de retour et le LISEZ-MOI des retours changent (RET-01). Ce sont les lignes 525 à 576 de `app/e2e/local/ordre-migrations.txt`. Un fichier `.retour.sql` existe pour chacune. |
| Les contrôles du chantier « Migrations Supabase » acceptent la liste. | VÉRIFIÉ | J'ai lancé en local, sur une copie des fichiers, `conditionner-migration.mjs lot` (accepté) puis `verifier` sur chaque fichier (52 sur 52 acceptés). Les noms passent le filtre du chantier. Aucune base touchée. |
| Les chantiers GitHub sont identiques sur `main` et sur la version préparée. | VÉRIFIÉ | `git diff e1e442dc 062296e2 -- .github/ app/scripts/deploiement app/scripts/sauvegarde` : vide. |
| Aucune nouvelle variable d'environnement. `vercel.json`, `next.config.ts` et `/api/sante` ne changent pas. | VÉRIFIÉ | `git diff 81740dec 062296e2` sur ces fichiers et sur `app/.env.example` : vide. |
| Vérification complète au banc local : 16 506 tests réussis, seuls les 2 fichiers en échec attendus du banc ; 355 parcours navigateur réussis au premier essai, 3 ignorés. | VÉRIFIÉ par l'agent qui l'a lancée, sur `89cb87ff` | `JOURNAL.md`, entrée « Fusion des deux arbres et corrections ». Non rejoué pour ce plan. |
| Vérification complète au banc du commit `f78e3a3f` : construction, typage et style sans erreur ; 16 574 tests réussis, seuls 2 fichiers en échec, attendus au banc (`lot2-auth-reel`, `lot3-notifications-base`, qui passent dans la CI de GitHub) ; 355 parcours navigateur réussis au premier essai, 3 ignorés. `ee28d874` ne change ensuite que trois fichiers de test, qui passent au banc (80 réussis, 1 ignoré ; l'épreuve des PDF produit 34 documents). | VÉRIFIÉ par le pilote | `JOURNAL.md`, entrée du 25/11 « Seconde passe complète, essais de publication, vérification CI ». Non rejoué pour ce plan. |
| Vérification complète au banc du commit `becd15c0` (25/11) : construction, typage et style sans erreur ; 16 575 tests réussis (31 ignorés), seuls les 2 fichiers en échec attendus du banc ; 354 parcours navigateur réussis au premier essai, 1 au second essai, 3 ignorés. Le parcours repris (analyse d'accessibilité de la page des consommations à 768 px, lancée avant que la page ait retrouvé son titre) est corrigé dans `e821bb49`, puis rejoué au banc quatre fois de suite avec les deux parcours rendus indépendants par `becd15c0` : 29 réussis sur 29. | VÉRIFIÉ par le pilote | `JOURNAL.md`, entrée du 25/11 « CI GitHub : deux défauts d'écran qu'elle seule voyait (WebKit mobile, fiche de mission de l'artisan) ». Non rejoué pour ce plan. |
| **Vérification complète au banc du commit `062296e2` (25/11), la version préparée** : construction, typage et style sans erreur ; 16 578 tests réussis (31 ignorés), seuls les 2 fichiers en échec attendus du banc ; **355 parcours navigateur réussis au premier essai**, 3 ignorés. | VÉRIFIÉ par le pilote | `JOURNAL.md`, entrée du 25/11 « CI GitHub : deux défauts d'écran qu'elle seule voyait (WebKit mobile, fiche de mission de l'artisan) ». Non rejoué pour ce plan. |
| Seconde passe complète sur `89cb87ff` (IA activée, puis IA coupée). | VÉRIFIÉ, terminée | 355 puis 354 parcours réussis au premier essai (3 ignorés) ; documents générés sans anomalie ; aucune fuite entre espaces (un signal sur les discussions d'intervention, contrôlé en base : seuls les participants légitimes les lisent). Relecture des captures par six relecteurs et un vérificateur : un seul défaut majeur confirmé (L-01, corrigé dans `f78e3a3f`) ; tous les défauts majeurs de la première passe sont corrigés ; défauts mineurs reportés (votre décision). Rapports : `livrables/notes-banc/passe2/`. |
| CI GitHub. | **VERTE sur `062296e2`, sans aucune reprise** | Exécution n° 45591695035, lancée sur la branche de sauvegarde `claude/sauvegarde-fusion`, au même commit que la préproduction : 16 620 tests et les épreuves PDF ; 355 parcours par profil au premier essai (3 ignorés) ; envois avec boîte fictive (4) ; 75 parcours WebKit mobile ; vrai PostgREST (9) ; invitation artisan dans une base jetable (2). Avant : `89cb87ff` (n° 45547334372) en échec (4 tests dus aux tests eux-mêmes, et le parcours d'annulation d'un rendez-vous par le locataire) ; `ee28d874` (n° 45561874554) en échec sur WebKit mobile, ce parcours passé au second essai seulement ; `becd15c0` (n° 45582618122) en échec sur ce parcours ; `e821bb49` (n° 45587450943) verte, ce parcours passé au second essai. Ce parcours instable venait d'un défaut de l'écran de l'artisan, corrigé dans `062296e2`. La CI de la PR et celle de `main` (É2, É4) restent exigées le jour J. |
| Aucun lien d'aperçu. | VÉRIFIÉ | Pas de copie de la base (Q1 annulée, `DECISIONS-2026-11-24.md`). Un aperçu Vercel se brancherait sur la base de production (`AUDIT.md`, P0-01). `garde-environnement.mjs` refuse d'ailleurs de construire un aperçu. **Le premier passage réel sera donc la production.** |

---

## 2. Prérequis

### 2.1 Avant le jour J

P1 et P2 appliquent votre décision Q9, déjà prise. Ils ne changent ni le site ni la structure de la base (la sauvegarde écrit seulement sa ligne habituelle au journal technique de la base, comme chaque nuit). Ils peuvent donc se faire avant le message « je valide la publication ». Le contrôle de restauration (P2, point 2) demande votre accord. Votre décision du 24/11 (nuit) le rappelle : une sauvegarde neuve et relisible doit exister avant la publication (`DECISIONS-2026-11-24.md`).

**P1 — Nouvelle clé des sauvegardes `GERIMMO_BACKUP_KEY` (décision Q9). À FAIRE, par vous.**

Pourquoi : la clé actuelle n'existe que dans les secrets de GitHub. Un secret GitHub ne se relit pas. Vous n'en avez aucune copie (Q9). Sans clé, aucune sauvegarde ne se restaure.

1. Sur votre ordinateur, fabriquez une clé de 64 caractères hexadécimaux. La commande est écrite en tête de `.github/workflows/sauvegarde.yml` : `openssl rand -hex 32`. L'agent vous guide pas à pas. Il ne voit jamais la clé.
2. Rangez une copie dans votre gestionnaire de mots de passe, hors de GitHub.
3. GitHub → dépôt → Settings → Secrets and variables → Actions → `GERIMMO_BACKUP_KEY` → Update. Collez la clé. Enregistrez.
4. Ne collez jamais la clé dans une conversation, un document ou un message.

À savoir (SUPPOSÉ, déduit de Q9) : remplacer le secret efface l'ancienne clé, qui n'existe nulle part ailleurs. Les copies faites avant deviennent illisibles. Elles restent chez Scaleway jusqu'à leur suppression automatique (90 jours d'après la documentation ; réglage non vérifié). **Ce geste ne se défait pas.**

**Conséquence à connaître :** entre le remplacement de la clé et la réussite de P2, il n'existe plus aucune sauvegarde lisible. Faites P1 et P2 le même jour, l'un juste après l'autre.

**P2 — Une sauvegarde lisible, faite avec la nouvelle clé. À FAIRE.**

1. GitHub → Actions → « Sauvegarde quotidienne » → Run workflow, branche `main`. Ce chantier ne demande pas d'approbation (aucun environnement protégé dans `sauvegarde.yml`). Attendre le message « ✓ sauvegarde … déposée et relue ».
2. Puis, avec votre accord : Actions → « Vérifier la restauration de la sauvegarde réelle » (`restauration-sauvegarde.yml`) → Run workflow, branche `main`. Il télécharge la **dernière** copie, la déchiffre avec la clé et la restaure dans une base jetable. Il ne touche ni Scaleway, ni Supabase, ni le site.
3. Attendu : chantier vert, et un fichier `bilan-restauration` conservé. C'est la preuve que la nouvelle clé lit la copie.

Cette sauvegarde ne remplace pas celle du jour J (étape É7) : le chantier des migrations exige une sauvegarde réussie depuis moins de 90 minutes.

**P3 — Décider qui peut jouer un retour arrière de la base. À DÉCIDER.**

Les retours de la base se jouent « à la main », avec `psql` et le mot de passe de la base. Jamais par le chantier des migrations (`GUIDE-DE-REPRISE.md`, § 6). Ce mot de passe est dans le secret GitHub `SUPABASE_DB_PASSWORD`, qui ne se relit pas. Les notes ne disent pas qui le détient ailleurs. Sans cet accès, le niveau 2 du retour en arrière (§ 5.4) ne peut pas être joué vite. Il faut décider avant le jour J qui le jouerait, et comment l'accès serait donné. L'accès n'est jamais écrit dans un document.

**Bloquant :** sans cette décision, ne pas publier. Ou bien acceptez par écrit que seuls les niveaux 1 (site) et 3 (restauration) soient disponibles vite.

**P4 — Réglages à relire chez Vercel et GitHub, avant la fusion. À FAIRE, par vous (l'agent dit quoi regarder).**

- **Vercel, variable `GERIMMO_MODE` (environnement Production) = `commercial`.** À vérifier **avant la fusion**, car la variable est lue à la construction du site. `app/scripts/deploiement/garde-environnement.mjs` refuse de construire la production si le mode n'est pas `commercial`, si `NEXT_PUBLIC_SITE_URL` n'est pas `https://www.gerimmo.app`, si `GERIMMO_PILOTE_LIMITE` vaut `true`, si `GERIMMO_PAIEMENTS_DESACTIVES` vaut `1`, ou si `COURRIELS_CHIFFREMENT_CLE` manque. SUPPOSÉ déjà `commercial` : `81740dec` a été construit pour la production avec ce même contrôle (VÉRIFIÉ : la règle est dans `81740dec:app/scripts/deploiement/garde-environnement.mjs`, appelée à la construction ; le fichier n'a pas changé depuis). La valeur est masquée (Q16) : non lue. **Attention :** `QUESTIONS.md` (Q16) écrit « Ce réglage se fera le jour de la publication ». Si la valeur lue n'est pas `commercial`, la construction de É4 échouera : la production ne change pas, mais il faut régler la variable avant de continuer.
- **Vercel : « Auto-assign Custom Production Domains » désactivé.** SUPPOSÉ : le 21/11, le site a changé à la publication contrôlée, pas à la fusion (`GUIDE-DE-REPRISE.md`, § 9, point 3). Non lu. S'il était actif, la fusion mettrait le nouveau code en ligne **avant** les migrations (voir la règle d'arrêt de l'étape É4).
- **GitHub : variable `GERIMMO_RELEASE_ENABLED` = `true` ; environnement `gerimmo-production` avec vous seul comme approbateur.** `publier.mjs` le contrôle. SUPPOSÉ (cela marchait le 21/11). Non relu. VÉRIFIÉ en lisant `controle.mjs` (`approbationGerimmoConforme`) : le contrôleur refuse de publier si l'environnement n'a plus exactement un approbateur (votre compte), sans exception pour les administrateurs, et limité aux branches protégées.
- **GitHub : protection de `main`.** Non relue depuis le 21/11. Elle peut exiger une revue avant la fusion (É3).
- **Vercel garde l'ancienne version** `dpl_AV9825DKz3JzKQhDXd699x8yhfvu` (celle de `81740dec`, `log.md` du 21/11). SUPPOSÉ. Elle sert au retour en arrière.

**P5 — Seconde passe complète terminée, sans défaut bloquant.** **Fait (25/11), sur `89cb87ff`, IA activée puis coupée :** 355 puis 354 parcours navigateur réussis au premier essai (3 ignorés) ; documents générés sans anomalie ; aucune fuite entre espaces (un signal sur l'état des discussions d'intervention a été contrôlé en base : seuls les participants légitimes les lisent). Relecture des captures par six relecteurs et un vérificateur : un seul défaut majeur confirmé, L-01 (la carte « Mon logement » du locataire laissait croire que l'usure normale est retenue sur le dépôt ; elle dit maintenant « L'usure normale du logement ne peut pas vous être retenue », FAQ alignée, test ajouté). Tous les défauts majeurs de la première passe sont corrigés. Les défauts mineurs sont reportés (votre décision). Rapports : `livrables/notes-banc/passe2/`.

Si la seconde passe amène des corrections, le commit change. Il faut alors refaire la vérification complète et mettre ce plan à jour (commit, liste des migrations, liste des retours). **Fait :** la correction L-01 et celle de RET-01 ont donné `f78e3a3f`, vérifié en entier au banc (§ 1), puis `ee28d874` (trois tests seulement), puis `becd15c0`, `e821bb49` et `062296e2` (deux défauts d'écran trouvés par la CI, et des parcours rendus fiables ; vérifications complètes au banc sur `becd15c0` puis `062296e2`, § 1). La liste des migrations (É6) et l'ordre des retours (§ 5.4) ne changent pas.

**P6 — Essais recommandés au banc local (aucune production). Faits le 25/11 (essais « bloc », « ancien » et « retours »), puis repris par les corrections du 25/11 (fin du plan, « Corrections du 25/11 après les essais de publication »).** Le texte ci-dessous garde la raison de chaque essai ; leur résultat est donné en fin de point.

- a. **Jouer les 52 migrations en une seule transaction**, comme le fait le chantier, sur une base arrêtée à `20261120200000`. Raison : le banc les applique une par une (`app/e2e/local/preparer-ci.mjs`). Le lot d'un seul bloc n'a jamais été joué. La simulation de production (É6) le jouera aussi, sans risque.
  **Résultat (essai « bloc », VÉRIFIÉ au banc, `livrables/notes-banc/essais/bloc.md`) :** simulation puis application d'un seul bloc réussies (code 0), avec le texte même des étapes de `migrations.yml` ; schéma identique à celui d'une base construite migration par migration. À savoir pour É8 : à partir de la 28ᵉ migration (`20261124110000`), un verrou peut attendre 10 secondes par instruction, et non 5. Non reproduits : le pooler et la vraie instance Supabase, la durée réelle des verrous en production.
- b. **Faire tourner l'ancien code `81740dec` sur la base migrée**, sur les parcours principaux. Raison : entre l'application des migrations (É8) et la publication (É10), et en cas de retour de niveau 1, l'ancien code tourne sur la nouvelle base. C'est aussi ce que vous déclarez en cochant `base_compatible` (É10). Aujourd'hui, ce n'est prouvé que pour `20261125150000` (sonde SQL, `fusion/PLAN-PUBLICATION-NOTES.md`, « Preuves »). Trois autres migrations l'écrivent dans leurs commentaires (`20261122220000`, `20261125140000`, `20261125153000`/`154000`). Rien n'a été essayé pour le lot entier. **À DÉCIDER par vous :** faire cet essai avant le jour J, ou accepter par écrit de cocher `base_compatible` sans preuve. Le contrôleur refuse de publier si la case n'est pas cochée (sauf mode « correction en avant », lu dans `controle.mjs`).
  **Résultat (essai « ancien », VÉRIFIÉ au banc) :** la suite de parcours navigateur de `81740dec` passe sur la base migrée (282 réussis, 0 échec). **Un risque de donnée fausse a été trouvé hors de la suite (A-01) : la lettre de révision de loyer** (voir É8 et § 5.3, consigne). **Restent SUPPOSÉS (A-05)** : les objets créés par le nouveau code puis lus par l'ancien (avenants, factures refusées, absences d'artisan, rendez-vous manqués), l'IA réelle, les e-mails réels, les tâches planifiées, le vrai PostgREST/Supabase (le banc utilise un émulateur) et l'affichage à l'écran des refus de la base. Ce que la lecture du code de `81740dec` en dit est au § 5.3. **À DÉCIDER par vous :** cocher `base_compatible` en acceptant par écrit ces points supposés et les consignes de É8 et du § 5.3, ou demander d'abord l'essai ciblé (objets créés avec la nouvelle version, écrans parcourus avec `81740dec`).
- c. **Jouer la chaîne complète des 52 retours** sur une base migrée, puis réappliquer les migrations.
  **Résultat (essai « retours », puis correction RET-01, VÉRIFIÉ au banc) :** les 52 retours passent. L'essai a trouvé que 11 d'entre eux laissaient leur version au registre : la réapplication par `migrations.yml` était refusée. Corrigé dans le code (commit `140f4216`, § 5.4) et rejoué : après la chaîne, aucune des 52 versions ne reste ; le bloc « Appliquer » de `migrations.yml` réapplique le lot (simulation, puis application : code 0) ; le schéma obtenu est identique au schéma migré d'origine (6 212 entrées, 0 écart).
- d. **Essayer les 7 retours à plusieurs instructions** dans une seule transaction (voir § 5.4). **Résultat (essai « retours ») :** `begin; \i ×52; rollback;` et `--single-transaction` passent.

**P7 — Le jour J : une demi-journée de votre disponibilité** (approbations GitHub, console, Stripe). Conseil, pas une règle du dépôt : éviter le 1er du mois (tâche `cycle-mensuel` à 05:00 UTC, appels de loyer) et le matin entre 03:00 et 09:00 UTC (tâches de la base ; tâches de Vercel de 03:00 à 09:00 UTC dans `app/vercel.json` ; sauvegarde planifiée, qui part en réalité entre 06 h et 08 h UTC d'après `sauvegarde.yml`).

**P8 — Votre message écrit « je valide la publication ».** Rien de la suite ne commence sans lui.

### 2.2 Contrôles en lecture seule, le jour J, juste avant la fusion

**Qui :** l'agent, avec l'outil de lecture de la base (il vous demande d'accepter l'outil). À défaut : vous, dans l'éditeur SQL de Supabase, en collant la requête telle quelle. Ces requêtes ne font que lire. Rien n'est écrit.

**C1 — Aucune ancienne demande de signature manuelle en attente** (requête de la note D5, `livrables/notes-banc/notes-D5.md`).

```sql
select count(*)                                                        as toutes,
       count(*) filter (where signee_le is null)                        as en_attente,
       count(*) filter (where signee_le is null and prestataire='manuel') as manuelles_en_attente
  from public.demandes_signature;
```

- Attendu : `0 | 0 | 0` (contrôle du 24/11 : table vide).
- Si `manuelles_en_attente` > 0 : **ARRÊT, ne pas publier.** Le locataire n'aurait plus d'écran pour déposer son document signé. La migration `20261125140000` s'arrêterait d'ailleurs d'elle-même, et tout le lot avec elle.
- Si `toutes` > 0 mais rien en attente : publication possible.

**C2 — Zéro abonné actif** (requête de `fusion/PLAN-PUBLICATION-NOTES.md`, étape 6 ; même filtre que la console, `conditions-versions-serveur.ts`, statuts clos `canceled` et `incomplete_expired`).

```sql
select count(*) from public.abonnements
 where stripe_subscription_id is not null
   and coalesce(stripe_statut,'') not in ('canceled','incomplete_expired');
```

- Attendu : `0`.
- Si > 0 : **ARRÊT, et décision de votre part.** L'archivage des conditions du 24/11 serait refusé (D4R-02). L'annonce par e-mail prévue par l'article 16 des conditions n'est pas construite. Les souscriptions resteraient bloquées.

**C3 — Circuits de signature « prêts » mais pas envoyés** (requête écrite pour ce plan d'après le schéma : table `bail_signature_circuits`, migrations `20261018085521` et `20261018185515` ; non jouée au banc).

```sql
select modele, etat, count(*) as nombre
  from public.bail_signature_circuits
 group by modele, etat
 order by modele, etat;
```

- Attendu : aucune ligne à l'état `pret` ou `preparation`. Le 24/11, un seul circuit existait : un bail, terminé (Q40).
- S'il y en a : pas bloquant. Les noter. Après la publication, ils seront refusés à l'envoi (« Le dossier a changé depuis la préparation ») et devront être préparés de nouveau : bail, acte de cautionnement, état des lieux de sortie, protocole d'apurement, autorisation de travaux, avenant (Q40). En production, il n'y a que des comptes de test (Q64).

**C4 — Aucune des 52 migrations n'est déjà en base** (requête écrite pour ce plan ; non jouée).

```sql
select version from supabase_migrations.schema_migrations
 where version > '20261120200000' order by version;
```

- Attendu : aucune ligne. Le chantier refuserait de toute façon une version déjà enregistrée.
- S'il y en a : **ARRÊT.** Quelque chose a été appliqué hors du plan.

**C5 — Texte de la fonction `accepter_cgu`** (requête de `fusion/PLAN-PUBLICATION-NOTES.md`, étape 8).

```sql
select md5(prosrc) = '05c1f8827ce05a4599803634a822a575' as accepter_cgu_texte_attendu
  from pg_proc where oid = 'public.accepter_cgu(text,text,text)'::regprocedure;
```

- Attendu : `t`. Ce texte est celui du 24/10. La migration `20261125150000` ne le change pas en production.
- Si `f` : pas bloquant. Noter la valeur de `md5(prosrc)`. Après les migrations, elle devra être la même (étape É9). La valeur de production n'a jamais été lue (notes de la reprise, § 9.5).
- Si le texte est très différent, la migration `20261125150000` s'arrête d'elle-même (« définition inattendue, remplacement refusé », lu dans le fichier). La simulation (É6) échoue alors, sans rien appliquer : **ARRÊT.**

**C6 — La version du 24/11 n'est pas déjà archivée** (requête écrite pour ce plan d'après la table `versions_conditions`, migration `20261024090000` ; non jouée).

```sql
select document, version, publiee_le from public.versions_conditions order by document, version;
```

- Attendu : aucune ligne `conditions_clients` / `2026-11-24`.
- Si elle existe : **ARRÊT.** L'archivage du jour J serait refusé (« déjà archivée avec un autre texte », notes T4, § 9.3). Ne rien forcer.

---

## 3. L'ordre des opérations, pas à pas (jour J)

**La règle : toutes les migrations avant le code.** Il n'y a plus d'exception. L'exception D4 (migration `20261125150000`) a été levée par la relecture de la fusion (R-01, commit `e71d2644`) : la migration a été réécrite et ne bloque plus rien, quel que soit l'ordre (`livrables/notes-banc/fusion/PLAN-PUBLICATION-NOTES.md`, lignes 3 et 14 à 20, et section « Preuves »). La migration `20261125150000` se joue donc à son rang, entre `20261125140000` et `20261125151000`.

**Les approbations** que GitHub vous demandera : quatre, ou trois si l'on saute É5. É5 (vérifier seulement), É6 (simulation), É8 (application), É10 (publication). La sauvegarde (É7) et la recette (É12) n'en demandent pas : leurs chantiers n'utilisent pas l'environnement `gerimmo-production` (lu dans `sauvegarde.yml` et `recette-production-autonome.yml`).

**É1 — Ouvrir la PR.** Agent.
De `claude/palier-1-preproduction` vers `main`. Vérifier que la tête de la PR est `062296e2` et que la branche est à jour avec `main` (elle contient `e1e442dc`). Rien ne change en production.

**É2 — CI de la PR verte.** Agent (suivi).
Chantier « CI », tâche « Lint, types, tests, build », verte sur `062296e2`. Historique au § 1 (ligne « CI GitHub »). Si elle est rouge : **ARRÊT.** Lire l'erreur, corriger sur la branche, refaire la vérification complète, revenir à É2.

**É3 — Fusionner en « squash ».** Agent, ou vous.
- Noter le nouveau commit de `main` (40 caractères). Il remplace `062296e2` dans la suite.
- Contrôle : `git diff 062296e2 <nouveau commit>` doit être vide. Cela prouve que `main` porte exactement ce qui a été vérifié au banc.

**É4 — CI de `main` verte, et construction Vercel prête.** Agent (suivi et lecture).
- Noter le numéro de l'exécution de la CI réussie sur le nouveau commit. Ce doit être celle lancée par l'envoi sur `main`, pas celle de la PR : le contrôleur exige une exécution « push » sur `main` (lu dans `controle.mjs`).
- Noter la référence Vercel `dpl_…` de la version construite pour la production, sans domaine attribué.
- **Tout de suite, lire `https://www.gerimmo.app/api/sante`.** Le champ `revision` doit encore valoir `81740decfc1f4818d8da4b15b232800144f30815`.
- **Règle d'arrêt :** si `revision` montre déjà le nouveau commit, le code est en ligne avant la base. Remettre aussitôt `81740dec` (§ 5.3), puis chercher pourquoi (réglage de P4).
- Si la construction Vercel échoue avec « Construction suspendue : configuration commerciale incohérente… » : c'est `GERIMMO_MODE` ou une variable de P4. La production n'a pas changé. Corriger la variable, relancer la construction.

**É5 — Publication contrôlée en mode « vérifier seulement ».** Agent lance, vous approuvez. Recommandé.
- Actions → « Publication contrôlée Gerimmo » (`publication-controlee.yml`), branche `main`.
- `revision` = nouveau commit ; `deploiement` = `dpl_…` de É4 ; `tests` = numéro de la CI de É4 ; `publier` **décoché**.
- Attendu : état `prete_a_valider`. Le contrôleur vérifie la CI, la branche, le commit, la santé de la version préparée et celle de la version en ligne. Rien ne change.

**É6 — Simulation des migrations.** Agent lance, vous approuvez.
- Actions → « Migrations Supabase » (`migrations.yml`), branche `main`, case `simulation` **cochée**.
- Champ `fichiers` : la liste ci-dessous, telle quelle, dans cet ordre (celui du manifeste `ordre-migrations.txt`, lignes 525 à 576). 52 noms, 2 587 caractères (recompté le 25/11 ; liste comparée au manifeste : identique).

```text
20261122090000_bail_repris_dpe_g_et_edl_entree.sql 20261122100000_relais_point_inscriptions.sql 20261122110000_decompte_sortie_echeancier_charges.sql 20261122120000_interrupteur_ia.sql 20261122130000_lien_garant_admis.sql 20261122140000_incident_urgence_corrigee.sql 20261122150000_evaluation_contestee.sql 20261122160000_signatures_electroniques_locataire.sql 20261122170000_facture_artisan_refus.sql 20261122180000_echanges_intervention_non_lus.sql 20261122190000_avenants_bail.sql 20261122200000_envois_automatiques_reglage.sql 20261122210000_decision_artisan_notifiee.sql 20261122220000_incident_bien_categorie_urgence.sql 20261122230000_charges_proposees_a_confirmer.sql 20261122233000_disponibilites_locataire_incident.sql 20261122234000_edl_photos_par_element.sql 20261122235000_devis_garantie_annoncee.sql 20261122235500_artisan_absences_semaine_type.sql 20261122235800_artisan_relance_facture_rdv_manque.sql 20261122235900_artisan_lignes_devis.sql 20261122235950_pointage_loyer_releve.sql 20261122235959_menage_droits_sans_politique.sql 20261123090000_reperes_fiscaux_reglage.sql 20261123150000_regularisation_premiere_mensualite.sql 20261123170000_contrat_individuel_message_plafond.sql 20261124100000_revision_loyer_delai_et_premier_terme.sql 20261124110000_publications_origine.sql 20261124120000_motif_retrait_reserve_a_l_auteur.sql 20261124130000_revision_loyer_reprise_d2.sql 20261124140000_export_droits_par_colonne.sql 20261124150000_revision_loyer_seconde_reprise_d2.sql 20261124170000_revision_loyer_troisieme_reprise_d2.sql 20261124180000_notice_information_deposee.sql 20261124190000_reperes_fiscaux_source.sql 20261124200000_justificatif_retenue_piece_existante.sql 20261124210000_reperes_fiscaux_ancien_reglage_sans_source.sql 20261124220000_justificatif_retenue_dossier_du_bail.sql 20261124230000_reperes_fiscaux_ancien_reglage_journal_source.sql 20261125101500_conge_textes_officiels_t1.sql 20261125103000_factures_conservation_dix_ans.sql 20261125104000_courrier_impaye_conditions_du_24_novembre.sql 20261125105000_archive_compte_apres_client_stripe.sql 20261125106000_type_vendeur_et_vente_sans_mediateur.sql 20261125110000_relance_report_rdv_et_relance_a_la_main.sql 20261125111000_textes_officiels_t3.sql 20261125140000_ancien_parcours_signature_manuelle_droits_retires.sql 20261125150000_accord_conditions_version_archivee.sql 20261125151000_textes_t3_reprise_exercice_ancien.sql 20261125152000_bail_locataires_epoux_pacses.sql 20261125153000_bail_epoux_pacses_personnes_a_la_signature.sql 20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature.sql
```

- Attendu dans le compte rendu : « dix dernières versions enregistrées » se termine par `20261120200000` ; puis « SIMULATION : tout a été joué puis annulé. Rien n'est conservé. »
- **Ne pas lancer la simulation pendant une sauvegarde.** Le 19/11, une simulation a échoué (« lock timeout ») parce que la sauvegarde tournait en même temps (`log.md`).
- Si elle échoue : **ARRÊT.** Rien n'est appliqué : tout le lot est dans une seule transaction (`migrations.yml`, étape « Appliquer »).

**É7 — Sauvegarde du jour.** Agent lance.
Actions → « Sauvegarde quotidienne » → Run workflow, branche `main`, **après la fin de la simulation**. Attendre son succès. Elle est faite avec la nouvelle clé (P1).

**É8 — Application des migrations.** Agent lance, vous approuvez.
- Même chantier, **même liste, même ordre**, case `simulation` **décochée**, dans les 90 minutes qui suivent le succès de É7.
- Le chantier refuse tout seul l'application si : la CI n'est pas verte sur le commit exact ; aucune sauvegarde n'a réussi depuis 90 minutes ; une version est déjà en base ; un même contenu est déjà appliqué sous un autre numéro ; un nom n'est pas un simple fichier `.sql` (`migrations.yml`, lu). Il n'y a pas de contournement : suivre le message (par exemple, relancer la sauvegarde puis l'application).
- Tout le lot est joué d'un bloc : tout passe, ou rien.
- Si l'application échoue sur un verrou (« lock timeout ») : rien n'est appliqué. Attendre quelques minutes, puis relancer. Si plus de 90 minutes ont passé depuis É7, refaire d'abord la sauvegarde.
- **À partir d'ici, l'ancien code `81740dec` tourne sur la nouvelle base jusqu'à É10.** Garder ce moment court (quelques minutes). Compatibilité essayée au banc, avec un risque connu et des points supposés (voir P6 b).
- **Consigne A-01, de É8 jusqu'au succès de É10 : n'enregistrer aucune révision de loyer et ne produire aucune lettre « Révision du loyer ».** Pourquoi (VÉRIFIÉ au banc, sonde en transaction annulée) : la nouvelle base fait partir le loyer révisé du premier terme qui suit la demande (colonne `revisions_loyer.premier_terme`). La lettre de `81740dec` imprime « Loyer hors charges révisé, à compter du » suivi de la date d'effet (`revision-irl.ts`, ligne 101). Pour une demande du 01/11/2026 enregistrée le 25/11, la lettre annonce 616,89 € « à compter du 01/11/2026 » alors que novembre est appelé à 600,00 € (premier terme révisé : 01/12/2026). La base ne peut pas l'empêcher : l'ancien et le nouveau code appellent la même fonction, avec les mêmes quatre arguments (`actions/loyers.ts` des deux versions). En production, les comptes sont des comptes de test (Q64) : la consigne vous concerne, vous et l'agent. Contrôle en É9.

**É9 — Contrôles en lecture après l'application.** Agent.

```sql
-- 52 versions enregistrées (requête écrite pour ce plan ; C4 a montré qu'aucune n'existait avant)
select count(*) from supabase_migrations.schema_migrations
 where version between '20261122090000' and '20261125154000';
-- Texte d'accepter_cgu inchangé : attendu t (ou la même valeur qu'en C5)
select md5(prosrc) = '05c1f8827ce05a4599803634a822a575' as accepter_cgu_texte_attendu
  from pg_proc where oid = 'public.accepter_cgu(text,text,text)'::regprocedure;
-- Seul un accord à l'empreinte du texte archivé compte pour la non-reconduction : attendu t
select position('c.empreinte_sha256 = v.empreinte_sha256' in prosrc) > 0 as accord_exige_empreinte
  from pg_proc where oid = 'public.abonnements_sans_accord_conditions(text)'::regprocedure;
-- Supervision : accords à une version non archivée (rien ne bloque)
select * from public.acceptations_sans_version_archivee();
```

Les trois dernières requêtes viennent de `fusion/PLAN-PUBLICATION-NOTES.md`, étape 8.

```sql
-- Consigne A-01 : révisions dont la lettre de 81740dec annoncerait une autre date que le premier terme appelé au
-- loyer révisé (requête jouée au banc : elle liste la révision de la sonde A-01). Attendu en É9 : aucune ligne.
select r.id, r.bail_id, r.date_demande, r.date_effet, r.premier_terme, r.created_at
  from public.revisions_loyer r
 where r.premier_terme is not null
   and r.premier_terme <> r.date_effet
 order by r.created_at;
```

S'il y a une ligne en É9 : une révision a été enregistrée depuis É8. Ne produire sa lettre qu'après le succès de É10, avec le nouveau code, qui imprime le premier terme (lu dans `revision-irl.ts` de la version préparée ; PDF non rendu pour ce contrôle).
**À vérifier :** `acceptations_sans_version_archivee()` n'accepte que la clé de service ou un super admin connecté avec la double vérification (lu dans la migration `20261024090000` et dans `is_super_admin`). Depuis l'éditeur SQL, elle répondra sans doute « Accès refusé » (déduit, non essayé). Ce n'est pas un défaut. La même liste se lit dans la console : `/admin/sante`, « Versions des conditions ».
**Ne jamais appeler `accepter_cgu` en production pour un contrôle, même avec un compte de test.** Une ligne écrite dans `acceptations_cgu` ne se supprime plus : la table est en ajout seul (relecture Y-02).

**É10 — Publication contrôlée, pour de bon.** Agent lance, vous approuvez.
- Même chantier qu'en É5, mêmes `revision`, `deploiement` et `tests`.
- `publier` **coché** ; `base_compatible` **coché** (c'est l'hypothèse de P6 b : essayée au banc, avec la consigne A-01 et les points supposés A-05, à accepter par écrit avant le jour J) ; `correction_en_avant` **décoché**.
- Le contrôleur (`app/scripts/deploiement/publier.mjs` et `controle.mjs`) : vérifie tout, bascule le site vers `dpl_…`, puis fait trois contrôles de santé de suite sur `www.gerimmo.app`. Après trois échecs, il revérifie l'ancienne version et demande à Vercel d'y revenir.
- Attendu : état `publiee_verifiee`.
- Si l'état est `retour_verifie` : l'ancien code est revenu, la base reste migrée. Décider de la suite (§ 5).
- Si l'état est `intervention_requise` ou `bloquee` : **ARRÊT.** Lire le compte rendu de l'exécution.

**É11 — Contrôle de santé.** Agent.
- `https://www.gerimmo.app/api/sante` : `"ok": true`, `"base": true`, `"revision"` = nouveau commit de `main`, `"maintenance": false` (champs lus dans `app/src/app/api/sante/route.ts`).
- Pages publiques en 200 : `/`, `/tarifs`, `/outils`, `/journal`, `/connexion`, `/inscription`, `/conditions`, `/mentions-legales`, `/confidentialite`. La page `/conditions` affiche la version du 24 novembre 2026.
- Erreurs d'exécution chez Vercel : zéro dans l'heure qui suit (lecture seule).

**É12 — Recette de production.** Agent lance.
- Actions → « Recette de production avec nettoyage » (`recette-production-autonome.yml`), branche `main`.
- Elle crée cinq comptes fictifs, parcourt les espaces sur téléphone, puis les supprime. Aucun paiement réel. Seuls des e-mails vers les boîtes de test de Resend peuvent partir (en-tête du chantier).
- SUPPOSÉ compatible : elle n'a jamais tourné sur cette version. Un échec n'est pas forcément un défaut du site : lire le rapport avant de conclure.

**É13 — Consigner.** Agent.
Une entrée `deploy` dans `log.md`, et une entrée dans `JOURNAL.md`, avec les numéros d'exécution et ce qui n'a pas été vérifié.

---

## 4. Les réglages du jour de publication, dans l'ordre

Ces gestes se font dans la console, avec un super admin permanent et la double vérification. **C'est donc vous qui les faites.** L'agent vous guide, relit les pages après chaque geste, mais ne peut pas les faire à votre place.

Ils commencent après É11 (et É12 si vous la lancez). Le nouveau code doit être en ligne : l'archivage lit la page publiée.

**R1 — Identité complète du vendeur.** `/admin/parametres`, rubrique « Contact et entreprise ».

**Choisir d'abord le « Type de vendeur ».** Valeurs : `DECISIONS-2026-11-24.md`, « Réponses du 24/11 (nuit) », Q76 suite ; compléments des notes D7, § 5.1.

| Champ (libellé de la console) | Valeur à saisir |
|---|---|
| Type de vendeur | Entrepreneur individuel |
| Nom de l'éditeur | `TAHIR Brahim EI` |
| Forme juridique | `Entrepreneur individuel (nom commercial SAUVEXPERT)` |
| Capital social (facultatif) | vide (la console refuse un capital pour un entrepreneur individuel) |
| Adresse | `3 rue de l'Église, 91360 Épinay-sur-Orge` |
| Immatriculation (RNE ou RCS) | RNE, numéro `821 974 474` (la forme exacte d'écriture n'est pas fixée par les notes) |
| SIRET | `821 974 474 00032` |
| TVA intracommunautaire (facultatif) | vide (« TVA non applicable ») |
| Directeur de publication | `Brahim TAHIR` |
| E-mail de contact | `contact.gerimmo.app@gmail.com` |
| Téléphone de contact professionnel | `07 43 56 04 63` |
| Médiateur (trois champs) | vides (aucun médiateur à ce jour) |

- Enregistrer. Relire `/mentions-legales`, `/conditions` et `/confidentialite`.
- **Relire le nom, l'adresse et l'e-mail avant R2.** Les changer après l'archivage suspendrait les premières souscriptions des particuliers jusqu'à une nouvelle version des conditions (notes T4, § 5).
- Vérifier sur `/admin/sante`, « Informations légales » : « L'identité du vendeur est complète. »
- Rubrique « Prestataires » (coordonnées de Vercel, Supabase…) : les notes ne donnent aucune valeur. Sans elles, les mentions légales gardent l'encadré « Document en cours de finalisation », et la rubrique « Hébergement » affiche « (à venir) ». Cela ne ferme pas les ventes (notes D7, § 5.1). Rien n'est inventé.
- Même chose pour la page Confidentialité : elle garde l'encadré tant que la « Localisation » de la Base Adresse Nationale n'est pas saisie. C'est la seule localisation que le code ne fixe pas (lu dans `lib/editeur.ts`). Ce qui est déjà saisi en production n'a pas été lu.
- Point de droit ouvert : vous avez décidé « TVA non applicable pour l'instant ». Une fiche officielle annonçait un changement de la référence « article 293 B » au 01/09/2026. Le recueil que vous avez fourni reporte ce changement au 01/01/2027 et garde « article 293 B » d'ici là (non recontrôlé sur Légifrance). Non tranché (`JURISTE.md`, partie 6, point 13, et partie 9, point 32).

**R2 — Archiver la version du 24 novembre 2026 des conditions.**
1. Refaire le contrôle C2 (zéro abonné actif).
2. `/admin/sante` → « Versions des conditions » → « Archiver la version en vigueur des conditions ».
3. Conditions de réussite : nouveau code en ligne (la page publiée doit afficher la version du serveur) ; identité saisie (l'archive range l'identité affichée) ; zéro abonné actif (`app/src/lib/conditions-versions-serveur.ts`, lu).
4. Si l'archivage est refusé : ne rien forcer, prévenir l'agent. Tant que la version n'est pas archivée, les souscriptions attendent (la preuve d'accord exige l'empreinte du texte archivé). L'inscription et le premier mot de passe, eux, passent.
5. **Irréversible :** une version archivée ne se modifie ni ne se supprime (déclencheur `versions_conditions_immuables`).

**R3 — Mode commercial (`GERIMMO_MODE`).**
Rien à changer dans la console. C'est une variable de Vercel, lue à la construction (P4). Sur `/admin/parametres`, vérifier que l'IA s'affiche activée, et non « activée mais non connectée » : ce troisième état veut dire que la clé manque ou que le verrou pilote s'applique (`GUIDE-DE-REPRISE.md`, § 7 ; `lib/etat-ia.ts` ; libellé exact à l'écran non relu). L'IA reste activée à la publication (Q12). SUPPOSÉ : si le mode n'était pas `commercial`, la construction de É4 aurait échoué.

**R4 — Repères fiscaux du micro-foncier, avec leur source.** `/admin/parametres` → « Repères fiscaux affichés aux propriétaires ».
- Le jour même, relire la page officielle (les valeurs ont été lues le 24/11).
- Plafond : `15 000` €. Abattement : `30` %. Lu le 24/11 sur le BOFiP, BOI-RFPI-DECLA-10, version en vigueur du 06/03/2025 (texte lu), et sur impots.gouv.fr, page modifiée le 10/07/2026 (`TEXTES-OFFICIELS-LUS-2026-11-24.md`, § 5 ; Q38).
- Champ « source » : une seule ligne, de 10 à 300 caractères (règle de la migration `20261124190000`). Proposition, à ajuster si votre relecture du jour diffère :
  `BOFiP BOI-RFPI-DECLA-10, version en vigueur du 06/03/2025 (bofip.impots.gouv.fr) ; impots.gouv.fr, « Je mets en location un logement vide », page modifiée le 10/07/2026 ; lus le 24/11/2026`
- Cocher la case, enregistrer.
- La date enregistrée sera celle du jour de la saisie, pas celle de la lecture (question ouverte de Q38).

**R4 bis — Votre parcours de vérification, avant d'ouvrir les envois.** `livrables/PARCOURS-15-MINUTES.md`, partie A : environ 17 minutes (estimé). La partie B (environ 17 minutes de plus) dépose en production des documents fictifs : à faire seulement si vous l'acceptez. À la moindre différence, aucun envoi n'est ouvert tant qu'elle n'est pas comprise.

**R5 — Ouvrir les cinq envois automatiques, un par un.** `/admin/parametres` → « Envois automatiques d'e-mails ».

Vos décisions : Q6 (quatre envois ouverts à la publication) et Q37 (cinquième envoi ouvert à la publication). Ordre d'affichage de la console (`app/src/lib/envois-suspendus.ts`) :

1. Avis d'échéance du loyer
2. Relance amiable d'un loyer impayé — l'ouvrir ouvre **aussi** la relance de loyer envoyée à la main (Q24)
3. Rappel d'un rendez-vous d'intervention
4. Relance d'une invitation de locataire
5. Relance d'une demande de report de rendez-vous

Pour chacun :
- Avant d'ouvrir, lire le nombre d'espaces qui ont déjà donné leur accord : leurs e-mails partent à la passe suivante (Q24). Les espaces actuels sont des comptes de test (Q64) : des e-mails réels peuvent partir vers leurs adresses. À vous de décider.
- « Ouvrir cet envoi », cocher la confirmation.
- Vérifier la ligne « envoi_automatique » au journal de la supervision (cinq lignes au total, notes D4, § 5).
- Pour refermer : « Fermer cet envoi ». **Un e-mail parti ne se rappelle pas.**

Préalable rempli par l'ordre du § 3 : le déclencheur D4R-03 (une relance à la main n'est jamais reprise d'elle-même) vient de `20261125150000`. Il est en place avant l'ouverture, puisque toutes les migrations passent avant le code.
Recommandé (notes D4, § 5, point 7) : un essai réel avec un compte de test et une vraie boîte de réception, puisqu'il n'y a pas de préproduction.

**R6 — Médiateur absent : les ventes aux particuliers restent fermées.**
- Rien à faire : sans médiateur saisi, la première souscription d'un particulier reste fermée par défaut.
- **Seul vous** pouvez lever ce blocage : `/admin/parametres` → carte « Blocage des abonnements » → rubrique « Vente aux particuliers sans médiateur de la consommation » → lire les deux articles → cocher « J'ai lu les deux articles… » → « Ouvrir la vente aux particuliers sans médiateur ». La décision est datée par la base et inscrite à l'historique. « Retirer cette décision » la défait.
- « Lever le blocage » n'ouvre plus rien aux particuliers : laisser « Règle active » (notes T4, § 9.3).
- **Point de droit non tranché, jamais présenté comme conforme :** le recueil cite L612-1 et L616-1 du code de la consommation, sans exception lue (Q65, Q75 ; `JURISTE.md`, partie 7, point 6, et partie 9, point 26). Votre décision du 24/11 dit, mot pour mot : « on peux ouvrir les ventes même sans ce dernier » (`DECISIONS-2026-11-24.md`). L'agent ne fait pas ce geste à votre place.

**R7 — En-tête des factures d'abonnement, dans votre compte Stripe.** Par vous, dans Stripe.
- Gerimmo n'écrit que le pied de facture (« TVA non applicable, article 293 B du CGI »). Le nom, l'adresse et le SIREN de l'en-tête viennent des réglages du compte Stripe (Q80).
- À saisir : nom `TAHIR Brahim EI` (nom commercial SAUVEXPERT), adresse `3 rue de l'Église, 91360 Épinay-sur-Orge`, SIREN `821 974 474` (notes D7, § 5.3).
- Hors logiciel : intitulé du compte bancaire professionnel avec la mention « … EI » (article R. 526-27 du recueil, non relu sur Légifrance).
- Non vérifié : aucune facture réelle n'a été vue.

**R8 — Seulement ensuite, si vous le décidez : « Ouvrir les souscriptions ».** `/admin/parametres`, carte « Blocage des abonnements », case à cocher (Q7).
- Le paiement réel par Stripe n'a jamais été exercé (souscription ignorée au banc, faute de paiement configuré).
- Conseil de l'audit du 19/11 (constat COM-2), pas une décision : faire d'abord un premier paiement réel, puis le rembourser, avant d'ouvrir les souscriptions à tous.
- Pour refermer : « Fermer les souscriptions ».

**Facebook : rien à faire.** La diffusion reste masquée tant que la Page n'est pas « Relié » (décision du 25/11, Q101 ; commit `6c4dd35f`). Un article échu reste « en attente ».

---

## 5. Le retour en arrière

### 5.1 Le principe

- **C'est vous qui décidez** d'un retour. L'agent propose. Tout se consigne dans `log.md`.
- Trois niveaux, du plus léger au plus lourd. On commence toujours par le niveau 1.
- Si une seule migration pose problème, une correction « en avant » (une nouvelle migration) est souvent plus sûre qu'un retour : un retour réintroduit les défauts corrigés (`app/supabase/retours-arriere/LISEZ-MOI.md`, « Quand l'utiliser »).

### 5.2 Avant tout retour (si la console répond)

1. Fermer les cinq envois automatiques (« Fermer cet envoi »).
2. Fermer les souscriptions (« Fermer les souscriptions »), et retirer la décision « vente aux particuliers sans médiateur » si elle a été prise.
3. Avant de remettre l'ancien code : activer ou annuler les circuits de signature de bail **en cours**. Sous l'ancien code, un bail envoyé avec la notice déposée ne s'activerait plus (LISEZ-MOI, ligne de `20261124180000`).

Ces gestes se font dans la console du nouveau code : l'ancien code ne les a pas.

### 5.3 Niveau 1 — Remettre `81740dec` sur Vercel

La base reste migrée. L'ancien code tourne alors sur la nouvelle base (compatibilité SUPPOSÉE, voir P6 b).

- **Automatique :** le contrôleur de É10 le fait seul après trois contrôles de santé en échec.
- **À la main, par la file unique (recommandé).** La documentation demande de ne pas publier à côté du contrôleur (`app/docs/publication-controlee.md`). Actions → « Publication contrôlée Gerimmo », branche `main` :
  - `revision` = `81740decfc1f4818d8da4b15b232800144f30815`
  - `deploiement` = `dpl_AV9825DKz3JzKQhDXd699x8yhfvu`
  - `tests` = `44910220705` (CI de `main` réussie sur `81740dec`, `log.md` du 21/11)
  - `publier` coché, `base_compatible` coché.
  - SUPPOSÉ accepté par le contrôleur : il exige une CI « push » sur `main` pour ce commit, et un commit toujours dans l'historique de `main`. Jamais essayé pour un retour.
  - **Limite (VÉRIFIÉ en lisant `controle.mjs`) :** le contrôleur garde la version en ligne comme « version de retour » et exige qu'elle réponde bien à `/api/sante`. Si le nouveau code ne répond plus, ce chemin est refusé (« La version de retour n'est pas saine : publication suspendue »). Passer alors par Vercel (point suivant).
- **À la main, en secours :** Vercel → Deployments → `dpl_AV9825DKz3JzKQhDXd699x8yhfvu` → retour à cette version. Jamais essayé en production (`GUIDE-DE-REPRISE.md`, § 9, point 6). Ne pas le faire pendant qu'un contrôle tourne.
- Vérifier : `/api/sante` montre `"revision": "81740decfc1f4818d8da4b15b232800144f30815"`.
- `main` garde le nouveau code. Son annulation (`git revert` du commit de fusion) se décide ensuite. Le site ne change pas tout seul à chaque envoi sur `main` (SUPPOSÉ, P4).
- **Ce niveau ne restaure jamais la base.**

**Tant que `81740dec` tourne sur la base migrée (après ce niveau, et jusqu'à une nouvelle publication ou au niveau 2) :**

- **Consigne A-01 : aucune révision de loyer enregistrée, aucune lettre « Révision du loyer » produite.** La lettre de `81740dec` se fabrique à partir de la révision enregistrée, à tout moment : elle annonce le loyer révisé « à compter du » la date d'effet, alors que la base n'appelle ce loyer qu'à partir de `premier_terme` (VÉRIFIÉ au banc, voir É8). C'est vrai aussi pour une révision enregistrée par le nouveau code avant le retour. Juste après le retour, jouer la requête « Consigne A-01 » de É9 et noter les révisions listées : leur lettre ne se produit qu'après une nouvelle publication du nouveau code. Les lettres déjà rangées, produites par le nouveau code, gardent le premier terme (lu dans le code, non rendu). Sinon, accepter ce risque par écrit.
- **Ce que la lecture du code de `81740dec` dit des objets créés par le nouveau code (A-05 ; lu, jamais vu à l'écran, donc SUPPOSÉ) :**
  - **Facture d'artisan refusée** : l'écran de l'incident liste toutes les factures de la mission (`incidents/factures-incident.tsx`). Une facture refusée y apparaît « à vérifier », avec le bouton de validation. La base refuse de la valider (garde de `20261122170000` ; test `facture-artisan-refus-base`, « refus et validation s'excluent », réussi au banc). Ne pas traiter ces factures depuis l'ancien code.
  - **Rendez-vous manqué, facture refusée ou relancée** : le fil de l'incident affiche le nom technique de l'événement (`rdv_manque`, `facture_refusee`, `facture_relancee`) : `81740dec` ne connaît pas ces types et affiche le type brut (`pane-incident.tsx`, ligne 404). Pas de panne, du jargon à l'écran.
  - **Avenant** : `81740dec` ne lit pas la table `avenants_bail`. Un avenant en attente s'applique quand même au premier loyer appelé du mois d'effet : c'est un déclencheur de la base (lu dans `20261122190000`).
  - **Absence d'artisan** : `81740dec` ne lit pas les absences. La base refuse de solliciter un artisan absent (lu dans `20261122235500`) ; l'ancien écran affiche ce refus.
  - Non essayés : l'IA réelle, les e-mails réels, les tâches planifiées, le vrai PostgREST/Supabase.

### 5.4 Niveau 2 — Jouer les retours de la base

**Seulement après le niveau 1.** La plupart des retours le disent : « à jouer après le retour du code ». Il faut aussi l'accès de P3.

**Procédure** (LISEZ-MOI des retours, « Procédure » ; `GUIDE-DE-REPRISE.md`, § 6) :

1. **Sauvegarde** à la demande (« Sauvegarde quotidienne »), attendre son succès.
2. **Simulation :** jouer toute la chaîne ci-dessous dans une transaction annulée à la fin (un fichier qui contient `begin;`, puis un `\i` par retour dans l'ordre, puis `rollback;`), avec `psql "$URL" -v ON_ERROR_STOP=1 -f <ce fichier>`. Je n'ai trouvé, dans aucun des 52 retours, de refus d'une transaction ouverte (recherche par mots-clés dans les fichiers ; simulation non essayée).
3. **Exécution**, depuis `app/supabase/retours-arriere/`, fichier par fichier, dans l'ordre exact ci-dessous :
   `psql "$URL" -v ON_ERROR_STOP=1 -f <fichier>.retour.sql`
   `$URL` : le « pooler » de Supabase en mode session, port 5432, comme `migrations.yml`. Le mot de passe passe par la variable `PGPASSWORD`, jamais dans la ligne de commande ni dans un journal.
   **Toujours `-v ON_ERROR_STOP=1`.** Sans lui, `psql` continue après une erreur et sort avec le code 0 (relecture X-02).
4. **À la première erreur : s'arrêter.** Ne sauter aucun fichier. Beaucoup de retours s'arrêtent d'eux-mêmes, sans rien changer, quand l'ordre n'est pas le bon : lire leur message.
5. **Vérifier** l'état, puis **consigner** (décision, heure, opérateur, résultat). Après la chaîne complète, le registre ne doit plus porter aucune version du lot :
   `select version from supabase_migrations.schema_migrations where version > '20261120200000' order by version;` → aucune ligne (même requête que C4).
   Une ligne restante désigne un retour qui ne s'est pas joué jusqu'au bout : la lire avant toute suppression à la main.

**L'ordre exact des 52 retours** : l'inverse exact du manifeste. On s'arrête à `20261122090000`. `20261120200000` et les plus anciennes restent : elles sont en production depuis le 21/11.

```text
20261125154000_bail_epoux_pacses_marque_a_la_nouvelle_signature.retour.sql
20261125153000_bail_epoux_pacses_personnes_a_la_signature.retour.sql
20261125152000_bail_locataires_epoux_pacses.retour.sql
20261125151000_textes_t3_reprise_exercice_ancien.retour.sql
20261125150000_accord_conditions_version_archivee.retour.sql
20261125140000_ancien_parcours_signature_manuelle_droits_retires.retour.sql
20261125111000_textes_officiels_t3.retour.sql
20261125110000_relance_report_rdv_et_relance_a_la_main.retour.sql
20261125106000_type_vendeur_et_vente_sans_mediateur.retour.sql
20261125105000_archive_compte_apres_client_stripe.retour.sql
20261125104000_courrier_impaye_conditions_du_24_novembre.retour.sql
20261125103000_factures_conservation_dix_ans.retour.sql
20261125101500_conge_textes_officiels_t1.retour.sql
20261124230000_reperes_fiscaux_ancien_reglage_journal_source.retour.sql
20261124220000_justificatif_retenue_dossier_du_bail.retour.sql
20261124210000_reperes_fiscaux_ancien_reglage_sans_source.retour.sql
20261124200000_justificatif_retenue_piece_existante.retour.sql
20261124190000_reperes_fiscaux_source.retour.sql
20261124180000_notice_information_deposee.retour.sql
20261124170000_revision_loyer_troisieme_reprise_d2.retour.sql
20261124150000_revision_loyer_seconde_reprise_d2.retour.sql
20261124140000_export_droits_par_colonne.retour.sql
20261124130000_revision_loyer_reprise_d2.retour.sql
20261124120000_motif_retrait_reserve_a_l_auteur.retour.sql
20261124110000_publications_origine.retour.sql
20261124100000_revision_loyer_delai_et_premier_terme.retour.sql
20261123170000_contrat_individuel_message_plafond.retour.sql
20261123150000_regularisation_premiere_mensualite.retour.sql
20261123090000_reperes_fiscaux_reglage.retour.sql
20261122235959_menage_droits_sans_politique.retour.sql
20261122235950_pointage_loyer_releve.retour.sql
20261122235900_artisan_lignes_devis.retour.sql
20261122235800_artisan_relance_facture_rdv_manque.retour.sql
20261122235500_artisan_absences_semaine_type.retour.sql
20261122235000_devis_garantie_annoncee.retour.sql
20261122234000_edl_photos_par_element.retour.sql
20261122233000_disponibilites_locataire_incident.retour.sql
20261122230000_charges_proposees_a_confirmer.retour.sql
20261122220000_incident_bien_categorie_urgence.retour.sql
20261122210000_decision_artisan_notifiee.retour.sql
20261122200000_envois_automatiques_reglage.retour.sql
20261122190000_avenants_bail.retour.sql
20261122180000_echanges_intervention_non_lus.retour.sql
20261122170000_facture_artisan_refus.retour.sql
20261122160000_signatures_electroniques_locataire.retour.sql
20261122150000_evaluation_contestee.retour.sql
20261122140000_incident_urgence_corrigee.retour.sql
20261122130000_lien_garant_admis.retour.sql
20261122120000_interrupteur_ia.retour.sql
20261122110000_decompte_sortie_echeancier_charges.retour.sql
20261122100000_relais_point_inscriptions.retour.sql
20261122090000_bail_repris_dpe_g_et_edl_entree.retour.sql
```

**Pourquoi cet ordre (VÉRIFIÉ en lisant le LISEZ-MOI de `89cb87ff` ; dans `ee28d874`, le LISEZ-MOI ne change que l'étape 4 de la « Procédure » et la ligne des 11 retours de RET-01, lu par `git diff`) :**

- C'est l'inverse exact de `ordre-migrations.txt`.
- Il reprend, pour les 23 retours qui y figurent, la chaîne « Ordre complet » du LISEZ-MOI (section « fuseau-suite ») : elle commence par `20261125151000`, puis `20261125111000`, `20261125110000`… et passe par `20261122090000` avant de continuer avec des retours plus anciens, déjà en production, qui ne se jouent pas ici.
- Il respecte la chaîne des e-mails (fin du LISEZ-MOI) : `20261125110000`, puis `20261122210000`, puis `20261122200000`, puis `20261122130000`.
- Il respecte les règles « avant / après » écrites entre les fichiers du lot. Exemples : `20261125154000` avant `20261125153000` avant `20261125152000` ; `20261125151000` avant `20261125111000` ; `20261125110000` avant `20261122200000`. J'ai relevé ces règles avec un petit script de lecture : 19 mentions. Une seule semblait contredire l'ordre. C'est une phrase qui décrit un cas, pas une règle (ligne de `20261124230000` : « joué après le retour de `20261124210000`, il ne touche pas la fonction »).
- `20261125150000` se joue avant les retours de `20261024100000` et `20261024090000` : ceux-là ne sont pas dans la chaîne (déjà en production depuis octobre), donc la règle est tenue.

**À savoir avant de jouer ces retours (lu dans le LISEZ-MOI et dans les fichiers) :**

- **Certains retours effacent des données :** `20261125106000` (le type de vendeur et la date de la décision « sans médiateur ») ; `20261125110000` (l'état du cinquième interrupteur ; les relances de ces deux types encore en file passent « à vérifier » et leur contenu chiffré est effacé) ; `20261124190000` (la source des repères fiscaux) ; `20261123090000` (la table des repères : valeurs et date ; le journal de la supervision les garde) ; `20261122180000` (les marqueurs de lecture des messages) ; `20261122200000` (la table des interrupteurs ; les e-mails encore en file passent « à vérifier »).
- **D'autres gardent leurs colonnes et leurs données :** `20261125152000`, `20261125153000`, `20261124100000`, `20261124130000`, `20261124110000`, entre autres.
- `20261125152000` : les départs enregistrés sous la case « mariés ou pacsés » gardent une fin de solidarité vide. Ils sont à revoir un par un.
- `20261122110000` : vérifier d'abord qu'aucune restitution du dépôt n'est en préparation sur un bail dont l'échéancier de charges est entamé.
- `20261124180000` : la valeur `notice_information` reste dans le type `document_type`. PostgreSQL ne sait pas la retirer.
- **Chacun des 52 retours retire sa propre version du registre des migrations** (corrigé le 25/11, constat RET-01, commit `140f4216`). Avant, 11 retours la laissaient (`20261125101500`, `103000`, `104000`, `105000`, `106000`, `111000`, `140000`, `151000`, `152000`, `153000`, `154000`) : l'essai « retours » a montré que le chantier refusait alors de réappliquer le lot (« la version 20261125101500 est déjà enregistrée en base »). Désormais, un retour à plusieurs instructions retire sa version en dernier (arrêté par une erreur, il la laisse) ; un retour d'un seul bloc la retire dans ce bloc. VÉRIFIÉ au banc : chaîne des 52 retours (`psql -v ON_ERROR_STOP=1 -f`, ordre ci-dessus), aucune version restante, puis réapplication par le bloc « Appliquer » de `migrations.yml` (simulation puis application, code 0) et schéma identique au schéma migré d'origine (6 212 entrées, 0 écart). Test : `tests/retours-lot-publication-registre.test.ts`. Le LISEZ-MOI (« Procédure », étape 4) le dit.
- **7 retours contiennent plusieurs instructions** (VÉRIFIÉ par un comptage des instructions) : `20261122100000`, `20261124140000`, `20261125101500`, `20261125103000`, `20261125105000`, `20261125106000`, `20261125110000`. Joués avec `psql -f`, chaque instruction est validée seule. Une erreur au milieu laisserait donc appliquées les instructions d'avant. Proposition : les jouer avec l'option `--single-transaction` de `psql` (essayée depuis au banc sur les 52 retours : elle passe, même schéma ; P6 d). À savoir (essai « retours », point 7) : joué avec `psql -f` seul, `20261122100000` affiche « WARNING: SET LOCAL can only be used in transaction blocks » : son délai de verrou ne s'applique pas. Aucun d'eux ne contient `begin`, `commit` ou une instruction interdite dans une transaction (recherche faite).
- **Aucun retour n'a jamais été joué en production** (`AUDIT.md`). Au banc, la chaîne entière des 52 retours a été jouée d'un bout à l'autre le 25/11 (essai « retours », puis rejeu après la correction RET-01).
- **Un retour ne défait pas les données déjà écrites** (journaux, notifications parties, états changés entre-temps).

### 5.5 Niveau 3 — Restaurer la sauvegarde (dernier recours)

- Procédure en sept étapes : `app/docs/sauvegarde-et-restauration.md`, « Procédure en cas d'incident ». En bref : suspendre les écritures et les envois ; obtenir la clé (P1) et télécharger les archives ; préparer **un projet Supabase de secours distinct**, envois, paiements et signatures coupés ; restaurer les schémas avec leurs droits (jamais `--no-privileges`) et les fichiers ; vérifier comptes, bail, quittance et isolation ; faire valider la bascule ; **réactiver `pg_cron` et `pg_net` et recréer les tâches planifiées** (`rejouer-pg-cron.sql`).
- On perd tout ce qui a été écrit depuis la sauvegarde de É7.
- Jamais éprouvé de bout en bout : bascule vers un projet de secours, remise en route des tâches, retour en moins de quatre heures (même note).
- Sans la nouvelle clé (P1) et sa copie hors de GitHub, ce niveau est impossible hors de GitHub.

### 5.6 Ce qui n'est PAS réversible

1. **Les e-mails partis** : avis d'échéance, relances (automatiques et à la main), rappels, relances d'invitation et de report, e-mails de connexion et d'inscription, motifs à l'artisan, lien au garant. Fermer un envoi arrête les suivants. Il ne rappelle pas ceux qui sont partis.
2. **L'archive des conditions du 24/11/2026** : immuable en base. Aucun retour du lot ne la retire.
3. **Les acceptations des conditions** par les comptes : table en ajout seul. Seule la suppression du compte les retire.
4. **Le journal de la supervision** : chaque geste de la console (identité, archivage, envois, ventes, décision « sans médiateur ») reste écrit.
5. **Les paiements réels**, si les souscriptions sont ouvertes (R8) : un abonnement payé est un contrat conclu, et ses factures sont gardées dix ans (lot T4).
6. **Les données parties chez un prestataire** : textes envoyés à OpenAI (IA activée, Q12), circuits envoyés à Zoho Sign.
7. **Les écritures faites par les migrations elles-mêmes** : la ligne du journal des durées de `20261125103000` ; les relances à la main déjà en file, marquées « sans reprise » par `20261125150000` ; la valeur `notice_information` de `20261124180000`.
8. **Les données effacées par certains retours** (liste du § 5.4).
9. **Le remplacement de la clé des sauvegardes** : les copies d'avant deviennent illisibles (SUPPOSÉ, P1).
10. **Une restauration (niveau 3)** : tout ce qui a été écrit après la sauvegarde est perdu.

---

## 6. Qui fait quoi, et combien de temps

Les durées sont des estimations. Seules quelques-unes s'appuient sur les publications passées (`log.md`, 19/11 et 21/11) : CI de `main` en 32 à 33 minutes ; sauvegarde réussie en moins de 10 minutes ; publication contrôlée en 1 à 3 minutes après l'application ; recette en 9 à 12 minutes. La version préparée porte plus de tests qu'alors : la CI peut être plus longue (SUPPOSÉ).

| Étape | Vous (dirigeant) | Agent | Durée estimée |
|---|---|---|---|
| P1 — Nouvelle clé | Créez la clé, rangez une copie, posez le secret | Vous guide ; ne voit jamais la clé | 15 min |
| P2 — Sauvegarde et contrôle de restauration | Donnez votre accord pour le contrôle | Lance les deux chantiers, lit les résultats | 20 à 40 min |
| P3 — Accès pour les retours | Décidez qui, et comment | — | — |
| P4 — Réglages Vercel et GitHub | Lisez les réglages | Dit quoi regarder | 10 min |
| P6 — Essais au banc | — | Les fait, rend compte | 2 à 4 h (SUPPOSÉ) |
| P8 — Le message | Écrivez « je valide la publication » | — | — |
| C1 à C6 — Contrôles en lecture | Acceptez l'outil de lecture | Lance les requêtes, compare | 15 min |
| É1 à É4 — PR, CI, fusion, CI de `main`, construction | Rien (ou vous fusionnez) | Ouvre, suit, fusionne, note les références, lit `/api/sante` | 1 h 10 à 1 h 40 |
| É5 — Vérifier seulement | Approuvez | Lance, lit | 5 min |
| É6 à É8 — Simulation, sauvegarde, application | Approuvez deux fois | Lance les trois chantiers, lit | 30 à 45 min |
| É9 — Contrôles après migration | Acceptez l'outil de lecture | Lit | 10 min |
| É10 — Publication | Approuvez | Lance, lit le compte rendu | 5 à 10 min |
| É11 à É13 — Santé, recette, journal | — | Contrôle, lance la recette, écrit le journal | 30 min |
| R1 à R8 — Réglages du jour | Faites chaque geste (console, Stripe) | Vous guide, relit les pages après chaque geste | 45 à 75 min |
| R4 bis — Parcours de vérification | Le faites vous-même | Lit vos copies d'écran si une étape diffère | 17 min (partie A), 17 min de plus (partie B), estimés |
| **Total du jour J** | | | **environ 3 h 45 à 5 h 30** |
| Retour, niveau 1 | Décidez, approuvez | Lance, vérifie | 10 min |
| Retour, niveau 2 | Décidez, donnez l'accès (P3) | Prépare, simule, joue si l'accès lui est donné | 45 à 90 min (SUPPOSÉ, jamais fait) |
| Retour, niveau 3 | Décidez, fournissez la clé | Suit la procédure | plusieurs heures (jamais éprouvé) |

Ce que l'agent ne peut pas faire : voir un secret, se connecter comme super admin, régler Stripe, approuver à votre place dans GitHub.

---

## 7. Points que je n'ai pas pu vérifier

1. **L'état réel de la production**, avec la date du dernier relevé de chaque fait : version servie `81740dec` (`log.md` 21/11, `AUDIT.md` 22/11) ; 10 comptes, de test selon vous (22/11 et Q64), aucune demande de signature manuelle, un seul circuit terminé (`JOURNAL.md`, 24/11) ; abonnés actifs et versions des conditions archivées : **jamais lus pendant cette mission** (`JOURNAL.md`, 25/11 ; dernier relevé connu des abonnements : audit du 19/11, aucun). Non relu : aucune requête vers la production pour ce plan.
2. **La valeur de `GERIMMO_MODE` chez Vercel** : masquée (Q16). Déduite du contrôle de construction de `garde-environnement.mjs`. `QUESTIONS.md` (Q16) dit pourtant que ce réglage « se fera le jour de la publication » : à lire avant la fusion (P4).
3. **Le réglage Vercel « Auto-assign Custom Production Domains »** : supposé désactivé, jamais lu.
4. **`GERIMMO_RELEASE_ENABLED`, l'approbateur de `gerimmo-production` et la protection de `main`** : non relus depuis le 21/11. La protection de `main` pourrait exiger une revue avant la fusion.
5. **La présence chez Vercel de l'ancienne version** `dpl_AV9825DKz3JzKQhDXd699x8yhfvu` : non relue.
6. **`main` toujours à `e1e442dc` sur GitHub** : lu seulement sur la copie locale.
7. **La CI GitHub sur cette version** : verte sur `062296e2` sans aucune reprise (exécution n° 45591695035 : 16 620 tests, 355 parcours au premier essai, 75 parcours WebKit mobile, envois, vrai PostgREST et invitation artisan). Elle ne remplace ni la CI de la PR ni celle de `main` (É2, É4).
8. **Le lot des 52 migrations joué d'un seul bloc** : joué au banc le 25/11 (essai « bloc », P6 a), réussi ; jamais sur le pooler ni sur la vraie instance Supabase.
9. **L'ancien code `81740dec` sur la base migrée** : essayé au banc le 25/11 (282 parcours réussis). Un risque trouvé, la lettre de révision de loyer (A-01), tenu par une consigne (É8, § 5.3). Restent SUPPOSÉS (A-05) : objets créés par le nouveau code puis lus par l'ancien (lus dans le code au § 5.3, jamais vus à l'écran), IA réelle, e-mails réels, tâches planifiées, vrai PostgREST/Supabase, affichage des refus de la base. La case `base_compatible` repose sur cet essai et sur ces points acceptés.
10. **La chaîne des 52 retours, d'un bout à l'autre** : jouée au banc le 25/11 (essai « retours », rejeu RET-01). Aucun retour n'a jamais été joué en production.
11. **Les 7 retours à plusieurs instructions** : leur effet en cas d'erreur au milieu n'a pas été essayé. L'option `--single-transaction` a été essayée au banc depuis (P6 d) : elle passe.
12. **Les 11 retours qui laissaient leur version au registre** : effet constaté au banc (réapplication refusée), corrigé dans le code (commit `140f4216`), puis rejoué au banc : réapplication acceptée, schéma identique. Non essayé sur le pooler de Supabase.
13. **Qui détient le mot de passe de la base** pour jouer les retours : non établi (P3).
14. **La perte des anciennes copies de sauvegarde** quand la clé est remplacée : déduite, non constatée. La conservation de 90 jours chez Scaleway n'est pas vérifiée.
15. **La restauration complète vers un projet de secours** : jamais éprouvée.
16. **Le texte d'`accepter_cgu` en production** (md5) : jamais lu.
17. **Les requêtes C3, C4, C6 et la première d'É9** : écrites pour ce plan d'après le schéma, jamais jouées, même au banc.
18. **La longueur du champ `fichiers`** (2 587 caractères, 52 noms) : jamais essayée dans GitHub. Le plus long lot trouvé dans `log.md` comptait sept fichiers (14/10). La limite de longueur de GitHub pour ce champ n'a pas été vérifiée.
19. **La recette de production sur la nouvelle version** : jamais jouée.
20. **Le paiement Stripe réel et l'en-tête des factures** : jamais vus.
21. **La lecture réelle de la Page Facebook** (`santeFacebook`) : jamais exercée.
22. **Le retour à la main chez Vercel** et le retour par la publication contrôlée vers `81740dec` : jamais faits.
23. **Les points de droit** : médiateur et vente aux particuliers (Q65, Q75, `JURISTE.md` partie 7 point 6, partie 9 point 26) ; référence de la mention de TVA (`JURISTE.md` partie 6 point 13) ; textes du recueil non recontrôlés sur Légifrance. Aucun de ces points n'est présenté comme conforme : aucun n'est tranché.
24. **Les repères fiscaux** : lus le 24/11 ; à relire le jour même.
25. **La forme d'écriture de l'immatriculation au RNE** dans la console : non fixée par les notes.
26. **Les coordonnées des prestataires** (Vercel, Supabase) pour les mentions légales : non fournies.
27. **Les durées** du § 6 : estimations, sauf celles tirées de `log.md`.
28. **La seconde passe complète** : faite sur `89cb87ff` (P5), un défaut majeur trouvé et corrigé (L-01, `f78e3a3f`). Elle porte sur `89cb87ff` ; sur `f78e3a3f`, c'est la vérification complète qui a été refaite (§ 1). Non vérifié dans cette passe : un PDF réel de congé pour vendre ou pour reprendre (le banc n'en produit plus, règle nouvelle), les nouveaux envois avec interrupteur ouvert (`passe2/p2-relecture-documents-envois.md`).
29. **`acceptations_sans_version_archivee()` lue depuis l'éditeur SQL** (É9) : refus probable, déduit du code, non essayé.
30. **Les encadrés « Document en cours de finalisation »** des pages Mentions légales et Confidentialité : ils dépendent de ce qui est déjà saisi dans la console de production (coordonnées de Vercel et Supabase, localisation de la Base Adresse Nationale), non lu.
31. **Les contrôles de fichiers du chantier** (`conditionner-migration.mjs lot`, puis `verifier` sur chacun) : rejoués le 25/11 par le critique sur une copie des fichiers de `89cb87ff`, 52 sur 52 acceptés (les 52 migrations sont identiques dans `ee28d874`). Aucune base touchée. Cela ne prouve pas que le lot passe en base.

---

## Sources lues pour ce plan

- `livrables/notes-banc/PLAN-PUBLICATION-NOTES.md` (première version) et `livrables/notes-banc/fusion/PLAN-PUBLICATION-NOTES.md` (version qui la remplace).
- `livrables/notes-banc/fusion/` : `fusion-notes.md`, `corrections-fusion-notes.md` (dont § 9, reprise `89cb87ff`), `relecture-argent.md`, `relecture-contrats.md`, `relecture-ecrans.md`, `relecture-envois.md`, `relecture-corr-argent.md`, `relecture-corr-inscription.md`.
- `livrables/notes-banc/` : `notes-D4.md` (§ 5, R5, R6), `notes-D5.md`, `notes-D7.md` (§ 5, § 6), `notes-T4.md` (§ 5, § 9.3).
- `livrables/notes-banc/essais/` (`bloc.md`, `ancien.md`, `retours.md`, `corrections.md`) et `livrables/notes-banc/passe2/` (seconde passe). Écarts de `89cb87ff` à `062296e2` lus par `git log` et `git diff` (lecture seule).
- `GUIDE-DE-REPRISE.md`, `JOURNAL.md`, `QUESTIONS.md` (Q6, Q9, Q12, Q16, Q24, Q37, Q38, Q40, Q64, Q65, Q75, Q76, Q80, Q81, Q116 à Q123), `JURISTE.md` (parties 6, 7 et 9), `DECISIONS-2026-11-24.md`, `AUDIT.md`, `TEXTES-OFFICIELS-LUS-2026-11-24.md` (§ 5), `log.md` (publications du 19/11 et du 21/11).
- Code au commit `89cb87ff`, en lecture seule (`git show`) : `.github/workflows/` (`ci.yml`, `migrations.yml`, `publication-controlee.yml`, `sauvegarde.yml`, `restauration-sauvegarde.yml`, `recette-production-autonome.yml`) ; `app/scripts/deploiement/` (`publier.mjs`, `controle.mjs`, `conditionner-migration.mjs`, `garde-environnement.mjs`, `migrations-commerciales.json`) ; `app/src/app/api/sante/route.ts` ; `app/e2e/local/ordre-migrations.txt` et `preparer-ci.mjs` ; `app/supabase/retours-arriere/LISEZ-MOI.md` et les 52 fichiers `.retour.sql` ; les migrations citées ; `app/docs/publication-controlee.md` et `sauvegarde-et-restauration.md` ; les écrans de la console cités (`app/src/app/admin/…`) ; `app/src/lib/envois-suspendus.ts`, `identite-editeur.ts`, `editeur.ts`, `conditions-versions-serveur.ts`, `verrou-pilote.ts`.

## Relecture critique du 25/11/2026

Chaque fait du plan a été comparé aux notes, au journal et au code de `89cb87ff` (lecture seule, aucune requête vers la production). Ce qui a été corrigé ou ajouté :

- **Recompté et rejoué (VÉRIFIÉ)** : la liste du champ `fichiers` est identique au manifeste (lignes 525 à 576) et compte 2 587 caractères, pas 2 589 ; l'ordre des 52 retours est l'inverse exact du manifeste ; les 11 retours qui gardent leur version et les 7 retours à plusieurs instructions sont confirmés ; les contrôles de fichiers du chantier acceptent les 52 migrations (copie locale).
- **Corrigé** : le plus long lot passé comptait sept fichiers (14/10), pas quatre ; l'état de la production est daté fait par fait (abonnés et versions archivées jamais lus) ; la mention de TVA suit le recueil (report au 01/01/2027) ; les heures à éviter vont jusqu'à 09:00 UTC.
- **Ajouté** : le geste irréversible du remplacement de la clé et la fenêtre sans sauvegarde lisible (P1) ; P3 et P6 b deviennent des décisions à prendre avant le jour J ; la règle d'approbation lue dans `controle.mjs` et la protection de `main` (P4) ; l'écart avec `QUESTIONS.md` (Q16) ; l'arrêt de `20261125150000` si `accepter_cgu` est inattendue (C5) ; la CI « push » exigée par le contrôleur (É4) ; l'échec sur un verrou (É8) ; le refus probable d'une requête depuis l'éditeur SQL (É9) ; l'encadré de la page Confidentialité (R1) ; l'étape R4 bis (parcours de vérification) ; le conseil COM-2 (R8) ; l'effet du retour de `20261125110000` sur les e-mails en file (§ 5.4).
- **Fait le 25/11** : `QUESTIONS.md` inscrit Q64 comme tranchée (« Q64 c'est des tests », réponse du 24/11).

## Corrections du 25/11 après les essais de publication (A-01, A-05, RET-01)

Trois défauts relevés par les essais au banc (« ancien » et « retours ») ont été vérifiés, puis corrigés. Rien n'a été fait en production.

- **A-01 (bloquant) — lettre de révision de loyer sous l'ancien code.** Défaut VÉRIFIÉ au banc (sonde en transaction annulée : lettre « à compter du 01/11/2026 », novembre appelé à 600,00 €, premier terme révisé le 01/12/2026). Il ne se corrige pas dans la base : l'ancien et le nouveau code appellent la même fonction avec les mêmes arguments, et la lettre de `81740dec` lit la révision enregistrée. **Corrigé dans ce plan** : consigne en É8 et au § 5.3, requête de contrôle en É9 (jouée au banc : elle liste la révision de la sonde). À défaut, accepter ce risque par écrit.
- **A-05 (important) — points non couverts par l'essai « ancien ».** Constat exact : ces cas ne sont pas dans la suite de parcours de `81740dec`. **Corrigé dans ce plan** : P6 b, É10, § 5.3 et § 7 (point 9) les nomment comme SUPPOSÉS, avec ce que la lecture du code de `81740dec` en dit. L'essai ciblé à l'écran n'a pas été fait : c'est à vous de l'accepter par écrit ou de le demander avant le jour J.
- **RET-01 (important) — 11 retours gardaient leur version au registre.** **Corrigé dans le code**, commit local `140f4216` (branche locale `claude/palier-1-fusion`, non envoyé à ce moment ; envoyé depuis avec `ee28d874` sur `claude/palier-1-preproduction`) : les 11 retours retirent leur version, le LISEZ-MOI (« Procédure », étape 4) le dit, et un test le garde. Rejoué au banc (§ 5.4, P6 c). Aucune des 52 migrations ne change (`git diff 89cb87ff 140f4216 -- app/supabase/migrations app/e2e/local/ordre-migrations.txt .github` : vide). La liste du champ `fichiers` (É6) et l'ordre des retours (§ 5.4) sont donc inchangés.

**À faire avant le jour J :** la version préparée devient le commit qui portera ces corrections (`140f4216` ou son successeur). Selon P5, refaire la vérification complète sur ce commit, puis remplacer `89cb87ff` par lui dans ce plan (§ 1, É1, É3, P5).
**Fait le 25/11 :** la version préparée est `ee28d874` (RET-01, puis L-01 de la seconde passe, puis trois tests) ; vérification complète au banc sur `f78e3a3f`, et les trois tests de `ee28d874` au banc (§ 1) ; ce plan est mis à jour (§ 1, P5, P6 a, É1 à É3, § 5.4, § 7). Puis la version préparée est devenue `062296e2` (deux défauts d'écran trouvés par la CI : rubrique du bail sur WebKit mobile, avertissement d'annulation de l'artisan ; vérifications complètes au banc sur `becd15c0` puis `062296e2`) ; ce plan est remis à jour (§ 1, P5, É1 à É3, § 7). CI GitHub : verte sur `062296e2` sans aucune reprise (exécution n° 45591695035 : 16 620 tests, 355 parcours au premier essai, 75 parcours WebKit mobile, envois, vrai PostgREST et invitation artisan).
