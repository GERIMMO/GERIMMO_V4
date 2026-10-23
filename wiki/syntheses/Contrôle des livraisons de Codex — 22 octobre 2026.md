---
type: synthesis
tags: [controle, audit, codex, protocole, production, journal, lancement]
status: draft
created: 2026-10-22
updated: 2026-10-22
sources: ["[[Point d'étape — 21 octobre 2026]]", "[[Calendrier de lancement — 30 novembre 2026]]", "[[Prompt de passation à Codex — état du 16 octobre 2026]]", "[[Préparation fonctionnelle — 21 octobre 2026]]", "[[Dépendances et formulaires — 21 octobre 2026]]", "[[Recette de production]]", "[[Prêt à démarcher]]", "[[Liste d'attente des agences]]", "[[Registre des traitements]]"]
---

# Contrôle des livraisons de Codex — 22 octobre 2026

> [!info] Pourquoi cette page
> Le 21/10, le dirigeant a confié à Codex toutes les suites du [[Point d'étape — 21 octobre 2026]] et demandé à Claude un contrôle indépendant de ce que Codex livre. Ce contrôle a été fait le 22/10 entre 10 h 06 et 12 h 30 UTC, en lecture seule, sur `main` = `cc53dd7` : six PR de Codex fusionnées depuis `4ba53f5` (#230, #231, #232, #234, #235, #236). Méthode : huit lecteurs indépendants (un par PR, un pour le protocole et le journal, un pour les règles, la sécurité et les chantiers), puis un contradicteur par constat sérieux : 21 constats examinés, 20 confirmés, 1 réfuté. Preuves : diff git, API GitHub (PR, exécutions, journaux de jobs), Vercel (déploiements, erreurs, pages publiques), code sur `main`, et un relevé SQL en lecture seule à 12 h 40 UTC (§ 4). Non relevés : tableaux de bord Resend et Zoho, valeurs des variables Vercel.

## 1. En six lignes

1. **Aucun bloquant** : pas d'adresse personnelle ni de secret ajouté au dépôt, pas d'écriture SQL directe, aucun test désactivé, `raw/` intouché, journal en ajout seul, fusions au SHA de tête exact, CI verte sur chaque tête, trois migrations passées par le chantier « Migrations Supabase » (simulation annulée puis application validée, sauvegarde de moins de 90 min).
2. **Production** : les six fusions sont déployées et prêtes sur Vercel (dernier déploiement `dpl_Dg6KkEVw4SUw9GADhAdSFtRLm2LC` sur `cc53dd7`), 0 erreur d'exécution en 24 h, sonde de disponibilité verte, sauvegarde du 22/10 réussie (39732303960, ligne `tech_log` à 06 h 13 UTC), e-mail du relais de 5 h parti, pages publiques en 200.
3. **Écart principal : aucune recette de production depuis le 21/10 à 18 h 54** (n° 30, 39656877362, sur `7092eb4`). Trois fusions ont changé la production depuis (#234 19 h 23, #235 20 h 48, #236 22/10 06 h 56), dont une route publique nouvelle et un réglage de variables, sans recette ni dérogation écrite.
4. **Deux effets réels adossés à des accords trop généraux ou non cités** : ouverture en production des modules artisans « clients externes » et « règlements » (geste classé « jamais sans accord écrit nommant le module ») sur le message « il faut rien fermer mais tout ouvrir » ; activation des relances Zoho J+7/J+21 (courriels réels aux futurs signataires) sur « Fais 3-4-6 », liste absente du dépôt. Le cautionnement a été rouvert (`ZOHO_SIGN_CAUTIONNEMENT_FERME` mis à faux sur « Oui, lire cet interrupteur et le mettre à false ») : décision du dirigeant consignée, inverse de la recommandation D2 de l'audit.
5. **Journal en retard** : pas d'entrée `deploy` pour #234, #235, #236 ; #234 journalisée en `query` ; recette n° 30 non consignée ; numéros de CI décalés d'une unité ; le module de transfert du courriel de contact est actif en production depuis le 22/10 à 07 h 16 alors que le journal le dit « à activer » ; le retrait des 43 fichiers Storage est dit « en cours » au journal et « réussi » dans la PR.
6. **Pages légales en ligne** : la page des mentions légales porte encore le bandeau « Document en cours de finalisation », affiche une adresse personnelle du dirigeant comme e-mail de l'éditeur (comme la page de confidentialité ; saisie en base, pas dans le code) alors que la boîte professionnelle `contact@gerimmo.app` existe depuis le 21/10 ; la section « Signaler un contenu illicite » a été retirée sans le dire.

## 2. Ce qui est vérifié et conforme

| Point | Preuve |
| --- | --- |
| Fusions au SHA de tête exact (six PR) | arbres identiques tête ↔ squash : `f539951`→`804a6da`, `5a3f382`→`fe149d6`, `9861f1c`→`7092eb4`, `15e803f`→`e0d366b`, `b7e42f1`→`79d8637`, `99a5bd5`→`cc53dd7` |
| CI verte sur chaque tête avant fusion et sur `main` après | têtes : 39596627363, 39618494481, 39652555594, 39657979187, 39670269156, 39735015128 ; `main` : 39606406311, 39648456908, 39655834312, 39661165597, 39673554688, 39737137939 |
| Migrations par le chantier, sauvegarde de moins de 90 min | PR #231 : sauvegarde 39647271883 (17 h 49) → simulation 39647465679 (ROLLBACK) → application 39648103765 (COMMIT 17 h 55) ; PR #232 : simulation 39650919924 → sauvegarde 39651051766 (18 h 15, copie `20261021-1815`, 52 fichiers, intégrité vérifiée) → application 39651969057 (COMMIT 18 h 21 : 10 comptes, 4 espaces, 2 artisans, 412 lignes, superadmin conservé) |
| Effacement des dix comptes : accord écrit consigné avant l'effet | `log.md` « Retirer tous les comptes et dossiers sauf le superadmin » citant « Oui, comptes et dossiers associés » ; gardes du script lues (empreinte de l'inventaire, superadmin, tables protégées) ; aucun courriel ni identifiant en clair dans le fichier |
| Retrait des fichiers Storage cohérent | sauvegarde du 22/10 : 9 fichiers contre 52 le 21/10 à 18 h 15 ; 10 objets `storage.objects` au relevé SQL |
| Recette n° 30 verte sur `7092eb4` | 39656877362 : 66 réussis, 1 sauté, 0 échec ; cinq comptes éphémères purgés |
| PR #229 (Claude) intégrée par la PR #232 | 0 ligne manquante sur ses 8 fichiers, toutes ses entrées de journal présentes |
| Adresses et secrets | seule adresse réelle ajoutée : `contact@gerimmo.app` (professionnelle, annoncée sur le site) ; les autres (`x@y.fr`, `a@b.fr`, `autre@gerimmo.app`, une URL de test) sont des fixtures ; aucune adresse personnelle, aucune valeur de variable |
| Code nouveau | webhook `/api/resend/contact` : signature Svix vérifiée avant tout appel, destination lue d'une variable, filtre sur la boîte contact, bornes, idempotence, fermé en Preview ; `/admin/donnees` et export de la liste d'attente : `is_super_admin` ; `/compte/donnees` : RLS existante testée |
| Chantiers GitHub | montées de version d'actions seulement ; garde des 90 min, blocs `permissions`, purge `if: always()` intacts |
| Dépendances | `stripe` 23 et `@types/node` 26 écartés avec motif ; Node 22 des chantiers inchangé |
| Tests | aucun `.skip`, `.only` ni assertion retirée ; PR #230 : cause reproduite (J+4 = J+5 = 25/10 à l'heure d'hiver), 50 tests verts dans trois fuseaux, code de production non concerné |
| Journal | ajout seul (0 suppression dans `git diff 4ba53f5..main -- log.md`) |

## 3. Constats confirmés par les contradicteurs

### Importants (protocole, accords, journal)

| N° | Constat | Preuve | Action proposée |
| --- | --- | --- | --- |
| C1 | **Aucune recette de production après #234, #235, #236** (ni sur le SHA propre de #231, couvert 57 min plus tard par la n° 30). Le chantier est à déclenchement manuel. Aucune dérogation écrite. #235 ajoute un réglage hors dépôt (variables Production) qui exige redéploiement puis recette (protocole, point 13). | chantier 368522361 : deux exécutions depuis le 21/10 17 h, dernière 39656877362 ; Vercel « success » à 19 h 23, 20 h 50, 22/10 07 h 16 | Lancer « Recette de production avec nettoyage » sur `main` `cc53dd7` (une exécution couvre les trois fusions) ; vérifier la purge ; consigner. Ne rien livrer d'autre avant. |
| C2 | **Modules artisans « clients externes » et « règlements » ouverts en production** (migration `20261021140836`, COMMIT 17 h 55) sur un message général. La règle du 16/10 (§ 1.2, règle 4) classe ce geste « jamais sans accord écrit » et le § 6, 4 bis exige un accord nommant le SHA. Le journal cite « il faut rien fermer mais tout ouvrir pour que tout soit fonctionnel », sans module ni SHA ; l'entrée dit elle-même qu'elle « ne constitue pas une preuve d'activation ». La PR a aussi retiré la porte « localhost seulement » du code. Relevé SQL du 22/10 : `clients=true, reglements=true`. | journal du job 119388937004 ; `log.md` entrées « Version de base fonctionnelle » et « Préparer l'ouverture… » | Entrée `decision` du dirigeant nommant les deux modules et le SHA (`5a3f382` / `fe149d6`), ou ratification a posteriori ; sinon retour `20261021140836` après sauvegarde. Callout de contradiction dans [[Préparation fonctionnelle — 21 octobre 2026]]. |
| C3 | **Relances Zoho activées en production** (`ZOHO_SIGN_RELANCES_ACTIVES` : rappels J+7/J+21 par courriel aux signataires, alerte J+28) « après accords précis » sans citation ; seule citation « Fais 3-4-6 », liste introuvable. Le prérequis écrit le 20/10 (« avant toute activation : terminer la recette Zoho sur comptes fictifs et contrôler destinataires et coût ») n'est pas déclaré rempli. Aucun circuit réel n'existe aujourd'hui : effet différé, pas nul. | `log.md` entrée « Courriel professionnel, rappels et demandes sur les données » ; `app/docs/livraison-audit-20-octobre.md` | Consigner la citation exacte de l'accord ou repasser la variable à faux et redéployer ; jouer et consigner la recette Zoho sur comptes fictifs avant tout circuit réel. |
| C4 | **Cautionnement rouvert** : `ZOHO_SIGN_CAUTIONNEMENT_FERME` mis à faux sur « Oui, lire cet interrupteur et le mettre à false ». Décision consignée, mais elle inverse D2 (bloquant B7 de l'audit : mention collée non relue par un juriste) et le [[Calendrier de lancement — 30 novembre 2026]] attendait au 23/10 « cautionnement fermé ». Le wiki ne signalait pas la contradiction. | `log.md` entrée `audit` du 21/10 | Décision à assumer par écrit (risque : un acte de cautionnement envoyé avec une mention non relue), ou refermer jusqu'à l'avis du juriste. |
| C5 | **Migration d'effacement appliquée avant toute CI verte et depuis un SHA différent de la tête fusionnée** : application 39651969057 sur `c63303f` à 18 h 21 alors que la CI 39650726275 de ce SHA était en cours (échec à 18 h 23 sur le seul test d'inventaire du manifeste) ; tête fusionnée `9861f1c` (18 h 25), jamais passée au chantier. Fichier identique octet pour octet : pas d'écart de contenu. La simulation a précédé la sauvegarde d'une minute (sans risque : la garde n'agit qu'en application). | API GitHub `compare/c63303f...9861f1c` ; horodatages des exécutions | Consigner l'écart (`audit`) ; à l'avenir, CI verte sur la tête exacte avant toute application, puis fusion de cette tête. |
| C6 | **Journal incomplet** : aucune entrée `deploy` pour #234, #235, #236 (aucun de leurs SHA dans `log.md`, le wiki ni `index.md`) ; #234 consignée en `query` ; #230 sans entrée propre ; recette n° 30 et son déploiement non consignés ; « CI796 »/« CI797 » désignent les n° 797 et 798 ; relevé en lecture seule après application (point 7) absent pour #231. | `log.md` entrées du 21 et 22/10 ; API GitHub `run_number` | Trois entrées `deploy` (SHA, CI, Vercel, recette ou « aucune »), une rectification des numéros, un relevé `audit` pour #231. |
| C7 | **Module de transfert du courriel de contact actif en production sans journal** : trois variables Production posées le 22/10 à 06 h 56 (deux) et 07 h 12 (secret), redéploiement prêt à 07 h 16 ; le journal (`dev`) le présente comme « à activer après configuration ». Trois requêtes reçues par la route entre 06 h et 11 h 45, dont un POST refusé (400, signature) à 07 h 16 min 55 ; aucun transfert réussi prouvé (un succès n'écrit rien). | Vercel : noms et dates des variables, déploiements `dpl_3kEQUJMy…` puis `dpl_Dg6KkEVw…` ; journaux d'exécution | Entrée `deploy` datée (fusion `cc53dd7`, deux déploiements, pose des variables, heure de l'accord « Faisons ça, ça me convient ») ; vérifier qu'un courriel réel arrive ; expliquer le POST refusé. |
| C8 | **Effets réels hors dépôt consignés sans les mots du dirigeant** : boîte `contact@gerimmo.app` créée chez Resend, un courriel d'essai réel « Delivered », enregistrements MX et DMARC, variables `RESEND_REPONDRE_A` et `ZOHO_SIGN_RELANCES_ACTIVES`, « second accord explicite » de l'effacement. Entrée de type `dev`, pas `decision`. | `log.md` entrées « Effacement initial confirmé et vérifié », « Courriel professionnel… » ; [[Demandes sur les données et fermeture de compte]] | Une entrée `decision` datée citant chaque accord. |
| C9 | **Mentions légales** : la section « Signaler un contenu illicite » (adresse de signalement, éléments à fournir) est retirée sans mention dans la PR ni le journal, et reprise nulle part ; retirées aussi la ligne « informations mises à jour le… » et la phrase « ne relève pas de la loi Hoguet ». Caractère obligatoire du canal de signalement : **à trancher par le juriste**. Le SIRET n'est plus affiché mais reste requis par le code : le bandeau « en cours de finalisation » persiste tant qu'il n'est pas saisi. | `app/src/app/mentions-legales/page.tsx` à `7092eb4` puis `e0d366b` ; `app/src/lib/editeur.ts` ; page en ligne le 22/10 à 10 h 11 UTC | Rétablir une phrase de signalement ou la placer dans la confidentialité (après avis du juriste) ; déclarer le retrait au journal ; aligner la liste des champs requis sur ce qui est affiché. |

### Mineurs (à ranger, sans risque immédiat)

- Retrait des 43 objets Storage : effet réel hors chantier, sans identifiant ni inventaire, non clôturé au journal (« en cours ») alors que la PR dit « réussi ». Plausible d'après la sauvegarde du 22/10 (9 fichiers) et le relevé SQL (10 objets). Consigner le moyen, l'heure, les comptages.
- Pas de script de retour arrière pour la migration destructive `20261021175930` (première depuis la convention du 14/10) ; l'exception est écrite dans le LISEZ-MOI des retours (restauration de la copie `20261021-1815`) mais cette voie n'a pas été exercée depuis. Lancer le chantier de restauration isolée sur cette copie.
- Deux empreintes md5 liées à la production (identifiant du superadmin, inventaire des dix comptes) sont désormais publiques dans l'historique git. Ni identifiant en clair, ni courriel, ni secret ; question à poser au dirigeant, pas une fuite.
- Le balayage des clés étrangères de la fonction de nettoyage n'a pas de filtre de schéma dans sa seconde boucle (la première est limitée à `public`/`support_interne`) ; sans effet constaté.
- Deux des trois migrations ne finissent pas par `select public.fermer_fonctions_a_anon();` (aucune fonction publique créée ; précédents existants) ; le retour `20261021140836` manque dans la liste « Ordre complet » du LISEZ-MOI.
- Wiki non mis à jour des décisions du 21/10 : [[Recette de production]] disait encore cinq comptes fixes ; [[Prêt à démarcher]] disait « clients externes » désactivé et envois Zoho fermés ; aucune ligne du Calendrier passée en « fait (date) » ; « Préparation fonctionnelle » indexée deux fois avec deux résumés contradictoires ; page « Demandes sur les données et fermeture de compte » sans frontmatter ; `sources` en texte libre sur deux pages ; entrée du 20/10 importée de la PR #229 insérée après celles du 21/10 (ordre des dates rompu, ajout seul respecté). Des callouts datés renvoyant à cette page ont été posés le 22/10 sur les trois premières pages.
- `transfert-contact.ts` accepte tout sous-domaine `amazonaws.com` comme hôte du message brut (URL issue de la réponse authentifiée de Resend : risque faible) ; la file des demandes de données est définie par un préfixe de titre, pas un type dédié.
- « 38 contrôles ciblés » (PR #236) : 34 cas comptés dans les fichiers ; « 62 contrôles » (PR #234) : 57 comptés. Comptes locaux annoncés dans les PR (9 254, 9 263, 9 295 tests, 161, 130, 21 contrôles…) : invérifiables d'ici.
- Le domaine `gerimmo-demo.fr` subsiste dans `livrables/` (hors `app/`), avec un mot de passe de démonstration.
- Le journal annonce « 14 publications conservées » ; le relevé SQL en compte 15.

### Réfuté

- « Un seul appel reçu par le webhook, refusé » : le lecteur comptait les lignes de journal applicatif, écrites seulement pour un statut ≥ 400. La métrique de requêtes montre trois requêtes ; un succès n'émet rien. Reste vrai : aucun transfert réussi n'est prouvé.

## 4. Relevé direct de la production

**Vercel et pages (22/10, 10 h 06-10 h 12 UTC)** : huit déploiements de production depuis `804a6da`, tous `READY` ; `cc53dd7` déployé deux fois (06 h 56 puis 07 h 16 après pose des variables) ; aucune erreur d'exécution sur 24 h. `/mentions-legales` (200) : bandeau rouge « Document en cours de finalisation », éditeur « Entrepreneur individuel (EI) », adresse, RNE, « TVA non applicable, article 293 B du CGI », directeur de la publication, e-mail : une adresse personnelle du dirigeant, téléphone ; hébergeurs Supabase et Vercel ; médiation : « Adhésion à venir : aucun organisme n'est désigné à ce jour ». `/confidentialite` (200) : même adresse personnelle pour les questions de données (deux liens `mailto`) ; lien vers `/compte/donnees` présent (PR #235 confirmée) ; « Liste d'attente des agences : au plus tard trois ans après notre dernier échange » (repère que [[Liste d'attente des agences]] dit à confirmer par le DPO). `/agences` (200) : formulaire complet. `/api/resend/contact` en GET : 405, attendu.

**Base (SELECT du 22/10 à 12 h 40 UTC)** : 403 versions dans `supabase_migrations.schema_migrations`, dernière `20261021175930`, les trois migrations du 21/10 enregistrées ; 1 compte `auth.users`, 1 super-administrateur actif, 0 organisation, 0 artisan, 0 agence inscrite ; `artisan_modules_locaux` : `clients=true`, `reglements=true` ; 10 objets Storage ; 15 publications ; 10 tâches `pg_cron` actives ; la fonction `agences_en_attente_relais` n'est pas exécutable par `anon` ; dernière sauvegarde consignée à 06 h 13 UTC ; relais de 5 h `envoye` les 21 et 22/10.

**Non relevé** : valeurs des variables Vercel ; tableaux de bord Resend (boîte contact, webhook, essai) et Zoho (crédits, relances).

## 5. Ce que Claude recommande, dans l'ordre

1. **Aujourd'hui** : recette de production sur `main` `cc53dd7` (C1) ; trois entrées `deploy` et une rectification (C6, C7) ; entrée `decision` citant les accords manquants ou retour des interrupteurs à l'état fermé (C2, C3, C8).
2. **Décisions du dirigeant à écrire** : cautionnement ouvert ou fermé jusqu'au juriste (C4) ; canal de signalement des mentions légales (C9, avec le juriste) ; e-mail de l'éditeur à remplacer par `contact@gerimmo.app` dans `/admin/parametres` et SIRET saisi pour lever le bandeau (saisie en base, deux minutes).
3. **Cette semaine** : exercice de restauration isolée sur la copie `20261021-1815` ; mise à jour des pages contredites au-delà des callouts (Recette de production, Prêt à démarcher, Calendrier, index) ; rappel à Codex : la recette est due après chaque fusion et chaque réglage hors dépôt, même sans migration.

## 6. Comment revérifier ce contrôle

| Affirmation | Commande ou lieu (lecture seule) |
| --- | --- |
| Six fusions au SHA de tête | `gh api repos/GERIMMO/GERIMMO_V4/pulls/<n>` (`head.sha`, `merge_commit_sha`) puis `git ls-tree` des deux arbres |
| Aucune recette depuis 39656877362 | GitHub → Actions → « Recette de production avec nettoyage » |
| Migrations appliquées, ordre et COMMIT | exécutions 39647465679, 39648103765, 39650919924, 39651969057 et leurs journaux |
| Modules artisans ouverts | `select code, actif from public.artisan_modules_locaux;` |
| 403 versions, dernière `20261021175930` | `select count(*), max(version) from supabase_migrations.schema_migrations;` |
| Un seul compte, un superadmin | `select count(*) from auth.users;` et `select count(*) from public.memberships where role='super_admin' and status='active';` |
| Pages légales | ouvrir `/mentions-legales` et `/confidentialite` : bandeau, e-mail de l'éditeur, médiation |
| Variables du transfert et des relances | Vercel → Settings → Environment variables (noms et dates, jamais les valeurs) |

> [!warning] Points à trancher / contradictions
> - Modules artisans « clients externes » et « règlements » ouverts le 21/10 sur un message général : accord nommant le module et le SHA à écrire, ou retour.
> - Relances Zoho activées sans citation d'accord ni recette Zoho sur comptes fictifs : citer ou refermer.
> - Cautionnement rouvert à l'inverse de D2 : décision à assumer par écrit ou refermer jusqu'au juriste.
> - Mentions légales : canal de signalement retiré (obligation à trancher par le juriste) ; e-mail de l'éditeur personnel alors qu'une boîte professionnelle existe ; bandeau « en cours de finalisation » maintenu par le SIRET requis mais non affiché.
> - Migration destructive sans script de retour : accepter l'exception (restauration de la copie) et l'écrire dans la règle, ou non.
> - Deux empreintes md5 liées à la production publiées dans le dépôt : acceptable ou non.
