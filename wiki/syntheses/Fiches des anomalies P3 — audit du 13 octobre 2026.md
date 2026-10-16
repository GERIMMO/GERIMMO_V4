---
type: synthesis
tags: [audit, anomalies, registre, v1, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-16
sources: []
---

# Fiches des anomalies P3 — audit du 13 octobre 2026

Fiches complètes des 166 anomalies de gravité P3 du [[Registre des anomalies — audit du 13 octobre 2026]] (les fiches P0, P1 et P2 sont dans le registre). Les champs vides n'ont pas été relevés par l'agent.

> [!info] Statuts au 16/10/2026
> Le champ « Statut » des fiches ci-dessous reflète la rédaction du 13–14/10. Depuis, 39 anomalies P3 sont passées à *déployée* (vague 1, PR #181 ; vague 2, PR #182 ; vague 3, PR #184 ; vague 4a, PR #185 ; puis PR #188, #190 et #191, tests PR #193) et 33 restent *à trancher* : le statut à jour, avec la PR et le SHA de chaque livraison, est dans le tableau P3 du [[Registre des anomalies — audit du 13 octobre 2026]] (encadré « Mise à jour du 16/10/2026 »).

#### `AUD-C-03` — L'ordre d'application des migrations n'est pas l'ordre des noms de fichiers

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Reconstruction d'une base depuis le dossier de migrations par un outil qui trie par nom (Supabase CLI, db reset)
- **Étapes** : Comparer ls app/supabase/migrations et app/e2e/local/ordre-migrations.txt : memes 306 noms, 95 fichiers a une autre position, 263 paires inversees, du 28/07 au 14/09. preparer-base.sh documente un cas (module8_artisans_socle appelle une fonction definie par un fichier de nom posterieur).
- **Attendu** : Dossier rejouable dans l'ordre des noms, ou limite signalee dans la documentation de reprise.
- **Observé** : Connu et documente dans le script ; les 22 migrations de la PR #177 sont dans le meme ordre des deux cotes ; rejeu non tente (hypothese a verifier).
- **Preuve expurgée (banc)** : inventaire-automatismes.md section 6
- **Cause probable** : Fichiers renommes apres application en production (app/e2e/local/preparer-base.sh, commentaire).
- **Correction proposée** : Mentionner l'ordre du manifeste dans app/docs/sauvegarde-et-restauration.md ; a terme renommer les fichiers selon l'historique de production.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `AUD-C-04` — Trois versions de PostgreSQL dans les preuves de sauvegarde, sans garde de coherence (hypothese a verifier)

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Version reelle du serveur de production inconnue depuis le banc
- **Étapes** : ci.yml : serveur et client 18 ; sauvegarde.yml et restauration-sauvegarde.yml : client 17 et service postgres:17 ; banc : PostgreSQL 16.13 (aucun pg_dump 17 ou 18).
- **Attendu** : Meme version majeure testee en integration continue et exercee pour la sauvegarde reelle, ou verification explicite.
- **Observé** : Si la production passe en 18, pg_dump 17 s'arrete ; l'echec serait consigne (echecs: 1) et visible dans Sante, donc fermeture sure. Restauration reelle du 27/09 : documentee (execution GitHub 36342665715), non verifiable depuis le banc ; elle ne prouve ni la bascule Auth/Storage ni le delai de 4 h (dit par la documentation).
- **Preuve expurgée (banc)** : .github/workflows/ci.yml, sauvegarde.yml, restauration-sauvegarde.yml
- **Cause probable** : Evolution de version non reportee partout.
- **Correction proposée** : Ajouter au debut de sauvegarde.yml une comparaison show server_version_num / pg_dump --version avec message clair.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `CAR-02` — La matrice de droits du super-administrateur cite une ligne de code qui ne contient pas ce qu'elle désigne

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : preuves/superadmin/matrice-droits.md §1 ; code de la tête.
- **Étapes** : 1. grep -n 'admin/layout.tsx:24' preuves/superadmin/matrice-droits.md ; 2. sed -n 24p app/src/app/admin/layout.tsx ; 3. grep -n 'is_super_admin' app/src/app/admin/layout.tsx
- **Attendu** : « src/app/admin/layout.tsx:24 (is_super_admin) » pointe l'appel à is_super_admin.
- **Observé** : La ligne 24 est un commentaire (« sécurité restent dans l'en-tête, visibles sur chaque écran. ») ; l'appel `supabase.rpc("is_super_admin")` est à la ligne 32 puis la redirection ligne 33. L'autre référence du document (src/proxy.ts:216) est exacte. Contrôle fait par 07_tests.py (références_matrices : 1 incohérente(s)).
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/tests.json › references_matrices
- **Cause probable** : Le layout a changé après la rédaction du document (numérotation des lignes décalée).
- **Correction proposée** : Remplacer :24 par :32 dans la matrice, ou citer la fonction plutôt que la ligne.
- **Correction sans aval** : oui

#### `CAR-04` — Aucun journal de parcours navigateur ni d'audit des écrans pour la référence e9f31ac : la comparaison avec la candidate est impossible hors lint, types, build, vitest

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : /tmp/ref-*.log.
- **Étapes** : 1. ls -la /tmp/ref-*.log ; 2. wc -c /tmp/ref-global.log
- **Attendu** : La référence e9f31ac porte les mêmes mesures que la candidate (parcours, audits 768/1440).
- **Observé** : Présents : ref-build, ref-etat, ref-lint, ref-types, ref-vitest. ref-global.log fait 0 octet ; aucun ref-*e2e* ni ref-*audit*. Le parcours navigateur et l'audit des écrans de la candidate (164 tests, 157 écrans) n'ont pas de point de comparaison.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/tests.json › reference_e9f31ac
- **Cause probable** : La chaîne de référence (13/10, 09:56-10:00) ne lançait que lint, build, types et vitest.
- **Correction proposée** : Ne pas revendiquer de non-régression navigateur depuis e9f31ac ; si nécessaire, rejouer le parcours sur un build e9f31ac dans un banc séparé.
- **Correction sans aval** : oui

#### `CAR-07` — Lacunes de couverture : 4 pages jamais ouvertes, 43 écrans ouverts ni exercés ni regardés, 43 actions serveur sans aucune trace

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : app/e2e/matrice-ecrans.json (157 écrans), e2e/.audit/rapport-*.json (passe 1440 px), tests vitest et parcours Playwright.
- **Étapes** : 1. python3 scripts/06_couverture.py ; 2. lire donnees/couverture.json › taux_ecrans, pages_du_code_absentes_de_la_matrice, actions
- **Attendu** : Chaque écran et chaque action de la V1 a au moins un parcours ou un test qui l'exerce.
- **Observé** : Écrans : 157/157 ouverts, exercés entre 88 et 99 sur 157 (56.1 à 63.1 %, selon que l'on compte ou non 11 écrans dont le seul parcours a un profil indéterminé), 51/157 cités par un rapport de rôle. Pages absentes de la matrice : /artisan/chantiers/[chantierId], /artisan/clients/[clientId], /artisan/facturation/[factureId], /invitations/[invitationId]. Actions : 43/259 sans trace ; 125 seulement via l'import de leur module. RPC authenticated : vitest sur base réelle 258, appel de contrôle d'accès seulement (matrice/fuzz) 82, vitest (sans base) 14.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/couverture.json ; inventaire-couverture.md
- **Cause probable** : Matrice générée à partir des seuls objets présents dans la base du banc ; parcours centrés sur les chemins principaux.
- **Correction proposée** : Ajouter au jeu d'essai un client, un chantier, une facture externe et une invitation pour ouvrir les 4 pages ; écrire un parcours ou un test par action non couverte de la V1.
- **Correction sans aval** : oui

#### `CAR-08` — Matrice des droits du super-administrateur : l'autorisation positive en aal2 n'est pas rejouée sur les 99 fonctions (profil aal1 seulement)

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : preuves/superadmin/scripts2/matrice_rpc_candidate.py ; sql2/matrice_rpc_negative_candidate.json.
- **Étapes** : 1. lire la table `personas` de matrice_rpc_candidate.py (7 profils + anon) ; 2. python3 scripts/05_matrice.py : champ exerce_super_admin_aal2_par_scripts
- **Attendu** : « 99 fonctions × 7 profils, 0 écart » couvre le refus des autres profils ET l'accès du super-administrateur aal2.
- **Observé** : Les profils rejoués sont proprietaire, locataire, artisan, agent, admin_agence, multi, superadmin_aal1, anon : pas de profil aal2. Sur 86 fonctions de classe super_admin, 6 seulement sont nommées dans les scripts ou sorties du rôle (les gestes passent par l'interface sans nommer la RPC). Le document établit bien le refus ; l'accès positif aal2 est « lu dans le code » pour le reste. L'auditeur le note aussi (« fonctions de supervision exécutées sous MFA aal2 : non exécutées »). Hypothèse à vérifier : aucune fonction de supervision n'est inaccessible au super-administrateur aal2.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/matrice.json ; preuves/superadmin/scripts2/matrice_rpc_candidate.py
- **Cause probable** : Le script ne forge pas de jeton aal2 ; les gestes positifs ont été éprouvés par l'interface.
- **Correction proposée** : Ajouter un profil `superadmin_aal2` (claims aal=aal2) au script de matrice, dans une transaction annulée sur une copie.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `CAR-09` — Les relevés d'audit par écran sont écrasés à chaque largeur : seule la passe 1440 px est détaillée, les passes 390 et 768 px ne survivent que par leurs totaux

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : e2e/audit-ecrans.spec.ts écrit rapport-<profil>.json dans E2E_AUDIT_DIR (défaut e2e/.audit) ; candidat5.sh lance les trois largeurs sans changer ce dossier.
- **Étapes** : 1. ls -la --time-style=full-iso app/e2e/.audit/rapport-*.json ; 2. comparer la somme des boutonsVisibles de chaque rapport aux totaux de /tmp/cand5-audit-768.log et -1440.log
- **Attendu** : Un relevé par écran et par largeur.
- **Observé** : Les sept rapport-*.json datent de 03:56 à 04:01 et leurs sommes de commandes visibles (public 24, agent 207, admin 211, locataire 23, proprietaire 95, superadmin 150, artisan 44) sont celles du journal 1440 px (public 37 à 768 px). Les relevés par écran de 390 px et 768 px n'existent plus.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/couverture.json (rapports_audit_dates) ; /tmp/cand5-audit-1440.log ; /tmp/cand5-audit-768.log
- **Cause probable** : E2E_AUDIT_DIR non positionné par largeur dans scratchpad/outils/candidat5.sh.
- **Correction proposée** : Exporter E2E_AUDIT_DIR=e2e/.audit-$LARGEUR pour chaque passe, ou inclure la largeur dans le nom du rapport.
- **Correction sans aval** : oui

#### `CAR-10` — La matrice du super-administrateur décrit la politique d'écriture de `memberships` de façon incomplète

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : preuves/superadmin/matrice-droits.md §4 ; catalogue de gerimmo_ci_integ.
- **Étapes** : 1. grep -n 'memberships' preuves/superadmin/matrice-droits.md ; 2. psql gerimmo_ci_integ : select policyname, cmd, with_check from pg_policies where tablename='memberships' ; 3. select has_table_privilege('authenticated','public.memberships','insert\|update\|delete')
- **Attendu** : La ligne « memberships : politique INSERT/DELETE ouverte à is_super_admin() » décrit les politiques et les privilèges réels.
- **Observé** : Catalogue : la politique INSERT accepte l'admin d'agence de l'organisation OU is_super_admin() ; la politique UPDATE aussi ; DELETE est réservé à is_super_admin(). Mais `authenticated` n'a que SELECT et DELETE sur la table : INSERT et UPDATE directs sont refusés pour tous (y compris le super-administrateur), seules les fonctions SECURITY DEFINER (inviter_agent, ouvrir_organisation, initialiser_espace_proprietaire, repondre_invitation_locataire, terminer_bail, solliciter_artisan_interne) créent ou modifient une adhésion. La conclusion du document (« l'octroi se fait en base ») reste juste.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/base.json › catalogue.politiques (table memberships) et catalogue.tables (droits_authenticated = SD)
- **Cause probable** : Document rédigé à partir des politiques sans croiser les privilèges de table.
- **Correction proposée** : Corriger la ligne : « INSERT/UPDATE : politiques (admin d'agence, super-admin) sans effet faute de privilège ; DELETE : super-admin » ; supprimer les politiques sans effet lors d'une migration relue.
- **Correction sans aval** : oui

#### `CHF-08` — Hypothèse à vérifier : le lien « notice officielle 2044, millésime 2026 (revenus 2025) » affiché sous un récapitulatif des revenus 2026 pointe vers …/2044_5487.pdf, alors que la recherche renvoie le…

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Récapitulatif fiscal 2026.
- **Étapes** : Lire le pied de page de l'écran fiscal ; comparer à l'URL renvoyée par la recherche.
- **Attendu** : Lien vers la notice des revenus concernés, vérifié.
- **Observé** : Lien non ouvrable ici (impots.gouv.fr bloqué) ; numéro de fichier différent de celui renvoyé par la recherche.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/captures/fiscal-final.txt ; preuves/charges-fiscalite/web-consultation.txt
- **Cause probable** : app/src/components/recapitulatif-fiscal.tsx:357
- **Correction proposée** : Ouvrir le lien depuis un poste non filtré et corriger si besoin.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `DES-B-12` — HORS V1 PUBLIQUE — espaces administrateur d'agence et agent : défauts transversaux déjà connus et petites cibles sur la recherche

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Comptes admin.alpha et agent.alpha, 390x844
- **Étapes** : Ouvrir les écrans de la matrice (29 admin, 31 agent) et appuyer sur Tab ; mesurer les cibles
- **Attendu** : Mêmes exigences que le propriétaire
- **Observé** : (1) Focus clavier masqué par la barre basse à 390 px sur plusieurs écrans (par ex. /artisans « SIRET », /baux/<id>, /loyers « Encaisser… », /reseau, /incidents/nouveau) : même cause que DES-A-01 ; (2) bouton « Rechercher un lot, une personne… » de 43 px de haut sur 26 écrans (1 px sous 44) ; (3) libellé « Menu » de la barre basse en 10,5 px ; (4) fiche d'un bien : axe serious definition-list et dlitem (DES-A-04) ; (5) écran de reprise : consigne « tel quel : depot_garantie » (code interne montré à l'utilisateur). Aucune correction de priorité : ces espaces ne sont pas présentés au public en V1.
- **Preuve expurgée (banc)** : journaux/auto-admin-390.json ; journaux/auto-agent-390.json (clavier.masques, mesure.ciblesMoins44Ex)
- **Cause probable** : globals.css (barre basse de .coquille-basse, sans scroll-padding, cf. DES-A-01) ; bouton .recherche-ouvrir (min-height 43 px) ; app/src/lib/reprise-soldes.ts (libellé de code)
- **Correction proposée** : Appliquer le correctif de DES-A-01 ; `.recherche-ouvrir { min-height: 44px }` ; libellé « Dépôt de garantie » à la place du code dans l'aide de saisie
- **Correction sans aval** : oui

#### `FIN-12` — Hypothèse à vérifier : les lectures de qualifications, de captures et d'écritures n'ont ni filtre d'année (captures, qualifications) ni garde contre la limite de 1 000 lignes de l'API, alors que d'au…

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un propriétaire dont l'historique dépasse 1 000 captures (par exemple 20 lots sur 4 ans) : si la limite de lignes de l'API de production est celle par défaut, la lecture des captures est tronquée sans erreur ; des loyers apparaissent alors « à qualifier » et les recettes sont sous-évaluées, sans message, dans un récapitulatif à recopier sur une déclaration. Non reproduit : l'émulateur du banc ne reproduit pas ce plafond, et le réglage de production n'a pas été consulté.
- **Preuve expurgée (banc)** : Lecture seule : snap-main/app/src/components/recapitulatif-fiscal.tsx lignes 67-75 ; garde existante ailleurs : snap-main/app/src/lib/documents/modeles/catalogue-bail.ts ligne 15
- **Cause probable** : app/src/components/recapitulatif-fiscal.tsx:67-75 (cinq lectures sans limite ni contrôle de troncature)
- **Correction proposée** : Filtrer captures et qualifications sur les identifiants des écritures de l'année (ou joindre côté base), et refuser d'afficher des montants si une lecture renvoie 1 000 lignes, comme le fait déjà le catalogue de documents.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `-- Lecture seule : volumes par organisation (alerte au-delà de 800) et réglage de plafond à consulter dans Supabase (Réglages > API > Max rows). select organization_id, count(*) from public.fiscal_encaissements_composantes group by 1 having count(*) > 800 order by 2 desc; select organization_id, count(*) from public.fiscal_qualifications_ecritures group by 1 having count(*) > 800 order by 2 desc; select organization_id, date_part('year', date_piece) annee, count(*) from public.ecritures group by 1,2 having count(*) > 800 order by 3 desc;`

#### `FIN-13` — Hypothèse à vérifier : l'encaissement en un clic prend la date par défaut de la base (current_date, fuseau UTC), pas la date de Paris ; entre 00 h 00 et 01 h 59 (heure de Paris) un règlement est daté…

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le 1er janvier 2027 à 00 h 30 (heure de Paris), le gérant clique « Encaisser » : la date du paiement et de la pièce comptable est le 31/12/2026 en UTC, donc l'année 2026 du récapitulatif 2044 et du livre. Le comportement existait avant la PR (l'ancien insert direct n'envoyait pas de date non plus) et le fuseau de la base du banc est Etc/UTC ; la valeur en production n'a pas été consultée. Non reproduit : aucune horloge simulée.
- **Preuve expurgée (banc)** : Lecture seule : migration lignes 94-95 ; show timezone sur le banc = Etc/UTC ; ancienne version git show 1e464f1:app/src/app/actions/quittancement.ts (insert sans date) ; le code utilise ailleurs aujourdhuiParis()
- **Cause probable** : app/supabase/migrations/20261012223000_encaissement_reste_atomique.sql:94-95 (insert sans date_paiement : défaut current_date)
- **Correction proposée** : Passer explicitement date_paiement = (now() at time zone 'Europe/Paris')::date dans la fonction.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `-- Lecture seule : réglage de fuseau, et paiements datés de la veille d'un jour de création entre 22 h et 24 h UTC. show timezone; select e.id, e.organization_id, e.date_paiement, e.created_at, (e.created_at at time zone 'Europe/Paris')::date as jour_paris from public.encaissements e where e.date_paiement <> (e.created_at at time zone 'Europe/Paris')::date and e.note = 'Encaissé depuis le quittancement' order by e.created_at desc limit 50;`

#### `PR178-A-09` — Sans API Navigation (hypothèse Safari/iOS et Firefox), le geste Retour abandonne silencieusement un formulaire modifié

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Simulation : window.navigation défini à undefined avant le chargement ; compte proprietaire, navigation douce tableau de bord vers Alertes. Aucun Safari ni Firefox réel disponible sur le banc : support réel de l'API non vérifié.
- **Étapes** : 1. Cliquer « Alertes » depuis le tableau de bord. 2. Taper un titre. 3. Retour arrière du navigateur.
- **Attendu** : Confirmation ou conservation de la saisie.
- **Observé** : En simulation, aucune boîte : retour au tableau de bord, formulaire perdu (le code l'assume : « Pas de faux ajout dans l'historique en repli », protection-saisie.ts:163-165). Avec l'API présente (Chromium), la protection fonctionne (PR178-A-E02). Sur mobile, le geste « balayer pour revenir » est le plus exposé. Non reproduit dans un navigateur réel : hypothèse à vérifier.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a13-sortie.txt ; src/lib/protection-saisie.ts:163-171
- **Cause probable** : Repli inexistant en l'absence de navigation.addEventListener (popstate non interceptable pour annuler).
- **Correction proposée** : Vérifier le support sur Safari iOS et Firefox ; à défaut, enregistrer un brouillon local (comme pour les fiches) ou une pastille « modifications non enregistrées » visible.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PR178-B-07` — Les parcours navigateur ajoutés n'auraient détecté aucun des constats B-01 à B-06 : les tests du garde sont en partie synthétiques et aucun ne couvre les succès financiers, la session expirée ou les…

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lecture du dépôt (snap-main-178) : e2e/protection-saisie.spec.ts, demonstration.spec.ts, tests/proxy-redirection-post.test.ts.
- **Étapes** : Lire les tests ; chercher une assertion sur : un succès d'encaissement suivi d'une sortie ; un retour sans clé succes ; un <form> sans method ; une session expirée pendant une action ; la suppression des cookies sb-* par le proxy.
- **Attendu** : Chaque règle du garde (reset annulé, confirmation, exclusion des recherches) testée sur un formulaire réel de chaque famille d'état de retour.
- **Observé** : Aucune de ces assertions n'existe. Les tests « banc » appellent confirmerSoumission à la main sur une page factice ; demonstration.spec.ts est un film (sauté par défaut) compté parmi les « parcours » ; le test proxy ne vérifie pas le cookie de session.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/rapport.json PR178-B-E13 (lecture statique)
- **Cause probable** : e2e/protection-saisie.spec.ts lignes « banc » et « artisan : seule la confirmation réelle… » ; tests/proxy-redirection-post.test.ts (signOut simulé sans setAll).
- **Correction proposée** : Ajouter : (1) un parcours « encaissement : erreur puis succès puis sortie sans avertissement » ; (2) un test qui parcourt les types Etat* des actions et exige succes ou une déclaration explicite ; (3) un formulaire sans method dans le banc ; (4) un test proxy qui vérifie Set-Cookie de suppression de sb-*.
- **Correction sans aval** : oui

#### `REP-03` — Clients externes (module desactive en production) : apres un refus de validation, le meme justificatif ne peut plus etre remplace par un autre fichier de meme type tant que le formulaire n'est pas re…

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecture (relecture/reprises) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : La cle d'idempotence 'cle' sert aussi de nom de fichier (artisan/<cle>.<ext>) et n'est remise a zero qu'apres un succes. Apres une erreur renvoyee par artisan_externe_ecrire (ex. bilan trop court) le justificatif est deja depose et classe. L'artisan corrige son texte ET choisit une autre photo : upload refuse (chemin existant), le code telecharge l'objet existant, le hachage differe -> 'Le justificatif n'a pas pu etre depose' ; aucune consigne de recharger. Pour valider_devis, le PDF est regenere par Chromium a chaque tentative (date de creation embarquee) : le hachage differe de celui du premier depot, meme refus apres une premiere tentative partielle. Aucun effet financier ; contournement : recharger la page (nouvelle cle).
- **Preuve expurgée (banc)** : Lecture seule des lignes citees ; le depot Storage n'a pas ete rejoue (module desactive en production, aucune ecriture sur le banc de parcours). Hypothese a verifier.
- **Cause probable** : app/src/app/artisan/clients/actions.ts + formulaire.tsx:actions.ts:17-19 (chemin artisan/<cle>.<ext> + comparaison de hachage) ; formulaire.tsx:8 (cle conservee tant qu'il y a une erreur)
- **Correction proposée** : Deriver le chemin du hachage du fichier (artisan/<sha256>.<ext>) au lieu de la cle, ou regenerer la cle apres toute erreur de validation ; dire 'rechargez le formulaire' dans le message d'echec.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `-- sans objet : module desactive en production (artisan_modules_locaux.actif=false par defaut)`

#### `SUP-06` — Ces trois lectures font db.from('accounts').select('id,email') sans filtre puis filtrent en JavaScript : au-delà de la limite de lignes de l'API (1 000 par défaut chez Supabase), la liste des respons…

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Plus de 1 000 comptes : les super-administrateurs peuvent ne pas figurer dans les 1 000 premières lignes ; le formulaire de consigne ne les propose plus comme responsables, les alertes affichent « Compte indisponible ». Aucun message d'erreur (la page ne teste que error, pas la troncature). Non reproduit sur le banc (émulateur sans plafond) : lecture seule.
- **Preuve expurgée (banc)** : lecture seule : app/src/app/admin/consignes/page.tsx:17 et relais/page.tsx:19 (snapshot e9f31ac)
- **Cause probable** : Lecture non bornée de accounts au lieu de .in('id', ids_super_admin).
- **Correction proposée** : Lire d'abord memberships (super_admin actif), puis accounts avec .in('id', ids).
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `select count(*) from public.accounts; -- si > 1000, le défaut est atteignable`

#### `VUI-01` — Résiduel de DES-A-01/DES-B-02 : deux champs multilignes restent masqués en partie (24 % et 51 %) par la barre du bas quand ils reçoivent le focus au clavier à 390 px

- **Sévérité** : P3 · **Statut** : ouverte — 2 champs multilignes en partie masqués par la barre du bas à 390 px au focus clavier (curseur et début du champ visibles) ; pas de correctif sûr trouvé sans refonte du défilement · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : verification-ui (verification/ui-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : 390x844 tactile, propriétaire /agence/<org>/incidents/nouveau ; artisan /artisan/entreprise
- **Étapes** : Ouvrir la page, appuyer sur Tab jusqu au champ Description (propriétaire, 8e arrêt) ou Mentions (artisan, 15e arrêt)
- **Attendu** : Champ focalisé entièrement au-dessus de la barre (WCAG 2.4.12 niveau AAA ; le niveau AA 2.4.11, aucun champ entièrement masqué, est respecté)
- **Observé** : textarea#description top 711 bottom 811 pour une barre à 787 (24 % masqués) ; textarea mentions 729-831 pour une barre à 779 (51 %). La page ne défile pas parce que le champ est déjà dans la fenêtre ; scroll-padding-bottom (72 px / 80 px) n est pas appliqué dans ce cas. Le haut du champ et le curseur restent visibles
- **Preuve expurgée (banc)** : preuves/verification/ui-finale/etats/clavier-prop-incident-nouveau-390.png ; etats/clavier-art-entreprise-390.png ; journaux/clavier-prop-incident-nouveau-390.json ; journaux/clavier-art-entreprise-390.json
- **Cause probable** : hypothèse à vérifier : le défilement au focus de Chromium ne tient pas compte de scroll-padding quand l élément est déjà entièrement dans la fenêtre (globals.css:2214 et :1652 ne couvrent que le cas où un défilement est nécessaire)
- **Correction proposée** : Ajouter un scroll-margin-bottom ou un espace réservé sous les champs multilignes de bas de formulaire, ou réduire la hauteur de zone visible via visual viewport ; à valider en navigateur
- **Correction sans aval** : oui

#### `VUI-03` — Agence (hors V1 publique) : l entrée « Administration » du rail tablette est coupée en « Administrati/on » à 641, 768 et 860 px

- **Sévérité** : P3 · **Statut** : ouverte — correction CSS (césure) sans effet dans le Chromium du banc (pas de dictionnaire de césure) : « Administration » reste coupé dans le rail tablette de l'agence ; à confirmer sur un Chrome de bureau ; hors V1 publique, cosmétique · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : verification-ui (verification/ui-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Connexion admin.alpha@gerimmo-demo.fr (agence), viewport 641 à 860 px
- **Étapes** : Ouvrir /agence/<org> ; examiner le libellé « Administration » dans le rail de 76 px
- **Attendu** : Libellé entier sur une ligne ou coupé entre deux mots
- **Observé** : Le mot « Administration » (14 caractères, 10,5 px) occupe deux lignes : coupure au milieu du mot (overflow-wrap:anywhere). Mesure par Range sur chaque caractère, 3 largeurs, aucun autre mot coupé ; profil agent : aucune coupure
- **Preuve expurgée (banc)** : preuves/verification/ui-finale/journaux/rail-mots-coupes.json (agence-admin, motsCoupes) ; etats/rail-agence-admin-768-colonne.png
- **Cause probable** : app/src/app/globals.css:2182 : `.coquille-late .coquille-menu a .lib { overflow-wrap: anywhere }` (rail 76 px, 10,5 px) ; le commentaire de la règle choisit de revenir à la ligne plutôt que de tronquer, ce qui coupe le mot le plus long de l agence
- **Correction proposée** : Raccourcir le libellé du rail (« Admin. » ou « Équipe ») ou réduire à 10 px le seul libellé trop long ; hors V1 publique
- **Correction sans aval** : oui

#### `V10-01` — Parcours de bail : les montants ne passent pas par lireMontant ; message generique pour '1 234,50' et '1e3' / '0x10' acceptes en silence

- **Sévérité** : P3 · **Statut** : ouverte — le parcours de bail lit encore ses montants par Number() : « 1e3 » est enregistré 1000 et « 0x10 » 16 sans message ; à brancher sur lireMontant dans une prochaine passe · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : auditeur transversal (verification finale vague 10) (verification/vague10-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Proprietaire connecte (locale en-US ou fr-FR), bail brouillon ('Commencer le bail' sur un lot), etape 4 Loyer du parcours.
- **Étapes** : 1. Ouvrir le brouillon, etape 'Loyer'. 2. Saisir '1 234,50' dans Loyer hors charges, Charges ou Depot ; Enregistrer cette etape. 3. Saisir '1e3' puis '0x10' dans Charges ; Enregistrer.
- **Attendu** : '1 234,50' refuse avec 'Montant invalide : ecrivez 1234,50, sans espace ni point de milliers.' (VFL-04). '1e3' et '0x10' refuses comme les autres textes illisibles.
- **Observé** : '1 234,50' est bien refuse mais avec 'Saisissez des montants positifs ou nuls, avec au plus deux decimales.' (message qui ne dit pas quoi ecrire). '1e3' est enregistre comme 1000.00 et '0x10' comme 16.00 (charges), sans message.
- **Preuve expurgée (banc)** : preuves/verification/vague10-finale/journaux/s3d-parcours.json ; preuves/verification/vague10-finale/journaux/s3i-extras.json
- **Cause probable** : app/src/lib/champs-etape-bail.ts:36-38 : Number(brut.replace(',', '.')) au lieu de lireMontantFacultatif/lireDecimalFacultatif de lib/saisie-montant.ts (la vague 10 a migre baux.ts, loyers.ts, etc., mais pas lireEtapeBail, qui sert le parcours de bail brouillon).
- **Correction proposée** : Lire les champs montant de lireEtapeBail avec lireMontantFacultatif (irl_valeur avec lireDecimalFacultatif) et nommer le champ avec erreurDuChamp ; ajouter un test sur '1e3', '0x10' et '1 234,50'.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `V10-03` — Rail tablette de l'agence : 'Administration' reste coupe en 'Administrati-on' (sans trait d'union) dans Chromium

- **Sévérité** : P3 · **Statut** : ouverte · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : designer UX/UI (verification finale vague 10) (verification/vague10-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte agence (admin.alpha), fenetre de 641 a 860 px, Chromium de Playwright (pas de dictionnaire de cesure fr).
- **Étapes** : 1. Ouvrir /agence/<id> a 768 px. 2. Lire le dernier item du rail.
- **Attendu** : Mot non coupe, ou cesure 'Administra-tion' avec trait d'union
- **Observé** : Deux lignes 'Administrati' / 'on', sans trait d'union (mesure par Range sur le noeud texte ; capture jointe).
- **Preuve expurgée (banc)** : preuves/verification/vague10-finale/journaux/s5-rail.txt ; preuves/verification/vague10-finale/captures/s5-rail-agence-768.png
- **Cause probable** : app/src/app/globals.css (bloc rail agence, ~l.2204) : hyphens: auto depend du dictionnaire de cesure du navigateur ; en son absence overflow-wrap: break-word coupe n'importe ou. Le comportement dans un Chrome de bureau avec dictionnaire fr reste une hypothese a verifier.
- **Correction proposée** : Inserer une cesure douce dans le libelle (Adminis&shy;tration) ou reduire la taille/espacement de la lettre de ce seul item, au lieu de compter sur hyphens: auto ; agence hors V1 publique, donc priorite basse.
- **Correction sans aval** : oui

#### `ARC-01` — Échec du rendu PDF du devis externe : message technique brut (variable d environnement) montré à l artisan

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-erreurs.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Module clients externes activé ; chantier externe avec devis v1 brouillon ; serveur sans Chrome (banc)
- **Étapes** : 1. /artisan/chantiers/<id> 2. Cliquer « Valider cette version et générer le PDF »
- **Attendu** : Message métier compréhensible avec référence de support (comme les autres générations de documents : « La génération du document a échoué (réf. DOC-…) »)
- **Observé** : « Chrome introuvable pour le rendu PDF : installez Google Chrome ou renseignez GERIMMO_CHROME. » affiché tel quel (nom de variable d environnement) ; toute autre erreur du rendu serait aussi recopiée brute
- **Preuve expurgée (banc)** : scripts/p9.mjs (sortie du message) ; captures/c03-devis-v1.png
- **Cause probable** : app/src/app/artisan/clients/actions.ts : le catch final renvoie e.message sans filtrer ; app/src/lib/documents/rendu.ts lève ce texte technique
- **Correction proposée** : Dans enregistrerActivitePrivee, intercepter les erreurs de rendu (rendrePdf) et renvoyer un message métier avec référence, comme le reste des documents
- **Correction sans aval** : oui

#### `ARC-03` — Agenda : l état du chantier externe est affiché avec son code interne (« planifie »)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-affichage.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Chantier externe planifié
- **Étapes** : Ouvrir /artisan/agenda
- **Attendu** : Libellé français accentué (« Planifié »), comme sur la fiche du chantier
- **Observé** : « Client externe · <nom> · planifie »
- **Preuve expurgée (banc)** : captures/c08-agenda.png
- **Cause probable** : Section « Mes chantiers externes » de l agenda n applique pas libelleEtatPrive (clients/elements.tsx)
- **Correction proposée** : Appliquer libelleEtatPrive au statut
- **Correction sans aval** : oui

#### `ARC-05` — Agenda artisan sur mobile 390 px : défilement horizontal (448 px) causé par la carte d une mission Gerimmo au nom de parc long

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Artisan avec une intervention Gerimmo dans les 7 jours dont le nom du client est long (« Parc de Éloïse [TEST-proprietaire] Durand-Lévêque »)
- **Étapes** : Ouvrir /artisan/agenda en 390x844
- **Attendu** : Aucun défilement horizontal, le nom est tronqué dans sa carte
- **Observé** : scrollWidth 448 pour 390 : la carte (lien .artisan-mission) mesure 432 px et dépasse du bord droit de 58 px. Même famille que ART-14 (corrigé ailleurs), non traité sur l agenda
- **Preuve expurgée (banc)** : captures/c18-mobile-agenda-debordement.png
- **Cause probable** : Carte de mission de l agenda sans min-w-0/overflow-hidden dans la grille des jours (composant .artisan-mission)
- **Correction proposée** : Ajouter min-w-0 et overflow-hidden à la carte et à son conteneur de jour
- **Correction sans aval** : oui

#### `ARC-06` — Clients externes : messages d erreur génériques inadaptés (client en doublon : « cette facture » ; champ vide : « joignez votre justificatif »)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-erreurs.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Page /artisan/clients
- **Étapes** : 1. Recréer un client déjà existant (même nom, e-mail, adresse) 2. Créer un client dont le nom ne contient que des espaces
- **Attendu** : « Ce client existe déjà » / « Indiquez le nom du client »
- **Observé** : 1. « Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer » 2. « Complétez tous les champs et joignez votre justificatif. » alors que le formulaire n a aucun justificatif
- **Preuve expurgée (banc)** : captures/c20-message-doublon-client.png
- **Cause probable** : app/src/app/artisan/clients/actions.ts (traduction unique des erreurs « violates » / « null value ») et exception unique_violation générique de artisan_externe_ecrire
- **Correction proposée** : Messages par action (client, chantier, facture) et par contrainte
- **Correction sans aval** : oui

#### `ARC-09` — Formulaires privés artisan : session perdue présentée comme « connexion interrompue », sans lien de reconnexion

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-session-expiree.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Session expirée ou cookies effacés pendant la saisie
- **Étapes** : Remplir « Créer le client », effacer les cookies, cliquer « Créer le client »
- **Attendu** : « Votre session a expiré, reconnectez-vous (nouvel onglet) puis réessayez », comme corrigé en 36219ec pour les fiches personnes (PR178-A-05, PR178-B-01)
- **Observé** : « La connexion a été interrompue. Réessayez avec la même saisie. » ; la page reste sur /artisan/clients, nouvel essai identique ; saisie conservée
- **Preuve expurgée (banc)** : captures/c22-session-perdue.png
- **Cause probable** : app/src/app/artisan/clients/formulaire.tsx : FormulairePrive intercepte toute erreur de l action par un message unique ; la correction 36219ec ne l a pas couvert
- **Correction proposée** : Réutiliser le contrôle de session des formulaires de fiche personne et afficher le message de session expirée avec lien
- **Correction sans aval** : oui

#### `ARC-10` — Clients externes : entre minuit et 2 h à Paris (heure d été), la date du jour est refusée et la date par défaut est celle de la veille (jour UTC)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/artisan-dates-paris.test.ts : 21 cas SQL, tests/artisan-devis-jour-paris.test.ts : 3 cas, tests/correctifs-audit-13-octobre-rejeu.test.ts : 13 cas dont 2 fonctions ARC-10, 'sur les définitions d · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Heure de Paris entre 00:00 et 02:00 (01:47 le 14/10/2026 lors du test), facture avec solde
- **Étapes** : 1. Ouvrir /artisan/facturation/<facture> 2. Observer le champ « Date du règlement » 3. Saisir la date du jour à Paris (14/10/2026) en levant le plafond du champ
- **Attendu** : Date proposée = jour de Paris ; saisie du jour acceptée
- **Observé** : Valeur par défaut 2026-10-13 et plafond 2026-10-13 ; envoi du 14/10 refusé par le serveur : « Indiquez la date réelle du règlement, sans date future ». Même calcul UTC pour la date d accord du client (chantier). Recoupe l hypothèse FIN-13 (autre écran)
- **Preuve expurgée (banc)** : captures/c23-date-paris-vs-utc.png
- **Cause probable** : pages artisan/facturation/[factureId] et chantiers/[chantierId] : toISOString().slice(0,10) ; RPC artisan_reglement_ecrire et artisan_externe_ecrire : current_date (UTC)
- **Correction proposée** : Calculer la date du jour en Europe/Paris côté page et côté base ((now() at time zone Europe/Paris)::date)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-B-05` — Dépôt de deux fichiers identiques : un seul conservé, sans le dire

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur-b (auditeur/b) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Deux fichiers identiques dans un même envoi
- **Étapes** : Signaler un problème avec deux fois la même photo
- **Attendu** : Mention « une photo identique n'a été jointe qu'une fois » ou refus
- **Observé** : Trois photos envoyées dont deux PNG de contenu identique (l'une au nom hostile) : le signalement INC-2026-0003 n'a que deux documents, et l'écran de suivi ne mentionne aucun doublon écarté. Le comportement est voulu côté GED (empreinte anti-doublon) mais silencieux dans ce parcours.
- **Preuve expurgée (banc)** : preuves/auditeur/b/incident-accepte.png ; SQL : 2 documents photo_incident pour INC-2026-0003
- **Cause probable** : lib/photos-incident-reprise.ts / app/actions/incidents.ts (dédoublonnage par empreinte)
- **Correction proposée** : Afficher le nombre de pièces réellement jointes dans la confirmation
- **Correction sans aval** : oui

#### `AUD-C-06` — L'export CSV du journal ne neutralise pas les formules de tableur (hypothese a verifier)

- **Sévérité** : P3 · **Statut** : corrigée en branche — même défaut que CHF-04 : src/lib/csv-sur.ts + export du journal, tests/csv-sur.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un libelle, un nom de lot ou de personne commencant par =, +, - ou @
- **Étapes** : Lire comptabilite/export/route.ts : champ() retire ; et sauts de ligne mais pas le premier caractere.
- **Attendu** : Prefixe d'apostrophe ou espace devant les cellules a risque.
- **Observé** : Code lu ; aucun libelle de ce type n'existe sur le banc, donc non reproduit.
- **Preuve expurgée (banc)** : app/src/app/agence/[orgId]/comptabilite/export/route.ts
- **Cause probable** : champ() ne traite que ; \n \r.
- **Correction proposée** : Preceder d'une apostrophe toute valeur commencant par = + - @ ou tabulation.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `CAR-01` — La référence de tests candidate porte sur b9a7107, non sur la tête 9396669, et son parcours navigateur n'est pas vert

- **Sévérité** : P3 · **Statut** : corrigée en branche — batterie complète rejouée sur le SHA figé 0ad658a (4 207 tests, 168 parcours, audits 768 et 1440 px) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Journaux /tmp/cand5-*.log produits par scratchpad/outils/candidat5.sh ; dépôt en lecture seule.
- **Étapes** : 1. head -1 /tmp/cand5-etat.log (SHA de la chaîne) ; 2. git -C /home/user/GERIMMO_V4 rev-parse --short HEAD ; 3. git diff --stat b9a7107 HEAD ; 4. grep -E '^e2e:' /tmp/cand5-etat.log ; tail -6 /tmp/cand5-e2e.log
- **Attendu** : La référence qui accompagne la livraison est verte et porte sur le SHA livré.
- **Observé** : Chaîne exécutée sur b9a7107 (« arbre-propre:0 ») ; tête actuelle 9396669 ; la différence est app/e2e/personne-reprise.spec.ts seul (6 insertions, 2 suppressions). Le parcours navigateur de la chaîne se termine par « e2e:1 » : 161 réussis, 1 en échec (« fiche personne et justificatif : fermeture et création à 1440px »), 1 instable (même parcours à 390px), 1 ignoré. Le commit 9396669 corrige ce parcours mais aucun journal ne montre qu'il a été rejoué.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/tests.json (candidat5.etat, candidat5.e2e, diff_depuis_la_chaine) ; /tmp/cand5-etat.log ; /tmp/cand5-e2e.log
- **Cause probable** : Le correctif du parcours (commit 9396669) a été posé après la fin de la chaîne (04:02) ; aucun rejeu planifié.
- **Correction proposée** : Rejouer personne-reprise.spec.ts aux deux largeurs puis la suite complète au SHA final, et citer ce SHA dans la référence.
- **Correction sans aval** : oui

#### `CAR-03` — `.env.example` annonce « Neuf missions quotidiennes » alors que le code et vercel.json en comptent dix

- **Sévérité** : P3 · **Statut** : corrigée en branche — app/.env.example : « Dix missions » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Dépôt en lecture seule.
- **Étapes** : 1. sed -n 50p app/.env.example ; 2. grep -c 'mission=' app/vercel.json ; 3. sed -n 16,29p app/src/lib/missions.ts
- **Attendu** : Le commentaire donne le nombre réel de missions passant par /api/cron/equipes?mission=.
- **Observé** : Commentaire : « Neuf missions quotidiennes ». lib/missions.ts définit 10 missions (veille, appels, quittances, relances, rappels, abonnements, signatures, marketing, territoire, purge) et vercel.json en planifie 10 (+ l'orchestrateur = 11 crons). Aucune mission non planifiée, aucune planifiée inconnue.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/tests.json › missions_crons
- **Cause probable** : La dixième mission (veille) a été ajoutée sans mettre le commentaire à jour.
- **Correction proposée** : Écrire « Dix missions » (ou ne plus donner de nombre).
- **Correction sans aval** : oui

#### `CAR-11` — Le serveur du banc hérite d'un jeton GitHub du shell de lancement alors que l'application ne l'utilise pas

- **Sévérité** : P3 · **Statut** : corrigée en branche — scratchpad : serveur du banc lancé sans GITHUB_TOKEN (hygiène du banc, hors dépôt) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Serveur `next start` du banc (port 3100) ; lecture de /proc/<pid>/environ limitée aux NOMS et à l'état défini/vide (aucune valeur lue ni écrite).
- **Étapes** : 1. python3 scripts/04_transverse.py (env_du_serveur_banc) ; 2. lire donnees/transverse.json › variables[nom=GITHUB_TOKEN].definie_serveur_banc ; 3. grep -rn GITHUB_TOKEN app/src app/scripts
- **Attendu** : Le serveur de l'application ne porte que les variables que le code de src/ lit (Supabase, adresse du site, variables du banc).
- **Observé** : GITHUB_TOKEN est défini dans l'environnement du processus du serveur du banc ; il n'est lu que par scripts/deploiement/publier.mjs (publication contrôlée), jamais par app/src. Aucun chemin de l'application qui l'expose n'a été trouvé : c'est un défaut d'hygiène du banc, pas une fuite constatée. Hypothèse à vérifier : aucune page d'erreur ni journal du serveur n'imprime l'environnement.
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/transverse.json › variables (GITHUB_TOKEN : definie_serveur_banc = true) ; scripts/deploiement/publier.mjs:7
- **Cause probable** : Le serveur a été lancé depuis un shell qui exportait le jeton ; aucun nettoyage d'environnement au lancement (banc-up.sh).
- **Correction proposée** : Lancer le serveur du banc avec une liste blanche de variables (`env -i` + variables nécessaires) ; ne jamais poser de jeton d'écriture dans le shell du banc.
- **Correction sans aval** : oui

#### `LOC-01` — Dépôt d'une attestation déjà déposée : message technique générique au lieu de « ce fichier est déjà dans votre dossier »

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : locataire (chaine/1) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Locataire connecté, attestation d'assurance déjà déposée (ou même PDF présent dans le dossier du bail, par exemple le DPE ou le bail déposé par le propriétaire)
- **Étapes** : 1. /locataire/<org>/documents. 2. Choisir exactement le même fichier PDF déjà déposé. 3. Date d'expiration 30/06/2027. 4. Déposer.
- **Attendu** : Message explicite : ce document est déjà enregistré (ou remplacement silencieux)
- **Observé** : « Gerimmo n'a pas pu terminer cette action. Réessayez dans un instant ; si le problème continue, signalez-le depuis Aide et retours. » (l'index unique documents_empreinte_unique (organization_id, empreinte) rejette l'insertion et sansJargon masque la cause). Réessayer ne servira jamais. Reproduit 3 fois (simple clic, double clic, fichier déjà déposé par le propriétaire). Même racine que PROP-11 côté propriétaire.
- **Preuve expurgée (banc)** : preuves/chaine/1/captures/loc-01-doublon-fichier-message-generique.png ; SQL : index documents_empreinte_unique
- **Cause probable** : src/app/actions/attestation-locataire.ts : erreurRpc passé à sansJargon() sans traiter l'erreur 23505 ; index unique sur (organization_id, empreinte)
- **Correction proposée** : Capturer le code 23505 sur l'insertion et répondre « Ce fichier est déjà dans votre dossier » ; ou chercher l'empreinte avant le dépôt
- **Correction sans aval** : oui

#### `LOC-02` — Élision manquante : « Dernier document — quittance de octobre 2026 »

- **Sévérité** : P3 · **Statut** : corrigée en branche — 9978efa — « d'octobre » (espace locataire) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : locataire (chaine/1) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Mois commençant par une voyelle (octobre, avril, août)
- **Étapes** : Ouvrir l'accueil du locataire après une quittance d'octobre.
- **Attendu** : « quittance d'octobre 2026 »
- **Observé** : « quittance de octobre 2026 » sur la tuile Mes documents de l'accueil (même défaut d'élision que PROP-05 pour « Parc de Éloïse »).
- **Preuve expurgée (banc)** : preuves/chaine/1/captures/l1-mobile-accueil.png
- **Cause probable** : Gabarit de la tuile documents de l'accueil locataire (« quittance de {mois} »)
- **Correction proposée** : Utiliser une fonction d'élision (d'octobre / de mars)
- **Correction sans aval** : oui

#### `ART-11` — Quantité et taux de TVA écrits avec un point décimal (« 2.5 », « 5.5 % ») sur le PDF du devis et dans le détail vu par le propriétaire, alors que les montants et le sélecteur sont en virgule

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/devis-affichage-fr.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Devis avec une quantité décimale (2,5) et un taux 5,5 %
- **Étapes** : 1. Saisir 2,5 en quantité et choisir TVA 5,5 %. 2. Valider et générer le PDF. 3. Ouvrir la fiche de l'incident côté propriétaire avant de retenir le devis.
- **Attendu** : « 2,5 » et « 5,5 % » (typographie française, comme « 58,40 € » et le sélecteur de TVA)
- **Observé** : PDF : « 2.5 », « 5.5 % ». Côté propriétaire : « 2.5 × 58,40 € HT — TVA 10,00 % — 160,60 € TTC » (la quantité garde le point ; le taux est en virgule). Le texte vient de la description construite en SQL (deposer_devis_structure : quantité concaténée en texte brut).
- **Preuve expurgée (banc)** : preuves/chaine/1b/fichiers/devis-v1-artisan.pdf (texte extrait) ; preuves/chaine/1b/captures/o2-01-devis-recu.png
- **Cause probable** : supabase : fonction deposer_devis_structure (concaténation de (l->>'quantite')) et gabarit PDF app/api/devis/[sollicitationId]/pdf/route.ts : formatage fr-FR absent. Hypothèse de fichier, non vérifiée.
- **Correction proposée** : Formater la quantité et le taux en fr-FR dans le gabarit PDF et dans la description du devis.
- **Correction sans aval** : oui

#### `ART-12` — Quantité ou prix invalide (0, « abc », 12,345, -5) : le total reste à 0,00 € sans dire quel champ est en cause

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/devis-affichage-fr.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Formulaire de devis, étape 1
- **Étapes** : 1. Saisir quantité 0 puis « abc », prix 12,345 puis -5. 2. Observer le total.
- **Attendu** : Message sous le champ (ex. « deux décimales au plus », « quantité supérieure à zéro »)
- **Observé** : Total inchangé à 0,00 € et phrase générique « Le total se met à jour à mesure que les lignes se complètent » ; aucune erreur de champ avant la validation du PDF
- **Preuve expurgée (banc)** : sortie console du script scripts/a4.mjs (totaux 0,00 € pour chaque saisie invalide) ; preuves/chaine/1b/captures/a4-01-ligne-sans-tva.png
- **Cause probable** : app/artisan/lignes-devis.tsx : le calcul de calculerDevis échoue dans un try/catch vide quand une ligne est invalide (total laissé à 0,00 €).
- **Correction proposée** : Afficher une erreur de champ (aria-invalid + texte) dès que montantEnCentimes ou la quantité est invalide.
- **Correction sans aval** : oui

#### `ART-14` — Mobile 390 px : la fiche d'une demande de devis close et l'accueil artisan débordent horizontalement avec un nom de client long

- **Sévérité** : P3 · **Statut** : corrigée en branche — 611dce2 — en-tête du devis : min-width et retour à la ligne · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Client nommé « Parc de Éloïse [TEST-proprietaire] Durand-Lévêque » (49 caractères), mobile 390x844
- **Étapes** : 1. Ouvrir /artisan puis /artisan/devis/<sollicitation> en mobile. 2. Mesurer scrollWidth.
- **Attendu** : Aucun défilement horizontal, nom du client renvoyé à la ligne
- **Observé** : scrollWidth 473 px (fiche de demande close) et 448 px (accueil) pour 390 px de fenêtre ; l'en-tête .devis-module__entete (456 px) et la carte mission débordent. À rapprocher du nom très long : réel mais dépendant de la donnée (non reproduit avec « Agence Alpha »).
- **Preuve expurgée (banc)** : preuves/chaine/1b/captures/m2-01-artisan-accueil-debordement-mobile.png ; preuves/chaine/1b/captures/m1-01-artisan-devis-lecture-mobile.png
- **Cause probable** : Rangée flex de l'en-tête sans min-width:0 ni retour à la ligne (app/artisan/devis/[sollicitationId]/devis.module.css .entete / .client). Hypothèse de fichier, non vérifiée.
- **Correction proposée** : min-width:0 et flex-wrap sur .entete/.client, overflow-wrap:anywhere sur le nom du client.
- **Correction sans aval** : oui

#### `LOC-22` — Un locataire connecté qui ouvre /artisan arrive sur le formulaire d'inscription artisan

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : locataire (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Session locataire
- **Étapes** : Ouvrir /artisan, /artisan/missions/<id>, /artisan/facturation/<id>
- **Attendu** : Retour à l'espace du locataire (comme /agence/* et /admin) ou page « réservé aux artisans »
- **Observé** : Redirection vers /artisan/inscription alors que le compte est déjà un compte locataire ; aucune donnée d'artisan visible
- **Preuve expurgée (banc)** : sql/isolation-locataire-urls-stockage.txt
- **Cause probable** : app/src/app/artisan/acces.ts (verifierAccesArtisan redirige tout compte sans fiche artisan vers l'inscription)
- **Correction proposée** : Rediriger un compte déjà rattaché à un espace vers cet espace, ou afficher une page d'explication avant l'inscription
- **Correction sans aval** : oui

#### `PRO2-22` — Un propriétaire direct lit « privé à votre agence » sur la notation de l'artisan, et l'artisan lit « l'agence le tranchera » sur l'écart de facture (recoupe PROP-09)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/vocabulaire-proprietaire-direct.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : propriétaire n°2 (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Organisation de type propriétaire direct
- **Étapes** : Fiche incident > Noter l'artisan ; côté artisan, facture avec montant différent du devis
- **Attendu** : Vocabulaire du propriétaire (« privé à votre compte » / « le propriétaire le tranchera »)
- **Observé** : « Commentaire — privé à votre agence » ; « Le montant diffère du devis retenu : expliquez l'écart, l'agence le tranchera » ; côté API, le message « Aucune fiche rattachée à votre compte dans cette agence » (mon_conge_locataire) et « appartient à l'agence ou au propriétaire » (retenir_devis) ne sont pas lus par le locataire dans l'interface. Même famille que PROP-09 (libellés d'agence dans l'espace propriétaire direct) : à traiter avec elle
- **Preuve expurgée (banc)** : captures/o2-01-valider-facture.png, sql/isolation-locataire-ecritures.txt
- **Cause probable** : app/src/app/actions/artisan.ts (message 'l'agence le tranchera') ; formulaire de notation de l'incident
- **Correction proposée** : Adapter les libellés au type d'organisation (ou « votre interlocuteur »), en même temps que PROP-09
- **Correction sans aval** : oui

#### `CHF-04` — L'export CSV du livre recettes-dépenses ne neutralise pas les cellules commençant par =, +, - ou @ : un libellé « =1+1 » est exporté tel quel et sera évalué par le tableur.

- **Sévérité** : P3 · **Statut** : corrigée en branche — src/lib/csv-sur.ts + export du journal (commit 2235d73), tests/csv-sur.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Écriture dont le libellé commence par « = ».
- **Étapes** : 1. Livre > Ajouter une écriture, libellé « =1+1 ». 2. Ouvrir /comptabilite/export. 3. Lire la ligne.
- **Attendu** : Cellule préfixée (apostrophe ou espace) pour rester du texte.
- **Observé** : Ligne exportée : « 2026-10-14;2026-10-14;…;Divers formule;depense;1,00;=1+1;non; ». Risque limité au propriétaire direct (ses propres saisies), plus sérieux pour les journaux d'agence qui reprennent des libellés de tiers.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/captures/export-livre.csv
- **Cause probable** : app/src/app/agence/[orgId]/comptabilite/export/route.ts (fonction champ(), ne retire que ; et sauts de ligne)
- **Correction proposée** : Préfixer d'une apostrophe tout champ texte commençant par = + - @ ou tabulation.
- **Correction sans aval** : oui

#### `PUB-02` — Offre agence présentée au public alors que les agences sont hors périmètre V1 publique : accueil (repères, espaces, bandeau tarif, FAQ), tarifs, connexion, inscription artisan, choix d'espace, pied d…

- **Sévérité** : P3 · **Statut** : corrigée en branche — commit e7982a7 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : public (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : aucune présentation publique de l'offre agence en V1 ; composants et code conservés
- **Observé** : captures « avant » : accueil bureau et mobile, tarifs, connexion mobile (« Agence ? Demander un devis »)
- **Preuve expurgée (banc)** : scratchpad/preuves/avant/*.png
- **Correction proposée** : retrait des mentions publiques ; grille agence (lib/tarifs.ts), TableauAgences et espace /agence conservés
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PUB-04` — La mention de taxes de l'accueil et des tarifs citait encore les agences (« pour les particuliers comme pour les agences »)

- **Sévérité** : P3 · **Statut** : corrigée en branche — 35b0ae8 — phrase de taxes sans agences, 4 tests · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : coordinateur (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : Aucune mention d'agence sur le site public de la V1
- **Observé** : Relevé par comparaison des captures avant/après des pages publiques : les seules occurrences d'« agence » restantes sont la phrase de TVA (accueil et tarifs) et « sans agence » sur l'inscription
- **Preuve expurgée (banc)** : preuves/apres/rapport-apres.json et captures preuves/avant, preuves/apres ; app/src/lib/tarifs.ts mentionTaxesPubliques
- **Cause probable** : app/src/lib/tarifs.ts : phrase partagée entre accueil et tarifs, écrite pour les deux publics
- **Correction proposée** : La phrase ne nomme plus les agences par défaut ; option agences pour une réactivation
- **Correction sans aval** : oui

#### `DES-A-02` — La page de confirmation de lien e-mail (/auth/confirmer) annonce encore « pour les agences », alors que /connexion a été nettoyée

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/vocabulaire-v1-parcours.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Aucune session ; largeur ≥ 768 px (panneau de marque visible)
- **Étapes** : 1. Ouvrir /auth/confirmer. 2. Lire la phrase sous la promesse du panneau de gauche. 3. Comparer à /connexion.
- **Attendu** : Même formulation V1 sur toutes les pages d'authentification : « … pour les propriétaires bailleurs, leurs locataires et les artisans. »
- **Observé** : /auth/confirmer : « Baux, quittances, régularisations, rapports de gestion et interventions — pour les agences, les propriétaires bailleurs, leurs locataires et les artisans. » ; /connexion : même phrase sans « les agences ». Le site public est par ailleurs sans mention d'agence hors pages juridiques (relevé automatique des 21 pages publiques × 3 largeurs).
- **Preuve expurgée (banc)** : journaux/auto-public-1280.json (mesure.mentionsAgence de /auth/confirmer) ; auto/public/auth-confirmer-1280.png
- **Cause probable** : app/src/app/auth/confirmer/page.tsx:50 (sousPromesse) non alignée sur app/src/app/connexion/page.tsx:17
- **Correction proposée** : Remplacer « pour les agences, les propriétaires bailleurs » par « pour les propriétaires bailleurs » dans app/src/app/auth/confirmer/page.tsx:50.
- **Correction sans aval** : oui

#### `DES-A-03` — Espace locataire : les titres de carte sont des <h3> directement sous le <h1> (aucun <h2>) sur toutes les pages

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/titres-hierarchie-espaces.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte locataire (locataire.pd@gerimmo-demo.fr et locataire.alpha@…), n'importe quelle largeur
- **Étapes** : Lancer axe-core sur /locataire/<id>, /loyers, /documents, /demandes, /contact, /logement, /incident, /compte, /espaces
- **Attendu** : Hiérarchie h1 > h2 > h3 (navigation par titres au lecteur d'écran, WCAG 1.3.1 / bonne pratique heading-order)
- **Observé** : Règle heading-order (modérée) sur 16 des 24 écrans locataire relevés à 1280 px (deux comptes) ; app/src/app/locataire compte 25 balises <h3> et 0 <h2>. Même défaut, plus rare, côté propriétaire (profil, documents, parc/import, comptabilite/reprise : h3 sans h2).
- **Preuve expurgée (banc)** : journaux/auto-locataire+locataire_pd-1280.json (champ axe) ; journaux/auto-proprietaire-1280.json
- **Cause probable** : app/src/app/locataire/[orgId]/page.tsx:365, loyers/page.tsx:165,255,268,413 etc. : <h3 className="text-base font-medium"> dans .entete-carte
- **Correction proposée** : Passer ces <h3> en <h2> en conservant les classes (vérifier d'abord qu'aucune règle CSS ne cible `.entete-carte h3` ou `.loc-carte h3` ; sinon dupliquer le sélecteur pour h2).
- **Correction sans aval** : oui

#### `DES-A-04` — Fiche d'un bien : la liste de définitions des chiffres clés est mal formée (dl > div > div > dt)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire, fiche d'un bien avec au moins un lot
- **Étapes** : axe-core sur /agence/<id>/parc/<bienId>
- **Attendu** : <dl> dont les groupes <div> ne contiennent que des <dt>/<dd> : le lecteur d'écran annonce « terme / définition »
- **Observé** : axe : definition-list (1 nœud) + dlitem (8 nœuds), impact « serious » : « dl element has direct children that are not allowed: div > div » ; le <div> de groupe contient l'icône SVG et un <div> enveloppant dt/dd.
- **Preuve expurgée (banc)** : journaux/auto-proprietaire-1280.json (/parc/<id>, axe.definition-list et dlitem)
- **Cause probable** : app/src/app/agence/[orgId]/parc/[bienId]/page.tsx:280-288 : `<div key><IconeTrait/><div><dt/><dd/></div></div>`
- **Correction proposée** : Aplatir : `<div key={f.label}><dt><IconeTrait nom={f.icone}/>{f.label}</dt><dd>{f.valeur}</dd></div>` et ajuster .bien-visuel-chiffres si la mise en page dépend du <div> intermédiaire.
- **Correction sans aval** : oui

#### `DES-A-05` — Tablette (641-860 px) : les libellés du rail du menu locataire sont à 9,5 px, sous la métrique commune de 11 px de la charte

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte locataire, viewport 768×1024
- **Étapes** : Ouvrir /locataire/<id> à 768 px et lire le rail de gauche (Accueil, Documents, Paiements…)
- **Attendu** : Libellés ≥ 10,5 px comme la barre basse mobile du propriétaire (.coquille-basse : 10,5 px) et le commentaire de la charte (« jamais sous 11 px »)
- **Observé** : span.lib 9,5 px (« Accueil », « Mon logement ») relevé sur 18 écrans locataire ; en 390 px la barre basse locataire utilise 10,5 px. Cible tactile voisine : le lien « Accueil de mon espace » de l'en-tête locataire fait 111×24 et 177×24 px à 390 px (< 44 px).
- **Preuve expurgée (banc)** : journaux/auto-locataire+locataire_pd-768.json (mesure.textesPetitsEx) ; journaux/auto-locataire+locataire_pd-390.json (ciblesMoins44Ex)
- **Cause probable** : app/src/app/globals.css:1450-1455 (.loc-menu .lib { font-size: 9.5px })
- **Correction proposée** : font-size: 10.5px à globals.css:1452 (vérifier que « Mon logement » tient dans le rail de 78 px) ; donner au lien d'accueil de l'en-tête locataire un min-height de 44 px (padding vertical).
- **Correction sans aval** : oui

#### `DES-A-12` — Après une erreur de formulaire, le focus tombe sur <body> et les deux mots de passe sont vidés ; deux pages d'authentification partagent le même titre ; la 404 publique propose « Retour à mon espace »

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/formulaires-auth-focus-titres.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Visiteur non connecté, 390×844
- **Étapes** : 1. /inscription : saisir deux mots de passe différents et envoyer. 2. /connexion : mauvais mot de passe. 3. Ouvrir /nouveau-mot-de-passe et /page-inexistante-x.
- **Attendu** : Le focus va sur le message d'erreur ou le premier champ en défaut ; les champs sans erreur sont conservés ; chaque page a un titre propre ; la 404 d'un visiteur propose « Retour à l'accueil »
- **Observé** : Inscription : alerte role=alert « Les deux saisies ne correspondent pas. » (bien annoncée), mais document.activeElement = BODY et les champs mot de passe/confirmation sont vides (nom, e-mail et CGU conservés). Connexion en échec : « Identifiants invalides. » et focus sur BODY. <title> « Connexion — Gerimmo » identique sur /connexion et /nouveau-mot-de-passe. 404 publique : bouton « Retour à mon espace ».
- **Preuve expurgée (banc)** : etats/inscription-confirmation-differente-390.png ; etats/public-journal.json ; journaux/auto-public-390.json (titres identiques) ; avant/public/page-introuvable-390.png
- **Cause probable** : Formulaires d'authentification (actions serveur sans gestion du focus) ; titres définis dans app/src/app/nouveau-mot-de-passe/page.tsx ; page not-found partagée
- **Correction proposée** : Après erreur : focus() sur le conteneur role=alert (tabIndex -1) ; metadata.title = « Nouveau mot de passe — Gerimmo » ; libellé « Retour à l'accueil » quand il n'y a pas de session.
- **Correction sans aval** : oui

#### `DES-A-14` — Tablette (641-860 px) : le nom de l'espace du locataire est tronqué en « Par… » dans la cellule de logo du rail

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte locataire d'un propriétaire direct (« Parc de Claire Moreau »), viewport 768×1024
- **Étapes** : Ouvrir /locataire/<id> à 768 px, lire le coin supérieur gauche
- **Attendu** : Le nom de l'espace lisible ou remplacé par des initiales/le logo
- **Observé** : Tuile blanche de 56 px avec « Par… » ; le nom complet n'apparaît nulle part sur l'écran (l'en-tête affiche seulement le nom du locataire). Même nom complet visible à 390 px et 1280 px.
- **Preuve expurgée (banc)** : avant/locataire/accueil-768.png ; planches/p768-a.png
- **Cause probable** : app/src/app/globals.css:1011-1013 (.loc-logo dans la bande tablette : le libellé n'est masqué que par endroits, le nom reste affiché sur 56 px)
- **Correction proposée** : Dans la bande 641-860 px masquer le nom (display: none) comme à 1011-1013 et afficher les initiales, ou autoriser le nom en en-tête de page.
- **Correction sans aval** : oui

#### `DES-A-15` — Formulaire « Déclarer un incident » (propriétaire) : l'option d'urgence est coupée à 390 px (« …attendre quelques jour »)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/libelles-courts-et-bandeau-390.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire, 390×844
- **Étapes** : Ouvrir /agence/<id>/incidents/nouveau et lire le champ « Urgence » fermé
- **Attendu** : Valeur affichée lisible en entier (un <select> ne retourne pas à la ligne)
- **Observé** : « Normal — peut attendre quelques jour » : la fin du libellé est masquée par le chevron, le « s » de « jours » disparaît
- **Preuve expurgée (banc)** : auto/proprietaire/agence-3c1d1e95-3570-400b-8012-44530be145b1-incidents-nouveau-390.png ; planches/p390-fin-inc.png
- **Cause probable** : app/src/app/agence/[orgId]/incidents/nouveau/formulaire-incident.tsx:125 (libellé long) ; même schéma côté locataire formulaire-incident-locataire.tsx:371
- **Correction proposée** : Raccourcir : « Normal — sous quelques jours » (ou « Normal — quelques jours ») ; garder le détail dans une aide sous le champ.
- **Correction sans aval** : oui

#### `DES-B-04` — Clients externes : « Archiver ce client » s'exécute au premier clic, sans confirmation, avec le style du bouton principal

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-04 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan.alpha, module clients externes actif (banc), client de test « [TEST-designer-b] Client Nettoyage »
- **Étapes** : 1. Ouvrir la fiche du client (390 px). 2. Appuyer une fois sur « Archiver ce client ».
- **Attendu** : Action de rangement distinguée du bouton « Enregistrer les coordonnées » (secondaire ou danger) et confirmée, ou au minimum annonçant clairement sa réversibilité
- **Observé** : Les deux boutons sont deux bandeaux bleu nuit pleine largeur identiques (min-h-14). Un clic envoie immédiatement l'archivage (1 POST, aucune boîte de confirmation) ; la fiche affiche « Archivé » et « Réactiver ce client » : l'action est réversible, mais rien ne le dit avant le clic.
- **Preuve expurgée (banc)** : etats/client-fiche-avant-archivage-390.png ; etats/client-apres-archivage-390.png ; etats/clients-archive-journal.json
- **Cause probable** : app/src/app/artisan/clients/[clientId]/page.tsx:11 (bouton d'archivage rendu avec la même classe que le bouton principal, sans confirmation)
- **Correction proposée** : Passer « Archiver ce client » en secondaire (btn contour) et ajouter la phrase « Vous pourrez le réactiver à tout moment. » au-dessus ; une confirmation modale n'est utile que si la réactivation n'est pas immédiate
- **Correction sans aval** : oui

#### `DES-B-05` — Modules clients externes et règlements déclarés : composants hors charte (liens soulignés en guise de boutons, pastilles redondantes, liens de liste de 19 px)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-05, app/tests/titres-de-page.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan.alpha, modules actifs (banc), 390 et 1280 px
- **Étapes** : Ouvrir /artisan/clients, /artisan/devis/nouveau, /artisan/clients/<id>, /artisan/facturation
- **Attendu** : Boutons, liens et en-têtes de la charte (cartes à icône, .btn-secondaire, cibles 44 px) ; une seule navigation
- **Observé** : (1) Cinq pastilles « Clients externes · Nouveau chantier et devis · Agenda · Facturation · Exporter mon registre » en tête de chaque sous-page : elles répètent le menu latéral (1280 px) et la page courante y figure comme un lien comme un autre ; (2) « Rechercher » et « Choisir » sont des boutons-liens soulignés, sans fond ni bordure ; (3) les noms de clients de la liste sont des <a> en ligne : la classe min-h-12 est sans effet, hauteur mesurée 19 px (« [TEST-artisan] Idempotence ») ; (4) en tête de /artisan/facturation, le bloc « Mes règlements déclarés » liste les factures en liens soulignés cernés d'un filet, sans l'iconographie des autres cartes de la page ; (5) /artisan/clients est titré « Clients externes — Artisan » alors que le reste du portail dit « — Espace artisan », et /artisan/devis/nouveau et /artisan/clients/<id> gardent le titre générique « Espace artisan — Gerimmo ». Rec…
- **Preuve expurgée (banc)** : etats/mesures-clients.json ; auto/artisan/artisan-clients-390.png ; auto/artisan/artisan-clients-1280.png ; auto/artisan/artisan-facturation-1280.png ; auto/artisan/artisan-agenda-390.png ; journaux/auto-artisan-1280.json (mesure.titre)
- **Cause probable** : app/src/app/artisan/clients/elements.tsx:9-11 (NavigationPrivee) ; app/src/app/artisan/clients/page.tsx:7 (metadata) et :11 (liens min-h-12 en ligne, boutons underline) ; app/src/app/artisan/devis/nouveau/page.tsx (pas de metadata)
- **Correction proposée** : Masquer NavigationPrivee à partir de 1024 px (le rail latéral suffit) ; remplacer `min-h-12 underline` par `inline-flex min-h-12 items-center underline` sur les liens de liste (cible 48 px) ; boutons « Rechercher » et « Choisir » en classe de bouton secondaire de la charte ; metadata « Clients externes — Espace artisan » et titres propres pour /devis/nouveau et /clients/<id>
- **Correction sans aval** : oui

#### `DES-B-06` — Artisan qui vient de s'inscrire : trois bandeaux au même sens et trois appels au dépôt d'une pièce sur la même page

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-06 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte neuf « [TEST-designer-b] Plomberie Neuve » (inscription par l'interface), 390x844
- **Étapes** : 1. Terminer /artisan/inscription (fiche). 2. Observer /artisan/attestations à l'arrivée.
- **Attendu** : Un seul message d'état, un seul appel principal
- **Observé** : Bandeau orange du haut « Inscription en cours de validation par Gerimmo… », bandeau vert « Votre entreprise est inscrite. Déposez maintenant votre décennale… », bandeau orange « Votre inscription est examinée par Gerimmo. Elle ne sera validée qu'au vu de vos justificatifs. » ; puis le bouton « Déposer un document », cinq boutons « Déposer » et la carte « Prochaine action » : sept chemins pour la même action sur 2 400 px de page.
- **Preuve expurgée (banc)** : etats/neuf/apres-inscription-390.png ; etats/neuf/inscription3-journal.json
- **Cause probable** : app/src/app/artisan/layout.tsx:166 (bandeau d'attente de la coquille) ; app/src/app/artisan/attestations/page.tsx:32 (« Votre entreprise est inscrite… ») et :33 (« Votre inscription est examinée… »)
- **Correction proposée** : Garder le bandeau de la coquille (valable sur toutes les pages) et le message de bienvenue de attestations/page.tsx:32 ; supprimer l'avertissement redondant de attestations/page.tsx:33
- **Correction sans aval** : oui

#### `DES-B-07` — Titres de page (<title>) incohérents dans l'espace artisan et la supervision

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/titres-de-page.test.ts : 2 × · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Comptes artisan.alpha et superadmin, 1280 px
- **Étapes** : Relever document.title des écrans de la matrice
- **Attendu** : Un suffixe unique par espace
- **Observé** : Super-admin : « — Gerimmo », « — Supervision », « — Supervision Gerimmo », « — Console Gerimmo » ; le détail d'une organisation (H1 « Agence Alpha ») s'intitule « Client — Gerimmo » ; /admin/brief/exploitation « Le point du matin — détail — Gerimmo ». Artisan : voir DES-B-05 (5).
- **Preuve expurgée (banc)** : journaux/auto-superadmin-1280.json (mesure.titre) ; journaux/auto-artisan-1280.json
- **Cause probable** : export const metadata de chaque page sous app/admin (suffixes écrits à la main)
- **Correction proposée** : Un gabarit title `%s — Gerimmo` dans app/admin/layout.tsx (metadata.title.template) et suppression des suffixes locaux
- **Correction sans aval** : oui

#### `DES-B-08` — Super-admin sur mobile : résumés repliables de 20 à 28 px de haut, barre d'enregistrement collante qui masque le champ focalisé, bouton flottant hors repère

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-08 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte superadmin, 390x844
- **Étapes** : 1. Ouvrir /admin/artisans, /admin/journaux, /admin/relais (résumés repliables, pagination). 2. Ouvrir /admin/publications/16606eda-… et appuyer sur Tab jusqu'à « Titre ».
- **Attendu** : Cibles >= 44 px ; champ focalisé visible
- **Observé** : (1) 11 écrans d'administration à 390 px portent des <summary> de 20 à 28 px de haut (« Refuser cette inscription » 324x20, « Suspendre la validation » 324x20, « Historique des réponses » 324x20, « Comprendre ces chiffres » 324x24) ; « Suivant » de la pagination du journal fait 47x20 et les liens de communes de /admin/couverture 14 px de haut. (2) Sur /admin/publications/<id>, le champ « Titre » (706-750) est entièrement recouvert par la barre collante « Enregistrer » (688-800, position sticky) quand il reçoit le focus au clavier : l'élément à son centre est button.btn-or de cette barre. (3) Le bouton fixe « Aide et retours » (a.fixed.z-30.size-11, 44x44) est hors de tout repère de page : axe signale la règle « region » (modérée) sur 81 relevés.
- **Preuve expurgée (banc)** : journaux/auto-superadmin-390.json (mesure.ciblesMoins44Ex, clavier.masques) ; etats/sa-focus-titre-publication-390.png ; etats/sa-synthese-journal.json (bouton « Aide et retours »)
- **Cause probable** : app/src/app/admin/publications/[id]/editeur-publication.tsx:230 (sticky bottom-[calc(72px+safe-area)] : le décalage de 72 px prévu pour une barre basse inexistante en administration) ; <summary class="cursor-pointer"> sans hauteur minimale (app/src/app/admin/**) ; bouton flottant sans repère
- **Correction proposée** : editeur-publication.tsx:230 → ajouter `scroll-mt`/`scroll-padding-bottom` : sur le formulaire `scroll-padding-bottom: 140px` (hauteur de la barre + marge) pour que le focus s'aligne au-dessus ; `summary { min-height: 44px; display: flex; align-items: center }` dans la feuille d'admin ; envelopper le bouton flottant dans <aside aria-label="Aide">
- **Correction sans aval** : oui

#### `DES-B-09` — Compte artisan : « toutes les agences » dans la page Sécurité du compte (vocabulaire d'agence dans la V1)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/vocabulaire-v1-parcours.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan.alpha
- **Étapes** : Ouvrir /compte
- **Attendu** : Aucune notion d'agence dans le parcours artisan de la V1 (propriétaires bailleurs et artisans)
- **Observé** : « L'adresse de connexion ne se change pas depuis cet écran : elle identifie votre compte auprès de toutes les agences. » ; /assistance affiche aussi « l'administrateur de l'agence concernée » (DES-A-07). Les cartes d'intervention montrent le nom de l'organisation cliente (« Agence Alpha ») : c'est une donnée du banc, pas un libellé.
- **Preuve expurgée (banc)** : journaux/auto-artisan-1280.json (mesure.mentionsAgence, /compte et /assistance)
- **Cause probable** : app/src/app/compte/page.tsx:158 (branche estArtisan)
- **Correction proposée** : « … elle identifie votre compte auprès de tous vos clients. Pour la modifier, écrivez-nous depuis Aide et retours. »
- **Correction sans aval** : oui

#### `DES-B-11` — Super-admin, Relais : le bandeau « Habilitation perdue : tâches bloquées » est posé en ligne sur le texte qui le précède, et chevauche l'adresse du responsable à 390 px

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/libelles-courts-et-bandeau-390.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte superadmin, 390x844, un plan de vacances dont le responsable a perdu son habilitation (donnée du banc)
- **Étapes** : Ouvrir /admin/relais et lire la carte du plan « [TEST-superadmin] Vacances essai — version 1 »
- **Attendu** : Le signalement forme sa propre ligne sous « Responsable : … »
- **Observé** : L'adresse sa.relais.test@gerimmo-demo.fr passe à la ligne ; le filet rouge de gauche et le fond rosé du <strong class="err"> en ligne viennent se placer contre « demo.fr » et sur sa ligne (recadrage 2x). Plus bas, la phrase « …remontée au créateur du plan après 1 minutes » est affichée au pluriel sur la build servie ; la source actuelle (vacances.tsx:12) gère déjà le singulier : à revérifier sur la prochaine build.
- **Preuve expurgée (banc)** : auto/superadmin/admin-relais-390.png ; etats/relais-recadrage-390.png
- **Cause probable** : app/src/app/admin/relais/vacances.tsx:12 (<strong className="err"> … Habilitation perdue : tâches bloquées</strong> rendu dans la même ligne, classe .err avec filet et fond)
- **Correction proposée** : vacances.tsx:12 → `<strong className="err block mt-1">Habilitation perdue : tâches bloquées</strong>` (sans le tiret cadratin)
- **Correction sans aval** : oui

#### `IA-08` — Le commentaire de la tâche territoire dit 'mensuelle, le 1er' alors qu'elle est planifiée chaque jour

- **Sévérité** : P3 · **Statut** : corrigée en branche — commentaire de app/src/app/api/cron/territoire/route.ts corrigé (vague 6) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Code au commit 83ba492
- **Étapes** : Lire territoire/route.ts:2-9, vercel.json:27-30, sante-service.ts:344
- **Attendu** : Un commentaire de tête décrit la planification réelle
- **Observé** : Constat statique : planification '0 5 * * *' (quotidienne) ; Santé la classe quotidienne ; la clé de préparation (YYYY-MM:département:public) rend l'effet mensuel.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-08/09)
- **Cause probable** : app/src/app/api/cron/territoire/route.ts:2-9
- **Correction proposée** : Corriger le commentaire : 'quotidienne ; la préparation est limitée à une par mois, département et public'
- **Correction sans aval** : oui

#### `IA-10` — La page wiki 'Gerimmo en autonomie' est périmée : 4 tâches quotidiennes, 'vercel.json ne fixe aucune région', ronde quotidienne 'à armer'

- **Sévérité** : P3 · **Statut** : corrigée en branche — wiki : page Gerimmo en autonomie marquée historique, renvoi vers l'inventaire à jour (commit de la vague 7) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Wiki au commit 83ba492
- **Étapes** : 1. Lire wiki/syntheses/Gerimmo en autonomie.md (lignes 77, 163-169, 225) ; 2. Lire app/vercel.json:3-5 et 6-51 ; 3. Lire wiki/regles-metier/Registre des traitements.md (région cdg1 fixée le 20/09)
- **Attendu** : Le wiki décrit l'état du code ou signale ce qui a changé
- **Observé** : La page (statut draft, mise à jour 29/09) contredit le code (11 tâches, région cdg1) et le Registre des traitements.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-10)
- **Cause probable** : Page non remise à jour après les évolutions des 20 au 29/09
- **Correction proposée** : Mettre à jour la page ou la marquer 'historique', avec renvoi vers propositions.md une fois le dirigeant d'accord
- **Correction sans aval** : oui

#### `PRF-01` — Page de connexion : décalage de mise en page (CLS 0,212) sur mobile avec réseau lent

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/connexion-squelette-cls.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Visiteur anonyme ; Chromium 390×844 mobile ; cache vide ; réseau émulé 1,6 Mbit/s, 150 ms (ou processeur ×4) ; version candidate sur 3100. Sans étranglement, CLS = 0.
- **Étapes** : 1. Ouvrir /connexion avec le réseau émulé. 2. Relever les layout-shift (PerformanceObserver) et capturer l'écran à 1,3 s puis à la fin du chargement.
- **Attendu** : CLS ≤ 0,1 ; le titre « Connexion » ne bouge pas pendant que le formulaire arrive.
- **Observé** : CLS 0,212 sur 3 essais sur 3 avec réseau lent seul, 1 essai sur 3 avec processeur ×4 seul, 0 sans étranglement. Au premier affichage (FCP ≈ 1,15 s) seuls le titre et le chapeau sont affichés, centrés à mi-hauteur (y ≈ 430) ; vers 2,3 s le logo, le formulaire et les liens arrivent et le bloc remonte (carte [25,325,340,194] → [25,105,340,633]). Seule page publique concernée sur 18 testées sous réseau lent.
- **Preuve expurgée (banc)** : preuves/perf-liens/cls-connexion-sortie.txt ; preuves/perf-liens/cls-connexion2-sortie.txt ; preuves/perf-liens/cls-connexion-intermediaire-5.png ; preuves/perf-liens/cls-connexion-final.png ; preuves/perf-liens/cls-public-reseau-lent-390.json
- **Cause probable** : Arbre de travail (à confirmer sur le commit servi) : app/src/app/connexion/page.tsx:24-27, <Suspense> sans repli autour de FormulaireConnexion (useSearchParams) ; conteneur centré verticalement app/src/components/coquille-auth.tsx:62 (flex items-center justify-center). Le formulaire n'est pas dans le premier flux et le contenu déjà affiché est recentré à son arrivée.
- **Correction proposée** : Donner au <Suspense> un repli de même hauteur (squelette du formulaire), ou lire les paramètres d'URL côté serveur pour rendre le formulaire dans le premier flux ; à défaut aligner le bloc en haut sur mobile. Revérifier avec le même profil réseau.
- **Correction sans aval** : oui

#### `PRF-06` — Page « Compte » : le lien « le lien reçu par email » renvoie l'utilisateur connecté à son accueil sans explication

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Sessions locataire et agent (écran /compte de la matrice).
- **Étapes** : 1. Ouvrir /compte. 2. Cliquer « le lien reçu par email » dans la phrase « Mot de passe perdu et session fermée ? Il reste le lien reçu par email. » (href=/mot-de-passe-oublie).
- **Attendu** : Le lien aboutit à un écran utile, ou n'est pas un lien tant que la session est ouverte.
- **Observé** : /mot-de-passe-oublie renvoie un utilisateur connecté vers son accueil (locataire : /locataire/<org>, agent : /agence/<org>) : le clic n'a aucun effet visible. Constaté pour locataire et agent ; propriétaire et artisan non relevés (/compte absent de la matrice pour eux).
- **Preuve expurgée (banc)** : preuves/perf-liens/lien-compte-lien-mdp.png ; preuves/perf-liens/liens-resultats.json (entrées /mot-de-passe-oublie) ; preuves/perf-liens/liens.md
- **Cause probable** : Page /compte (texte du lien) ; la redirection est faite par app/src/app/mot-de-passe-oublie/page.tsx pour tout utilisateur connecté (non relu en détail).
- **Correction proposée** : Retirer le lien de la phrase (texte seul) ou le remplacer par une consigne (« déconnectez-vous puis utilisez Mot de passe oublié »).
- **Correction sans aval** : oui

#### `PRF-09` — Lien factice href="#" « Retour à mes fiches » (annuaire des personnes)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Profils propriétaire, administrateur, agent ; /agence/<id>/personnes ; section « Créer une fiche ».
- **Étapes** : 1. Relever les liens de /personnes. 2. Observer le lien « Retour à mes fiches » (masqué tant que « Créer une fiche » n'est pas ouvert).
- **Attendu** : Un vrai lien (ou un bouton) pour revenir à la liste.
- **Observé** : Lien <a href="#"> avec gestionnaire JavaScript : fonctionne avec JavaScript, mais sans JavaScript, avec un clic du milieu ou une lecture par lecteur d'écran, il ne mène nulle part. Non constaté comme panne par un utilisateur : lien masqué par défaut (non visible à 390 et 1280 px dans l'état initial).
- **Preuve expurgée (banc)** : preuves/perf-liens/exp6-sortie.txt ; preuves/perf-liens/liens.md
- **Cause probable** : app/src/app/agence/[orgId]/personnes/vue-personnes.tsx:38.
- **Correction proposée** : Remplacer par <button type="button"> ou par un lien vers l'URL de la liste.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PROP-04` — Surface démesurée : message technique « numeric field overflow » affiché à l'utilisateur

- **Sévérité** : P3 · **Statut** : corrigée en branche — d6ef891 — surface bornée à 9 999,99 m² avec message clair · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : /parc/nouveau étape lot
- **Étapes** : surface 999999 m², 2 pièces, Créer le lot
- **Attendu** : message métier (surface maximale plausible)
- **Observé** : « La création n’a pas pu être confirmée : numeric field overflow. Vos saisies sont conservées. Réessayez… »
- **Preuve expurgée (banc)** : sortie de s2c.mjs (surface_enorme) ; colonne lots.surface_m2 numeric(7,2)
- **Cause probable** : pas de borne max côté formulaire ; l'erreur Postgres est relayée (sansJargon laisse passer « numeric field overflow »)
- **Correction proposée** : max=9999.99 dans le champ et message dédié
- **Correction sans aval** : oui

#### `PROP-06` — La page /connexion présente encore l'offre agence alors que les agences sont hors V1 publique

- **Sévérité** : P3 · **Statut** : corrigée en branche — commit e7982a7 (/connexion sans offre agence) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : visiteur anonyme
- **Étapes** : ouvrir /connexion
- **Attendu** : aucune mention publique des agences (périmètre V1 : propriétaires, locataires, artisans)
- **Observé** : texte « … pour les agences, les propriétaires bailleurs, leurs locataires et les artisans », « Agence, propriétaire, locataire ou artisan », lien « Agence ? Demander un devis » vers /#agences
- **Preuve expurgée (banc)** : sortie de x.mjs (texte de /connexion) ; page /auth/confirmer de même
- **Cause probable** : textes de la page de connexion non mis à jour (peut déjà être couvert par la correction « agences hors site public V1 » en cours)
- **Correction proposée** : retirer les mentions et le lien agence de /connexion et /auth/confirmer
- **Correction sans aval** : oui

#### `PROP-09` — Libellés d'agence ou de permission dans l'espace propriétaire direct

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/vocabulaire-proprietaire-direct.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : compte propriétaire direct (membership proprietaire_direct)
- **Étapes** : fiche lot archivé ; assistant fiche personne
- **Attendu** : vocabulaire propriétaire (pas d'« agence », pas de mention de permission dans un bouton)
- **Observé** : bouton « Réactiver (réservé au responsable) » (le propriétaire direct est le responsable) ; champ « Rattacher à un lot de l’agence — Facultatif » dans l'assistant de création de fiche
- **Preuve expurgée (banc)** : captures/s2-24-lot-archive-reactiver.png ; sortie x-decrire /personnes (champ p-lot)
- **Cause probable** : libellés partagés avec l'espace agence (boutons-etat-lot.tsx:32)
- **Correction proposée** : libellé « Réactiver » ; « Rattacher à un lot » pour le propriétaire direct
- **Correction sans aval** : oui

#### `FIN-05` — « Montant net à qualifier » additionne recettes et dépenses non qualifiées en valeurs positives : ce n'est pas un net.

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/finance-textes-fiscal.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un loyer de 900 € et une dépense de 800 € non qualifiés : l'écran affiche « Montant net des pièces ou parts à qualifier : 1 700 € » et le CSV exporte « HORS TOTAL ; Montant net à qualifier ; 1700,00 » ; le net réel serait +100 €. Le chiffre sert de repère d'effort restant mais est mal nommé dans un export destiné à la déclaration.
- **Preuve expurgée (banc)** : preuves/relecture/finance/ts/t5.mts (sortie : aQualifier = 1700 et ligne CSV correspondante)
- **Cause probable** : app/src/lib/fiscal.ts:36 (fonction inconnue) ; app/src/lib/fiscal-export.ts ligne 14-15
- **Correction proposée** : Renommer « Montant brut des pièces à qualifier » ou séparer recettes et dépenses à qualifier (deux totaux signés).
- **Correction sans aval** : oui

#### `FIN-06` — « Retrouver la ventilation historique » annonce un succès sans rien changer quand la pièce a déjà une capture avec une part non ventilée (avance).

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/finance-textes-fiscal.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Paiement de 700 € pour un appel de 540 € : la capture porte 500 + 40 et 160 € non ventilés ; la pièce reste dans la liste « Qualifier les pièces » avec le bouton « Retrouver la ventilation historique ». La fonction retourne l'identifiant dès qu'une capture existe (ligne 162), l'action affiche « Ventilation historique retrouvée et conservée avec les références des pièces. » alors que la part non ventilée est inchangée.
- **Preuve expurgée (banc)** : preuves/relecture/finance/sql/t11_retrouver_faux_succes.sql (avant/après identiques, 160,00 non ventilés)
- **Cause probable** : app/supabase/migrations/20261012224000_fiscalite_historique_qualifiee.sql et app/src/components/formulaires-fiscaux.tsx:migration 162 ; composant ligne 12
- **Correction proposée** : Ne proposer le bouton que si aucune capture n'existe ; ou faire renvoyer à la fonction un statut « aucune reprise possible : qualification manuelle requise » quand non_ventile > 0.
- **Correction sans aval** : oui
- **Contrôle en production (lecture seule)** : `-- Lecture seule : pièces concernées (capture avec reste non ventilé). select organization_id, count(*) from public.fiscal_encaissements_composantes where non_ventile > 0 group by 1;`

#### `FIN-08` — Toute dépense qualifiée « Hors revenus fonciers » est présentée au propriétaire comme de la taxe d'enlèvement des ordures ménagères, et toute recette « hors 2044 » comme des provisions de charges enc…

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/finance-textes-fiscal.test.ts, app/tests/catalogue-documents.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Frais de comptable de 800 € qualifiés hors revenus fonciers et indemnité d'assurance de 300 € qualifiée hors 2044 : la carte « Charges récupérables — hors déclaration » annonce « 300,00 € de provisions et régularisations de charges encaissées, 800,00 € de taxe d'enlèvement des ordures ménagères ». Les montants sont exclus à bon droit mais décrits faussement, dans un écran et un CSV (« Provisions et charges récupérées ») destinés à être recopiés.
- **Preuve expurgée (banc)** : preuves/relecture/finance/ts/t7.mts (teomExclue = 800, chargesRecuperees = 300) ; texte de la carte lu dans le composant
- **Cause probable** : app/src/lib/fiscal.ts et app/src/components/recapitulatif-fiscal.tsx:fiscal.ts 66 ; composant 309-327
- **Correction proposée** : Ajouter les natures « TEOM » et « charges récupérées » à la qualification, ou intituler la carte « Montants exclus de la 2044 » avec le détail par pièce.
- **Correction sans aval** : oui

#### `PR178-A-06` — Accessibilité des copies locales : la région role=status change de phrase à chaque frappe (25 changements pour 12 caractères) et le focus tombe sur le body après « Reprendre ma saisie »

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/copie-locale-annonces.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Fiche personne, rôle choisi, champ « Nom » ; Chromium. Effet sur lecteur d'écran réel non testé (hypothèse à vérifier).
- **Étapes** : 1. Ouvrir « Créer une fiche », choisir Locataire. 2. Observer par MutationObserver la région role=status qui contient « conserv » pendant 12 frappes. 3. Recharger, choisir « Reprendre ma saisie » au clavier et lire document.activeElement.
- **Attendu** : Une annonce polie au plus quand l'état change réellement (conservé / refusé), pas à chaque caractère ; focus déplacé vers le titre de l'étape reprise.
- **Observé** : La région alterne « Conservation de votre saisie sur cet appareil… » et « Saisie et fichiers conservés sur cet appareil · non envoyés automatiquement… » : 25 changements de texte pour 12 frappes (aria-live implicite polite du role=status). Après « Reprendre ma saisie » le bouton disparaît et document.activeElement = BODY (focus perdu, pas d'annonce de l'étape reprise). La mise en garde « Évitez un appareil partagé » n'est annoncée que dans l'état vide.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a08-sortie.txt, a07-sortie.txt (ligne focus), captures/A-05-reprise-390.png ; src/components/reprise-locale/index.tsx:24,38-56,66-75
- **Cause probable** : setStatut('attente') puis setStatut('conserve') à chaque enregistrement (index.tsx:40,47) ; RepriseLocale ne gère pas le focus au passage pret=true.
- **Correction proposée** : Ne mettre à jour la région que sur changement d'état stable (debounce ou statut agrégé) ; après la reprise, appeler focus() sur le titre de l'étape ; dupliquer l'avertissement poste partagé dans tous les états.
- **Correction sans aval** : oui

#### `PR178-A-07` — Les copies de devis (une clé localStorage par demande) ne sont jamais purgées si l'artisan ne rouvre pas la même demande : l'expiration de 7 jours n'est contrôlée qu'à la lecture de la clé

- **Sévérité** : P3 · **Statut** : corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes ; les copies d'un même compte expirent à la réouverture · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lecture seule, non reproduit sur le banc (il faudrait attendre ou falsifier la date d'un brouillon).
- **Étapes** : Enregistrer un brouillon de devis, ne plus jamais ouvrir cette demande ; attendre plus de 7 jours.
- **Attendu** : Suppression des copies expirées au plus tard à la prochaine ouverture de l'application (comme pour la base IndexedDB, dont lireCopieFichiers balaie toutes les clés).
- **Observé** : Hypothèse à vérifier : lireDevisLocal(cle) ne supprime que la clé demandée (brouillon-devis-local.ts:22-30) ; aucun balayage des clés « gerimmo:devis:v1:* » ni « gerimmo:bien:v1:* » ailleurs dans le code (grep : seuls les fichiers brouillon-* touchent localStorage). Les devis restent donc indéfiniment (diagnostic, prix, accès) dans le navigateur.
- **Preuve expurgée (banc)** : Lecture de src/lib/brouillon-devis-local.ts:22-39 et src/lib/brouillon-bien.ts:26-49 ; grep localStorage dans src (aucun balayage)
- **Cause probable** : Purge à la lecture d'une clé unique.
- **Correction proposée** : Balayer au chargement de l'espace artisan et propriétaire toutes les clés gerimmo:* expirées, et à la déconnexion toutes les clés (voir PR178-A-01).
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PR178-A-08` — Quand le stockage local est refusé, l'écran « La fiche est créée » affiche encore l'alerte « Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement » et chaque sortie déclenche la boîte «…

- **Sévérité** : P3 · **Statut** : corrigée en branche — 36219ec — l'effacement qui échoue après un envoi confirmé ne laisse plus ni alerte ni boîte de sortie · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Navigateur où indexedDB.open échoue (simulé : IDBFactory.prototype.open lève SecurityError ; cas réel : navigation privée stricte, politique d'entreprise). Compte proprietaire.
- **Étapes** : 1. Ouvrir « Créer une fiche » : le formulaire s'affiche (bon). 2. Remplir les trois étapes sans pièce, « Créer la fiche ». 3. Constater l'écran de succès, puis recharger la page.
- **Attendu** : Après la confirmation d'enregistrement, plus d'alerte de risque ni de confirmation de sortie.
- **Observé** : La fiche est bien créée et l'écran de succès s'affiche, mais le role=alert « La copie sur cet appareil est indisponible. Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement. » reste présent après la confirmation, et le rechargement ouvre une boîte beforeunload (statut « refuse » jamais levé, car enregistrer(null) échoue aussi et termine.current n'est pas positionné).
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a14-sortie.txt (sortie de t24.mjs), t24.mjs ; src/components/reprise-locale/index.tsx:46-63
- **Cause probable** : useCopieFichiers : sur exception, setStatut('refuse') sans condition ; le succès (enregistrer(null)) échoue lui aussi et ne remet pas le statut à « vide » ; l'écouteur beforeunload dépend du statut seul.
- **Correction proposée** : Quand l'enregistrement serveur est confirmé (bilan.terminee), forcer termine.current=true et statut « vide » même si la suppression locale échoue ; masquer l'alerte de RepriseLocale sur l'écran de succès.
- **Correction sans aval** : oui

#### `PR178-B-02` — Import du parc : la confirmation de sortie « modifications non enregistrées » se déclenche encore après un import réussi (l'état de retour n'a pas de clé succes)

- **Sévérité** : P3 · **Statut** : corrigée en branche — 36219ec — l'import du parc n'est plus suivi · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire de test ; /agence/<org>/parc/import ; fichier CSV d'une ligne.
- **Étapes** : 1. Choisir le fichier CSV. 2. « Contrôler le fichier ». 3. Importer. 4. Cliquer un lien du menu (ex. Mes lots).
- **Attendu** : Après l'import enregistré, quitter la page sans fenêtre de confirmation.
- **Observé** : Après l'import (1 bien créé en base), le clic sur un lien interne ouvre confirm(« Des modifications ne sont pas encore enregistrées. Quitter cette page et les abandonner ? »). Le fichier reste choisi dans le champ (files.length=1). Même fenêtre après la simple étape de contrôle.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/PR178-B-import-apres-succes.png ; scripts/import1.mjs
- **Cause probable** : src/lib/protection-saisie.ts:retourConfirme exige retour.succes truthy ; EtatImport (src/app/actions/import-parc.ts) et EtatReprise (src/app/actions/reprise-comptable.ts) n'ont pas de clé succes (champs controle/resultats), donc confirmerSoumission n'est jamais appelé et le reset React est annulé par le garde (écouteur reset). Lecture seule pour la reprise comptable (formulaire-reprise.tsx), non reproduit.
- **Correction proposée** : Faire renvoyer succes par ces actions, ou permettre à retourConfirme de reconnaître controle/resultats ; ou marquer ces deux formulaires data-protection-saisie="locale".
- **Correction sans aval** : oui

#### `SUP-08` — Quand le responsable désigné perd son habilitation, traiter_vacances passe TOUTES les alertes non accusées du plan en « non_acheminee », y compris celles déjà escaladées vers le créateur (qui, lui, e…

- **Sévérité** : P3 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — seules les alertes du responsable concerné sont requalifiées · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Alerte échue -> escalade vers sa1 (statut escalade). sa2 (responsable) est retiré des super-administrateurs. Au passage suivant, l'alerte de sa1 devient « Non acheminée : responsable non habilité » alors que sa1 est le destinataire valide. L'information reste visible dans /admin/relais (aucun canal de poussée n'existe : canal « interne » seul).
- **Preuve expurgée (banc)** : preuves/relecture/supervision/97-vacances-escalade.sortie.txt (E4 puis E6)
- **Cause probable** : update public.supervision_alertes_internes set statut='non_acheminee' where plan_id=p.id and statut in ('ouverte','escalade') sans filtre destinataire=p.responsable.
- **Correction proposée** : Ajouter `and destinataire=p.responsable` à cet update.
- **Correction sans aval** : oui
- **Contrôle en production (lecture seule)** : `select id,statut,destinataire from public.supervision_alertes_internes where statut='non_acheminee' and escalade_le is not null;`

#### `RET-01` — migrations.yml laisse passer un nom de fichier portant un chemin (« ../retours-arriere/… »), alors que la saisie annonce « Noms seuls (pas de chemin) »

- **Sévérité** : P3 · **Statut** : corrigée en branche — .github/workflows/migrations.yml : garde de nom de fichier (commit 2235d73), testée en shell sur 9 noms · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : retour-arriere (retour-arriere) · **Version testée** : bases jetables reconstruites depuis le manifeste (migrations de la branche)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un script à transaction propre (begin/commit) ou un fichier hors de app/supabase/migrations/ est nommé dans l'entrée « fichiers » du chantier.
- **Étapes** : 1. Rejouer en local la boucle de garde de migrations.yml (lignes 78-117) avec fichiers = ../retours-arriere/20261013120000_correctifs_audit_13_octobre.retour.sql et un historique contenant 20261013120000. 2. Comparer avec le même nom sans chemin.
- **Attendu** : Refus net de tout nom contenant « / ».
- **Observé** : Avec chemin : la version lue est « ../retours-arriere/20261013120000 », absente de l'historique, la garde « version déjà enregistrée » est franchie, le fichier est lu, une ligne de version fantaisiste serait inscrite ; un script qui fait son propre commit validerait le lot entier, simulation comprise. Sans chemin : « déjà enregistrée » (refus). Seule la logique shell a été rejouée, pas le chantier GitHub réel. Mitigation posée : les deux scripts de retour refusent de se jouer dans un lot (observé, RET-EX-06).
- **Preuve expurgée (banc)** : preuves/retour-arriere/migrations-yml/R_migrations_yml_chemin.txt
- **Cause probable** : Le contrôle repose sur « ${f%%_*} » sans interdire « / » (.github/workflows/migrations.yml, boucle de garde).
- **Correction proposée** : Ajouter en tête de boucle : case "$f" in */*\|*..*) echo "✗ nom seul attendu : $f" >&2; exit 1;; esac.
- **Correction sans aval** : oui

#### `RET-03` — La page du wiki Plan de reprise d'activité cite une base de connaissance qui n'existe pas dans V4 (docs/plan-reprise-activite.md, table backup_registry) et décrit une sauvegarde Supabase alors que la…

- **Sévérité** : P3 · **Statut** : corrigée en branche — wiki : page Plan de reprise d'activité mise à jour (V4, retours arrière, état vérifié) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : retour-arriere (retour-arriere) · **Version testée** : bases jetables reconstruites depuis le manifeste (migrations de la branche)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lecture de wiki/regles-metier/Plan de reprise d'activité.md et du dépôt.
- **Étapes** : 1. Lire « Fondement » et « Paramètres » de la page. 2. git ls-files \| grep plan-reprise ; grep -rl backup_registry app.
- **Attendu** : La page décrit le dispositif V4 (workflow Sauvegarde quotidienne, app/docs/sauvegarde-et-restauration.md, tech_log tache_sauvegarde).
- **Observé** : docs/plan-reprise-activite.md n'existe que dans raw/Gerimmo-V3 ; backup_registry : 0 occurrence dans app/ ; la page parle de « sauvegarde quotidienne (Supabase) » et d'un test trimestriel/annuel sans calendrier tenu (contradiction déjà signalée par la page).
- **Preuve expurgée (banc)** : wiki/regles-metier/Plan de reprise d'activité.md (non modifié : hors périmètre) ; grep dans le dépôt.
- **Cause probable** : Page migrée de V3 sans mise à jour du dispositif V4.
- **Correction proposée** : Mettre la page à jour (liens vers app/docs/sauvegarde-et-restauration.md et les deux workflows, retirer backup_registry, renvoyer à app/supabase/retours-arriere/).
- **Correction sans aval** : oui

#### `SA-03` — Une consigne ambiguë (sans aucune tâche) peut être « autorisée » : l'écran dit « Aucune tâche proposée. Précisez les lectures » mais propose quand même « Autoriser la version 1 », et la base enregist…

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/consigne-sans-tache.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-admin aal2 ; consigne '[TEST-superadmin] D2 ambigue' (texte vague, aucune lecture cochée)
- **Étapes** : 1) /admin/consignes : saisir un texte vague sans cocher de lecture. 2) Constater 'Aucune tâche proposée' et le bouton 'Autoriser la version 1'. 3) Appeler decider_consigne(version, true).
- **Attendu** : Une consigne ambiguë est bloquée ou renvoyée en clarification : pas de bouton d'autorisation tant qu'aucune tâche n'est définie
- **Observé** : Le bouton d'autorisation est offert, et la décision est acceptée (accord enregistré, journal consigne_decision). Aucun effet n'en découle (aucune tâche), mais la version apparaît ensuite parmi les 'Consigne de lecture déjà autorisée' proposables à un plan de vacances, donnant l'impression d'un accord valable.
- **Preuve expurgée (banc)** : sql2/s04_negatifs_consignes_sortie.txt (ligne 'approuver consigne ambiguë D2 sans tâche : ACCEPTE') ; sql2/s02_consignes_sortie.txt
- **Cause probable** : src/app/admin/consignes/page.tsx (bouton Autoriser sans condition sur travail.length) ; decider_consigne (migration 20261012221000_consignes_versionnees.sql:64) ne vérifie pas l'existence d'une tâche
- **Correction proposée** : Masquer 'Autoriser' (et refuser dans decider_consigne) quand la version n'a aucune tâche proposée, avec le message 'Précisez les lectures dans une nouvelle version'
- **Correction sans aval** : oui

#### `SA-05` — Les dates des retours utilisateurs s'affichent en UTC, sans mention de fuseau : 2 h de décalage (et parfois un jour) avec l'heure de Paris utilisée partout ailleurs dans la console

- **Sévérité** : P3 · **Statut** : corrigée en branche — 9978efa — dates des retours à l'heure de Paris · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un retour envoyé à 00:42 heure de Paris le 14/10/2026
- **Étapes** : 1) Envoyer un retour depuis /assistance. 2) Lire sa date sur /admin/retours et sur /assistance (suivi de l'utilisateur).
- **Attendu** : '14/10/2026 00:42' (Europe/Paris, comme les autres écrans de supervision qui affichent 'Heures affichées à l'heure de Paris')
- **Observé** : /admin/retours : '13/10/2026 22:42:23' ; /assistance : 'Réponse de Gerimmo · 13/10/2026 22:42:34' et date de création '13/10/2026'. Base : cree_le = 2026-10-13 22:42:23+00 = 00:42:23 le 14/10 à Paris.
- **Preuve expurgée (banc)** : sql2/s20_retours_sortie.txt ; captures2/11-retour-traite.png
- **Cause probable** : src/app/admin/retours/page.tsx:75 et :56 (toLocaleString/toLocaleDateString('fr-FR') sans timeZone) ; src/app/assistance/contenu-assistance.tsx:52-55
- **Correction proposée** : Utiliser formaterDateHeureParis (src/lib/heure-paris.ts), déjà utilisé sur /admin/consignes et /admin/relais
- **Correction sans aval** : oui

#### `SA-06` — Pluriels fautifs dans les écrans de relais et de consignes : 'après 1 minutes', 'Plafonds : 1 lectures au total, 1 par mois'

- **Sévérité** : P3 · **Statut** : corrigée en branche — 9978efa — pluriels accordés · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Plan avec délai de 1 minute ; consigne avec plafonds 1/1
- **Étapes** : Lire /admin/relais (plan) et /admin/consignes (consigne D7)
- **Attendu** : 'après 1 minute', '1 lecture au total'
- **Observé** : 'Une alerte non acquittée est remontée au créateur du plan après 1 minutes.' ; '14/10/2026 00:15 → 15/10/2026 06:25. Plafonds : 1 lectures au total, 1 par mois.'
- **Preuve expurgée (banc)** : sql2/s08_actif_sortie.txt ; captures2/04-revision-conflit.png
- **Cause probable** : src/app/admin/relais/vacances.tsx ; src/app/admin/consignes/page.tsx
- **Correction proposée** : Accorder le pluriel (1 minute / 1 lecture)
- **Correction sans aval** : oui

#### `SA-07` — En diagnostic artisan, le bouton d'enregistrement de la fiche entreprise répond « Connectez-vous à votre espace artisan. » au lieu d'expliquer la lecture seule

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/diagnostic-devis-raison.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Session de diagnostic ouverte sur un artisan de test
- **Étapes** : 1) Ouvrir /artisan/entreprise pendant le diagnostic. 2) Saisir une adresse. 3) Cliquer 'Enregistrer mes informations de devis'.
- **Attendu** : Message clair : 'Diagnostic en lecture seule : aucune modification' (ou bouton désactivé)
- **Observé** : Le formulaire reste actif et répond 'Connectez-vous à votre espace artisan.' ; rien n'est écrit (0 ligne modifiée, garde SQL confirmée par ailleurs).
- **Preuve expurgée (banc)** : sql2/s16_sup02_sortie.txt (ligne 'ÉCRITURE pendant le diagnostic') ; captures2/10-diagnostic-ecriture-refusee.png
- **Cause probable** : src/app/artisan/devis/actions-preparation.ts:55 et src/lib/parcours-devis-serveur.ts:10 : la fiche artisan est cherchée par le compte connecté (le superviseur n'a pas de fiche), pas par la session de diagnostic
- **Correction proposée** : Désactiver les formulaires d'écriture et afficher 'Lecture seule' quand ma_session_artisan_diagnostic() renvoie une session
- **Correction sans aval** : oui

#### `VFL-02` — Déconnexion hors ligne : écran d'erreur générique au lieu d'un message « vous êtes hors ligne »

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/deconnexion-hors-ligne.test.ts, e2e/menu-compte.spec.ts : « hors ligne, se déconnecter le dit sans quitter la page ni la session » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire connecté, fiche personne en cours avec pièce jointe conservée, réseau coupé (context.setOffline)
- **Étapes** : 1. Ouvrir le menu compte. 2. Cliquer « Se déconnecter » hors ligne. 3. Attendre 6 s.
- **Attendu** : La session reste ouverte, la copie reste (OK) et un message explicite dit que la déconnexion n'a pas pu aboutir
- **Observé** : La page est remplacée par « Cette page n'a pas pu s'afficher. L'incident est noté — la page, pas vos données… Réessayer » ; la saisie à l'écran n'est plus visible (la copie locale et la session sont intactes, vérifié).
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/captures/copies-e-deconnexion-hors-ligne.png
- **Cause probable** : app/src/app/actions/auth.ts:27-35 (seDeconnecter) : l'échec réseau de l'action serveur remonte à la limite d'erreur ; app/src/components/menu-compte.tsx:112 (formulaire action={seDeconnecter} sans gestion d'échec)
- **Correction proposée** : Intercepter l'échec côté client (navigator.onLine / catch) et afficher « Déconnexion impossible hors ligne ; votre saisie est conservée ».
- **Correction sans aval** : oui

#### `VFL-04` — « 1 234,50 » et « 1.234,50 » refusés avec le seul message « Montant invalide. » (format usuel français non expliqué)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/saisie-montant.test.ts : « 1 234,50 », « 1.234,50 », espace insécable, espace fine, « 1 234.50 », « 1,234.50 » donnent exactement « Montant inva · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire, bail actif avec loyer impayé, navigateur en-US ou fr-FR
- **Étapes** : 1. /agence/<org>/baux/<id>, bloc « Saisir un encaissement ». 2. Saisir « 1 234,50 » (puis « 1.234,50 »), valider.
- **Attendu** : Accepté (1234,50) ou refus avec message qui nomme le format attendu (ex. « Saisissez le montant sans séparateur de milliers : 1234,50 »)
- **Observé** : Aucune ligne créée (aucun montant faux : conforme à la consigne), message « Montant invalide. » seul. Un séparateur de milliers est pourtant courant pour des loyers ou dépôts élevés.
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/montants-enus2.json ; preuves/verification/flux-finale/captures/montant-loyer-123450.png
- **Cause probable** : app/src/lib/saisie-montant.ts (lireMontant : refus de tout séparateur de milliers) et app/src/app/actions/loyers.ts:257 (ajouterEncaissement, message « Montant invalide. »)
- **Correction proposée** : Soit tolérer l'espace (fine, insécable ou normale) comme séparateur de milliers, soit enrichir le message : « Montant invalide : écrivez 1234,50 (sans espace ni point de milliers). »
- **Correction sans aval** : oui

#### `VFL-05` — Reprise des soldes : « date de bascule » par défaut calculée en UTC (la veille entre 00 h et 02 h à Paris l'été)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/jour-paris-formulaires.test.ts : rendu serveur de FormulaireReprise avec serveur UTC et horloge au 13/10/2026 23:47 UTC · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire connecté ; horloge navigateur émulée au 14/10/2026 01:47 Europe/Paris
- **Étapes** : 1. context.clock.setFixedTime(2026-10-14T01:47+02:00). 2. Ouvrir /agence/<org>/comptabilite/reprise. 3. Lire le champ date_bascule.
- **Attendu** : 2026-10-14 (jour de Paris, comme le corrige ARC-10 ailleurs)
- **Observé** : 2026-10-13
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/dates-paris.json (reprise.dates)
- **Cause probable** : app/src/app/agence/[orgId]/comptabilite/reprise/formulaire-reprise.tsx:12-14 (new Date().toISOString().slice(0, 10)) ; helper correct disponible : aujourdhuiParis() dans app/src/lib/ged.ts:155
- **Correction proposée** : Remplacer par aujourdhuiParis() (même fichier que les champs corrigés par ARC-10) et ajouter un test de source interdisant toISOString().slice(0,10) dans les formulaires.
- **Correction sans aval** : oui

#### `VFL-06` — Hypothèse à vérifier : attestation d'assurance locataire, date plancher et contrôle serveur calculés en jour UTC

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/jour-paris-formulaires.test.ts : à 01:47 Paris, le champ expire_le a min=2026-10-14 ; deposerMonAttestation refuse une attestation expirée le 13 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Locataire connecté ; entre 00 h et 02 h à Paris (heure d'été)
- **Étapes** : Lecture du code : formulaire-attestation.tsx:17-19 (min de expire_le) et attestation-locataire.ts:58 (refus si expire < jour UTC).
- **Attendu** : Une attestation expirée la veille (jour de Paris) est refusée
- **Observé** : Non reproduit : le min est rendu au serveur (2026-10-14 mesuré à 01:47 émulé côté navigateur) et l'horloge réelle du banc (≈ 06 h Paris) ne permet pas de reproduire la fenêtre 00 h-02 h côté serveur. Par lecture du code, une attestation expirée le jour précédent (Paris) serait acceptée pendant ces deux heures.
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/dates-paris.json (locataireAttestation)
- **Cause probable** : app/src/app/locataire/[orgId]/formulaire-attestation.tsx:17-19 ; app/src/app/actions/attestation-locataire.ts:58
- **Correction proposée** : Utiliser aujourdhuiParis() aux deux endroits ; test unitaire avec horloge simulée à 23:47 UTC.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `VER-PR178-02` — Session expirée puis autre compte dans le même navigateur : les copies du compte précédent (identité, brouillon de lot) restent sur l'appareil tant que le nouveau compte n'ouvre pas la fiche personne…

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/copies-locales-arrivee.test.ts, tests/copies-locales.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Deux comptes propriétaires créés par l'interface ; A a saisi une fiche personne (IndexedDB) et un brouillon de lot (localStorage) ; la session de A expire sans clic sur « Se déconnecter » (cookies supprimés)
- **Étapes** : 1. Connecter B dans le même navigateur ; 2. Lire localStorage et indexedDB sur la page d'arrivée de B, puis sur /parc/nouveau ; 3. Ouvrir /personnes#creer-fiche
- **Attendu** : « Un compte qui ouvre un formulaire efface celles des autres comptes » (message et commentaire de copies-locales.ts) : les copies de A disparaissent dès la première page de B
- **Observé** : Copies de A présentes à l'arrivée de B et sur parc/nouveau ; effacées seulement à l'ouverture de la fiche personne. Le texte affiché « sinon elles sont supprimées au bout de 7 jours » est inexact pour le brouillon de lot et le devis (l'expiration n'est évaluée qu'à la relecture de la même clé). Recoupe PR178-A-01 et PR178-A-07 (marquées corrigées) : la correction ne couvre que le chemin « déconnexion cliquée »
- **Preuve expurgée (banc)** : preuves/verification/pr178/purge2.txt
- **Cause probable** : app/src/components/reprise-locale/index.tsx:17 est le seul appelant de purgerCopiesAutresComptes ; brouillon-bien (formulaire-avec-brouillon.tsx) et devis (formulaire-avec-reprise.tsx) ne purgent rien
- **Correction proposée** : Appeler purgerCopiesAutresComptes(compteCourant) et l'équivalent IndexedDB depuis un composant présent sur toutes les pages connectées (menu du compte), pas seulement depuis RepriseLocale ; ou corriger le texte. La durée de conservation reste à trancher (déjà au registre).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VER-PR178-03` — Stockage IndexedDB refusé : après une fiche créée et confirmée, l'alerte « Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement » reste affichée (résidu de PR178-A-08)

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : IndexedDB refusée (simulation) ; fiche personne créée avec succès
- **Étapes** : 1. Ouvrir /agence/<org>/personnes#creer-fiche avec indexedDB.open en erreur ; 2. Créer une fiche jusqu'au bout ; 3. Lire les alertes de la page
- **Attendu** : Plus aucune alerte « jusqu'à confirmation » une fois la fiche confirmée (correction A-08)
- **Observé** : Le statut de la copie est bien remis à zéro, mais l'alerte de lecture « La copie sur cet appareil est indisponible. Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement. » (role alert) persiste après « 3 fiches »
- **Preuve expurgée (banc)** : preuves/verification/pr178/idb-refuse.txt
- **Cause probable** : app/src/components/reprise-locale/index.tsx:41 : lecture.erreur est affichée tant que RepriseLocale est monté, indépendamment de l'état « terminée » de la fiche
- **Correction proposée** : Effacer lecture.erreur dès que useCopieFichiers passe à « vide » après un envoi confirmé (callback ou état remonté depuis le formulaire).
- **Correction sans aval** : oui

#### `VER-PR178-04` — Reprise d'une saisie après session expirée : l'ancien message « Votre session a expiré… » est réaffiché alors que la personne s'est reconnectée

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/copies-locales-arrivee.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte A ; fiche personne au récapitulatif ; cookies supprimés ; clic sur « Créer la fiche » ; reconnexion dans un autre onglet
- **Étapes** : 1. Recharger l'onglet ; 2. « Reprendre ma saisie » ; 3. Aller au récapitulatif
- **Attendu** : Saisie reprise sans message d'erreur périmé
- **Observé** : Le récapitulatif affiche encore « Votre session a expiré : cette saisie n'a pas été enregistrée… » ; le bouton fonctionne et un seul envoi crée une seule fiche (persons 1 -> 2)
- **Preuve expurgée (banc)** : preuves/verification/pr178/fiche-expire2.txt
- **Cause probable** : app/src/app/agence/[orgId]/personnes/formulaire-personne.tsx : le snapshot de copie locale embarque l'état (bilan avec erreur) ; la reprise le rejoue tel quel
- **Correction proposée** : Ne pas persister (ou retirer à la reprise) l'erreur MESSAGE_SESSION_EXPIREE du bilan mémorisé.
- **Correction sans aval** : oui

#### `VER-PR178-05` — La purge des copies locales part au clic sur « Se déconnecter », avant que la déconnexion ait réussi : hors ligne, la copie est effacée alors que la session reste ouverte

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/copies-locales-arrivee.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte A, fiche personne en cours de saisie, copie IndexedDB présente, réseau coupé juste avant le clic
- **Étapes** : 1. Saisir nom et prénom (copie écrite) ; 2. Ouvrir le menu du compte, couper le réseau (Playwright setOffline) ; 3. Cliquer « Se déconnecter »
- **Attendu** : La copie n'est effacée qu'une fois la déconnexion confirmée ; en cas d'échec la personne garde sa saisie et sa copie
- **Observé** : indexedDB.databases() vide, URL inchangée (session toujours ouverte), écran « Cette page n'a pas pu s'afficher » : la saisie est perdue en mémoire et sur l'appareil. Avant la correction (main-178) la copie aurait survécu. L'écran d'erreur sur échec de seDeconnecter existait déjà ; c'est l'effacement préalable qui rend la perte définitive
- **Preuve expurgée (banc)** : preuves/verification/pr178/logout-hors-ligne.txt ; preuves/verification/pr178/logout-hors-ligne.png
- **Cause probable** : app/src/components/purger-copies-a-la-deconnexion.tsx:13-16 écoute « submit » du formulaire de déconnexion et purge immédiatement
- **Correction proposée** : Purger après réussite : faire rediriger seDeconnecter vers /connexion?raison=deconnecte et purger à l'arrivée sur cette adresse (aucun effet si l'action échoue ; couvre aussi une déconnexion faite depuis un autre onglet).
- **Correction sans aval** : oui

#### `VER-PR178-07` — Si sessionStorage est refusé par le navigateur, toute l'application et la page de connexion affichent « Cette page n'a pas pu s'afficher » (code antérieur aux corrections, relevé en testant l'indispo…

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/stockage-session.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Chromium, propriété window.sessionStorage qui lève SecurityError (simulation de « bloquer tous les cookies et données de site ») ; non reproduit dans une vraie fenêtre privée, où le stockage est disponible
- **Étapes** : 1. Définir le refus avant le chargement ; 2. Ouvrir /connexion ou n'importe quelle page de l'espace connecté
- **Attendu** : Une page dégradée mais utilisable, comme avec localStorage ou IndexedDB refusés (EX-12)
- **Observé** : Écran d'erreur partout, connexion impossible ; localStorage seul et indexedDB seul refusés : aucun problème
- **Preuve expurgée (banc)** : preuves/verification/pr178/stockage-refuse2.txt ; preuves/verification/pr178/stockage-refuse-connexion.png
- **Cause probable** : app/src/components/synthese-alertes.tsx:84 et :99 (sessionStorage.getItem/setItem sans try/catch dans un effet) ; app/src/app/connexion/formulaire-connexion.tsx:76 (removeItem sans protection)
- **Correction proposée** : Envelopper ces trois accès dans try/catch (le drapeau « alertes déjà vues » devient alors non mémorisé). Sévérité à réévaluer si un navigateur réel reproduit le refus.
- **Correction sans aval** : oui

#### `VER-SQL-01` — 20261013120000 n'est pas rejouable sans effet : un rejeu hors transaction duplique la garde de definir_equipements_lot puis s'arrête sur AUD-A-02

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/correctifs-audit-13-octobre-rejeu.test.ts : 7 marques présentes, rejeu double sans effet · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse sql (verification/sql) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Base déjà migrée par 20261013120000.
- **Étapes** : psql -v ON_ERROR_STOP=1 -f 20261013120000_correctifs_audit_13_octobre.sql sur la base migrée (sans begin/commit).
- **Attendu** : Rejeu sans effet, ou refus avant toute modification (l'en-tête promet « la migration s'arrête et ne change rien »).
- **Observé** : Le bloc AUD-A-01 ne reconnaît pas qu'il est déjà appliqué (son ancre « raise exception 'Accès refusé'; end if; if exists ( » est encore présente une fois, à la fin du texte ajouté) : il réécrit la fonction avec une seconde garde de portefeuille (hachage de définition différent), puis AUD-A-02 s'arrête (« ancre 1 absente ou répétée »). Dans la transaction unique de migrations.yml, rien ne subsiste (vérifié) et la version déjà enregistrée est refusée en amont : le risque est limité à un rejeu manuel.
- **Preuve expurgée (banc)** : preuves/verification/sql/cat_rejeu_120.txt ; rejeu_atomique.txt ; rejeu_derive.txt
- **Cause probable** : 20261013120000_correctifs_audit_13_octobre.sql, bloc AUD-A-01 : l'ancre ne contient pas de marqueur propre au correctif (les autres blocs, eux, s'arrêtent au rejeu).
- **Correction proposée** : Dans chaque bloc, ajouter en tête « if position('Audit du 13/10 (AUD-A-01)' in v_def) > 0 then return; end if; » (rejeu sans effet) ; ou corriger l'en-tête (« ne change rien » vaut pour la transaction du chantier, pas pour un psql nu).
- **Correction sans aval** : oui

#### `VER-SQL-02` — supprimer_detention : deux suppressions simultanées de la même détention laissent deux lignes d'audit pour une seule suppression

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/incidents-portefeuille-agent.test.ts : « VER-SQL-02 : une suppression qui ne retire aucune ligne ne laisse aucune trace d'audit » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse sql (verification/sql) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Une détention sans bail ; deux gestionnaires (ou un double clic) appellent supprimer_detention en même temps.
- **Étapes** : Session A : begin ; select supprimer_detention(d). Session B (autre compte) : select supprimer_detention(d) (attend le verrou de ligne) ; A : commit.
- **Attendu** : Une seule trace pour une seule suppression (ou un refus « Détention introuvable » pour B).
- **Observé** : B réussit sans erreur et a écrit sa propre ligne 'detention_supprimee' : 2 lignes d'audit, 1 détention supprimée. Le select initial et l'insert d'audit ne verrouillent pas la ligne ; seul le delete attend, puis supprime 0 ligne.
- **Preuve expurgée (banc)** : preuves/verification/sql/harness_apres.jsonl (A04-concurrence-deux-suppressions)
- **Cause probable** : 20261013120000, bloc AUD-A-04 : insert ... select ... from detentions where id = p_detention, puis delete, sans verrou ni test du nombre de lignes supprimées.
- **Correction proposée** : Remplacer les deux ordres par un seul : with d as (delete from public.detentions where id = p_detention returning *) insert into public.audit_log (...) select ... from d — la trace ne s'écrit que pour une ligne réellement supprimée.
- **Correction sans aval** : oui

#### `VER-SQL-03` — REP-01 : un second envoi identique est sans effet en base mais l'action TypeScript renvoie un succès et prévient de nouveau l'artisan

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/validation-creneaux.test.ts : le second envoi identique renvoie 0, tests/contre-proposition-locataire-action.test.ts : 4 tests de l'action · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse sql (verification/sql) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Locataire avec une contre-proposition déjà en attente ; il renvoie la même liste (réponse perdue, double clic).
- **Étapes** : 1. contre_proposer_creneaux(L) deux fois de suite (harnais REP01-double-envoi-identique) : les deux appels renvoient 3, aucun indice du « sans effet ». 2. Lecture de proposerMesCreneaux (incidents-locataire.ts:130-150) : après la RPC, notifierEnCoulisses(... notifierContrePropositionLocataire) est appelée sans condition ; expedier() est appelée sans cleIdempotence.
- **Attendu** : Le second envoi ne déclenche pas de second e-mail à l'artisan (le but de REP-01 est qu'il ne se passe « rien »).
- **Observé** : Base : conforme (REP01-double-envoi-identique). Notification : l'e-mail « Le locataire propose d'autres créneaux » repart à chaque envoi — déduit du code, non exécuté (aucune clé Resend sur le banc).
- **Preuve expurgée (banc)** : preuves/verification/sql/harness_apres.jsonl (REP01-double-envoi-identique : retours=3,3) ; lecture src/app/actions/incidents-locataire.ts:130-150 et src/lib/notifications.ts:1032-1060
- **Cause probable** : La fonction SQL renvoie v_nb dans les deux cas ; l'action TypeScript ne peut pas distinguer le rejeu.
- **Correction proposée** : Faire renvoyer à la fonction une valeur distincte pour le rejeu (par exemple 0, ou un second champ) et ne notifier que si un nouveau tour a été créé ; ou passer une cleIdempotence dérivée de (intervention, tour) à expedier().
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `VER-SQL-04` — SUP-08 : si le créateur du plan perd lui aussi son habilitation, l'alerte escaladée vers lui reste « escalade » alors qu'elle n'est acheminée à personne

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/consignes-vacances.test.ts : « perte de droit du remplaçant puis du créateur : l'alerte escaladée vers le créateur devient non acheminée » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse sql (verification/sql) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Plan de vacances actif (responsable R, créateur C) ; alerte ouverte puis escaladée vers C ; R puis C perdent leur habilitation ; traiter_vacances() est rappelée.
- **Étapes** : harness_sup08.mjs sur gerimmo_verif_sql_s8avant et gerimmo_verif_sql_s8apres.
- **Attendu** : Une alerte dont le destinataire n'est plus habilité devient « non_acheminee » (c'était le cas avant, par effet de bord du filtre trop large).
- **Observé** : Avant : étape 3 -> non_acheminee ; après : étape 3 -> escalade (le filtre « destinataire is not distinct from p.responsable » ne vise plus le créateur, et la boucle finale ne revisite que les alertes « ouverte »).
- **Preuve expurgée (banc)** : preuves/verification/sql/sup08_avant_apres.txt
- **Cause probable** : 20261013120000, bloc SUP-08 : condition destinataire = responsable ; aucune condition sur l'habilitation du destinataire.
- **Correction proposée** : Étendre la condition : « and (destinataire is not distinct from p.responsable or not public.responsable_supervision_habilite(destinataire)) ». Cas rare (deux perdent leur droit en même temps), borné au journal interne de la direction.
- **Correction sans aval** : oui

#### `VER-TS-01` — Une date de naissance de forme AAAA-MM-JJ impossible (2024-13-45) fait lever l'action serveur : erreur 500 et message sans rapport au lieu de « date de naissance non valide »

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/validation-fiches.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse ts (verification/ts) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire direct connecté, fiche d'un locataire ouverte (« Modifier la fiche »), champ date modifié par outil de développement (le sélecteur de date du navigateur n'envoie jamais cette forme) ; mêmes appels : création de personne, résolution du locataire d'un bail
- **Étapes** : 1. Ouvrir /agence/<org>/personnes/<id> puis « Modifier la fiche ». 2. Compléter adresse, code postal, ville, commune. 3. Passer le champ date en texte et saisir 2024-13-45. 4. Enregistrer.
- **Attendu** : « La date de naissance n'est pas valide. » sous le champ, saisie conservée
- **Observé** : POST 500 ; l'écran affiche « La confirmation n'a pas pu être reçue. Votre saisie reste dans cette page. Vérifiez le dossier avant de recommencer l'envoi. » ; le champ date est vidé ; aucune écriture (fiche inchangée en base). Au niveau fonction : RangeError: Invalid time value pour 2024-13-45, 2024-00-00, 1990-99-99
- **Preuve expurgée (banc)** : preuves/verification/ts/e2e-naissance.mjs ; preuves/verification/ts/e2e-naissance-2024-13-45.png ; preuves/verification/ts/e2e-naissance-etat-base.txt ; preuves/verification/ts/resultats-vitest.json (C.naissance)
- **Cause probable** : app/src/lib/validation-fiches.ts, verifierDateNaissance : new Date(`${d}T00:00:00Z`).toISOString() sans contrôle Number.isNaN ; verifierDateDejaPassee (saisie-montant.ts) a ce contrôle, pas celle-ci
- **Correction proposée** : Calculer const t = new Date(...) puis exiger !Number.isNaN(t.getTime()) avant toISOString ; ajouter les cas 2024-13-45 et 1990-99-99 à tests/validation-fiches.test.ts
- **Correction sans aval** : oui

#### `VER-TS-03` — L'élision « d’octobre » n'est appliquée que sur la page d'accueil locataire : e-mails, page Documents du locataire, PDF de décompte et libellés d'agenda disent encore « de octobre », « de avril », «…

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/elision-courriers.test.ts, tests/elision.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse ts (verification/ts) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Période d'octobre, d'avril ou d'août ; e-mails de relance, de quittance, d'avis d'échéance, d'information de la caution
- **Étapes** : Rendre sujetRelanceLoyer, corpsQuittance, corpsAvisEcheance, corpsRelanceLoyer, corpsInformationCaution pour 2026-10-01 et 2026-04-01
- **Attendu** : « Loyer d’octobre 2026 », « votre échéance d’avril 2026 »
- **Observé** : 12 occurrences fautives sur 2 périodes : « Loyer de octobre 2026 — un règlement semble en attente » (sujet), « loyer de octobre 2026 », « quittance de loyer de avril 2026 », « échéance de avril 2026 ». Même motif dans le code (non vérifié au navigateur) : locataire/[orgId]/documents/page.tsx:301 (« la quittance de octobre 2026 »), agenda/page.tsx:155 et agenda-proprietaire.tsx:78,87 (aria-label), lib/documents/modeles/decompte-restitution.ts:211 (« Terme de octobre 2026 » dans le PDF), fil-activite.tsx:174 et mandats/page.tsx:204 (agence). PROP-05 (nom d'espace « Parc de Éloïse », construit en SQL) reste ouverte et l'en-tête de elision.ts la présente comme traitée
- **Preuve expurgée (banc)** : preuves/verification/ts/resultats-vitest.json (I.*) ; preuves/verification/ts/zz-verif-ts.test.ts.copie
- **Cause probable** : app/src/lib/relance-loyer-email.ts:59,71,72,78 ; quittance-email.ts:65 ; appel-email.ts:65 (« de ${mois} » écrit à la main) ; deElide n'est importé que par app/locataire/[orgId]/page.tsx
- **Correction proposée** : Utiliser deElide(mois) dans ces gabarits (chaîne « de » + mois) et dans les autres sites listés ; corriger le commentaire de elision.ts ; PROP-05 reste à traiter dans la fonction SQL de création du parc
- **Correction sans aval** : oui

#### `VER-TS-04` — Récapitulatif fiscal nu : « Périmètre : N écritures » compte des pièces écartées (période meublé ou hors de mes droits) sans le dire

- **Sévérité** : P3 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/fiscal-perimetre.test.ts, tests/catalogue-documents.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse ts (verification/ts) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Exercice du lot avec deux périodes, nu de janvier à juin puis meublé de juillet à décembre ; 12 loyers encaissés
- **Étapes** : Générer recap_fiscal_nu pour l'année
- **Attendu** : Mention de ce qui est exclu, ou périmètre égal aux pièces comptées
- **Observé** : 211 = 4 680 (6 loyers de 780), mais le texte dit « Périmètre : 12 écritures enregistrées » et ne mentionne pas les 6 mois exclus ; le lecteur ne voit pas que la moitié des loyers est hors du tableau
- **Preuve expurgée (banc)** : preuves/verification/ts/resultats-vitest.json (G5.*)
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts, ligne du contenu « Périmètre : ${ecritures.length} écritures » : ecritures.length compte toutes les écritures du lot, pas fiscal.nbEcritures
- **Correction proposée** : Afficher fiscal.nbEcritures et, si fiscal.meuble.nbEcritures > 0 ou des périodes hors périmètre existent, une phrase les citant
- **Correction sans aval** : oui

#### `VUI-02` — Rail tablette locataire (641-860 px) : la cellule du nom d espace affiche « PDP… » (initiales suivies du début du nom tronqué) au lieu des seules initiales ; la correction DES-A-14 ne tient pas sur l…

- **Sévérité** : P3 · **Statut** : corrigée en branche — globals.css : font-size:0 !important sur les initiales du rail ; tests/rail-initiales-et-cesure.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : verification-ui (verification/ui-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Connexion locataire.pd@gerimmo-demo.fr (espace « Parc de Claire Moreau »), viewport 641 à 860 px
- **Étapes** : Ouvrir /locataire/<org> à 768x900 ; regarder la tuile blanche en haut du rail ; inspecter span[data-initiales]
- **Attendu** : « PD » seul, avec le nom entier en infobulle (DES-A-14, même rendu que le rail du propriétaire/agence)
- **Observé** : Texte rendu « PDP… » ; getComputedStyle(span).fontSize = 16px (devrait être 0) ; ::before content « PD » appliqué ; title « Parc de Claire Moreau » présent ; scrollWidth 199 pour clientWidth 48. Diagnostic : deux règles de taille de police s appliquent, `.loc-logo [data-initiales]{font-size:0}` dans la couche components et `.text-base` dans la couche utilities, qui l emporte. En injectant font-size:0!important la tuile n affiche plus que les initiales. Le rail agence (coquille) rend bien « AA » (font-size 0px)
- **Preuve expurgée (banc)** : preuves/verification/ui-finale/etats/rail-locataire-logo-768.png ; etats/rail-locataire-768.png ; journaux/rail-mots-coupes.json (marque.fs=16px aux 3 largeurs) ; etats/rail-locataire-logo-768-diagnostic-important.png (diagnostic par injection, hors preuve de correction) ; scripts/s4d-diag-logo.mjs ; apres-finale/locataire/768/locataire-c14c3187.png (locataire.alpha : tuile « AA… »)
- **Cause probable** : app/src/app/globals.css:1465 (règle en @layer components) battue par la classe text-base posée sur le span rendu par MarqueOrganisation (app/src/app/locataire/[orgId]/layout.tsx:104) ; la règle jumelle de la coquille (.coquille-late .coquille-marque [data-initiales]) fonctionne parce que son span n a pas text-base
- **Correction proposée** : Passer la règle en font-size:0!important (ou la sortir des couches, ou retirer text-base du span quand data-initiales est actif) et ajouter un test visuel à 768 px sur le rail locataire
- **Correction sans aval** : oui

#### `ARC-04` — Numéro de facture externe : unicité sensible à la casse (« art-2026-0001 » accepté en doublon de « ART-2026-0001 »), aucune continuité contrôlée

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Chantier externe terminé, devis accepté, facture ART-2026-0001 déjà déposée pour un autre chantier
- **Étapes** : Déposer, sur un second chantier terminé, une facture portant le numéro « art-2026-0001 » (ou « ART-2026-0001 » avec espaces)
- **Attendu** : Refus : deux factures du même artisan ne peuvent pas porter le même numéro, quelle que soit la casse ; contrôle ou avertissement sur un saut de numérotation
- **Observé** : La facture « art-2026-0001 » est acceptée et listée à côté de « ART-2026-0001 » sur la page Facturation ; les espaces autour sont retirés (btrim) mais pas la casse ; le message du vrai doublon est « Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer » (voir ARC-06)
- **Preuve expurgée (banc)** : captures/c19-numeros-facture-casse.png ; sql/s05-chantiers-4-3.txt
- **Cause probable** : supabase/migrations/20261012220000_artisan_clients_externes.sql : unique(artisan_id,numero) sur le texte brut ; la RPC artisan_externe_ecrire ne normalise que btrim
- **Correction proposée** : Index unique sur (artisan_id, lower(btrim(numero))) étendu aux numéros des factures Gerimmo du même artisan, et message dédié « Ce numéro de facture existe déjà »
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-A-05` — Écart documentation/code : la piste d'audit générique documentée n'existe pas

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur (auditeur/a) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lecture de wiki/regles-metier/Archivage plutôt que suppression.md et de la base.
- **Étapes** : select count(*) from pg_proc where proname='audit_table_changes' ; select count(*) from pg_tables where tablename='audit_logs'.
- **Attendu** : Table centrale audit_logs append-only alimentée par le déclencheur audit_table_changes(), DELETE réservé au super admin (wiki).
- **Observé** : Aucune des deux (0 et 0). La table réelle s'appelle audit_log et ne contient que 8 types d'actions (adhesion_creee, adhesion_retiree, suppression_encaissement, bien_retire, bien_retabli, invitation_locataire, invitation_locataire_envoi_echec, inscription_proprietaire) ; plusieurs suppressions sont ouvertes aux propriétaires (detentions, retenues, encaissements).
- **Preuve expurgée (banc)** : preuves/auditeur/a/securite.md (section Constats) et requête SQL ci-dessus
- **Cause probable** : Règle du wiki jamais livrée ou remplacée par des journaux par module ; à trancher.
- **Correction proposée** : Mettre le wiki en cohérence avec le code, ou livrer un déclencheur d'audit sur les tables sensibles (ecritures, detentions, baux, retenues).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-A-06` — Insertion anonyme directe dans demandes_devis sans limite de débit

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur (auditeur/a) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Clé publique (anon) du site.
- **Étapes** : 30 POST /rest/v1/demandes_devis en rafale avec nom, e-mail (jeton anon uniquement).
- **Attendu** : Limite de débit au niveau de l'API ou captcha ; l'action serveur app/src/app/actions/devis.ts en prévoit une.
- **Observé** : 30 insertions sur 30 acceptées ; un message de 2 Mo est refusé par la contrainte CHECK demandes_devis_longueurs (taille bornée à 4000 caractères). Le contournement de l'action serveur est admis par le commentaire du code (ligne 17).
- **Preuve expurgée (banc)** : sortie console de la session (insertions anonymes) ; table demandes_devis de la copie
- **Cause probable** : Politique demandes_devis_insert_public (with check true) + droit d'insertion par colonne accordé à anon.
- **Correction proposée** : Limite de débit en périphérie (Vercel/Supabase) ou insertion réservée à la clé de service via l'action serveur.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-B-03` — Cookie de session lisible par script et marqué Secure seulement si NEXT_PUBLIC_SITE_URL commence par https://

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur-b (auditeur/b) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Production avec variable mal posée (hypothèse)
- **Étapes** : Lire lib/supabase/cookies.ts ; vérifier la variable côté Vercel
- **Attendu** : Secure garanti en production indépendamment de la variable
- **Observé** : Le cookie de session Supabase n'est pas HttpOnly (choix documenté) ; son drapeau Secure dépend d'une variable d'environnement : absente ou en http, la session circulerait en clair sans alerte. script-src garde 'unsafe-inline' (choix documenté faute de nonce). Aucun script exécutable n'a été trouvé (B-XSS-RENDU, B-XSS-ROLES) : risque résiduel, pas une faille démontrée.
- **Preuve expurgée (banc)** : snap-main/app/src/lib/supabase/cookies.ts ; preuves/auditeur/b/entetes.txt ; état de session du banc
- **Cause probable** : snap-main/app/src/lib/supabase/cookies.ts:15
- **Correction proposée** : Dériver Secure de VERCEL_ENV === 'production' en plus de la variable ; ajouter un test de configuration au démarrage
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `AUD-C-05` — L'arret d'urgence ne couvre pas les e-mails declenches par le webhook Stripe (hypothese a verifier)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un arret demande dans la supervision ; evenement Stripe reçu ensuite
- **Étapes** : Lire api/stripe/webhook/route.ts : envoyerAvisFinEssai et envoyerRelancesDues sont appeles sans verifierAvantEffet ; lib/email.ts n'a pas de garde. Les missions, l'orchestrateur et les routes cron en ont une.
- **Attendu** : Aucun nouvel effet sortant apres un arret ('Aucun nouvel effet ne sera lance').
- **Observé** : Code lu seulement ; non atteignable sur le banc (webhook non configure).
- **Preuve expurgée (banc)** : app/src/app/api/stripe/webhook/route.ts lignes 297 et 348 ; app/src/lib/controle-effets.ts
- **Cause probable** : Garde posee dans les missions, pas dans les chemins evenementiels.
- **Correction proposée** : Appeler verifierAvantEffet(db, 'abonnements') avant ces deux envois, ou documenter que l'arret ne couvre que les missions.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `AUD-C-07` — Les routes cron directes n'ont ni verrou de mission ni reservation avant envoi (doublon d'e-mail possible, hypothese a verifier)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Detenteur du CRON_SECRET appelant /api/cron/appels (ou quittances, relances, rappels) pendant que le repartiteur tourne
- **Étapes** : Lire appels/route.ts : appels_a_envoyer (sans reservation) puis envoi puis marquer_appel_envoye ; le verrou commencer_mission n'existe que dans le repartiteur equipes.
- **Attendu** : Une seule passe a la fois ou reservation des lignes avant envoi.
- **Observé** : Code lu ; le chemin autorise n'est pas atteignable sur le banc (secret absent). Vercel n'appelle que le repartiteur.
- **Preuve expurgée (banc)** : app/src/app/api/cron/appels/route.ts, app/src/lib/execution-mission.ts
- **Cause probable** : Routes historiques conservees apres l'ajout du repartiteur.
- **Correction proposée** : Retirer l'export direct ou le faire passer par executerMission.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `AUD-C-08` — Fichiers PDF orphelins possibles si le webhook Youtrust et la tache de nuit traitent le meme evenement en meme temps (hypothese a verifier)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Youtrust production configure ; evenement signature_request.done en cours de traitement par le webhook et repris par la tache
- **Étapes** : Lire lib/signature-worker.ts : controle !signee_le non atomique, deux depots Storage avec UUID aleatoire, puis finaliser_signature_youtrust ; la 2e finalisation rend l'existant sans erreur donc sans suppression des fichiers deposes.
- **Attendu** : Aucun fichier orphelin.
- **Observé** : Aucun effet financier ni juridique (un seul document signe en base, verrou for update) ; fichiers en double dans le bucket documents. Non atteignable sur le banc.
- **Preuve expurgée (banc)** : app/src/lib/signature-worker.ts lignes 24-50 ; migration finaliser_signature_youtrust
- **Cause probable** : Pas de reservation de l'evenement avant telechargement.
- **Correction proposée** : Passer l'evenement a 'en_cours' par update conditionnel avant le telechargement.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `CAR-05` — Privilèges de table et politiques RLS ne se recouvrent pas : 17 tables ont des privilèges d'écriture sans politique, 12 tables ont des politiques sans privilège

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Catalogue de gerimmo_ci_integ (amorçage local, droits par défaut propres à l'amorçage) ; RLS active sur 145/145 tables.
- **Étapes** : 1. psql gerimmo_ci_integ : has_table_privilege('authenticated', oid, 'insert\|update\|delete') croisé avec pg_policies.cmd par table ; 2. python3 scripts/03_base.py puis lire donnees/base.json › catalogue.tables / politiques
- **Attendu** : Les privilèges de table de `authenticated` et les politiques RLS portent sur les mêmes commandes (une seule source de vérité).
- **Observé** : Tables concernées : annonces(UPDATE), appels_loyer(INSERT/UPDATE/DELETE), bail_personnes(UPDATE), clotures_comptables(INSERT/UPDATE/DELETE), demandes_devis(DELETE), depot_encaissements(INSERT/UPDATE), ecritures(UPDATE/DELETE), equipements_catalogue(DELETE), lot_equipements(UPDATE), messages(INSERT/UPDATE/DELETE), quittances(INSERT/DELETE), rapports_gestion(INSERT/UPDATE/DELETE), relances(UPDATE), restitutions(INSERT/UPDATE/DELETE), retenues(INSERT/UPDATE/DELETE), revisions_loyer(INSERT/UPDATE/DELETE), site_pages(INSERT/UPDATE/DELETE). La RLS refuse ces écritures (aucune politique) ; la matrice de l'auditeur n'a constaté aucune écriture croisée (692 tentatives, 0 ligne). Ce n'est pas un contournement : c'est un privilège inutilement large. À l'inverse, 12 tables portent des politiques sans le privilège correspondant (accounts(UPDATE), cles_repartition(UPDATE/DELETE/UPDATE), demandes_devi…
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/base.json ; cartographie.md §3.2
- **Cause probable** : Octrois larges de tables (GRANT) posés avec la création des tables, politiques ajoutées commande par commande ; hypothèse non prouvée par les migrations.
- **Correction proposée** : Migration relue qui révoque INSERT/UPDATE/DELETE là où aucune politique n'existe, après vérification sur une copie.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `CAR-06` — Deux valeurs de `membership_role` (`proprietaire_mandant`, `garant`) n'ont ni fonction d'attribution repérée ni espace dédié

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : cartographe (cartographie) · **Version testée** : tête 9396669 (lecture et catalogue SQL)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Énumération membership_role du catalogue ; fonctions qui écrivent dans memberships.
- **Étapes** : 1. python3 scripts/03_base.py ; lire catalogue.fonctions[*].tables_ecrites contenant memberships ; 2. python3 scripts/04_transverse.py ; lire roles_usage
- **Attendu** : Chaque rôle de l'énumération a un chemin d'attribution et un espace, ou est marqué réservé.
- **Observé** : Fonctions qui écrivent dans memberships : initialiser_espace_proprietaire, inviter_agent, ouvrir_organisation, repondre_invitation_locataire, solliciter_artisan_interne, terminer_bail. Aucune ne pose `proprietaire_mandant` ; `garant` n'apparaît que dans un `case` d'inviter_agent. Fichiers du code qui les citent : proprietaire_mandant 3, garant 15 (surtout des libellés de rôle de personne). Les deux ont des durées de session (7 j / 30 j).
- **Preuve expurgée (banc)** : preuves/cartographie/donnees/transverse.json › roles_usage ; donnees/base.json
- **Cause probable** : Rôles prévus pour le mandat (agences, hors V1 publique) ; hypothèse non confirmée.
- **Correction proposée** : Documenter ces deux rôles comme réservés, ou les retirer de l'énumération lors d'une migration dédiée.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `ART-15` — La photo jointe par le locataire n'est visible de l'artisan ni au stade du devis ni sur la fiche de mission

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : artisan (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Incident déclaré avec photo (« Photo jointe. »)
- **Étapes** : 1. Ouvrir la demande de devis de l'artisan. 2. Ouvrir la fiche de la mission après la sélection du devis.
- **Attendu** : Photo disponible au moins après sélection du devis (pour préparer l'intervention), ou mention explicite qu'elle n'est pas transmise
- **Observé** : La description dit « Photo jointe » mais aucune photo n'apparaît dans les deux écrans (le propriétaire, lui, la voit). L'artisan chiffre à l'aveugle. À trancher : choix de confidentialité ou lacune.
- **Preuve expurgée (banc)** : preuves/chaine/1b/captures/a1-02-demande-detail.png ; preuves/chaine/1b/captures/a9-01-detail-mission.png
- **Cause probable** : mes_sollicitations ne renvoie aucun identifiant de pièce ; la photo est classée dans documents de l'organisation (non lisible par l'artisan). Hypothèse de fichier, non vérifiée.
- **Correction proposée** : Décision produit : exposer la photo à l'artisan retenu via une URL signée, ou masquer la mention « Photo jointe » dans la description transmise.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRO2-11` — Élision manquante dans le nom de parc généré : « Parc de Éloïse … » (même famille que LOC-02)

- **Sévérité** : P3 · **Statut** : à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livraison sont figées et simulées) ; à regrouper dans une prochaine migration · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire dont le prénom commence par une voyelle
- **Étapes** : Ouvrir l'écran artisan de la demande de devis ou le PDF : le client est nommé « Parc de Éloïse [TEST-proprietaire] Durand-Lévêque ».
- **Attendu** : « Parc d'Éloïse … »
- **Observé** : « Parc de Éloïse … » dans l'espace artisan et sur le PDF du devis
- **Preuve expurgée (banc)** : preuves/chaine/1b/captures/a1-02-demande-detail.png ; preuves/chaine/1b/fichiers/devis-v1-artisan.pdf
- **Cause probable** : Génération du nom d'organisation par concaténation « Parc de » + prénom à l'inscription. Hypothèse de fichier, non vérifiée.
- **Correction proposée** : Appliquer l'élision (de / d') avant voyelle ou h muet.
- **Correction sans aval** : oui

#### `CHN-02` — La validation de la facture, l'écriture de règlement et la clôture de l'incident ne laissent aucune ligne au journal d'audit : seule la chronologie de l'incident les garde

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : chaine (propriétaire n°2, super-administrateur) (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Chaîne complète sur le propriétaire n°2
- **Étapes** : Valider la facture (22:53), saisir l'écriture de 239,68 € (22:55), clôturer l'incident (22:56), puis lire le journal d'audit de l'organisation
- **Attendu** : Les décisions financières (validation d'une facture, écriture de règlement) figurent au journal d'audit « actions sensibles », au même titre que l'annulation d'une écriture
- **Observé** : audit_log de l'organisation n°2 entre 22:35 et 23:05 : aucune ligne ; la validation est seulement dans incident_evenements (facture_validee, avec l'acteur) ; l'annulation d'écriture, elle, est journalisée (contre_ecriture) : la correction est tracée, la décision initiale ne l'est pas
- **Preuve expurgée (banc)** : sql/audit-log-chaine2.txt
- **Cause probable** : valider_facture_artisan et la saisie d'écriture n'insèrent pas dans audit_log (seule contre_ecriture l'a depuis la migration 20261013120000)
- **Correction proposée** : Journaliser facture_validee et ecriture_creee (montant, catégorie, lien facture) dans audit_log ; à rapprocher des lacunes de traçabilité AUD-A déjà au registre
- **Correction sans aval** : non (aval du dirigeant requis)

#### `CHF-05` — Le wiki « Fiscalité » ne s'appuie sur aucune source officielle (quatre sites commerciaux seulement) et affirme encore « non implémentée » pour des fonctions livrées ; le wiki « Régularisation des cha…

- **Sévérité** : P3 · **Statut** : à trancher — avertissement ajouté à la page Fiscalité ; les sources officielles n'ont pu être consultées (réseau bloqué) : à compléter quand l'accès est ouvert · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lecture de wiki/concepts/Fiscalité.md et wiki/processus/Régularisation des charges.md.
- **Étapes** : 1. Lire l'encadré « Décision produit — non implémentée » en tête des deux pages. 2. Lire leurs sections postérieures (« Phase 1 livrée », « Audit de gestion du 29/09/2026 »). 3. Lire la section « Sources web ».
- **Attendu** : Wiki cohérent, chaque règle fiscale rattachée à une source officielle datée (CLAUDE.md : traçabilité des affirmations).
- **Observé** : Encadré « Aucune implémentation dans le code » contredit par les sections suivantes ; sources de la matrice des régimes = Finalib, Maslow, jedeclaremonmeuble, Manda. À ajouter à FIN-10 (wiki non mis à jour sur 229/230).
- **Preuve expurgée (banc)** : wiki/concepts/Fiscalité.md (sources web) ; wiki/processus/Régularisation des charges.md (encadré de tête)
- **Cause probable** : Mise à jour du wiki non faite après les livraisons
- **Correction proposée** : Remplacer les encadrés, citer service-public.fr / impots.gouv.fr / legifrance.gouv.fr avec date de consultation.
- **Correction sans aval** : oui

#### `CHF-07` — Hypothèse à vérifier : une contre-écriture est datée du jour de l'annulation, non de la pièce d'origine ; annuler en janvier un encaissement de décembre déplace le correctif sur l'exercice suivant.

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Encaissement annulé après le changement d'année.
- **Étapes** : Observé seulement dans la même année : paiement du 07/09/2026 annulé le 14/10/2026, contre-écriture datée du 14/10/2026.
- **Attendu** : Règle de rattachement à l'exercice à confirmer avec une source officielle.
- **Observé** : Date de la contre-écriture = date du jour ; le cas inter-exercices n'a pas été rejoué.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/sql (requête ecritures, contre_ecriture_de non nul)
- **Cause probable** : SQL contre_ecriture / supprimer_encaissement (date_piece = jour)
- **Correction proposée** : Si le rattachement à l'exercice d'origine est exigé, dater la contre-écriture de la pièce annulée.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `CHF-09` — Un encaissement saisi par erreur puis retiré (net 0,00 €) reste « à qualifier » et empêche de générer le PDF du lot tant qu'il n'est pas qualifié à la main.

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lot nu avec exercice confirmé et récapitulatif complet ; bail dont tous les appels sont soldés.
- **Étapes** : 1. Encaisser 1,00 € sur le bail B (aucun appel à solder : avance). 2. Le retirer avec un motif (contre-écriture). 3. Ouvrir le récapitulatif fiscal 2026. 4. Générer le PDF « Récapitulatif annuel · location nue » du lot B.
- **Attendu** : La paire pièce + contre-écriture s'annule : rien à qualifier, PDF généré.
- **Observé** : L'écran garde « Divers/loyer · 1.00 € — à qualifier » et l'alerte « Une avance… » ; le PDF répond « Le récapitulatif 2026 de ce lot n'est pas complet… ». La pièce annulée doit être qualifiée pour débloquer le document.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/captures/fiscal-apres-depot.txt ; preuves/charges-fiscalite/captures/doc-b-apres-annulation-resultat.png
- **Cause probable** : app/src/lib/fiscal.ts : la fonction inconnue() est appelée pour la pièce et pour sa contre-écriture sans compenser les deux ; la liste « à qualifier » est gardée par identifiant d'origine.
- **Correction proposée** : Ne pas signaler une pièce dont la contre-écriture l'annule exactement dans l'exercice. Logique fiscale : validation spécialisée recommandée.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `EDI-01` — La ligne éditoriale de la veille accepte « agence » comme public valide (PUBLICS_JOURNAL) : un article visant seulement les agences passerait le filtre de pertinence en V1

- **Sévérité** : P3 · **Statut** : à trancher — ligne éditoriale · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : marketing (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : public de la veille aligné sur le périmètre V1 (bailleurs, locataires, artisans)
- **Observé** : app/src/lib/pertinence-veille.ts ligne 17 : ["bailleur", "agence", "locataire"]
- **Preuve expurgée (banc)** : lecture du code
- **Correction proposée** : retirer « agence » et ajouter « artisan » : changement de ligne éditoriale, à trancher
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PUB-03` — Les textes juridiques (conditions générales, mentions légales, confidentialité) décrivent encore l'offre et la tarification agence

- **Sévérité** : P3 · **Statut** : à trancher — textes juridiques non modifiés · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : juridique (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : textes alignés sur le périmètre V1, après décision du dirigeant ou avis juridique
- **Observé** : app/src/app/conditions/page.tsx (paiement, prix HT des agences, définition du client), mentions-legales, confidentialite
- **Preuve expurgée (banc)** : lecture du code, app/src/app/conditions/page.tsx lignes 57, 62, 127, 272, 278
- **Correction proposée** : non modifiés : décision à prendre (retirer ou conserver les paragraphes agence)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `DES-A-06` — Hors ligne : la navigation interne bascule sur la page d'erreur du navigateur (en anglais) et n'en sort pas au retour du réseau

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire ou locataire connecté, 390×844, réseau coupé juste avant un clic sur un onglet du menu
- **Étapes** : 1. Ouvrir le tableau de bord. 2. Couper le réseau. 3. Toucher « Finances » (propriétaire) ou « Paiements » (locataire). 4. Rétablir le réseau sans rien toucher.
- **Attendu** : Un message de l'application (« Connexion perdue, réessayez ») et un retour automatique ou un bouton « Réessayer » ; l'utilisateur reste dans l'application
- **Observé** : Le navigateur affiche « No internet / ERR_INTERNET_DISCONNECTED » (page non française), l'onglet reste sur cette page d'erreur, et après retour du réseau la page reste en erreur tant que l'utilisateur ne recharge pas. En revanche, au chargement lent (latence 1,8 s, 60 ko/s) un squelette de chargement s'affiche, et quand les requêtes RSC reçoivent un 500 la navigation retombe sur un chargement complet qui réussit.
- **Preuve expurgée (banc)** : etats/prop-hors-ligne-390.png ; etats/loc-hors-ligne-390.png ; etats/etats-journal-prop.json ; etats/etats-journal-loc.json (relancés sur la candidate)
- **Cause probable** : Aucune page de repli hors ligne ni service worker : la navigation Next retombe sur une navigation document qui échoue.
- **Correction proposée** : Ajouter un repli hors ligne (service worker + page /hors-ligne en français) ; c'est une décision produit, pas une retouche.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `DES-A-07` — Vocabulaire d'agence encore visible dans les parcours propriétaire et locataire de la V1

- **Sévérité** : P3 · **Statut** : à trancher — partiellement corrigée en branche ; reste à trancher : 4) veille réglementaire — Masquer l'audience « Agences et agents immobiliers » demande de savoir si le lecteur est un gérant d'agence : la page ne le sait pas (le paramètre retour /agence/<id> sert aussi aux propriétaires dire · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Comptes proprietaire@gerimmo-demo.fr (propriétaire direct) et locataire.pd@gerimmo-demo.fr
- **Étapes** : Ouvrir /assistance (formulaire d'aide) ; /agence/<id>/alertes (alerte confiée à tous) ; /agence/<id>/comptabilite/reprise ; /veille?public=bailleur et ?public=locataire
- **Attendu** : Aucune notion d'agence, d'administrateur d'agence ou de mandat dans les écrans d'un propriétaire direct et de son locataire
- **Observé** : (1) /assistance et FAQ propriétaire : « Votre demande est visible de vous, de l’équipe Gerimmo et de l’administrateur de l’agence concernée. » ; (2) alerte : « confiée à toute l’agence » ; (3) reprise comptable : « Détenteur du dépôt (agence ou proprietaire) » (et « proprietaire » sans accent) ; (4) veille réglementaire : l'audience « Agences et agents immobiliers » est listée pour bailleurs et locataires. À noter côté positif : /locataire/<id>/contact utilise bien « Votre gestionnaire » pour un propriétaire direct (contact/page.tsx:36-42).
- **Preuve expurgée (banc)** : journaux/auto-proprietaire-1280.json et journaux/auto-locataire+locataire_pd-1280.json (mesure.mentionsAgence) ; journaux/auto-proprietaire-390.json
- **Cause probable** : app/src/app/assistance/formulaire-retour.tsx:53 ; app/src/app/agence/[orgId]/alertes/modale-alerte.tsx:43 (assigned_all → « toute l’agence ») ; app/src/lib/reprise-soldes.ts:29 ; app/src/lib/veille-reglementaire.ts:1 (PUBLICS_VEILLE.agence) listée par app/src/app/veille/page.tsx
- **Correction proposée** : formulaire-retour.tsx:53 → « … de l’équipe Gerimmo et, le cas échéant, de votre gestionnaire. » ; modale-alerte.tsx:43 → « toute l’équipe » ; reprise-soldes.ts:29 → « Détenteur du dépôt (vous ou votre gestionnaire) » ; masquer l'audience « agence » des onglets de /veille pour les profils non agence.
- **Correction sans aval** : oui

#### `DES-A-08` — Toutes les pages du propriétaire direct vivent sous l'adresse /agence/<id>/… (adresse visible, partagée, mise en favori)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire direct
- **Étapes** : Ouvrir n'importe quel écran propriétaire et lire l'URL
- **Attendu** : Une adresse sans le mot « agence » dans une V1 qui ne présente plus les agences
- **Observé** : URL de la forme /agence/3c1d…/parc, /agence/3c1d…/loyers, etc. pour les 35 écrans propriétaire relevés
- **Preuve expurgée (banc)** : journaux/auto-proprietaire-390.json (cheminFinal)
- **Cause probable** : Le segment de route app/src/app/agence/[orgId] est partagé entre agences et propriétaires directs
- **Correction proposée** : Refonte : alias /espace/<id>/… avec redirections 301 depuis /agence/<id>/…, à décider avec l'équipe ; ne pas toucher sans aval.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `DES-A-10` — Le logo doré posé à nu sur fond clair est quasi illisible sur mobile (≈ 1,5:1), alors que la page d'inscription artisan le présente dans une tuile bleu nuit (≈ 13,6:1)

- **Sévérité** : P3 · **Statut** : à trancher — décision D28 de la page de décisions groupées · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : 390×844 ; pages /connexion, /inscription, /mot-de-passe-oublie, 404 publique et en-tête mobile de l'espace propriétaire
- **Étapes** : Ouvrir ces pages et comparer au haut de /artisan/inscription
- **Attendu** : Même traitement du logo sur tous les écrans d'entrée (tuile bleu nuit ou variante foncée), sans toucher à l'identité
- **Observé** : Contraste mesuré sur les captures (trait le plus contrasté du logo contre le fond) : ≈ 1,48:1 sur /connexion, ≈ 1,5:1 dans l'en-tête propriétaire ; ≈ 13,6:1 sur /artisan/inscription (tuile). Un logotype est exempté du critère 1.4.3 de WCAG, mais le nom du produit se lit à peine au premier écran de connexion.
- **Preuve expurgée (banc)** : avant/public/connexion-390.png ; avant/proprietaire/accueil-390.png ; avant/public/inscription-artisan-390.png ; planches/pub-390-forms.png
- **Cause probable** : app/src/components/coquille-auth.tsx:43 et app/src/app/agence/[orgId]/layout.tsx:219 (.coquille-marque-mobile, prestige.css:413 : logo 64 px sans fond) ; l'en-tête artisan/public utilise déjà la tuile
- **Correction proposée** : Réutiliser la tuile existante (fond var(--marque), rayon 10 px, padding 4 px 8 px) autour du logo dans .coquille-marque-mobile et dans la coquille d'authentification ; aucune refonte d'identité.
- **Correction sans aval** : oui

#### `DES-A-11` — L'adresse est « facultative » à l'inscription propriétaire mais bloque ensuite la création du premier bien

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire neuf créé par /inscription sans adresse, code postal ni ville (champs marqués « facultatif »)
- **Étapes** : 1. S'inscrire sans adresse. 2. Sur « Mes lots » vide, toucher « Créer mon premier bien ». 3. Lire la page « Créer un lot ».
- **Attendu** : Même exigence à l'inscription et à l'usage : soit adresse/code postal/ville demandés (et marqués obligatoires) à l'inscription, soit le premier bien créable sans détour
- **Observé** : La page « Créer un lot » est remplacée par « Complétez d'abord votre profil — Il manque votre adresse. Ils vous désignent comme bailleur dans le bail… sans eux, le bien ne peut pas être créé » avec un bouton vers /profil. Le message est clair et le détour fonctionne (profil enregistré en double clic : 1 seule requête, bouton « Profil enregistré », assistant de 6 étapes disponible ensuite), mais l'inscription a annoncé ces champs comme facultatifs et le CTA principal de « Mes lots » mène à un écran d'attente.
- **Preuve expurgée (banc)** : etats/neuf/ajout-bien-390.png ; etats/neuf/lots-390.png ; etats/neuf/profil-enregistre-390.png ; etats/neuf/assistant-lot-390.png ; avant/public/inscription-390.png
- **Cause probable** : Écrans /inscription (champs « Adresse postale (facultatif) ») et app/src/app/agence/[orgId]/parc/nouveau (porte « Complétez d'abord votre profil »)
- **Correction proposée** : Retirer « (facultatif) » des trois champs d'adresse de l'inscription et les rendre obligatoires, ou, sur « Mes lots » vide, remplacer le CTA par « Compléter mon profil pour créer un bien ». Choix produit ; les textes seuls sont sans aval.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `DES-B-10` — Logo doré quasi illisible sur l'en-tête blanc : artisan à 768 px et super-admin à 390 et 768 px (même défaut que DES-A-10)

- **Sévérité** : P3 · **Statut** : à trancher — décision D28 de la page de décisions groupées · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan à 768x1024 ; compte superadmin à 390x844 et 768x1024
- **Étapes** : Ouvrir /artisan/devis à 768 px, /admin à 390 et 768 px
- **Attendu** : Logo lisible (rapport >= 3:1) ; l'artisan à 390 px a un en-tête bleu nuit où il se lit bien
- **Observé** : Pixel le plus contrasté du logo sur fond blanc : (234,206,149), (231,196,142) et (234,207,168), soit des rapports de 1,53 ; 1,66 et 1,50 pour 1 (mesure sur les captures). Sur 1280 px, la marque est sur le rail bleu nuit.
- **Preuve expurgée (banc)** : auto/artisan/artisan-devis-768.png ; auto/superadmin/admin-768.png ; auto/superadmin/admin-390.png
- **Cause probable** : En-têtes blancs des coquilles artisan (≥ 641 px) et admin (≤ 900 px) avec le logo doré posé à nu ; voir DES-A-10
- **Correction proposée** : Même tuile bleu nuit que l'inscription artisan : `rounded-xl bg-[#152f4b] px-3 py-1` autour de <MarqueGerimmo surEncre /> (cf. artisan/layout.tsx:47, déjà utilisée pour la version sans session)
- **Correction sans aval** : oui

#### `IA-06` — L'arrêt d'urgence ne couvre pas le traitement immédiat du webhook Yousign ; la clé 'sauvegarde' n'a aucun lecteur (confirmation par lecture de SUP-07)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Arrêt global actif
- **Étapes** : 1. Lire youtrust/webhook/route.ts:49-57 et signatures/route.ts:45 ; 2. Rechercher verifier_arret dans .github et app/scripts
- **Attendu** : Aucun nouvel effet après un arrêt d'urgence
- **Observé** : Constat statique : le webhook appelle traiterEvenementSignature sans avantEffet (téléverse des PDF signés et finalise la signature) alors que le cron le passe ; aucune occurrence de verifier_arret dans le workflow de sauvegarde ni dans ses scripts. Complète AUD-C-05 et SUP-07 ; le webhook Yousign est inactif tant que Youtrust n'est pas en production.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-06)
- **Cause probable** : app/src/app/api/youtrust/webhook/route.ts:51-56 ; .github/workflows/sauvegarde.yml
- **Correction proposée** : Passer () => verifierAvantEffet(supabase, 'signatures') au traitement immédiat ; faire lire la clé 'sauvegarde' par le workflow ou retirer la clé de l'écran (D2)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-07` — Des éléments d'automatisation existent sans écrivain ni appelant : automation_events, log_automation_event, automation_stats_30d, autoriser_orchestration

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Code au commit 83ba492
- **Étapes** : Rechercher ces noms dans app/src et dans les migrations postérieures à 20260922120000
- **Attendu** : Une automatisation annoncée est branchée, ou son état 'préparé' est dit
- **Observé** : Constat statique : aucune occurrence dans app/src ; aucun écrivain en SQL après la migration d'origine ; le taux d'automatisation affiché vient de tech_log (automatisation.ts). mode='automatique' d'orchestration_cases est un libellé : la file n'exécute rien.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-07)
- **Cause probable** : app/supabase/migrations/20260922120000_autonomie_v3.sql:48-110,143-158
- **Correction proposée** : Décider : alimenter automation_events par les passages (utile pour le registre d'exécution des équipes IA) ou documenter 'préparé, non alimenté'
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-09` — La tâche territoire peut préparer une campagne-idée 'essai avec des agences', alors que les agences sont hors du périmètre public V1

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un département avec au moins 20 agences, un ratio agences/logements >= 0,001, la porte de santé ouverte
- **Étapes** : 1. Lire score-territoire.ts:65-73 et territoire/route.ts:185-191 ; 2. Lire 20260922223000_preparer_recrutement_territorial.sql
- **Attendu** : Aucune préparation visant un public hors V1 sans aval
- **Observé** : Constat statique : prioriteTerritoriale peut rendre 'agences' ; preparer_recrutement_territorial crée alors une ligne marketing_campagnes au statut 'idee', budget 0 (brouillon interne, aucune diffusion). Effet non rejoué. Voir EDI-01.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-08/09)
- **Cause probable** : app/src/lib/score-territoire.ts:69-70
- **Correction proposée** : Exclure 'agences' de la priorité tant que le périmètre V1 l'exclut, ou la garder explicitement marquée 'hors V1' (décision du dirigeant)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-11` — Aucun registre d'exécution n'a de règle de rétention (agent_passages, supervision_operations, points_du_matin, decisions_du_matin, brief_direction_snapshots)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Code au commit 83ba492
- **Étapes** : 1. Rechercher les suppressions de ces tables dans les migrations ; 2. Lire appliquer_retention (20260927142000_conservation_depuis_fin_du_contrat.sql:160-266)
- **Attendu** : Chaque journal a une durée de conservation écrite (Registre des traitements)
- **Observé** : Constat statique : seuls tech_log, acces_pieces_log, audit_log, alertes fermées et certains documents sont purgés. Les nouveaux registres des équipes IA devraient avoir une règle dès leur création. Voir SUP-05 pour les instantanés (données nominatives).
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-11)
- **Cause probable** : app/supabase/migrations/20260728_sprint1_ged_alertes_retention.sql:155-172 (règles) ; fonction appliquer_retention
- **Correction proposée** : Ajouter une règle par registre (par exemple 12 mois) validée avec le dirigeant ; source CNIL des durées : non consultée
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-12` — Hypothèse à vérifier : les textes et visuels produits avec l'IA et publiés sur le site et Facebook ne portent aucune mention d'origine

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un post de veille ou un visuel généré est publié
- **Étapes** : 1. Rechercher une mention d'origine IA dans app/src/app/journal, app/src/app/veille, facebook.ts, contenu-marketing.ts ; 2. Lire § 7 de propositions.md (règlement 2024/1689, art. 50)
- **Attendu** : L'obligation de transparence éventuellement applicable est qualifiée et respectée
- **Observé** : Constat statique : aucune mention. Selon la Commission européenne (page non ouverte, résultat de recherche), les obligations de l'article 50 s'appliquent à partir du 2 août 2026, avec un délai de grâce pour le marquage évoqué dans le paquet 'Omnibus IA' dont le statut est à vérifier. Qualification juridique non faite.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-12) ; preuves/equipes-ia/propositions.md § 7
- **Cause probable** : Conception : aucun libellé 'illustration générée' dans components/image-journal.tsx ni dans la page article
- **Correction proposée** : Faire qualifier l'obligation (D9), puis ajouter si nécessaire une mention et un marquage lisible par machine
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PRF-02` — Lien de nouveau mot de passe sans session : réponse 200 puis redirection côté client, avec décalage visible (CLS 0,346 à 390 px)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Visiteur sans session (cas d'un lien de récupération expiré ou déjà utilisé) ; aucun étranglement ; version candidate.
- **Étapes** : 1. GET /nouveau-mot-de-passe (curl, puis Chromium 390 et 1280). 2. Lire le statut, le corps et les layout-shift.
- **Attendu** : Refus avant rendu : 307 vers /connexion?raison=lien-invalide, comme /admin, /assistance ou /agence/<id> pour un anonyme ; aucun décalage.
- **Observé** : HTTP 200 ; le corps contient NEXT_REDIRECT;replace;/connexion?raison=lien-invalide;307 ; la redirection est faite par le navigateur ; CLS 0,346 à 390 px et 0,106 à 1280 px, identique sur 3 + 3 chargements répétés et sur les 2 passes ; le bloc « Connexion » saute de [25,325,340,194] à [0,24,390,820] (390 px). Même mécanisme que PRF-01 une fois sur /connexion.
- **Preuve expurgée (banc)** : preuves/perf-liens/cls-nouveau-mot-de-passe-390.png ; preuves/perf-liens/exp1-sortie.txt ; preuves/perf-liens/corps-nmdp.html ; preuves/perf-liens/mesures.csv (lignes /nouveau-mot-de-passe)
- **Cause probable** : app/src/app/nouveau-mot-de-passe/page.tsx:15 : redirect("/connexion?raison=lien-invalide") appelé dans la page après le flush de la coquille de app/src/app/loading.tsx ; le statut est déjà 200. Le décalage vient de /connexion (PRF-01).
- **Correction proposée** : Décider l'absence de session avant le rendu (proxy) pour renvoyer un vrai 307 ; corriger PRF-01 pour supprimer le décalage.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRF-03` — Accès interdits ou objets inexistants : le document répond 200 (redirection ou 404 faites côté client), seul le visiteur anonyme reçoit un vrai 307

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Sessions des 5 profils ; 157 écrans de la matrice ; version candidate.
- **Étapes** : 1. Demander en GET chaque écran de la matrice avec la session d'un autre profil (631 requêtes) et avec un visiteur anonyme. 2. Sondes d'erreurs : identifiants nuls, non-UUID, autre organisation, /journal/inexistant. 3. Lire statut et corps.
- **Attendu** : Statut de document cohérent : 307/401/403 pour un accès interdit, 404 pour un objet inexistant.
- **Observé** : Anonyme : 138 réponses 307 sur 138 écrans protégés (la 139e, /artisan/inscription, est une page publique : 200 attendu). Profils connectés : 490 réponses 200 sur 492 dont le corps contient NEXT_REDIRECT (retour vers /espaces ou accueil) ; 2 vrais 404 (/quittance/<id> pour propriétaire et artisan). Objets inexistants : /agence/<org>/parc/<0…0>, /agence/<org>/baux/pas-un-uuid, /artisan/missions/<0…0>, /journal/inexistant répondent 200 avec « Erreur 404 Cette page est introuvable » (le journal porte meta robots noindex). Les routes sans correspondance (/page-inexistante, /outils/inconnu) et /quittance/<id> renvoient un vrai 404. Aucune donnée d'autre organisation constatée dans ces réponses (voir PRF-04). Effets : supervision et journaux d'accès ne distinguent pas refus et succès ; vérificateurs de liens et robots voient des « soft 404 ».
- **Preuve expurgée (banc)** : preuves/perf-liens/authz-scan.json ; preuves/perf-liens/authz-scan2-sortie.txt ; preuves/perf-liens/sondes-erreurs.json ; preuves/perf-liens/sondes-corps.json ; preuves/perf-liens/exp6-sortie.txt ; preuves/perf-liens/introuvable-mission-200.png
- **Cause probable** : Frontière de streaming racine app/src/app/loading.tsx : tout redirect() ou notFound() exécuté dans un layout ou une page après l'envoi de la coquille devient une instruction côté client sous un statut 200 ; seuls les contrôles du proxy (anonyme) répondent 307.
- **Correction proposée** : Prendre la décision d'accès (appartenance à l'organisation, rôle) dans le proxy avant tout rendu, ou limiter la frontière de chargement aux segments sans contrôle d'accès ; pour /journal/[slug], valider l'existence avant le flush. À arbitrer : changement de comportement global de navigation.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRF-04` — Défense en profondeur : la garde des pages /admin vit dans le layout ; la page s'exécute pour un non-super-administrateur et sa charge utile part avant la redirection (bornée par la RLS)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte locataire (Agence Alpha) ; version candidate.
- **Étapes** : 1. GET /admin/marque-blanche avec la session du locataire. 2. Chercher dans le corps le nom d'organisation. 3. Étendre à 631 requêtes croisées avec 34 jetons (noms d'organisations, noms et e-mails du jeu de démonstration).
- **Attendu** : Aucun contenu de la page d'administration dans la réponse d'un non-super-administrateur.
- **Observé** : HTTP 200, 21 536 octets ; le flux RSC contient le contenu propre de la page (<h2> « Agence Alpha » et sa pastille de la liste des organisations) avant la redirection vers /espaces. Sur 631 requêtes croisées, seuls les noms de l'organisation de l'acteur lui-même apparaissent (menu ou liste filtrée par RLS) ; aucun nom d'une autre organisation (Agence Beta, Parc de Fisc, Parc de Éloïse), aucune adresse e-mail. Aucune fuite constatée aujourd'hui. Aucun client à clé de service dans app/src/app/admin (recherche textuelle).
- **Preuve expurgée (banc)** : preuves/perf-liens/fuite-verif-sortie.txt ; preuves/perf-liens/authz-scan2-sortie.txt ; preuves/perf-liens/tokens-donnees.json (liste des jetons de recherche, données de démonstration)
- **Cause probable** : app/src/app/admin/layout.tsx : `if (!estSuperAdmin) redirect("/espaces")` ; les pages n'ont pas leur propre garde (commentaires « Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond » dans admin/page.tsx:61, devis/page.tsx:14, sante/page.tsx:63). Un layout n'empêche pas la page de s'exécuter en parallèle.
- **Correction proposée** : Ajouter la garde is_super_admin au proxy pour /admin/* (avant rendu) ou dans chaque page ; ajouter un test automatisé de non-fuite par jetons sur les accès croisés ; garder la RLS comme filet. Reste valable tant qu'aucune page /admin n'utilise un client à clé de service.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRF-05` — Poids et mise en cache : logo de 292 Ko (2016×1594) et illustration de 298 Ko chargés sur chaque écran d'espace, servis avec max-age=0 ; ils portent le LCP des écrans d'agence

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bureau 1280 px, cache vide ; profils agent, administrateur, propriétaire ; version candidate.
- **Étapes** : 1. Charger l'accueil agent et la fiche diagnostics. 2. Lister les ressources (PerformanceResourceTiming) et le LCP. 3. curl -I sur /logo/gerimmo-officiel.png et /illustrations/quartier-gerimmo-2026.jpg ; requête conditionnelle If-None-Match.
- **Attendu** : Images dimensionnées à leur usage (via next/image ou fichiers réduits) et cache longue durée comme /_next/static (immutable).
- **Observé** : /logo/gerimmo-officiel.png : PNG RGBA 2016×1594, 292 196 octets ; /illustrations/quartier-gerimmo-2026.jpg : 298 659 octets (fond de la colonne latérale, découverte tardivement par la feuille de style, début ≈ 500 ms) ; ensemble ≈ 580 Ko sur 0,95 à 2 Mo transférés par écran de bureau (médiane 944 Ko, maximum 2 039 Ko). En-tête Cache-Control: public, max-age=0 (revalidation à chaque page, 304 confirmé) contre public, max-age=31536000, immutable pour /_next/static. Le logo transparent passé par /_next/image pèse 1,2 Ko à 96 px. LCP de ces écrans = <aside class="coquille-late"> ≈ 0,6 s sur banc. Aucun dépassement de budget sur banc : LCP maximal mesuré 644 ms (1280) et 668 ms (390) ; sous réseau 1,6 Mbit/s + processeur ×4, LCP 1,2 à 2,0 s, sous 2,5 s.
- **Preuve expurgée (banc)** : preuves/perf-liens/mesures.md ; preuves/perf-liens/mesures.csv ; preuves/perf-liens/etranglement-390.json ; preuves/perf-liens/synthese-par-ecran.json
- **Cause probable** : app/src/app/prestige.css:474 et :485 (url("/illustrations/quartier-gerimmo-2026.jpg")), app/src/lib/charte-gerimmo.ts:13 (logo: "/logo/gerimmo-officiel.png") ; absence d'en-têtes de cache pour /logo et /illustrations dans next.config.ts (headers() ne traite que /auth/*).
- **Correction proposée** : Servir le logo et l'illustration en formats réduits (WebP/AVIF, largeur utile) via next/image ou fichiers dédiés ; ajouter des en-têtes Cache-Control longue durée pour /logo/* et /illustrations/* (noms versionnés) ; précharger l'image de fond ou la déclarer en priorité. Décision de charte graphique à valider.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRF-07` — Console de supervision : « Voir le formulaire sur le site » n'affiche pas le formulaire pour un super-administrateur connecté

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-administrateur connecté ; écran /admin/devis (aucune demande commerciale).
- **Étapes** : 1. Ouvrir /admin/devis. 2. Cliquer « Voir le formulaire sur le site » (href="/#contact", target=_blank).
- **Attendu** : L'accueil public s'ouvre à l'ancre #contact.
- **Observé** : Le nouvel onglet atterrit sur /admin/brief « Aujourd'hui » : l'accueil « / » redirige tout utilisateur connecté vers /espaces puis vers son espace ; l'ancre #contact existe pourtant sur l'accueil public (id="contact").
- **Preuve expurgée (banc)** : preuves/perf-liens/lien-admin-devis-formulaire.png ; preuves/perf-liens/liens.md
- **Cause probable** : Redirection de « / » pour les sessions ouvertes ; lien rédigé sans tenir compte de cette règle (écran /admin/devis).
- **Correction proposée** : Indiquer « à ouvrir dans une fenêtre de navigation privée », ou prévoir un aperçu public accessible aux sessions ouvertes (paramètre explicite). À arbitrer avec le propriétaire du produit.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRF-08` — Page de confidentialité : « Aide et retours » mène un visiteur sans compte à la page de connexion ; contact éditeur « (à venir) » sur le banc

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Visiteur anonyme ; page publique /confidentialite ; banc sans coordonnées d'éditeur configurées.
- **Étapes** : 1. Ouvrir /confidentialite. 2. Cliquer « « Aide et retours » » (href=/assistance). 3. Lire la page /confidentialite, /mentions-legales et /conditions pour le moyen de contact.
- **Attendu** : Un visiteur sans compte dispose d'un moyen de contact pour ses demandes de données personnelles.
- **Observé** : Le lien renvoie en 307 vers /connexion?suite=%2Fassistance (constaté). Sur le banc l'adresse de contact de l'éditeur est un espace réservé « adresse de contact (à venir) » sur les trois pages (aucun mailto affiché) : un visiteur sans compte n'a pas de canal. En production l'adresse est peut-être renseignée : hypothèse à vérifier pour la partie contact.
- **Preuve expurgée (banc)** : preuves/perf-liens/lien-confidentialite-aide.png ; preuves/perf-liens/liens.md
- **Cause probable** : app/src/app/confidentialite/page.tsx:352-361 (lien « Aide et retours » ; mailto affiché seulement si courrielDeContact() de app/src/lib/editeur.ts:106 renvoie une adresse).
- **Correction proposée** : Vérifier que l'adresse de contact est bien configurée en production avant ouverture ; préciser dans le texte que « Aide et retours » exige un compte.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRF-10` — Journal serveur : erreur « The destination stream closed early » (digest 2041379235) non attribuée ; 69 % des préchargements de liens sont annulés

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : perf-liens (perf-liens) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Serveur 3100 (next start) ; campagne de ≈ 1 000 chargements ; journal /tmp/gerimmo-web.log.
- **Étapes** : 1. Comparer le journal avant et après la campagne. 2. Provoquer 30 annulations côté client de réponses RSC préchargées. 3. Chronométrer les préchargements de l'accueil agent.
- **Attendu** : Aucune erreur de niveau « error » pour une annulation de lecture par le navigateur ; préchargements menés à terme.
- **Observé** : Une ligne d'erreur nouvelle pendant la campagne (4 au total dans le journal, 3 antérieures) ; non reproduite par 30 annulations provoquées (0 ligne nouvelle) : écran d'origine inconnu. Observation liée : sur l'accueil agent, 24 des 35 URL préchargées (RSC) sont annulées par le navigateur environ 70 ms après l'ouverture, sans réussite ultérieure ; 6 366 requêtes ERR_ABORTED sur 507 chargements, 0 autre type d'échec. Lien de cause non établi : hypothèse à vérifier (annulation normale du routeur ou gaspillage de préchargements).
- **Preuve expurgée (banc)** : preuves/perf-liens/journal-serveur-avant.log ; preuves/perf-liens/exp1-sortie.txt ; preuves/perf-liens/mesures.csv (colonne requetes_annulees_ERR_ABORTED)
- **Cause probable** : Hypothèse : lecture de flux RSC annulée par le client (routeur Next 16) ; non vérifié.
- **Correction proposée** : Reproduire avec journaux horodatés ; si l'annulation est normale, filtrer ce message du niveau « error » dans la supervision.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PROP-05` — Nom d'espace sans élision : « Parc de Éloïse … »

- **Sévérité** : P3 · **Statut** : à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livraison sont figées et simulées) ; à regrouper dans une prochaine migration · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : inscription avec prénom commençant par une voyelle ou un H muet
- **Étapes** : créer le compte avec prénom « Éloïse »
- **Attendu** : « Parc d’Éloïse … »
- **Observé** : organizations.name = « Parc de Éloïse [TEST-proprietaire] Durand-Lévêque » ; affiché dans le bandeau d'accueil
- **Preuve expurgée (banc)** : captures/s1-12-espace-ouvert-bureau.png ; SQL organizations.name
- **Cause probable** : construction de la chaîne « Parc de ${prénom} ${nom} » sans règle d'élision
- **Correction proposée** : utiliser « d’ » devant voyelle/h
- **Correction sans aval** : oui

#### `PROP-08` — Recherche globale (⌘K) insensible à la casse mais pas aux accents ; code postal non recherchable

- **Sévérité** : P3 · **Statut** : à trancher — code postal recherchable (corrigé) ; accents : demandent l'extension unaccent en SQL ou l'opérateur imatch (migration interdite pour ce correcteur) · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : parc contenant « Résidence des Lilas · 8 rue de l'Hôtel-de-Ville · 75011 »
- **Étapes** : ⌘K puis « hotel », « HÔTEL », « hôtel », « 75011 »
- **Attendu** : « hotel » retrouve « Hôtel-de-Ville » (usage français courant, claviers sans accent)
- **Observé** : « hôtel » et « HÔTEL » : 2 lots ; « hotel » : « Aucun dossier trouvé » ; « 75011 » : « Aucun dossier trouvé »
- **Preuve expurgée (banc)** : sortie de s2k.mjs (sql/s2k.out.txt) ; captures/s2-31-recherche-globale-lilas.png
- **Cause probable** : recherche par ILIKE sans normalisation des accents (unaccent absent)
- **Correction proposée** : normaliser accents des deux côtés (extension unaccent ou colonne normalisée)
- **Correction sans aval** : oui

#### `PROP-10` — Message serveur de la clé de répartition avec point décimal : « fait 99.99 »

- **Sévérité** : P3 · **Statut** : à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livraison sont figées et simulées) ; à regrouper dans une prochaine migration · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : clé de répartition en mode ajusté
- **Étapes** : saisir 42,03 et 57,96 puis Valider la clé ajustée
- **Attendu** : « La somme des pourcentages fait 99,99 % : il faut exactement 100 % » (format français)
- **Observé** : « Validation impossible : La somme des pourcentages fait 99.99, il faut exactement 100 » (refus correct, la clé n'est pas créée)
- **Preuve expurgée (banc)** : sortie de s4g.mjs ; SQL count cles_repartition = 0 après refus
- **Cause probable** : message produit par la fonction SQL valider_cle_repartition sans formatage
- **Correction proposée** : formater en français dans l'action
- **Correction sans aval** : oui

#### `PROP-11` — Un même PDF ne peut pas être déposé pour deux lots (DPE collectif) et la consigne n'est pas réalisable depuis le formulaire

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : deux lots d'un même immeuble
- **Étapes** : déposer DPE-fictif.pdf sur le lot 1A puis le même fichier sur le lot 2B
- **Attendu** : possibilité de rattacher la même pièce (DPE collectif) ou consigne réalisable
- **Observé** : « Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « DPE — 13/10/2026 ». Rattachez cette pièce existante plutôt que de la déposer en double. » ; aucune action « rattacher une pièce existante » dans le formulaire de dépôt de diagnostic
- **Preuve expurgée (banc)** : sortie de s4c.mjs (sql/s4c.out.txt)
- **Cause probable** : unicité (organization_id, empreinte) sur documents (documents_empreinte_unique) + deposerFichierGed
- **Correction proposée** : proposer « utiliser cette pièce pour ce lot » dans le formulaire
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PROP-16` — Hypothèse à vérifier : aucune cohérence contrôlée entre loyer, loyer de référence et loyer de référence majoré

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : bail, étape « Autres et clauses », encadrement des loyers = Oui
- **Étapes** : loyer de référence 30 €/m² et majoré 25 €/m² ; puis majoré 15,60 €/m² alors que le loyer est 850 € / 45,5 m² = 18,68 €/m²
- **Attendu** : alerte si référence > majoré ou si loyer hors complément > majoré × surface (règle de l'encadrement ; à confirmer avec le texte légal, le wiki ne la décrit pas)
- **Observé** : les trois jeux de valeurs sont enregistrés (« Étape enregistrée »)
- **Preuve expurgée (banc)** : sortie de s7j.mjs (sql/s7j.out.txt)
- **Cause probable** : lireEtapeBail (src/lib/champs-etape-bail.ts) ne vérifie que forme et plafonds de dépôt/honoraires
- **Correction proposée** : avertissement non bloquant si loyer/m² > majoré
- **Correction sans aval** : non (aval du dirigeant requis)

#### `FIN-02` — Sur une organisation dont l'abonnement est suspendu, « Encaisser » répond « Accès refusé. » au lieu du message d'abonnement suspendu renvoyé par toutes les autres écritures.

- **Sévérité** : P3 · **Statut** : à trancher — le message vient de la fonction SQL encaisser_reste_atomique (migration 20261012223000, lignes 60-65) : demande une migration · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Organisation propriétaire direct en statut suspendue (ou essai expiré) : l'insert direct d'un encaissement et l'enregistrement d'un exercice fiscal renvoient « Abonnement suspendu : vos données restent consultables… Réactivez l'abonnement depuis « Mon abonnement » ». encaisser_reste_atomique, elle, mélange la garde org_ecriture_ouverte au contrôle de rôle et lève « Accès refusé. » ; le gérant croit à un problème de droits. Avant la PR, le bouton passait par un insert direct et affichait le bon message (régression de message).
- **Preuve expurgée (banc)** : preuves/relecture/finance/sql/t9_suspendu.sql (sortie : trois messages comparés, copie gerimmo_ci_rel_finance, transaction annulée)
- **Cause probable** : app/supabase/migrations/20261012223000_encaissement_reste_atomique.sql:60-65
- **Correction proposée** : Séparer les deux gardes : « Accès refusé. » pour le rôle, et lever le message standard « Abonnement suspendu… » quand org_ecriture_ouverte est faux (le même texte que refuser_ecriture_si_fermee).
- **Correction sans aval** : oui
- **Contrôle en production (lecture seule)** : `-- Lecture seule : organisations dont l'écriture est fermée et qui ont encore des appels impayés (les seules concernées) : select o.id, o.name, o.status from public.organizations o where not coalesce(public.org_ecriture_ouverte(o.id), false) and exists (select 1 from public.appels_loyer a where a.organization_id=o.id);`

#### `FIN-03` — Aucune contrainte de centime sur encaissements.montant / ecritures.montant : un paiement à 3 décimales est capturé avec un écart de 0,005 et ne peut plus jamais être qualifié (les parts doivent récon…

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un encaissement de 100,005 € (requête directe, le formulaire impose step=0,01) pour un appel 500 + 40 : composantes 92,60 + 7,41 = 100,01 (écart 0,005). Le récapitulatif refuse la pièce (« attendent leur ventilation ») et qualifier_ecriture_fiscale rejette toute saisie manuelle à deux décimales (« doivent réconcilier exactement »). La pièce reste bloquée sans issue. Hypothèse de faible probabilité : seul un client contournant la validation HTML5 peut y arriver ; non reproduit par l'interface.
- **Preuve expurgée (banc)** : preuves/relecture/finance/sql/t10_trois_decimales.sql + ts/t4.mts (reproduit en base et dans la fonction TypeScript ; non reproduit via le navigateur : step=0,01)
- **Cause probable** : app/supabase/migrations/20261012224000_fiscalite_historique_qualifiee.sql:56-95 et 113
- **Correction proposée** : Arrondir au centime à l'écriture (ajouterEncaissement) et ajouter une contrainte check (montant = round(montant,2)) en NOT VALID pour ne pas toucher l'existant ; ou faire capturer au déclencheur le montant arrondi.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : montants hors centime déjà présents. select 'encaissements' t, count(*) from public.encaissements where montant <> round(montant,2) union all select 'ecritures', count(*) from public.ecritures where montant <> round(montant,2) union all select 'composantes_incoherentes', count(*) from public.fiscal_encaissements_composantes c join public.ecritures e on e.id=c.ecriture_id where abs(c.loyer_hc+c.charges+c.non_ventile-e.montant) > 0;`

#### `FIN-04` — La régularisation 230 reste exigée (et est réintégrée si saisie) pour les lots passés en meublé ou hors périmètre, alors que leurs pièces sont exclues de la 2044.

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un lot confirmé « meublé » toute l'année : ses pièces sont comptées en BIC, mais le lot reste dans l'ensemble des lots de la boucle 230. Sans régularisation saisie, l'alerte « La régularisation 230… est à compléter » et la rubrique 230 « à compléter » ne disparaissent jamais ; si le propriétaire saisit un montant, il vient en déduction des charges 2044 d'un lot qui n'y figure pas.
- **Preuve expurgée (banc)** : preuves/relecture/finance/ts/t1.mts (sortie : alertes contenant la 230, aCompleter:true avec lot meublé seul)
- **Cause probable** : app/src/lib/fiscal.ts:68-71, 93-99 (boucle des lots / régularisation 230)
- **Correction proposée** : Ne retenir dans la boucle 230 que les lots ayant au moins une période en location nue sur l'année ; ne pas compter 230 pour un lot meublé.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : exercices dont tous les régimes sont hors 2044 mais qui portent un montant 230. select id, organization_id, lot_id, annee, regularisation230 from public.fiscal_exercices_lots x where regularisation230 is not null and not exists (select 1 from jsonb_array_elements(x.periodes) p where p->>'regime'='nu');`

#### `FIN-09` — La capture fiscale calcule « déjà encaissé avant » en sommant tous les AUTRES encaissements du bail présents en fin d'ordre : un INSERT à plusieurs lignes pour un même bail répartit faux (hypothèse :…

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Appel de 840 € (780 + 60), deux paiements 500 + 500 € insérés par un seul INSERT (requête PostgREST en tableau, import ou script de support) : les deux écritures sont captées 315,71 + 24,29 avec 160 € non ventilés, soit 680 € affectés au lieu de 840 € et 320 € non ventilés au lieu de 160 € ; en deux INSERT successifs, le résultat est correct (464,29/35,71 puis 315,71/24,29 + 160). La pièce figée ne peut pas être remplacée tant que non_ventile = 0 ; ici il reste > 0, la saisie manuelle est possible, mais le chiffre automatique est faux et muet.
- **Preuve expurgée (banc)** : preuves/relecture/finance/sql/t13_insert_multilignes.sql (sortie : preuves/relecture/finance/sql/t13_sortie.txt). Reproduit en base ; aucun appelant applicatif multi-lignes trouvé : seul le INSERT … SELECT de reprise_soldes (une ligne par bail) s'en approche.
- **Cause probable** : app/supabase/migrations/20261012224000_fiscalite_historique_qualifiee.sql:56-95 (déclencheur AFTER INSERT par ligne, calcul de « avant » à la ligne 75-76)
- **Correction proposée** : Rendre le déclencheur indépendant de l'ordre : filtrer « avant » sur les encaissements antérieurs à celui-ci ((created_at, id) strictement inférieurs) au lieu de « tous les autres », ou calculer la ventilation dans la même fonction que l'insertion ; ou refuser les INSERT multi-lignes sur encaissements.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : écritures de loyer captées dont le total affecté d'un bail dépasse min(total encaissé, total dû) — indice d'une capture faussée. select e.bail_id, sum(c.loyer_hc+c.charges) as affecte, (select sum(montant) from public.encaissements k where k.bail_id=e.bail_id) as encaisse, (select sum(montant_du) from public.appels_loyer a where a.bail_id=e.bail_id) as du from public.ecritures e join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id where e.contre_ecriture_de is null group by e.bail_id having abs(sum(c.loyer_hc+c.charges) - least((select sum(montant) from publ…`

#### `FIN-10` — Le wiki métier n'a pas été mis à jour : il décrit encore la ligne 229 comme « part non récupérable seulement, postes récupérables retirés lot par lot », alors que le code ne retire plus rien (coproRe…

- **Sévérité** : P3 · **Statut** : à trancher — page Fiscalité mise à jour (état implémenté, sources non officielles signalées) ; le traitement des lignes 229/230 se tranche avec une source officielle (inaccessible depuis l'audit) · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un lecteur du wiki (règle de référence selon la mission) attend que les appels de charges de copropriété ventilés (postes récupérables) réduisent la ligne 229 ; le code, lui, compte les provisions versées en entier et renvoie la réintégration à la ligne 230 de l'année suivante saisie manuellement. Aucune page ne décrit les natures de qualification, les captures figées, les exercices par lot, ni la règle de répartition FIFO des paiements en composantes. Hypothèse à vérifier sur la source officielle (notice 2044, lignes 229 et 230 ; BOFiP BOI-RFPI-BASE-20-30-10) : la lecture du code paraît conforme à la mécanique « provisions déduites l'année du versement, régularisées l'année suivante », donc c'est probablement le wiki qui est périmé, pas le code. La consultation du site impots.gouv.fr a échoué (proxy 403) : non vérifié.
- **Preuve expurgée (banc)** : Comparaison de lecture : wiki/concepts/Fiscalité.md lignes 111-114 (snapshot e9f31ac) contre src/lib/fiscal.ts (coproRecuperableExclue:0, option chargesCoproRecuperables ignorée) ; git diff 1e464f1..e9f31ac --name-only ne contient aucun fichier wiki ni index.md/log.md
- **Cause probable** : wiki/concepts/Fiscalité.md (aucun fichier wiki dans le diff de la PR):98-114 (section « Correction du récapitulatif 2044 », ligne 229)
- **Correction proposée** : Mettre à jour la page Fiscalité (et index.md, log.md selon CLAUDE.md §7) : décrire captures figées, qualifications versionnées, exercices par lot, traitement 229/230 retenu, et trancher la règle avec le porteur sur la notice officielle.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PR178-B-03` — Encaissement de 0,01 € accepté par le nouveau contrôle au centime mais refusé par la base avec le message générique « Gerimmo n'a pas pu terminer cette action »

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bail de l'Agence Alpha géré sous mandat (honoraires > 0) ; admin.alpha.
- **Étapes** : 1. /agence/<org>/baux/<bail>. 2. Saisir un encaissement de 0,01 €. 3. « Encaisser ».
- **Attendu** : Encaissement enregistré, ou message précis (montant minimal).
- **Observé** : Message générique « Gerimmo n'a pas pu terminer cette action. Réessayez dans un instant… ». La base refuse : insertion de l'écriture d'honoraires à 0,00 → ecritures_montant_check (reproduit par insertion en transaction annulée). Aucun encaissement créé. Saisie conservée.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/scripts/enc1.mjs (sortie console) ; essai SQL en transaction annulée (rollback)
- **Cause probable** : src/lib/saisie-montant.ts accepte tout montant > 0 au centime près ; le déclencheur qui écrit les honoraires arrondit à 0,00 pour un très petit montant et viole ecritures_montant_check ; sansJargon masque la cause.
- **Correction proposée** : Soit refuser sous un plancher en lireMontant avec un message clair, soit ne pas écrire d'écriture d'honoraires à 0,00 dans le déclencheur. Hors PR178 : interaction avec les contrôles de l'audit.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `REP-02` — Le courriel d'urgence au gestionnaire n'est envoye qu'a la premiere execution : si la premiere tentative a cree l'incident puis s'est arretee avant l'e-mail, la reprise (rejoue:true) ne l'envoie jama…

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/reprises) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Locataire, incident 'urgente' (degat des eaux). Tentative 1 : declarer_mon_incident_reprise valide (incident + commande enregistres) mais la reponse n'arrive pas au serveur d'actions (erreur reseau Supabase apres commit, ou action interrompue pendant l'envoi des photos qui precede l'e-mail). L'action rend une erreur et le formulaire invite a 'reessayer la meme tentative'. Tentative 2 (meme cle) : la RPC renvoie rejoue:true -> les photos sont reprises mais l'e-mail 'incident_urgent' est saute par '!declaration.rejoue' ; le message dit meme 'votre gestionnaire le verra ... a sa prochaine connexion'. Rien dans commandes_incidents_locataire ne memorise si l'e-mail est parti, donc ni la reprise ni une tache ne peut le renvoyer. Contournement : incident_creer cree deja une alerte 'critique' (Incident urgent a qualifier) dans l'espace du gerant ; seul le courriel immediat est perdu.
- **Preuve expurgée (banc)** : Moitie SQL reproduite : t3a-incident.sortie.txt et psql-incident-A/B.sortie.txt (2e appel, meme cle, depuis une 2e session psql : {rejoue:true, meme incident_id}). Moitie TypeScript en lecture seule (app/src/app/actions/incidents.ts:234). L'interruption entre le commit de la RPC et l'e-mail n'a pas ete provoquee de bout en bout (parcours navigateur en ecriture interdits sur la base du banc). Hypothese a verifier.
- **Cause probable** : app/src/app/actions/incidents.ts:234 (if (champs.urgence === "urgente" && !declaration.rejoue)) ; 226-229
- **Correction proposée** : Memoriser l'envoi : ajouter une colonne notifie_le a commandes_incidents_locataire (ou envoyer l'e-mail AVANT les photos), et envoyer l'e-mail d'urgence a la reprise tant que notifie_le est nul. Test : simuler une action qui s'arrete apres la RPC, rejouer, verifier un seul e-mail.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `select i.id, i.numero, i.created_at from public.incidents i join public.commandes_incidents_locataire c on c.incident_id = i.id where i.urgence = 'urgente' and not exists (select 1 from public.tech_log t where t.evenement = 'notification_envoyee' and t.details->>'evenement' = 'incident_urgent' and t.details->>'objet' = i.id::text) order by i.created_at desc;`

#### `REP-04` — choisir_creneau et accepter_creneau_locataire ne sont pas rejouables : une reponse perdue suivie d'un nouvel envoi affiche une erreur alors que le rendez-vous est confirme

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/reprises) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le locataire confirme un creneau, la reponse se perd, il reclique : le 2e appel trouve le creneau en 'retenu' et leve 'Ce creneau n'est plus propose'. Etat correct en base (1 rendez-vous), mais le locataire croit a un echec et peut contacter le gerant ; meme comportement attendu pour l'artisan qui retient une date du locataire (accepter_creneau_locataire : 'Cette date n'est plus proposee', lecture seule, non rejoue). Contrairement a l'incident, au bien et a l'invitation, aucune reprise n'a ete prevue pour ce geste.
- **Preuve expurgée (banc)** : preuves/relecture/reprises/t14-rejeu-choisir.sortie.txt : 1er appel OK ; rejeu -> ERREUR 'Ce creneau n'est plus propose' ; etat final planifiee/retenu
- **Cause probable** : app/supabase/migrations/20261013102000_planning_conflits.sql:choisir_creneau : 'if v.statut <> propose then raise ... plus propose' ; accepter_creneau_locataire idem
- **Correction proposée** : Dans les deux fonctions, retourner sans erreur si le creneau est deja 'retenu' ET que la mission est 'planifiee' sur ce meme creneau et que l'appelant est le meme acteur.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- sans objet (aucune donnee alteree)`

#### `REP-05` — Ecart au wiki : l'expiration J+30 et le refus trace sont livres, mais les relances J+3 / J+10 prevues par le module 16 n'existent nulle part

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/reprises) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le wiki (RM-16, 'L'invitation ... relances J+3/J+10, expiration J+30, refus trace') decrit des relances. Dans le code livre, 'invitations_locataires' n'est lue que par la fiche personne, l'espace /espaces, l'action invitations.ts et le courrier ; aucun cron (src/app/api/cron/*) ni aucune fonction SQL ne relance une invitation en attente. Un locataire qui n'ouvre pas le premier courriel n'est jamais relance ; l'invitation expire en silence au bout de 30 jours (le gerant doit la renvoyer a la main).
- **Preuve expurgée (banc)** : grep sur la photographie : 'invitations_locataires' / 'invitation_locataire' absents de src/app/api et src/lib hors lien-mot-de-passe.ts (courrier initial) ; aucune planification dans vercel.json. Absence verifiee par lecture, pas un defaut d'execution.
- **Cause probable** : app/supabase/migrations/20261013101000_invitations_locataire_cycle.sql (+ wiki/concepts/Compte, personne et adhésion.md l.81-83):table invitations_locataires ; aucune tache planifiee
- **Correction proposée** : Soit livrer les relances (tache de rappel J+3/J+10 limitee par organisation, comme rappels gestes), soit amender le wiki pour dire que les relances sont differees. Decision produit.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- lecture seule : invitations expirees sans reponse (jamais relancees) select count(*) filter (where etat='en_attente' and expire_le<=now()) as expirees_non_marquees, count(*) filter (where etat='expiree') as expirees from public.invitations_locataires;`

#### `SUP-03` — N'importe quel super-administrateur permanent peut accuser réception d'une alerte de relais adressée à un autre responsable : la fonction ne compare pas auth.uid() au destinataire (message d'erreur a…

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le plan désigne sa2 comme responsable ; une alerte lui est adressée. sa1 (créateur du plan, ou tout autre superviseur) clique « Accuser la prise en compte » : statut passe à accusee, accusee_par=sa1, sans que sa2 l'ait vue ni que l'escalade ait lieu. L'écran n'affiche que « Accusé reçu le … » sans dire par qui. Aucun effet financier ou de données ; la trace accusee_par/supervision_operations existe.
- **Preuve expurgée (banc)** : preuves/relecture/supervision/80-accuse-autoapprobation-activation.sortie.txt (T1)
- **Cause probable** : 20261012221100:accuser_alerte_vacances : update ... where id=p_id and statut<>'accusee' sans filtre destinataire=auth.uid().
- **Correction proposée** : Ajouter `and (destinataire=auth.uid() or statut in ('escalade','non_acheminee'))` (ou exiger destinataire/créateur selon l'état) et afficher accusee_par dans l'écran.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select a.id,a.destinataire,a.accusee_par,a.statut from public.supervision_alertes_internes a where a.statut='accusee' and a.accusee_par is distinct from a.destinataire;`

#### `SUP-04` — Pas de séparation des rôles pour une consigne : le même superviseur peut la rédiger, se désigner responsable et l'approuver (alors que enregistrer_vacances impose « un autre responsable »). L'« appro…

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : sa1 appelle enregistrer_consigne(... p_responsable=sa1 ...) puis decider_consigne(version, true) : OK, auteur=responsable=approbateur=sa1. Portée réelle limitée : seules deux lectures de compteurs (lecture_missions, lecture_passages) sont possibles, aucun envoi ni droit.
- **Preuve expurgée (banc)** : preuves/relecture/supervision/80-accuse-autoapprobation-activation.sortie.txt (T3)
- **Cause probable** : decider_consigne ne compare pas auth.uid() à v.auteur ni à v.responsable.
- **Correction proposée** : Décision à confirmer : exiger un approbateur distinct de l'auteur (ou le responsable désigné) si l'intention est une double vérification ; sinon renommer « approbation » en « activation ».
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select v.id,v.numero from public.supervision_consignes_versions v join public.supervision_consignes_accords a on a.version_id=v.id where a.auteur=v.auteur;`

#### `SUP-07` — Le périmètre d'arrêt « Sauvegarde » est proposé au superviseur et accepté par la base, mais aucun code (workflow GitHub de sauvegarde, scripts app/scripts/sauvegarde/*) ne lit verifier_arret_supervis…

- **Sévérité** : P3 · **Statut** : à trancher — décision D06 de la page de décisions groupées · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le superviseur choisit « Arrêter avant le prochain effet » sur « Sauvegarde » : l'écran affiche l'arrêt actif, la sauvegarde nocturne continue. Direction bénigne (une sauvegarde de plus), mais fausse assurance. grep arret\|supervision\|rpc dans sauvegarde.yml et app/scripts/sauvegarde/ : aucune occurrence. Lecture seule.
- **Preuve expurgée (banc)** : lecture seule : grep -rn -i 'arret\|supervision\|rpc' .github/workflows/sauvegarde.yml app/scripts/sauvegarde/*.mjs -> aucune ligne ; seul lib/controle-effets.ts accepte la clé
- **Cause probable** : Clé 'sauvegarde' déclarée dans le CHECK de supervision_arrets, le type TS et le formulaire, sans consommateur.
- **Correction proposée** : Retirer l'option du formulaire et la clé du CHECK, ou faire lire l'arrêt au workflow de sauvegarde.
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `select cle,arrete,modifie_le from public.supervision_arrets where cle='sauvegarde';`

#### `SUP-09` — Chaque validation d'un devis téléverse un nouveau PDF (chemin aléatoire) dans le compartiment devis-preparations et n'efface jamais l'ancien (ni celui d'une validation perdante en cas de conflit 409)…

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : L'artisan valide, modifie, revalide 3 fois avant l'envoi : 3 objets restent dans le compartiment, un seul est référencé par artisan_devis_preparations.pdf_path. Deux onglets validant en parallèle : le perdant a déjà téléversé son PDF. Non reproduit (le banc n'a pas de Storage réel sur ce chemin) : lecture seule.
- **Preuve expurgée (banc)** : lecture seule : route.ts, aucune occurrence de storage.remove dans le fichier ; purge_fichiers ne concerne que le compartiment documents
- **Cause probable** : Absence de nettoyage de l'ancien pdf_path et du chemin perdant.
- **Correction proposée** : Après update réussi, supprimer l'ancien pdf_path ; en cas d'échec d'enregistrement, supprimer le nouveau chemin.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite
- **Contrôle en production (lecture seule)** : `-- Comparer les objets storage.objects(bucket_id='devis-preparations') aux pdf_path référencés : select count(*) from storage.objects o where o.bucket_id='devis-preparations' and not exists (select 1 from public.artisan_devis_preparations p where p.pdf_path=o.name and p.pdf_bucket='devis-preparations');`

#### `RET-02` — La sauvegarde est faite avec --no-comments : les 152 commentaires SQL, dont celui qui porte la convention de sécurité de fermer_fonctions_a_anon(), disparaissent à la restauration

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : retour-arriere (retour-arriere) · **Version testée** : bases jetables reconstruites depuis le manifeste (migrations de la branche)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Sauvegarde par app/scripts/sauvegarde/base.mjs puis restauration (pg_restore) dans une base neuve.
- **Étapes** : 1. base.mjs exporter sur la base du banc (état B). 2. pg_restore --no-owner dans gerimmo_restauration_retour. 3. Comparer pg_dump --schema-only -n public de la source et de la copie.
- **Attendu** : Une copie restaurée porte les mêmes commentaires que la source (ou l'omission est documentée).
- **Observé** : 152 COMMENT ON dans la source, 0 dans la copie ; le commentaire « À APPELER EN FIN DE TOUTE MIGRATION… » de fermer_fonctions_a_anon() est perdu. Aucun droit, aucune donnée touchés ; effet : une équipe qui reprend sur la copie perd la documentation des conventions de sécurité.
- **Preuve expurgée (banc)** : preuves/retour-arriere/restauration/R3_diff_schema_public.txt ; preuves/retour-arriere/restauration/R2_restauration.txt
- **Cause probable** : app/scripts/sauvegarde/base.mjs, ligne de construction des arguments de pg_dump (« --no-comments »).
- **Correction proposée** : Retirer --no-comments (ou documenter l'omission dans app/docs/sauvegarde-et-restauration.md) ; valider par l'exercice de restauration avant d'adopter.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SOR-02` — Remise des clés acceptée à une date future (01/03/2027) : le délai légal de restitution est calculé sur un événement qui n a pas eu lieu, et la restitution ne se corrige pas

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire+locataire (sortie de bail) (sortie-de-bail) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bail en préavis (congé enregistré), EDL de sortie signé, date du jour 14/10/2026
- **Étapes** : Fiche du bail > Restitution du dépôt de garantie > Remise des clés = 01/03/2027 > Démarrer la restitution
- **Attendu** : Refus (« la remise des clés ne peut pas être dans le futur ») comme pour la date d envoi du décompte (jamais dans le futur, wiki Restitution du dépôt de garantie)
- **Observé** : La restitution est créée (statut en_cours, délai 2 mois, date_remise_cles = 2027-03-01) ; le formulaire disparaît, aucun moyen de corriger la date ensuite depuis l écran
- **Preuve expurgée (banc)** : sql/restitution-date-future.txt ; captures/l3-restitution.png
- **Cause probable** : app/src/app/actions/restitution.ts demarrerRestitution + RPC demarrer_restitution : pas de contrôle de borne supérieure sur date_remise_cles (à vérifier dans la RPC)
- **Correction proposée** : Refuser une date postérieure à aujourd hui dans la RPC (message clair) et prévoir une correction de la date tant que le décompte n est pas finalisé
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SOR-04` — Clôture du bail avant la fin du préavis : date_fin reste à la date théorique et rien n avertit des loyers non appelés

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire+locataire (sortie de bail) (sortie-de-bail) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Congé du locataire enregistré le 14/10/2026 (préavis 3 mois, effet 14/01/2027), EDL de sortie signé
- **Étapes** : Fiche du bail > Clôturer le bail le 14/10/2026
- **Attendu** : Avertissement de clôture anticipée, date de fin réelle enregistrée (ou clôture refusée tant que la date d effet n est pas atteinte sans accord noté)
- **Observé** : Bail termine, date_fin conserve 2027-01-14, aucun avertissement ; les loyers de novembre à janvier (dus jusqu au terme du préavis sauf accord) ne figurent ni dans les appels ni dans le solde. Hypothèse à vérifier : décision de gestion voulue (départ anticipé amiable)
- **Preuve expurgée (banc)** : captures/n1-bail-cloture.png ; sortie n1.mjs
- **Cause probable** : RPC terminer_bail : exige préavis + EDL de sortie signé, sans contrôle de date ni mise à jour de date_fin
- **Correction proposée** : Afficher une confirmation « clôture avant le 14/01/2027 : loyers restant dus ? » et enregistrer la date de sortie réelle
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SOR-05` — Espace du locataire sortant : « Rien à régler » alors que le décompte arrêté établit une créance de 561,43 EUR

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire+locataire (sortie de bail) (sortie-de-bail) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bail terminé, décompte finalisé (solde -561,43 EUR), locataire sortant connecté
- **Étapes** : Ouvrir /locataire/<org> et /documents après la finalisation
- **Attendu** : Le décompte arrêté est consultable (wiki Restitution : décompte envoyé par e-mail et espace, retenues visibles dès l arrêté)
- **Observé** : L accueil affiche « Rien à régler pour l instant », l historique montre octobre 700,00 EUR Impayé, aucune pièce « décompte » dans Mes documents ; pourtant la RPC ma_restitution_locataire renvoie solde -561,43 et les retenues. Affichage manquant ou volontairement différé jusqu au marquage « envoyé » (à vérifier)
- **Preuve expurgée (banc)** : sortie q1.mjs (RPC) ; captures/n1-locataire-sortant-documents.png
- **Cause probable** : app/src/app/locataire/[orgId] (accueil et documents) ne lit pas la restitution arrêtée
- **Correction proposée** : Afficher le décompte arrêté (ou un message « décompte en préparation ») dans le logement et les documents du locataire sortant
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SOR-06` — Comparatif d EDL : un passage de « bon » à « usagé » (usure normale) compte comme écart et porte le délai de restitution à 2 mois

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire+locataire (sortie de bail) (sortie-de-bail) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : EDL de sortie : Salle de bain/Sols bon -> usage (commentaire « Usure normale »), Cuisine/Murs bon -> mauvais
- **Étapes** : Fiche du bail > Comparatif entrée / sortie, puis Restitution
- **Attendu** : Seule une dégradation imputable est un écart ; l usure normale ne devrait pas allonger le délai (1 mois si sortie conforme, wiki Restitution du dépôt de garantie)
- **Observé** : « 2 écarts » dont l usure ; délai légal passé à 2 mois. Hypothèse à vérifier : règle produit voulue (tout écart d état)
- **Preuve expurgée (banc)** : captures/l3-restitution.png
- **Cause probable** : fonction comparatif_edl / règle de délai (à vérifier)
- **Correction proposée** : Distinguer écart d usure (sans effet sur le délai) et dégradation, ou confirmer la règle dans le wiki
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SA-02` — Brief de direction : les montants des faits datés s'affichent avec un point décimal ('500.00 €') alors que les mesures s'affichent à la française ('4 870,00 €')

- **Sévérité** : P3 · **Statut** : à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livraison sont figées et simulées) ; à regrouper dans une prochaine migration · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Faits de direction préparés (échéances en retard)
- **Étapes** : Ouvrir /admin/brief, préparer le point, déplier 'Dossiers concernés' de 'Échéances de loyers'
- **Attendu** : Format français partout ('500,00 €')
- **Observé** : 'Échéance en retard · 500.00 €', '840.00 €', '750.00 €' dans les titres de faits, contre '4 870,00 €' dans la mesure agrégée
- **Preuve expurgée (banc)** : captures/04-brief-dossiers-ouverts.png ; sql/brief_snapshot_faits.txt
- **Cause probable** : fonction SQL collecter_source_direction (to_char(..., 'FM999999999990.00') dans le titre du fait)
- **Correction proposée** : Formater le montant côté affichage (composant des faits) à partir d'une valeur numérique plutôt que dans la chaîne SQL
- **Correction sans aval** : oui

#### `SA-09` — La recherche de la console ne trouve ni un bien, ni un lot, ni un incident : le brief du support demande de retrouver « un dossier (utilisateur, bien, incident) »

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-admin aal2 ; incident INC-2026-0003 et lot 'E2E Lot 1' existants
- **Étapes** : 1) Ctrl+K. 2) Saisir 'INC-2026-0003' puis 'Lot 1'.
- **Attendu** : Le dossier est proposé (avec lien et périmètre) ou l'écran indique où chercher
- **Observé** : 'Aucun client trouvé.' pour les deux. La recherche ne couvre que Organisation, Artisan, Compte ; un incident ne s'atteint que par une alerte ou en entrant dans l'espace de l'organisation (traversée, SA-01).
- **Preuve expurgée (banc)** : sql2/s21_recherche_sortie.txt
- **Cause probable** : src/app/actions/recherche-supervision.ts (3 sources : organizations, artisans, rechercher_comptes_supervision)
- **Correction proposée** : Ajouter une recherche par référence d'incident et par bien, limitée au besoin (résultat = lien vers la fiche de l'organisation concernée, sans contenu)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SA-10` — Hypothèse à vérifier : aucun plafond de dépense applicatif pour les appels IA, et l'arrêt d'urgence ne couvre pas les appels IA déclenchés à la main (analyse du brief, rédaction de publications)

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Clé OpenAI posée en production (absente du banc)
- **Étapes** : Lecture du code : src/lib/brief-ia.ts, analyse-veille.ts, redaction-veille.ts, proposition-devis-ia.ts, visuel-marketing.ts ; src/app/admin/brief/actions.ts et src/app/admin/publications/nouvelle/actions.ts n'appellent pas verifierAvantEffet.
- **Attendu** : Un plafond (appels ou coût) propre à Gerimmo et un arrêt d'urgence couvrant tout appel IA payant
- **Observé** : Seuls existent un max_output_tokens et un délai par appel ; le plafond de dépenses est celui du compte OpenAI (erreur-ia.ts le traduit en message). Les appels IA initiés par un administrateur ne consultent pas l'arrêt d'urgence. Non exécuté faute de clé : hypothèse à vérifier.
- **Preuve expurgée (banc)** : Lecture de code (grep verifierAvantEffet absent de brief/actions.ts et publications/nouvelle/actions.ts)
- **Cause probable** : src/app/admin/brief/actions.ts ; src/app/admin/publications/nouvelle/actions.ts
- **Correction proposée** : Compter les appels IA par jour dans une table et refuser au-delà d'un plafond réglable ; consulter verifierAvantEffet('consignes' ou une mission dédiée) avant chaque appel payant
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `SA-11` — Journal du blocage d'un compte : « Compte bloqué » est écrit avant l'effet ; si le blocage échoue, le journal garde « Compte bloqué » suivi d'une ligne d'échec sans cause

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-admin aal2 ; compte de test ; appel d'administration en échec (ici l'émulateur du banc : 404 'non géré')
- **Étapes** : 1) Fiche d'un compte > Bloquer le compte, motif, confirmation. 2) Lire le journal d'audit.
- **Attendu** : Le journal dit clairement 'blocage demandé' puis 'blocage appliqué' ou 'blocage échoué (cause)'
- **Observé** : Lignes compte_bloque (motif, cible, auteur) puis controle_compte_echec ({geste, compte}) sans cause ni libellé de résultat sur la première ; la lecture rapide du journal laisse croire que le compte est bloqué. Choix délibéré du code (journaliser avant d'appliquer) : à trancher.
- **Preuve expurgée (banc)** : sql2/s25_blocage_msg.txt ; requête audit_log (00:46:50 compte_bloque puis controle_compte_echec)
- **Cause probable** : src/app/actions/controle-supervision.ts:132-154
- **Correction proposée** : Libeller 'Blocage demandé' / 'Blocage échoué' et conserver la cause technique expurgée dans details
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VFL-01` — La région role=status de la copie locale affiche « conservés » alors que l'écriture n'a pas eu lieu (seul le texte visible dit « Conservation… »)

- **Sévérité** : P3 · **Statut** : à trancher — décision de conception : exactitude de la région annoncée (role=status) contre bruit d'annonces ; texte visible exact, boîte « quitter la page » conforme · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire connecté, fiche personne en création, saisie déjà « conservée » (état stable)
- **Étapes** : 1. /agence/<org>/personnes#creer-fiche, remplir rôle, identité, coordonnées, laisser 1,5 s. 2. Étape Justificatifs : « Pièce d'identité », choisir un fichier. 3. Lire immédiatement le paragraphe visible et la région role=status.
- **Attendu** : Brief : le statut affiche « Conservation… » et jamais « conservés » avant l'écriture
- **Observé** : Paragraphe visible (aria-hidden) = « Conservation de votre saisie sur cet appareil… » ; région role=status = « Saisie et fichiers conservés sur cet appareil · non envoyés automatiquement… » pendant l'attente de 500 ms. La boîte beforeunload s'ouvre bien.
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/copies-b.json
- **Cause probable** : app/src/components/reprise-locale/index.tsx:129-154 (statutStableSuivant : « attente » garde l'état stable précédent pour la région annoncée, choix PR178-A-06)
- **Correction proposée** : Annoncer « Conservation… » dans la région polie quand l'état passe à « attente » après un état stable avec fichier ajouté, ou ne pas réaffirmer « conservés » tant que revision n'a pas avancé. Décision de conception à prendre (bruit d'annonces contre exactitude).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VER-PR178-06` — Hypothèse à vérifier : le brouillon local de la grille d'état des lieux (gerimmo-edl-brouillon-<id>) n'est ni effacé à la déconnexion ni rattaché à un compte ni limité dans le temps

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Appareil partagé ; EDL ouvert par un compte puis par un autre ayant accès au même état des lieux (hors V1 publique : agence)
- **Étapes** : Lecture du code uniquement : edl-brouillon.ts cle() et copies-locales.ts PREFIXE_COPIES_LOCALES = « gerimmo: »
- **Attendu** : Même traitement que les autres copies de saisie (PR178-A-01)
- **Observé** : Non reproduit dans le navigateur (aucun EDL créé pour ne pas modifier de données). Clé à tiret : ignorée volontairement par compteDeLaCle (tests/copies-locales.test.ts) ; RM-19.1.8 « localStorage, assumé »
- **Preuve expurgée (banc)** : app/src/lib/edl-brouillon.ts (cle, chargerBrouillon) ; app/src/lib/copies-locales.ts:12
- **Cause probable** : Périmètre de la correction limité aux clés gerimmo:<type>:v1:<compte>:…
- **Correction proposée** : Décision de rétention à prendre (aval du dirigeant) : soit préfixer et purger comme les autres copies, soit documenter que l'EDL fait exception.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `VER-SECURITE-01` — La purge de déconnexion annoncée par la correction PR178-A-01 laisse les brouillons d'état des lieux (et la quittance de l'outil public) sur l'appareil, et le changement de compte ne les purge pas no…

- **Sévérité** : P3 · **Statut** : à trancher — partiellement corrigée en branche (quittance de l'outil public purgée à la déconnexion) ; reste à trancher : brouillon d'état des lieux (RM-19.1.1/2/6/8 en font la copie de travail hors ligne de l'agent) · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : securite (vérificateur adverse) (verification/securite) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Navigateur partagé ; un utilisateur saisit une grille d'état des lieux (auto-sauvegarde locale, RM-19.1.1) puis se déconnecte par le menu compte
- **Étapes** : 1) saisir des états et commentaires dans la grille EDL ; 2) cliquer « Se déconnecter » (le formulaire déclenche purgerCopiesLocales) ; 3) lire localStorage ; 4) ouvrir un formulaire avec un autre compte (purgerCopiesAutresComptes)
- **Attendu** : Toutes les copies de saisie gardées sur l'appareil disparaissent à la déconnexion (promesse de src/lib/copies-locales.ts, en-tête) ; les copies d'un autre compte sont purgées à l'ouverture d'un formulaire
- **Observé** : Reproduit avec les vraies fonctions du dépôt sur un stockage simulé : avant = 4 clés (brouillon de bien, devis, EDL, gerimmo_quittance) ; après déconnexion il reste 'gerimmo-edl-brouillon-<edlId>' et 'gerimmo_quittance' ; après purgerCopiesAutresComptes('compteB') : 0 purgée, mêmes 2 clés. Cause : la purge ne cible que le préfixe 'gerimmo:' ; l'EDL utilise 'gerimmo-edl-brouillon-' (tiret, sans compte dans la clé) et l'outil public 'gerimmo_quittance' (souligné). Contenu EDL : états par ligne + commentaires libres (observations sur le logement, parfois des noms) ; le brouillon est relu tel quel par le compte suivant qui ouvre le même EDL. Autres chemins de fin de session sans purge : changement de mot de passe (auth.ts:120), suppression de compte (compte.ts:66), expiration de session (proxy.ts:179) — la purge n'est branchée que sur 4 formulaires de déconnexion.
- **Preuve expurgée (banc)** : preuves/verification/securite/purge-deconnexion.sortie.txt (test temporaire tests/zz-verif-securite.test.ts, supprimé) ; lecture de src/lib/edl-brouillon.ts:51, src/lib/outils/quittance.ts:93, src/lib/copies-locales.ts
- **Cause probable** : src/lib/copies-locales.ts : purgerCopiesLocales filtre k.startsWith('gerimmo:') ; src/lib/edl-brouillon.ts:51 clé 'gerimmo-edl-brouillon-'; src/lib/outils/quittance.ts:93 clé 'gerimmo_quittance'
- **Correction proposée** : Minimale : dans purgerCopiesLocales, purger toute clé commençant par 'gerimmo' (':' , '-' ou '_') et supprimer aussi 'gerimmo-edl-brouillon-*' au changement de compte (ou ajouter le compte à la clé EDL) ; test : après purge, aucune clé 'gerimmo*' ne subsiste
- **Correction sans aval** : oui

#### `VER-SECURITE-02` — Un artisan ayant une mission (ou une sollicitation ouverte) dans une organisation peut écrire n'importe quel chemin sous le dossier de cette organisation dans le compartiment documents

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : securite (vérificateur adverse) (verification/securite) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan (artisan.alpha) avec une intervention ou une sollicitation ouverte dans l'organisation X
- **Étapes** : Insérer dans storage.objects (bucket documents) un nom '<orgX>/<nom libre>.pdf' avec le rôle authenticated de cet artisan ; même geste vers une organisation sans lien, puis vers devis-preparations et marketing-visuels
- **Attendu** : Dépôt limité aux chemins attendus du parcours (dossier de la mission ou de la facture) ; refus ailleurs
- **Observé** : Dépôt dans l'organisation avec mission : ADMIS (chemin libre) ; dans une organisation sans lien : refusé par la politique ; compartiments devis-preparations et marketing-visuels : refusés. Effet : objets orphelins invisibles (la lecture exige une ligne documents ou chemins_fichiers_artisan), plafonnés à 10 Mo l'unité mais sans plafond de nombre, dans le dossier d'un client ; pas de lecture, pas d'écrasement (aucune politique UPDATE permissive), pas de squat utile car les chemins applicatifs contiennent un UUID aléatoire (ged-depot.ts:111). Réserve : l'émulateur maison n'est pas Supabase ; la politique ged_insert_artisan est lue et exécutée dans Postgres, l'application de ces politiques par le vrai service Storage n'est pas testée.
- **Preuve expurgée (banc)** : preuves/verification/securite/storage-artisan.sql ; preuves/verification/securite/storage-artisan.sortie.txt ; preuves/verification/securite/storage-policies.txt
- **Cause probable** : Politique storage.objects ged_insert_artisan : seul le premier segment du chemin (organisation) est contrôlé via orgs_de_mes_missions() / orgs_de_mes_sollicitations_ouvertes()
- **Correction proposée** : Restreindre le with check au gabarit '<org>/<intervention\|sollicitation>/%' ou à la fonction dossiers_de_mes_factures_a_deposer ; test : insertion hors gabarit refusée
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VER-TS-05` — Récapitulatif fiscal nu : à partir de 1 000 lignes fiscales dans l'organisation, le document est refusé avec un message trompeur (« Réduisez la période »), même pour un lot de 3 loyers

- **Sévérité** : P3 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : vérificateur adverse ts (verification/ts) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Organisation dont fiscal_encaissements_composantes (toutes années, tous lots) ou fiscal_qualifications_ecritures (toutes versions) atteint 1 000 lignes
- **Étapes** : Harnais : 3 loyers pour le lot + 997 composantes d'autres pièces ; ou 1 000 qualifications d'autres lots
- **Attendu** : Le document du lot se génère (la lecture se borne au lot et à l'année)
- **Observé** : Refus « Ce dossier contient trop de lignes pour un export intégral. Réduisez la période avant de générer le document. » alors qu'aucune période ne se règle pour ce document. Avant la correction (e9f31ac), le document lisait seulement les écritures du lot
- **Preuve expurgée (banc)** : preuves/verification/ts/resultats-vitest.json (G6.*)
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts (bloc recap_fiscal_nu) : lire('fiscal_qualifications_ecritures') et lire('fiscal_encaissements_composantes') sans filtre de lot ni d'année, sous la garde lireLignes (≥ 1000)
- **Correction proposée** : Borner ces deux lectures aux ecriture_id du lot et de l'année (filtre in sur les identifiants déjà lus) ; seuil atteint seulement pour de grands comptes, donc non bloquant en V1
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VUI-05` — Veille réglementaire : l audience « Agences et agents immobiliers » est toujours proposée aux propriétaires et aux locataires (DES-A-07 point 4 non corrigé)

- **Sévérité** : P3 · **Statut** : à trancher — décision D33 (ligne éditoriale de la veille) · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : verification-ui (verification/ui-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Connexion propriétaire puis locataire (matrice : /veille?public=bailleur et /veille?public=locataire)
- **Étapes** : Ouvrir /veille?public=bailleur (puis =locataire) ; lire le sélecteur d audiences
- **Attendu** : Aucune audience « Agences et agents immobiliers » dans la V1 publique
- **Observé** : Le sélecteur affiche « Tout voir · Propriétaires bailleurs · Agences et agents immobiliers · Locataires » sur les deux pages (2 occurrences par page dans le texte visible)
- **Preuve expurgée (banc)** : preuves/verification/ui-finale/etats/vocab-veille-audiences-1280.png ; journaux/vocabulaire-agence.json (/veille?public=bailleur et =locataire) ; journaux/vocabulaire-agence-tableau.md
- **Cause probable** : app/src/lib/veille-reglementaire.ts:1 : PUBLICS_VEILLE contient agence:Agences et agents immobiliers sans filtrage selon le périmètre V1
- **Correction proposée** : Masquer la clé agence du sélecteur hors supervision et espace agence ; conserver la donnée
- **Correction sans aval** : oui

#### `VUI-06` — Pages juridiques publiques (CGU, confidentialité, mentions légales) : les agences y sont encore présentées (tarif mensuel agences, marque blanche, « votre agence ») alors que le code agence n est plu…

- **Sévérité** : P3 · **Statut** : à trancher — décision D32 (textes juridiques) · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : verification-ui (verification/ui-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Visiteur non connecté
- **Étapes** : Ouvrir /conditions, /confidentialite, /mentions-legales ; lire le texte
- **Attendu** : Décision à prendre : retirer ou conserver les mentions d agence dans les textes juridiques (à arbitrer avec le porteur ; un texte juridique ne se réécrit pas sans validation)
- **Observé** : /conditions : 4 occurrences (« agence de gestion », « lots sous mandat actif pour une agence », « Les agences qui gèrent pour des tiers relèvent d un tarif mensuel… ») ; /confidentialite : 9 ; /mentions-legales : 4 (« des agences et des propriétaires bailleurs utilisent… », « c est à votre agence qu il faut vous adresser », « Marque blanche… une agence »). /inscription contient « partout en France, sans agence, sans commission » (formule de positionnement, probablement voulue)
- **Preuve expurgée (banc)** : journaux/vocabulaire-agence-tableau.md ; journaux/vocabulaire-agence.json (profil public)
- **Cause probable** : hypothèse à vérifier : textes juridiques volontairement laissés intacts par la correction du retrait des agences du site public
- **Correction proposée** : Faire valider par le porteur la version V1 des CGU, de la politique de confidentialité et des mentions légales (retrait ou conservation des clauses agence)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `V10-02` — Message de succes de la revision IRL : montant avec un point decimal ('671.18 EUR HC')

- **Sévérité** : P3 · **Statut** : à trancher — message de succès de la révision IRL formaté avec un point (« 671.18 € HC ») : texte produit par la base, même famille que PROP-10 et SA-02 (migration supplémentaire) · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur transversal (verification finale vague 10) (verification/vague10-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bail actif avec revision IRL, proprietaire ou agence.
- **Étapes** : Saisir un indice IRL valide (145,17), trimestre, annee, date de demande ; envoyer.
- **Attendu** : 'Loyer revise a 671,18 EUR HC.' (format francais)
- **Observé** : 'Loyer revise a 671.18 EUR HC.' (point decimal brut, y compris en locale fr-FR puisque le texte est construit cote serveur)
- **Preuve expurgée (banc)** : preuves/verification/vague10-finale/journaux/s3l-irl.json
- **Cause probable** : app/src/app/actions/loyers.ts:384 : `Loyer revise a ${data} EUR HC.` avec le nombre brut renvoye par la RPC.
- **Correction proposée** : Utiliser eur(data) de lib/ged comme les autres messages.
- **Correction sans aval** : oui

#### `VUI-04` — Reprise des soldes (propriétaire direct) : le libellé « Détenteur du dépôt (agence = votre gestionnaire / proprietaire = vous) » garde le mot « agence » et une faute (« proprietaire » sans accent) :…

- **Sévérité** : P3 · **Statut** : acceptée — « agence » et « proprietaire » sont les valeurs techniques de la colonne du fichier à fournir, sans accent ; le libellé les explique (tests/vocabulaire-v1-parcours.test.ts) · **Propriétaire** : clos par décision
- **Rôle / source** : verification-ui (verification/ui-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Connexion proprietaire@gerimmo-demo.fr (propriétaire direct)
- **Étapes** : Ouvrir /agence/<org>/comptabilite/reprise ; lire le formulaire de reprise des soldes
- **Attendu** : Vocabulaire du propriétaire direct, sans « agence », avec accents (par exemple « Qui détient le dépôt : votre gestionnaire / vous »)
- **Observé** : Texte visible : « Détenteur du dépôt (agence = votre gestionnaire / proprietaire = vous) » (span, 1280 px) ; page hors matrice-ecrans.json, relevée par le complément de balayage
- **Preuve expurgée (banc)** : preuves/verification/ui-finale/etats/vocab-reprise-detenteur-1280.png ; journaux/vocabulaire-complement.json ; journaux/vocabulaire-agence-tableau.md
- **Cause probable** : app/src/lib/reprise-soldes.ts:29 : libellé statique du champ detenteur, non adapté au type d organisation
- **Correction proposée** : Remplacer par « Qui détient le dépôt de garantie (votre gestionnaire / vous) » pour le propriétaire direct, avec accents ; conserver « agence » côté agence
- **Correction sans aval** : oui

#### `SOR-01` — Clé de répartition par surface : « NaN % » et validation impossible (peut venir de l émulateur du banc)

- **Sévérité** : P3 · **Statut** : réfutée — défaut de l'émulateur du banc (numeric rendu en chaînes, ligne 453 de serveur-supabase-local.mjs), pas du produit : un PostgREST réel rend un nombre · **Propriétaire** : clos par décision
- **Rôle / source** : proprietaire+locataire (sortie de bail) (sortie-de-bail) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bien en immeuble avec 2 lots dont la surface est saisie (45,50 et 30 m²), aucune clé validée
- **Étapes** : Fiche du bien > Clé de répartition > lire la proposition par surface > Valider la clé par surface
- **Attendu** : Proposition 60,26 % / 39,74 % validable
- **Observé** : Chaque lot affiche NaN %, total 0 %, et Valider renvoie « Validation impossible : Gerimmo n a pas pu terminer cette action ». Les lots ne peuvent donc pas passer en disponible avant une saisie manuelle des pourcentages (60/40 validés ensuite sans souci). Sur le banc l API renvoie les numeric en chaînes ("45.50") ; PostgREST réel les renvoie en nombres : hypothèse à vérifier en réel avant tout correctif
- **Preuve expurgée (banc)** : captures/c5 (sortie texte du script c5.mjs), valeur API : surface_m2 renvoyée en chaîne
- **Cause probable** : app/src/app/agence/[orgId]/parc/[bienId]/formulaire-cle.tsx (proposerCle somme des surfaces non converties en nombres) + émulateur du banc
- **Correction proposée** : Convertir Number(l.surface_m2) avant le calcul (sûr et sans effet si déjà nombre)
- **Correction sans aval** : oui

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]].
