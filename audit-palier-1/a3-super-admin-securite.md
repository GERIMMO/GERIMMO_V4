# Audit palier 1 — A3 : espace super admin, sécurité et base de données

Relevé du 22/11/2026, en lecture seule. Code : révision `e1e442dc` (copie `scratchpad/palier1`). Base : banc local
`gerimmo_ci_sql` (PostgreSQL 16.15, toutes les migrations du dépôt jouées, données fictives).

## 0. Méthode et limites

- **Deux niveaux de preuve, toujours distingués** : « **prouvé par requête** » (catalogue PostgreSQL du banc local, ou
  sonde en transaction `read only`) et « **lu dans le code** » (fichier:ligne). Les tests cités sont **cités, pas
  rejoués** : la consigne interdisait de lancer les tests et tout serveur.
- **Le banc local n'est pas la production.** Il prouve ce que les migrations du dépôt construisent. Pour la production,
  je m'appuie sur le relevé des avis Supabase fourni par le coordinateur (`audit-palier1/prod-advisors-securite.md`,
  22/11) : il **recoupe exactement** le banc sur quatre chiffres (30 tables avec RLS sans politique, 420 fonctions
  SECURITY DEFINER ouvertes à `authenticated`, 1 fonction sans `search_path`, 1 vue SECURITY DEFINER).
- **Incident de relevé** : à mon démarrage la base d'essai était arrêtée (machine redémarrée à 11 h 05 UTC). Je ne l'ai
  pas démarrée moi-même (consigne) ; le coordinateur l'a relancée, toutes les requêtes ci-dessous sont postérieures.
- **Non vérifiable d'ici** : les secrets réellement posés (GitHub, Vercel), la configuration du compartiment Scaleway,
  les passages réels des chantiers GitHub, le contenu de la base de production, les schémas exposés par l'API en
  production. Chaque point concerné est marqué « non prouvé ».
- Aucune écriture : ni code, ni base, ni wiki, ni git. Un seul fichier laissé : ce rapport (un fichier de travail
  temporaire, créé dans le scratchpad pendant le relevé, a été supprimé).

## 1. Synthèse

**Aucun P0 constaté.** L'isolation entre organisations tient en base, et c'est prouvé par requête :

- 227 tables sur 227 du schéma `public` ont la RLS active ; 0 fonction exécutable par `anon` dans `public` ;
  `anon` n'écrit que dans `liste_attente` (3 colonnes, plafond 30/h) ;
- sonde en lecture seule sous le rôle `authenticated`, avec l'identité d'un administrateur d'agence réel du jeu
  d'essai : sur **108 tables et vues portant `organization_id`**, 16 lignes visibles, **0 ligne d'une autre
  organisation** ; hors de ces tables, il ne voit que son compte (1 sur 30) et son organisation (1 sur 48) ;
- les 441 fonctions SECURITY DEFINER ouvertes aux comptes connectés (420 dans `public`, 21 dans les schémas
  internes) contrôlent l'appelant, directement ou par une fonction gardée, à deux exceptions sans donnée privée
  (§ 3). Les 43 + 16 fonctions sans garde directe visible ont été relues une à une.

**Ce qui reste à traiter, par gravité :**

| Rang | Sujet | Pourquoi |
|---|---|---|
| P1 | Antivirus absent sur les dépôts de fichiers | Exigence RM-A4.8 du wiki non tenue ; l'écran Santé l'affiche lui-même. |
| P1 | Reprise d'activité non prouvée de bout en bout | Exercice de restauration manuel seulement ; RTO de 4 h, projet de secours et rejeu des tâches `pg_cron` jamais joués ; garde de la clé de chiffrement hors GitHub non prouvée. |
| P1 | Comptes de démonstration à mot de passe connu | `seed.sql` porte `Gerimmo-Demo-2026` ; absence de ces comptes en production à vérifier (une requête). |
| P1 | Conservation RGPD partiellement active | 16 règles sur 58 inactives (fiches de personnes, messages, incidents, invitations, inscriptions non confirmées). |
| P2 | Vue `organisations_portail` SECURITY DEFINER, droits par défaut ouverts, 5 tables et 31 fonctions abandonnées, 21 tables avec des droits sans politique, 59 migrations sans retour arrière depuis le 13/10 | Hygiène et défense en profondeur ; détail au § 3. |

Côté console : les 26 écrans demandés existent, sont tous reliés au menu, tous branchés sur la base, aucun n'est une
maquette, aucun ne porte de texte « bientôt ». 13 fonctionnent, 13 sont partiels (dépendance externe non prouvée en
réel, ou geste manquant). Trois gestes prévus par la base n'ont **aucun écran** : retirer une évaluation d'artisan,
autoriser un dossier d'orchestration, purger les motifs de liste noire.

## 2. Espace super admin — écran par écran

Garde commune (lu dans le code) : `src/app/admin/layout.tsx:37-38` appelle `is_super_admin()` et renvoie vers
`/espaces` sinon ; `is_super_admin()` exige une adhésion `super_admin` active **et** `aal2` (second facteur) — prouvé
par requête sur `pg_proc.prosrc`. Chaque action serveur refait le contrôle (colonne Preuve). Tous les écrans sont dans
`src/lib/rubriques-supervision.ts` (17 rubriques, 5 groupes) : aucun écran orphelin, aucun fichier de composant jamais
importé, aucun lien vers un écran absent (recherche par import et par `"/admin/…"`).

États : FONCTIONNE = lecture et gestes câblés, gardés et couverts par des tests ; PARTIEL = câblé mais un geste manque
ou une dépendance externe n'est pas prouvée en réel. Aucun écran CASSÉ ni SEULEMENT EN MAQUETTE trouvé à la lecture
(aucun n'a été ouvert dans un navigateur : consigne).

| Écran | État | Preuve | Ce qui manque | Priorité |
|---|---|---|---|---|
| **finances** (`/admin`, onglet « Clients et abonnements ») | PARTIEL | `admin/page.tsx:20` → RPC `supervision_finances` ; `admin/finances.tsx`. Tests : `ux-abonnements-admin`, `tests/sql/supervision-complete.sql` ; e2e `console-clients.spec.ts`. | Lecture seule. Les chiffres dépendent de Stripe ; le paiement réel n'a jamais été exercé (audit du 19/11). | P1 |
| **trésorerie** (`/admin`, onglet « Encaissements et coûts ») | PARTIEL | `admin/tresorerie.tsx` (garde `is_permanent_super_admin` l. 11, relevé Stripe à la demande, RPC `supervision_total_couts`) ; `actions/supervision-couts.ts:7-15` (garde l. 8, politique `couts_ajout`). | Coûts saisis à la main, justificatif en texte libre (pas de fichier), aucun rapprochement bancaire, pas de test navigateur dédié. L'écran dit lui-même « ni le bénéfice comptable, ni le solde bancaire ». | P2 |
| **artisans** | PARTIEL | `artisans/page.tsx` (RPC `artisans_a_valider`, `decisions_artisans_supervision`) ; `actions/supervision-artisans.ts:9` (garde l. 15, RPC `traiter_inscription_artisan_atomique` l. 44) ; pièces : `artisans/pieces/[pieceId]/fichier/route.ts` (`log_sa_access`). Tests : `supervision-artisans` ; e2e `lot2-artisan`, `invitation-artisan`. | **Retirer une évaluation** : la RPC `retirer_evaluation` existe (réservée au super admin, RM-11.4.4) et n'est appelée par aucun écran. **Purge des motifs de liste noire** : `maintenance_artisans()` la porte, rien ne l'appelle (ni écran, ni `pg_cron`). | P1 |
| **autonomie** (deux vues : « Activité et dossiers », « Améliorations du produit ») | PARTIEL | `autonomie/page.tsx` ; `actions/autonomie.ts` (garde l. 10 ; `actualiserDossiers` l. 13, `deciderAmelioration` l. 45, `actualiserCorrection` l. 66). Tests : `arret-urgence-ecrans` ; e2e `finalisation`. | `autoriser_orchestration` n'est appelée nulle part : un dossier en mode « autorisation » n'a pas de bouton. La boucle de correction dépend de GitHub (voir équipes). | P2 |
| **brief** (vue d'ensemble, décisions, comptes rendus par équipe) | FONCTIONNE | `brief/actions.ts` : `analyserBriefIA` l. 19 (garde l. 21), `preparerPointDuMatin` l. 96, `marquerPointLu` l. 109, `deciderDecisionDuMatin` l. 209 (trace avant exécution l. 213). Tests : 19 fichiers (`file-decisions-navigateur`, `point-du-matin`, `tri-decisions`) ; e2e `navigation-matin`. | L'analyse par IA dépend de la clé OpenAI et du plafond. Envoi de l'e-mail du matin : en échec du 12 au 19/11 (audit du 19/11, OPS-1), effet du correctif non constaté ici. | P2 |
| **clients** (utilisateurs, fiche artisan, fiche personne) | FONCTIONNE | Vue `supervision_utilisateurs` (`security_invoker`, prouvé) ; `actions/session-artisan.ts:10` → `ouvrir_session_artisan`. Tests : `clients-supervision`, `recherche-supervision` ; e2e `utilisateurs`, `console-clients`. | — | — |
| **comptes** (`/admin/comptes/[accountId]`) | FONCTIONNE | RPC `dossier_compte_supervision` ; `actions/controle-supervision.ts:112` (`superviseurPermanent()` l. 119, journal avant le geste l. 133, clé de service ensuite) ; `actions/mois-offerts.ts:13` (garde l. 21). Tests : `controle-compte-journal-blocage` ; e2e `mois-offerts`, `compte-supervision`. | Indisponible sans clé de service (message explicite). | — |
| **conservation** | PARTIEL | `actions/retention.ts:8` (garde l. 10, RPC `modifier_duree_conservation`). Requête : 42 règles actives, **16 inactives**. e2e `conservation-reglages` ; aucun test unitaire ne cite l'écran. | Les 16 règles inactives : fiches de personnes, messages, incidents, invitations, inscriptions non confirmées, listes d'attente, journal d'authentification… | P1 |
| **consignes** | FONCTIONNE | `actions/consignes-vacances.ts` (garde l. 12 ; `enregistrerConsigne` l. 21, `commanderConsigne` l. 34). Tests : `consigne-sans-tache`, `consigne-activation-ecran` ; e2e `supervision-consignes`. | — | — |
| **couverture** | FONCTIONNE | Lecture seule : RPC `reseau_pilotage`, `reseau_interets_pilotage`. Tests : `reseau-couverture` ; e2e `reseau-couverture`. | Restes de l'ancien modèle « ouverture par commune » en base (2 tables, 2 fonctions, annexe B). | P2 |
| **devis** (libellé du menu : « Demandes de contact ») | FONCTIONNE | Lit `demandes_devis` ; `actions/devis-admin.ts:17` (garde l. 20, RPC `demande_devis_traitee` l. 24). Tests : `demande-rappel`, `devis-vitrine-base`. | Pas de test navigateur. Nom trompeur : le dossier et la table s'appellent « devis » mais portent les demandes de contact du site. | P2 |
| **donnees** | PARTIEL | `actions/fermeture-compte.ts` (`superviseur()` l. 46 ; programmer l. 71, annuler l. 141, geler l. 201) ; `actions/conservation-signatures.ts:6` (garde l. 7). Tests : `fermeture-compte-action`, `fermeture-comptes-ecrans` ; e2e `conservation-signatures`. | Le bilan affiche « Nettoyage pas encore écrit dans le code » pour les catégories sans purge (`donnees/bilan-conservation.tsx:21`). | P1 |
| **equipes** (« Tâches automatiques ») | PARTIEL | `actions/equipes.ts` : `commanderMission` l. 14 (garde l. 17, RPC `regler_mission` l. 43), `enregistrerContinuite` l. 47, `demanderCorrection` l. 64. Tests : `actions-equipes` ; e2e `equipes`. | L'atelier de correction : « un premier essai complet doit encore confirmer la préparation et la démonstration » (`equipes/qualite.tsx:14`) ; dépend d'un jeton GitHub. | P2 |
| **journaux** | FONCTIONNE | Lit `audit_log`, `tech_log`, `acces_pieces_log`, `supervision_registre`, `purge_fichiers` ; `actions/retention.ts:56` (garde l. 58, RPC `appliquer_retention` l. 61). Tests : `journaux-filtres`, `journal-traversee-ecran` ; e2e `navigation-matin`. | — | — |
| **liste-attente** | FONCTIONNE | `actions/liste-attente-agences-admin.ts:21` (relecture puis mise à jour sous RLS `liste_attente_agences_update_sa`) ; export : `admin/liste-attente/export/route.ts` (`is_super_admin` puis journal avant le fichier). Tests : `liste-attente-agences-console` ; e2e `console-liste-attente`. | Doublon : la table `liste_attente` (propriétaires) n'a aucun écran. | P2 |
| **marketing** | PARTIEL | `admin/marketing/actions.ts` : réglages l. 14, `programmerCampagne` l. 73, `deciderPostProgramme` l. 114 (gardes l. 16, 75, 116). Tests : 8 fichiers ; e2e `finalisation`, `navigation-matin`. | Publication gratuite seulement : « Les campagnes payantes ne sont pas lancées depuis Gerimmo » (l. 86). Dépend des jetons Meta. Colonne `meta_campaign_id` jamais lue. | P2 |
| **marque-blanche** | PARTIEL | `marque-blanche/page.tsx` ; `actions/verification-marque.ts:8` (garde l. 9, contrôle auprès de Vercel et Resend, journal). | **Aucun test** ne cite l'écran. Le domaine se déclare à la main chez l'hébergeur ; le proxy ne route rien par nom d'hôte (aucune occurrence de `host` dans `src/proxy.ts`). | P2 |
| **organisations** (fiche, ouverture, support) | FONCTIONNE | `actions/organisations-admin.ts:33` → RPC `ouvrir_organisation` l. 86 ; `actions/controle-supervision.ts:82` ; `actions/support-encaissement.ts:16` et `:41` (garde l. 30). Tests : 13 fichiers ; e2e `onboarding`, `compte-supervision`, `support-bailleur`, `recette-production/supervision`. | — | — |
| **parametres** | FONCTIONNE | `actions/identite-editeur.ts:6` (garde l. 7, mise à jour avec révision l. 9, politique `identite_admin`) ; `actions/reglage-souscription.ts:8` et `:12` (garde l. 18). Tests : `console-identite-mediateur`, `reglage-souscription-action` ; e2e `blocage-souscription`. | Médiateur de la consommation non renseigné (audit du 19/11). | P1 |
| **publications** | PARTIEL | `actions/publications.ts` (garde l. 36 ; publier l. 212, retirer l. 246, refuser l. 271, Facebook l. 135) ; `publications/nouvelle/actions.ts:22` (garde l. 27). Tests : 7 fichiers. | Pas de test navigateur. Rédaction et diffusion dépendent d'OpenAI et de Meta. | P2 |
| **relais** | FONCTIONNE | `actions/consignes-vacances.ts` (`enregistrerVacances` l. 41, `commanderRelais` l. 57) ; `actions/plafond-ia.ts:13` (garde l. 17). Tests : 10 fichiers ; e2e `supervision-consignes`, `equipes`. | Alerte e-mail du relais : voir brief (OPS-1). | P2 |
| **retours** (« Assistance clients ») | FONCTIONNE | RPC `file_retours_supervision` ; `actions/retours.ts` : `deciderRetour` l. 34, `regrouperRetours` l. 57, `cloreRevue` l. 66 (gardes l. 35, 58, 67). Tests : 5 fichiers ; e2e `support-bailleur`. | — | — |
| **sante** | PARTIEL | Lecture des connexions, tâches, sauvegarde, Stripe ; `actions/budget-signatures.ts:7` → RPC `regler_budget_signature` ; `actions/conditions-versions.ts:20` (garde l. 22). Tests : 14 fichiers ; e2e `conservation-signatures`, `navigation-matin`. | « Antivirus à connecter » (`sante/page.tsx:318-327`). | P1 |
| **securite** | PARTIEL | Page d'aiguillage et contrôles en lecture (`securite/controles.tsx` : superviseurs, second facteur, délégations, 20 derniers événements). | Aucun geste, un seul test (`rubriques-supervision`), pas de test navigateur. La vue `security_function_audit` (contrôle des fonctions, `verifie_le_contexte` à `false` en dur) n'est lue par aucun écran. | P2 |
| **territoire** | PARTIEL | `actions/prospects-supervision.ts:8` et `:26` (gardes l. 9, 28) ; `actions/etudes-territoriales.ts:7` (garde l. 8). Tests : `conservation-prospection-base`, `supervision-prospects-purge` ; e2e `finalisation`. | Six colonnes `source_*` de `territory_market_data` jamais lues ; un seul test cite l'écran. | P2 |
| **veille** | FONCTIONNE | Lit `regulatory_watch` ; `actions/veille.ts:4` (garde l. 5, RPC `decider_veille` l. 11). Tests : `tri-decisions` ; e2e `finalisation`. | Dépend de la collecte planifiée (mission `veille`). | — |

**Doubles et abandons côté console** : `autonomie` sert deux rubriques du menu (par `?vue=`), voulu. La file des
décisions est affichée à cinq endroits (brief, retours, veille, artisans, marketing) mais lit le même calcul
(`lib/decisions-attendues`). Deux vues SQL ne sont lues par aucun écran ni test : `security_function_audit`,
`automation_stats_30d`.

## 3. Sécurité et base de données

| Constat | Preuve (requête et résultat, ou fichier:ligne) | Gravité | Correction proposée | Priorité |
|---|---|---|---|---|
| **Aucune table sans RLS dans `public`** | Requête R1 : 227 tables, `relrowsecurity` vrai sur 227, `relforcerowsecurity` 0. Test : `tests/socle.test.ts:32`. | Conforme | — | — |
| **Isolation entre organisations tenue** | Sonde R9 (transaction `read only`, rôle `authenticated`, identité d'un administrateur d'agence du jeu d'essai) : 108 tables et vues avec `organization_id`, 16 lignes visibles, 0 d'une autre organisation. Sonde R10 : `accounts` 1 sur 30, `organizations` 1 sur 48, tables de supervision 0. Tests : `socle.test.ts:112`, `api-isolation.test.ts:119-175`, `rpc-etancheite-inter-agences.test.ts:110-153` ; 125 titres de tests d'isolation dans 89 fichiers (recherche sur les intitulés). | Conforme | — | — |
| **Aucune fonction ouverte à `anon` dans `public`** | R5 : 996 fonctions, 809 SECURITY DEFINER, 0 exécutable par `anon`, 420 par `authenticated`. Seule fonction ouverte à `anon` : `gerimmo_session_interne.verifier_session_api` (SECURITY INVOKER, garde de session de l'API). Tests : `aucune-fonction-ouverte-a-anon.test.ts:41`, `schema-performance-securite.test.ts:53`. | Conforme | — | — |
| **Les fonctions SECURITY DEFINER contrôlent l'appelant** | R6 : sur 441 (420 dans `public`, 21 dans les schémas internes), 398 portent une garde directe dans leur corps (`auth.uid()`, `is_super_admin`, `org_ids_avec_roles`…). Les 43 autres, toutes relues : 38 délèguent à une fonction gardée (`activer_bail` → `controler_mise_en_location`, `carnet_artisans_bien` → `reseau_verifier_acces_bien`, `mes_*` → `ma_personne_locataire`, `*_hors_portefeuille` → `est_agent_restreint`), 3 calculent un tarif sur des tables publiques, 2 n'ont aucune garde (ligne dédiée plus bas). R7 : 16 fonctions ne citant que `auth.uid()`, toutes relues, toutes gardées. Limite : la relecture porte sur la présence et la place de la garde, pas sur chaque branche des 441 corps. Test : `audit-securite-2026-09-27.test.ts:133`. | Conforme | — | — |
| **Antivirus absent sur les fichiers déposés** | `src/app/admin/sante/page.tsx:318-327` (« antivirus à connecter ») ; wiki « Socle de sécurité », RM-A4.8 (« analyse antivirus systématique », acté). Seuls format et taille sont bornés (R8 : compartiments limités à 10 Mo, PDF, JPEG, PNG). | Élevée | Relier le service prévu (`docs/antivirus-depots.md`) ; refuser le fichier en cas d'échec d'analyse. | P1 |
| **Reprise d'activité : sauvegarde prouvée, remise en service non prouvée** | `.github/workflows/sauvegarde.yml` (quotidien, chiffré, relu après dépôt) ; `restauration-sauvegarde.yml` : **`workflow_dispatch` seul**, aucun passage planifié. `docs/sauvegarde-et-restauration.md` : restaurations réelles du 27/09 et du 16/10 (liens de passages, non vérifiables d'ici) ; « ne prouve pas la bascule des services Auth et Storage », « cet essai n'a pas été joué » pour les tâches `pg_cron`. Wiki : RTO de 4 h, test trimestriel. | Élevée | Planifier l'exercice (mensuel) ; jouer une fois la remise en service complète sur un projet de secours et mesurer le RTO. | P1 |
| **Garde de la clé de chiffrement des sauvegardes non prouvée** | `sauvegarde.yml:37` : `GERIMMO_BACKUP_KEY` vit dans les secrets GitHub, qui ne se relisent pas. `docs/sauvegarde-et-restauration.md:89` : « doit être conservée séparément » — rien ne prouve que c'est fait. Sans copie, la perte du compte GitHub rend 90 jours de sauvegardes illisibles. | Élevée (non prouvé) | Vérifier la copie hors GitHub ; la consigner au plan de reprise. | P1 |
| **Comptes de démonstration à mot de passe connu** | `app/supabase/seed.sql:2,22,157` : `Gerimmo-Demo-2026`, comptes `@example.com` ; repris en clair dans plusieurs fichiers de test. Le fichier se dit « développement uniquement » ; aucune garde technique ne l'empêche de jouer ailleurs. | Élevée si présents en production (non prouvé) | En production : `select count(*) from auth.users where email like '%@example.com'` doit rendre 0. | P1 |
| **Conservation RGPD partiellement active** | R11 : `retention_rules`, 42 actives, 16 inactives (`personne:fiche`, `message:locatif`, `incident:dossier`, `invitation:*`, `compte:inscription_non_confirmee`, `contact:attente*`, `journal:auth_audit`, `support:*`…). | Moyenne | Activer règle par règle après le bilan de l'écran Données. | P1 |
| **Vue `organisations_portail` en SECURITY DEFINER** | R4 : `reloptions = {security_barrier=true}`, sans `security_invoker` ; propriétaire `postgres`. Avis de production : `security_definer_view` (ERROR). Elle filtre l'appelant (`user_org_ids()`, IBAN au seul locataire actif) et `socle.test.ts:203-228` le vérifie. | Faible (voulu, mais classé ERROR par Supabase) | La remplacer par une fonction, ou consigner l'exception. Les 7 autres vues sont en `security_invoker`. | P2 |
| **Droits par défaut ouverts sur les objets futurs** | R12 (`pg_default_acl`, banc local) : fonctions `anon=X`, tables `anon=r`, `authenticated=arwd`. Une table ou fonction neuve naît ouverte. Garde : les tests du socle, et `migrations.yml` qui exige une CI verte — mais `migrations.yml:46-48` consigne trois migrations appliquées hors chantier le 18/10. | Moyenne | Interdire toute application hors chantier ; rejouer R1, R2 et R5 en production après chaque application. | P2 |
| **Table abandonnée où `anon` écrit : `liste_attente`** | R3 : `anon` INSERT sur `email, biens, source`, politique `inscription anonyme` (`with check (true)`). Aucun `.from("liste_attente")` dans `app/src` ; aucun écran ne la lit. Bornée : 30 inscriptions par heure (`20261019120000_liste_attente_bornee.sql`). | Faible | Trancher : la brancher ou la supprimer. | P2 |
| **Table abandonnée lisible par `anon` : `site_pages`** | R1, R2 : `anon` SELECT, politique `using (true)`. Aucune référence dans `app/src` ni dans une fonction SQL ; 0 ligne au banc ; le commentaire renvoie à une fonction hébergée absente du dépôt. Contenu en production non vérifié. | Faible | Vérifier le contenu en production puis supprimer. | P2 |
| **Droits de table sans politique correspondante** | R13 : sur 21 tables, `authenticated` détient un droit sans politique permissive pour la commande (INSERT sur 13, UPDATE sur 17, DELETE sur 16) (`quittances`, `ecritures`, `restitutions`, `revisions_loyer`, `messages`…). La RLS refuse aujourd'hui ; une politique `for all` ajoutée plus tard les ouvrirait. | Faible | Révoquer ces droits inutilisés. | P2 |
| **Politique à condition toujours vraie** | R2 : `paiements_fourniture_lecture` compare `f.organization_id = f.organization_id`. Pas de fuite (la sous-requête passe par la RLS de `factures_fourniture`), mais la ligne n'est pas liée à sa propre organisation. | Faible | Comparer à `paiements_factures_fourniture.organization_id`. | P2 |
| **Fonction sans `search_path`** | R5 : `public.fermetures_comptes_nuit()` (procédure SECURITY INVOKER, non exécutable par les rôles de l'API). Avis de production : `function_search_path_mutable`. | Faible | `set search_path = ''`. | P2 |
| **Deux fonctions SECURITY DEFINER sans garde d'appelant** | R6 : `ged_securite_interne.fichier_reference(text)` et `purge_reservee(text)` répondent vrai ou faux sur l'existence d'un chemin, toutes organisations confondues. Chemins à identifiants aléatoires. | Faible | Réserver leur exécution aux politiques de stockage. | P2 |
| **Table sans RLS hors `public`** | R1 : `gerimmo_session_interne.reconnexions_requises`, RLS inactive, aucun droit pour `anon` ni `authenticated`. | Faible | Activer la RLS par principe. | P2 |
| **Second facteur obligatoire pour la seule supervision** | R6 : `second_facteur_valide()` n'exige `aal2` que si un facteur est enrôlé ; `is_super_admin()` l'exige toujours. Wiki « Socle de sécurité » : « MFA facultative des autres personas reste à développer ». | Moyenne (décision actée) | Rendre l'enrôlement obligatoire pour les administrateurs d'agence. | P2 |
| **Clé `service_role` confiée à GitHub pour la sauvegarde** | `sauvegarde.yml:39,99,187` : `GERIMMO_BACKUP_SERVICE_KEY`. Elle contourne toute la RLS. | Moyenne | Rôle dédié, borné à la copie des fichiers et à l'écriture du journal. | P2 |
| **Lecture en base avant autorisation sur une route planifiée** | `src/app/api/cron/equipes/route.ts:29-32` : pour `mission=marketing`, un appel sans secret déclenche la RPC `jeton_declencheur_marketing` avant le refus. | Faible | Refuser d'abord l'appel sans en-tête `Authorization`, comme `api/cron/relais/route.ts:48-52`. | P2 |
| **Retours arrière incomplets et jamais joués en production** | 526 migrations, 169 retours. Aucun retour avant le 13/10 (298 migrations). Depuis : 59 sur 228 sans retour, dont `20261113022742_session_active_api`, `20261119142934_securite_provenance_fichiers`, `20261119143935_imposer_second_facteur_actif`. `retours-arriere/LISEZ-MOI.md` : « préparé et vérifié localement, non exécuté en production » ; 78 fichiers de test citent le dossier. | Moyenne | Le vrai filet est la sauvegarde exigée avant migration (`migrations.yml`). Écrire les retours des migrations de sécurité. | P2 |
| **Extension `pg_net` dans `public` (production)** | Avis de production `extension_in_public`. Absente du banc (R14). | Faible | La déplacer dans un schéma dédié. | P2 |
| **Aucun secret dans le dépôt** | `git ls-files` : seul `app/.env.example` suivi ; `.gitignore:47-48`. Recherche de motifs (clés Stripe, Resend, JWT, clés privées, URL avec mot de passe) : uniquement le mot de passe du banc local et des valeurs de test. | Conforme | — | — |
| **Variables `NEXT_PUBLIC_` légitimes** | 4 noms : `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VERCEL_ENV`. | Conforme | — | — |
| **Routes planifiées et webhooks contrôlés** | `src/lib/tache.ts:49-57` (`timingSafeEqual` sur `CRON_SECRET`) appelé par les 4 routes `api/cron/*` ; Stripe `api/stripe/webhook/route.ts:56` (`constructEventAsync`) ; Zoho `api/zoho-sign/webhook/route.ts:33` ; Resend `api/resend/suivi/route.ts:10` et `lib/transfert-contact.ts:86` (signature Svix). | Conforme | — | — |
| **Actions serveur : contrôle avant écriture** | 113 fichiers « use server ». 14 prennent directement la clé de service ; chacun contrôle d'abord (voir § 3.3). Aucune écriture au client de service sans contrôle préalable trouvée. Limite : les chemins indirects par les bibliothèques n'ont pas été suivis un à un. | Conforme | — | — |
| **Stockage : 5 compartiments privés, 1 public** | R8 : seul `marketing-visuels` est public (JPEG, 10 Mo, aucune politique d'écriture pour les comptes). 35 politiques sur `storage.objects`, dont 17 restrictives (session valide, second facteur, provenance). `exports-complets` : ni taille ni type borné, clé de service seule. | Conforme | Borner `exports-complets` par principe. | P2 |

### 3.1 RLS, vues, fonctions (prouvé par requête)

- **Tables sans RLS** : aucune dans `public`. Hors `public` : `gerimmo_session_interne.reconnexions_requises` (sans
  droit pour l'API) et `e2e_local.migrations` (banc seulement).
- **Tables avec RLS mais sans politique** : 27 dans `public` et 3 dans `support_interne` — même liste que l'avis de
  production. Aucune n'accorde de droit à `anon` ni à `authenticated` : fermées par construction, lues par la clé de
  service ou par des fonctions. Liste en annexe A (colonne « politiques » à 0).
- **Politiques larges (`using true`)** : 14. Huit lectures de données publiques ou de référence —
  `tarif_formules`, `tarif_tranches`, `versions_conditions`, `retention_rules` (2), `reseau_communes`,
  `supervision_identite` (mentions légales), `site_pages` ; cinq politiques réservées à `service_role` ; et
  l'insertion anonyme de `liste_attente` (`with check (true)`).
- **Tables lisibles par `anon`** : par table `site_pages`, `tarif_formules`, `tarif_tranches` (0 ligne rendue, la
  politique vise `authenticated`), `versions_conditions` ; par colonnes `publications` (articles publiés seulement),
  `retention_rules`, `supervision_identite` (`singleton, valeurs`). Sonde sous le rôle `anon` : `organizations` →
  `permission denied`.
- **Tables modifiables par `anon`** : `liste_attente` (INSERT, 3 colonnes). Aucune autre, ni TRUNCATE, REFERENCES ou
  TRIGGER dans `public` (R15).
- **Politiques sans filtre d'organisation** : sur 364 politiques (298 permissives, 66 restrictives), 128 n'appellent
  aucune des fonctions de garde habituelles ; toutes relues : 66 sont des restrictions (portefeuille de l'agent,
  provenance des fichiers), les 62 permissives filtrent par `auth.uid()`, par l'identité de l'artisan, par une
  fonction métier gardée, ou par une sous-requête elle-même soumise à la RLS — hors les 14 politiques larges
  ci-dessus.
- **Vues** : 8 ; 7 en `security_invoker`, 1 en SECURITY DEFINER (`organisations_portail`).
- **Fonctions** : schémas internes — `consommations_interne` 31 SECURITY DEFINER dont 18 ouvertes aux comptes,
  `ged_securite_interne` 6 dont 2, `gerimmo_session_interne` 2 dont 1, `support_interne` 5 dont 0.
- **Garde de session de l'API** : `pgrst.db_pre_request = gerimmo_session_interne.verifier_session_api` posé sur le
  rôle `authenticator` (R16). En production : à constater.

### 3.2 Isolation : ce qui est prouvé, ce qui ne l'est pas

Prouvé par requête ici : administrateur d'agence contre toutes les autres organisations (sondes R9, R10), visiteur
anonyme (sonde R17). **Non sondé par moi** : locataire et artisan — le jeu d'essai n'a aucune adhésion `locataire`
ni aucun artisan (R18 : 12 `admin_agence`, 6 `proprietaire_direct`, 0 artisan), et créer ces comptes aurait été une
écriture. Pour ces deux profils la preuve repose sur les tests, non rejoués :

- locataire : `sprint7-locataire-intervention.test.ts:249,279,370,649`, `fenetre-lot.test.ts:475`,
  `consommations-base.test.ts:167`, `sprint7-incidents.test.ts:560`, `quittance-document-route.test.ts:27` ;
- artisan : `sprint7-artisans.test.ts:340,389,405`, `artisan-externe-reglements.test.ts:48`,
  `audit-artisan-2026-09-27.test.ts:333`, `devis-refus-motive.test.ts:316` ;
- agent restreint à son portefeuille : `incidents-portefeuille-agent.test.ts`, `fenetre-lot.test.ts:616`,
  `audit-securite-2026-09-29.test.ts:220-260`.

L'audit du 19/11 (wiki) avait sondé les 419 fonctions sous deux profils (propriétaire étranger, locataire) sans
trouver de faille ; son P1 SEC-1 (fiche de document visant le fichier d'un autre espace) est corrigé en base :
déclencheur `documents_provenance_fichier` et politiques restrictives `documents_provenance_creation` et
`documents_provenance_lecture` (prouvé par requête).

Trou que je vois : les rôles `proprietaire_mandant` et `garant` existent dans l'énumération `membership_role` mais
aucune politique ne leur ouvre quoi que ce soit (R2 : 0 politique les cite). Pas une fuite ; un portail jamais ouvert.

### 3.3 Actions serveur et clé de service (lu dans le code)

Les 14 fichiers « use server » qui prennent directement la clé de service, et le contrôle qui la précède :

| Fichier | Contrôle avant la clé |
|---|---|
| `actions/abonnement.ts` | `mon_client_stripe` l. 194, `ma_souscription_stripe` l. 447, 546, 638 (ne rendent rien à un autre que le responsable) |
| `actions/conditions-versions.ts` | `is_permanent_super_admin` l. 22, clé l. 28 |
| `actions/conservation-signatures.ts` | `is_super_admin` l. 7, clé l. 13 |
| `actions/controle-supervision.ts` | `superviseurPermanent()` l. 119 et 174, clé l. 129 et 176 |
| `actions/fermeture-compte.ts` | `superviseur()` l. 46, clé l. 78 et 147 |
| `actions/mois-offerts.ts` | `is_permanent_super_admin` l. 21, clé l. 35 |
| `actions/recommandes.ts` | `verifierGerant` l. 22, 69, 112 |
| `actions/retractation.ts` | clé créée l. 80, **utilisée** après `ma_retractation` ou `is_permanent_super_admin` l. 89-97 |
| `actions/signature-bail.ts` | `verifierGerant` par `acces()` l. 74-75 |
| `actions/verification-marque.ts` | `is_permanent_super_admin` l. 9, clé l. 17 |
| `artisan/devis/actions-preparation.ts` | `verifierArtisanAction` l. 63, clé l. 65 |
| `actions/devis.ts`, `actions/liste-attente-agences.ts` | Sans session par conception (formulaires publics) : pot de miel, validation, une insertion, plafond horaire en base |
| `actions/confirmation-caution.ts` | Sans session par conception (lien à jeton) : empreinte du jeton l. 35, limite par adresse IP l. 53 |

Les 99 autres ne prennent pas la clé directement : la RLS et les fonctions SQL décident. Certains passent par des
bibliothèques qui la prennent (`lib/email.ts`, `lib/lien-mot-de-passe.ts`, `lib/notifications.ts`,
`lib/signature-envoi.ts`, `lib/photos-demande-artisan.ts`) ; dans celles que j'ai ouvertes, la clé vient après une
lecture qui prouve le droit ou après une limite de fréquence, mais je n'ai pas suivi chaque appelant.

Routes et pages qui prennent la clé : `api/cron/*` (secret), `api/stripe/webhook`, `api/zoho-sign/webhook`,
`api/resend/*` (signature), `api/devis/[sollicitationId]/pdf` et `/signature` (après `chargerPreparationDevis` ou
`lire_signature_devis_archive`), `agence/[orgId]/export-complet` (après `demander_export_complet` et
`ma_session_active`), `artisan/entreprise` et `artisan/missions/…/facture` (après `verifierAccesArtisan`),
`signature/caution/[jeton]` (lien à jeton), `api/sante` (détail réservé au porteur du secret).

### 3.4 Tables, colonnes et fonctions abandonnées (résumé ; détail en annexe B)

- **5 tables** sans aucune lecture ni écriture par le code ni par une fonction SQL courante : `site_pages`,
  `signature_evenements`, `reseau_ouvertures`, `reseau_artisan_communes`, et `liste_attente` (citée par la purge
  seulement).
- **31 fonctions** jamais appelées (ni `app/src`, ni scripts, ni chantiers, ni `pg_cron`, ni déclencheur, ni politique,
  ni autre fonction), dont 18 encore ouvertes aux comptes connectés.
- **Deux tables pour le même objet** : `liste_attente` et `liste_attente_agences` ; l'ancien modèle du réseau
  (`reseau_ouvertures`, `reseau_artisan_communes`) et le nouveau (`artisan_zones`).
- **Intégration Youtrust abandonnée** au profit de Zoho Sign : `rattacher_signature_youtrust`,
  `finaliser_signature_youtrust`, `classer_echec_signature_youtrust`, `signer_edl_avec_preuve`, table
  `signature_evenements`.
- **21 colonnes** sur 2 398 jamais citées. **Énumérations** : 44 types, 186 valeurs, aucune valeur morte au sens
  strict.
- Faux positif écarté : `abonnement_defaut_a_regulariser` et `abonnement_regulariser_facture` sont appelées par le
  code sans exister en base — ce sont des noms d'action relayés par `stripe_evenement_appliquer`
  (`src/lib/stripe-file.ts:29-33`).

---

## Annexe B — Tables, fonctions, vues et colonnes présumées abandonnées

Recherche : chaque nom cherché comme mot entier dans `app/src` (`.ts`, `.tsx`, `.mjs`), `app/scripts`,
`.github/workflows`, le corps de toutes les fonctions des schémas applicatifs (`pg_proc.prosrc`), les politiques, les
vues, les valeurs par défaut, les contraintes, les index, les déclencheurs et `cron.job`.

**Tables** (`.from("…")` dans `app/src` = 0, et aucune fonction SQL courante ne les cite) :

| Table | Lignes au banc | Ce que montre la recherche |
|---|---|---|
| `site_pages` | 0 | Créée par `20260904132719_ajout_pages_demonstration.sql` (« servi par l'edge function site », absente du dépôt). Lisible par `anon`. |
| `signature_evenements` | 0 | Créée par `20260922090000_signature_youtrust.sql`. Aucune référence dans `app/src`, aucune fonction. |
| `reseau_ouvertures` | 0 | Modèle « ouverture par commune » retiré le 23/10 ; plus aucune fonction ne la cite. |
| `reseau_artisan_communes` | 0 | Idem. |
| `liste_attente` | 0 | Citée par `purger_contacts_echus`, `liste_attente_limiter`, `cibles_conservation_contacts` ; aucune écriture ni lecture applicative. |

**Fonctions jamais appelées** (31) :

- Ouvertes aux comptes connectés (18, dont 16 SECURITY DEFINER ; `bail_mentions_manquantes` et `inviter_locataire`
  sont SECURITY INVOKER) : `artisans_affectables`, `autoriser_orchestration`, `bail_mentions_manquantes`,
  `inviter_locataire`, `is_active_member`, `lire_devis_structure`, `ma_session_artisan`, `maintenance_artisans`,
  `mon_dossier_locataire`, `noter_envoi_invitation_artisan`, `noter_envoi_invitation_locataire`,
  `orgs_de_mes_sollicitations_ouvertes`, `rattacher_signature_youtrust`, `reseau_rattacher_artisan`,
  `reseau_regler_ouverture`, `retirer_evaluation`, `rouvrir_mois`, `signer_edl_avec_preuve`.
  Trois d'entre elles sont des **gestes métier sans écran** : `retirer_evaluation`, `autoriser_orchestration`,
  `rouvrir_mois` (rouvrir un mois clôturé). `reseau_regler_ouverture` et `reseau_rattacher_artisan` ne font plus que
  lever une exception.
- Réservées au service ou à personne (13) : `abonnement_evenement_a_traiter`, `abonnement_evenement_rejouable`,
  `abonnement_evenement_solde`, `attester_echec_definitif_ar24`, `classer_echec_signature_youtrust`,
  `fermer_fonctions_a_anon`, `fermetures_comptes_quotidiennes`, `finaliser_signature_youtrust`,
  `log_automation_event`, `organisations_du_seul_titulaire`, `poser_gardes_abonnement`,
  `poser_gardes_diagnostic_artisan`, `reappliquer_effacements`. À garder : les outils de migration
  (`fermer_fonctions_a_anon`, `poser_gardes_*`) et `reappliquer_effacements` (procédure de restauration). Doublon :
  `fermetures_comptes_quotidiennes` est l'ancienne version de la tâche de nuit, remplacée par la procédure
  `fermetures_comptes_nuit` que `pg_cron` appelle.

**Vues jamais lues** : `security_function_audit`, `automation_stats_30d`.

**Colonnes jamais citées** (21) : `avantages_fondateurs.attribue_par` ; `biens.syndic_email`,
`biens.reference_copropriete` ; `compteurs_consommation.principal_commun` ;
`fiscal_encaissements_composantes.capture_le` ; `marketing_campagnes.meta_campaign_id` ;
`orchestration_cases.derniere_action` ; `relances_invitations_locataires.reservee_le` ;
`reseau_artisan_communes.rattache_par`, `.rattache_le` ; `reseau_communes.source_date` ;
`signature_evenements.event_id`, `.event_name` ; `site_pages.mis_a_jour` ;
`supervision_sessions_artisan.ouverte_le` ; `territory_market_data.source_concurrence`, `.source_logements`,
`.source_agences`, `.source_tension`, `.source_artisans`, `.source_publicite`.

**Nommage hérité** (pas un doublon) : le socle est en anglais (`organizations`, `memberships`, `accounts`, `persons`,
`alerts`, `retention_rules`, `regulatory_watch`, `territory_*`, `orchestration_*`), le reste en français.

## Annexe C — Requêtes utilisées

Connexion : `PGPASSWORD=gerimmo-ci-local psql -h 127.0.0.1 -U postgres gerimmo_ci_sql`. Lecture seule.

```sql
-- R1. Tables : RLS, nombre de politiques, droits par rôle (annexe A)
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as politiques,
       has_table_privilege('anon', c.oid, 'SELECT') …  -- idem INSERT, UPDATE, DELETE ; idem authenticated, service_role
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p')
  and n.nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','cron','extensions','supabase_migrations');

-- R2. Politiques (larges, ouvertes à anon ou public, sans fonction de garde)
select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'public';

-- R3. Droits par colonne (échappent à has_table_privilege)
select c.relname, r.rolname, p.priv, string_agg(a.attname, ',')
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join (values ('anon'),('authenticated')) r(rolname) cross join (values ('SELECT'),('INSERT'),('UPDATE')) p(priv)
where c.relnamespace = 'public'::regnamespace
  and not has_table_privilege(r.rolname, c.oid, p.priv) and has_column_privilege(r.rolname, c.oid, a.attnum, p.priv)
group by 1,2,3;

-- R4. Vues
select c.relname, c.reloptions, pg_get_userbyid(c.relowner) from pg_class c
where c.relkind in ('v','m') and c.relnamespace = 'public'::regnamespace;

-- R5. Fonctions : SECURITY DEFINER, droits d'exécution, search_path
select n.nspname, count(*), count(*) filter (where p.prosecdef),
       count(*) filter (where p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')),
       count(*) filter (where p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
       count(*) filter (where p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
group by 1;

-- R6. SECURITY DEFINER ouvertes à authenticated sans garde visible dans le corps
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and p.prosrc !~* 'auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|is_super_admin|is_permanent_super_admin|org_ids_avec_roles|user_org_ids|has_org_role|is_active_member|can_manage_organization|has_supervision_power|mon_artisan_id|artisan_identite_reelle|exiger_artisan_reel';
-- R7. Même requête, restreinte à celles qui ne citent que auth.uid() sans fonction de rôle ni table memberships.

-- R8. Stockage
select * from storage.buckets;
select policyname, permissive, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage';

-- R9. Sonde d'isolation (aucune écriture possible)
begin transaction read only;
select set_config('request.jwt.claims', json_build_object('sub','<compte>','role','authenticated','aal','aal1')::text, true);
set local role authenticated;
select '<table>', count(*), count(*) filter (where organization_id is distinct from '<son organisation>'::uuid) from public.<table>;  -- × 108
reset role; rollback;
-- R10. Même sonde, count(*) sur les tables sans organization_id, comparé au total lu en superutilisateur.
-- R17. Même sonde sous « set local role anon ».

-- R11. select data_type, libelle, duree_mois, actif, sort from retention_rules;
-- R12. select pg_get_userbyid(defaclrole), defaclobjtype, defaclacl from pg_default_acl;
-- R13. Droits de table de authenticated sans politique permissive pour la même commande
-- R14. select extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace;
-- R15. has_table_privilege(…, 'TRUNCATE' | 'REFERENCES' | 'TRIGGER') pour anon et authenticated
-- R16. select d.datname, r.rolname, s.setconfig from pg_db_role_setting s
--      left join pg_database d on d.oid = s.setdatabase left join pg_roles r on r.oid = s.setrole;
-- R18. select role, count(*) from memberships group by 1; select count(*) from artisans;
```

Recherches dans le code : `grep -rc "clientDeService()" src` ; `grep -rl '^"use server"' src` ;
`git ls-files | grep -iE '\.env|\.pem|\.key|secret'` ;
`git grep -nIE 'sk_live_|sk_test_|whsec_|re_[0-9A-Za-z]{20,}|eyJhbGciOi|AKIA|BEGIN .*PRIVATE KEY|ghp_|postgres(ql)?://[^:@/ ]+:[^@/ ]+@'` ;
`git grep -hoE 'NEXT_PUBLIC_[A-Z0-9_]+'`.

## Annexe A — Toutes les tables : RLS, politiques, droits par rôle

Lecture des droits : S = SELECT, I = INSERT, U = UPDATE, D = DELETE, au niveau de la table. « col. » signale un droit
accordé par colonne seulement (requête R3). Prouvé par requête R1 sur le banc local.

Droits par colonne à ajouter à la lecture du tableau : `artisans` (authenticated, SELECT de 12 colonnes) ;
`cles_repartition` (UPDATE `invalidated_at`) ; `courriels_durables` et `notification_intentions` (SELECT de colonnes
d'état, supervision avec second facteur) ; `depots_temporaires` (INSERT 4 colonnes) ; `ecritures` (INSERT 11
colonnes) ; `liste_attente` (**anon**, INSERT `email, biens, source`) ; `liste_attente_agences` (UPDATE `statut,
contactee_le`) ; `publications` (**anon**, SELECT 12 colonnes publiques) ; `purge_fichiers` (UPDATE `deleted_at`) ;
`quittances` (UPDATE `email_envoye_at`) ; `retention_rules` (**anon**, SELECT 8 colonnes) ;
`supervision_executions_decisions` (UPDATE 3 colonnes) ; `supervision_identite` (**anon** SELECT `singleton,
valeurs` ; authenticated SELECT et UPDATE) ; `supervision_prospects` (UPDATE 13 colonnes).

| Schéma | Table | RLS | Politiques | anon | authenticated | service_role |
|---|---|---|---|---|---|---|
| e2e_local | `migrations` | **non** | 0 | — | — | — |
| gerimmo_session_interne | `reconnexions_requises` | **non** | 0 | — | — | — |
| public | `abonnement_evenements` | oui | 0 | — | — | SIUD |
| public | `abonnements` | oui | 0 | — | — | SIUD |
| public | `acceptations_cgu` | oui | 1 | — | S | SIUD |
| public | `acces_pieces_log` | oui | 1 | — | S | SIUD |
| public | `accounts` | oui | 2 | — | S | SIUD |
| public | `agent_missions` | oui | 1 | — | S | SIUD |
| public | `agent_passages` | oui | 1 | — | S | SIUD |
| public | `alerts` | oui | 7 | — | SIUD | SIUD |
| public | `annonces` | oui | 6 | — | SIUD | SIUD |
| public | `appel_charges_postes` | oui | 2 | — | SIUD | SIUD |
| public | `appels_charges` | oui | 2 | — | SIUD | SIUD |
| public | `appels_loyer` | oui | 2 | — | SIUD | SIUD |
| public | `archives_comptes` | oui | 1 | — | S | SIUD |
| public | `artisan_agences` | oui | 1 | — | S | SIUD |
| public | `artisan_avoirs_externes` | oui | 1 | — | S | SIUD |
| public | `artisan_chantiers` | oui | 1 | — | S | SIUD |
| public | `artisan_clients` | oui | 1 | — | S | SIUD |
| public | `artisan_devis_externes` | oui | 1 | — | S | SIUD |
| public | `artisan_devis_preparations` | oui | 0 | — | — | SIUD |
| public | `artisan_evaluations` | oui | 2 | — | S | SIUD |
| public | `artisan_evenements_prives` | oui | 1 | — | S | SIUD |
| public | `artisan_factures_externes` | oui | 1 | — | S | SIUD |
| public | `artisan_metiers` | oui | 1 | — | S | SIUD |
| public | `artisan_modules_locaux` | oui | 0 | — | — | SIUD |
| public | `artisan_numeros_factures` | oui | 0 | — | — | SIUD |
| public | `artisan_pieces` | oui | 1 | — | S | SIUD |
| public | `artisan_pieces_privees` | oui | 1 | — | S | SIUD |
| public | `artisan_profils_documents` | oui | 0 | — | — | SIUD |
| public | `artisan_reglements` | oui | 1 | — | S | SIUD |
| public | `artisan_rendez_vous` | oui | 1 | — | S | SIUD |
| public | `artisan_validations` | oui | 1 | — | S | SIUD |
| public | `artisan_zones` | oui | 1 | — | S | SIUD |
| public | `artisans` | oui | 1 | — | — (col.) | SIUD |
| public | `audit_log` | oui | 1 | — | S | SIUD |
| public | `automation_events` | oui | 1 | — | S | SIUD |
| public | `avantages_fondateurs` | oui | 0 | — | — | — |
| public | `avantages_parrainage` | oui | 1 | — | S | SIUD |
| public | `avertissements_inactivite` | oui | 1 | — | S | S |
| public | `bail_personnes` | oui | 4 | — | SIUD | SIUD |
| public | `bail_signature_circuits` | oui | 3 | — | S | SIUD |
| public | `baux` | oui | 4 | — | SIU | SIUD |
| public | `bien_infos_pratiques` | oui | 4 | — | SIUD | SIUD |
| public | `biens` | oui | 4 | — | SIU | SIUD |
| public | `brief_direction_snapshots` | oui | 1 | — | S | SIUD |
| public | `brouillons_regularisation_fourniture` | oui | 1 | — | S | SIUD |
| public | `cle_repartition_lignes` | oui | 2 | — | SI | SIUD |
| public | `cles_repartition` | oui | 4 | — | SI (col.) | SIUD |
| public | `clients_stripe_supprimes` | oui | 1 | — | S | S |
| public | `clotures_comptables` | oui | 1 | — | SIUD | SIUD |
| public | `commandes_encaissement_reste` | oui | 1 | — | S | SIUD |
| public | `commandes_incidents_locataire` | oui | 1 | — | S | SIUD |
| public | `compteurs_consommation` | oui | 1 | — | SIU | SIUD |
| public | `confirmations_mobile_caution` | oui | 0 | — | — | SIUD |
| public | `conges` | oui | 2 | — | S | SIUD |
| public | `connexions_ar24` | oui | 1 | — | S | SIUD |
| public | `consentements_documents_locataire` | oui | 2 | — | S | SIUD |
| public | `conservation_reperes` | oui | 0 | — | — | SIUD |
| public | `continuity_plan` | oui | 1 | — | S | SIUD |
| public | `continuity_rules` | oui | 1 | — | SIUD | SIUD |
| public | `contrats_fourniture` | oui | 1 | — | SIU | SIUD |
| public | `courriels_durables` | oui | 1 | — | — (col.) | SIUD |
| public | `courriels_evenements` | oui | 0 | — | — | SIUD |
| public | `decisions_du_matin` | oui | 1 | — | S | SIUD |
| public | `declencheur_marketing` | oui | 0 | — | — | SIUD |
| public | `declencheur_relais_urgences` | oui | 0 | — | — | — |
| public | `demandes_devis` | oui | 2 | — | SUD | SIUD |
| public | `demandes_lien_mot_de_passe` | oui | 0 | — | — | SIUD |
| public | `demandes_releves` | oui | 1 | — | S | SIUD |
| public | `demandes_signature` | oui | 2 | — | SIUD | SIUD |
| public | `depot_encaissements` | oui | 3 | — | SIUD | SIUD |
| public | `depots_photos_incident` | oui | 1 | — | S | SIUD |
| public | `depots_photos_releve` | oui | 1 | — | S | SIUD |
| public | `depots_temporaires` | oui | 3 | — | S (col.) | SIUD |
| public | `destinataires_rectifications_quittance` | oui | 0 | — | — | SIUD |
| public | `detentions` | oui | 4 | — | SIU | SIUD |
| public | `development_proposals` | oui | 1 | — | SIU | SIUD |
| public | `devis_avenants` | oui | 1 | — | S | SIUD |
| public | `diagnostics` | oui | 4 | — | SIU | SIUD |
| public | `document_liens` | oui | 4 | — | SID | SIUD |
| public | `documents` | oui | 6 | — | SI | SIUD |
| public | `documents_repartition_fourniture` | oui | 1 | — | S | SIUD |
| public | `dossier_contacts` | oui | 2 | — | S | SIUD |
| public | `echeanciers_charges` | oui | 1 | — | S | SIUD |
| public | `ecritures` | oui | 3 | — | SUD (col.) | SIUD |
| public | `ecritures_factures_fourniture` | oui | 1 | — | S | SIUD |
| public | `edl_cles` | oui | 5 | — | SIUD | SIUD |
| public | `edl_compteurs` | oui | 5 | — | SIUD | SIUD |
| public | `edl_lignes` | oui | 5 | — | SIUD | SIUD |
| public | `effacements_a_reappliquer` | oui | 1 | — | S | S |
| public | `encaissements` | oui | 4 | — | SID | SIUD |
| public | `equipements_catalogue` | oui | 3 | — | SIUD | SIUD |
| public | `etats_des_lieux` | oui | 4 | — | SIU | SIUD |
| public | `exports_complets` | oui | 1 | — | S | S |
| public | `factures_automatiques` | oui | 2 | — | S | SIUD |
| public | `factures_automatiques_evenements` | oui | 0 | — | — | SIUD |
| public | `factures_demandes_releves` | oui | 1 | — | S | SIUD |
| public | `factures_fourniture` | oui | 1 | — | SIU | SIUD |
| public | `factures_honoraires` | oui | 1 | — | S | SIUD |
| public | `fermetures_comptes` | oui | 1 | — | S | S |
| public | `fiscal_encaissements_composantes` | oui | 1 | — | S | SIUD |
| public | `fiscal_exercices_lots` | oui | 1 | — | S | SIUD |
| public | `fiscal_profils_detenteurs` | oui | 1 | — | S | SIUD |
| public | `fiscal_qualifications_ecritures` | oui | 1 | — | S | SIUD |
| public | `ia_appels_comptes_jour` | oui | 1 | — | S | S |
| public | `ia_appels_jour` | oui | 1 | — | S | S |
| public | `ia_plafond_reglage` | oui | 1 | — | S | S |
| public | `incident_consultations` | oui | 2 | — | S | SIUD |
| public | `incident_devis` | oui | 2 | — | S | SIUD |
| public | `incident_evenements` | oui | 2 | — | S | SIUD |
| public | `incident_interventions` | oui | 2 | — | S | SIUD |
| public | `incident_sollicitations` | oui | 2 | — | S | SIUD |
| public | `incidents` | oui | 2 | — | S | SIUD |
| public | `intentions_conge` | oui | 2 | — | SIUD | SIUD |
| public | `intentions_souscription` | oui | 0 | — | — | SIUD |
| public | `intervention_comptes_rendus` | oui | 2 | — | S | SIUD |
| public | `intervention_creneaux` | oui | 2 | — | S | SIUD |
| public | `intervention_demandes_rdv` | oui | 2 | — | S | SIUD |
| public | `intervention_echanges_etat` | oui | 1 | — | S | SIUD |
| public | `intervention_facture_reglements` | oui | 1 | — | S | SIUD |
| public | `intervention_factures` | oui | 1 | — | S | SIUD |
| public | `intervention_messages` | oui | 1 | — | S | SIUD |
| public | `intervention_photos` | oui | 2 | — | S | SIUD |
| public | `intervention_rappels` | oui | 2 | — | SIUD | SIUD |
| public | `inventaire_lignes` | oui | 5 | — | SIUD | SIUD |
| public | `invitations_artisans` | oui | 0 | — | — | SIUD |
| public | `invitations_locataires` | oui | 1 | — | S | SIUD |
| public | `liste_attente` | oui | 1 | — (col.) | — | SIUD |
| public | `liste_attente_agences` | oui | 2 | — | S (col.) | SIUD |
| public | `lot_chambres` | oui | 2 | — | SIUD | SIUD |
| public | `lot_equipements` | oui | 3 | — | SIUD | SIUD |
| public | `lot_pieces` | oui | 5 | — | SIUD | SIUD |
| public | `lots` | oui | 4 | — | SIU | SIUD |
| public | `mandat_lignes` | oui | 5 | — | SIUD | SIUD |
| public | `mandats` | oui | 4 | — | SIU | SIUD |
| public | `marketing_campagnes` | oui | 1 | — | SIUD | SIUD |
| public | `marketing_mesures` | oui | 1 | — | SIUD | SIUD |
| public | `marketing_reglages` | oui | 1 | — | SU | SIUD |
| public | `memberships` | oui | 3 | — | SD | SIUD |
| public | `messages` | oui | 1 | — | SIUD | SIUD |
| public | `mois_offerts` | oui | 0 | — | — | SIUD |
| public | `mouvements_mandants` | oui | 2 | — | S | SIUD |
| public | `notification_intentions` | oui | 1 | — | — (col.) | SIUD |
| public | `oppositions_prospection` | oui | 1 | — | S | SIUD |
| public | `orchestration_cases` | oui | 1 | — | S | SIUD |
| public | `orchestration_history` | oui | 1 | — | S | SIUD |
| public | `organizations` | oui | 4 | — | SIUD | SIUD |
| public | `paiements_factures_fourniture` | oui | 1 | — | S | SIUD |
| public | `parrainages` | oui | 1 | — | S | SIUD |
| public | `persons` | oui | 8 | — | SIUD | SIUD |
| public | `pieces_attendues_bail` | oui | 3 | — | SIU | SIUD |
| public | `pieces_demandees` | oui | 5 | — | SIUD | SIUD |
| public | `plan_apurement_tranches` | oui | 1 | — | S | SIUD |
| public | `plans_apurement` | oui | 1 | — | S | SIUD |
| public | `points_du_matin` | oui | 1 | — | S | SIUD |
| public | `preuves_commandes_abonnement` | oui | 0 | — | — | — |
| public | `provenances_contrats_bail` | oui | 0 | — | — | — |
| public | `publication_veines` | oui | 1 | — | SIUD | SIUD |
| public | `publications` | oui | 2 | — (col.) | SIUD | SIUD |
| public | `purge_fichiers` | oui | 2 | — | S (col.) | SIUD |
| public | `qualifications_diagnostics_lot` | oui | 3 | — | SIU | SIUD |
| public | `quittances` | oui | 3 | — | SID (col.) | SIUD |
| public | `rappels_echeanciers_charges` | oui | 1 | — | S | SIUD |
| public | `rapports_gestion` | oui | 2 | — | SIUD | SIUD |
| public | `receptions_loyers_signalees` | oui | 1 | — | S | SIUD |
| public | `recommandes_ar24` | oui | 2 | — | S | SIUD |
| public | `rectifications_quittances` | oui | 0 | — | — | SIUD |
| public | `reglages_avis_decompte` | oui | 1 | — | S | SIUD |
| public | `regularisations_charges` | oui | 2 | — | SIUD | SIUD |
| public | `regulatory_watch` | oui | 1 | — | S | SIUD |
| public | `regulatory_watch_diffusion` | oui | 1 | — | S | SIUD |
| public | `relais_alertes_envois` | oui | 1 | — | S | — |
| public | `relais_urgences` | oui | 1 | — | S | — |
| public | `relais_urgences_envois` | oui | 1 | — | S | — |
| public | `relances` | oui | 4 | — | SIUD | SIUD |
| public | `relances_invitations_locataires` | oui | 1 | — | S | S |
| public | `releves_consommation` | oui | 1 | — | S | SIUD |
| public | `remplacements_compteur` | oui | 1 | — | S | SIUD |
| public | `repartitions_fourniture` | oui | 1 | — | S | SIUD |
| public | `representations_bail` | oui | 1 | — | S | SIUD |
| public | `reprise_soldes` | oui | 2 | — | S | SIUD |
| public | `reprises_portefeuille` | oui | 1 | — | S | SIUD |
| public | `reseau_artisan_communes` | oui | 2 | — | S | SIUD |
| public | `reseau_communes` | oui | 1 | — | S | SIUD |
| public | `reseau_interets` | oui | 2 | — | S | SIUD |
| public | `reseau_ouvertures` | oui | 1 | — | S | SIUD |
| public | `restitutions` | oui | 2 | — | SIUD | SIUD |
| public | `retention_rules` | oui | 5 | — (col.) | S | SIUD |
| public | `retenues` | oui | 2 | — | SIUD | SIUD |
| public | `retours_historique` | oui | 1 | — | S | SIUD |
| public | `retours_revues` | oui | 1 | — | S | SIUD |
| public | `retours_soutiens` | oui | 1 | — | S | SIUD |
| public | `retours_utilisateurs` | oui | 1 | — | S | SIUD |
| public | `retractations_abonnement` | oui | 0 | — | — | SIUD |
| public | `revisions_loyer` | oui | 2 | — | SIUD | SIUD |
| public | `signature_budget` | oui | 2 | — | S | SIUD |
| public | `signature_consommations` | oui | 2 | — | S | SIUD |
| public | `signature_evenements` | oui | 0 | — | — | SIUD |
| public | `signature_suivi_actions` | oui | 1 | — | — | SIUD |
| public | `site_pages` | oui | 1 | S | SIUD | SIUD |
| public | `stripe_inventaire` | oui | 0 | — | — | SIUD |
| public | `stripe_souscriptions_non_suivies` | oui | 0 | — | — | SIUD |
| public | `supervision_alertes_internes` | oui | 1 | — | S | S |
| public | `supervision_arrets` | oui | 1 | — | S | S |
| public | `supervision_consignes` | oui | 1 | — | S | S |
| public | `supervision_consignes_accords` | oui | 1 | — | S | S |
| public | `supervision_consignes_taches` | oui | 1 | — | S | S |
| public | `supervision_consignes_versions` | oui | 1 | — | S | S |
| public | `supervision_couts` | oui | 2 | — | SI | SIUD |
| public | `supervision_delegations` | oui | 1 | — | SIU | SIUD |
| public | `supervision_executions_decisions` | oui | 3 | — | SI (col.) | SIUD |
| public | `supervision_identite` | oui | 2 | — (col.) | — (col.) | SIUD |
| public | `supervision_operations` | oui | 1 | — | S | S |
| public | `supervision_presence` | oui | 1 | — | SD | SIUD |
| public | `supervision_prospects` | oui | 3 | — | SI (col.) | SIUD |
| public | `supervision_registre` | oui | 2 | — | SI | SIUD |
| public | `supervision_sessions_artisan` | oui | 1 | — | S | SIUD |
| public | `supervision_taches_arret` | oui | 1 | — | S | S |
| public | `supervision_taches_hors_arret` | oui | 1 | — | S | S |
| public | `supervision_vacances` | oui | 1 | — | S | S |
| public | `tarif_formules` | oui | 1 | S | S | SIUD |
| public | `tarif_tranches` | oui | 1 | S | S | SIUD |
| public | `tech_log` | oui | 1 | — | S | SIUD |
| public | `tentatives_confirmation_auth` | oui | 0 | — | — | SIUD |
| public | `territory_market_data` | oui | 1 | — | S | SIUD |
| public | `territory_studies` | oui | 1 | — | S | SIUD |
| public | `verrous_facturation` | oui | 0 | — | — | SIUD |
| public | `versions_conditions` | oui | 1 | S | S | SI |
| support_interne | `controles_organisation` | oui | 0 | — | — | — |
| support_interne | `gestes_encaissement` | oui | 0 | — | — | — |
| support_interne | `maintenance_lignes` | oui | 0 | — | — | — |

Total : 232 tables relevées, dont 227 dans `public` (227 avec RLS ; 27 sans politique), 3 dans `support_interne` (RLS, sans politique, sans droit pour l’API), 1 dans `gerimmo_session_interne` (sans RLS, sans droit pour l’API), 1 dans `e2e_local` (banc seulement).
