---
type: synthesis
tags: [cartographie, audit, architecture, droits, banc-local]
status: draft
created: 2026-10-14
updated: 2026-10-16
sources: []
---

# Cartographie vérifiable de Gerimmo (pages, actions, base, stockage, authentification, intégrations, rôles)

> [!info] Provenance et rejeu
> - Version du code : `9396669` (branche `claude/compassionate-euler-qpqjp6`), relevé le 2026-10-14 04:41:07 +0000.
> - Arbre de travail : propre sur app/src, app/supabase, app/e2e, app/tests au moment du relevé.
> - Scripts : `scripts/lib.py`, `scripts/01_routes.py`, `scripts/02_actions.py`, `scripts/03_base.py`, `scripts/04_transverse.py`, `scripts/08_page_cartographie.py`, `scripts/00_controles_croises.sh` (rejeu complet : `bash scripts/rejouer.sh`).
> - Contrôle croisé (commande indépendante des scripts) : pages `116`, route handlers `27`, fichiers « use server » `70`, migrations `308` (fichier `donnees/controles-croises.tsv`).

> [!warning] Depuis ce relevé (état au 16/10/2026) — adresse du propriétaire direct
> Depuis la décision D27-B (PR #191, fusion `d55f87b`, 16/10/2026 à 00 h 38 heure de Paris), le propriétaire direct entre sous **`/espace/<id>/…`** : c'est un alias réécrit par
> le proxy vers les écrans de `app/agence/[orgId]`, après toutes ses gardes ; `/agence/<id>/…` d'un propriétaire direct lui répond en **308** (chemin et
> requête conservés, à vie) ; `/espace/<id>` d'une autre organisation répond « introuvable ». Les agences et leurs agents restent sous `/agence/<id>`.
> La structure des fichiers décrite ici (dossier `app/agence/[orgId]`, coquille commune) ne change pas : seules les adresses vues par le propriétaire
> direct changent (`app/src/lib/racine-espace.ts`, `app/src/app/espaces/page.tsx`). Les autres écarts depuis le 14/10 (migrations des 14 et 15/10,
> tâches planifiées) ne sont pas reportés dans ce relevé généré : voir [[Dossier de validation — version candidate du 13 octobre 2026]] § 5 quater.


Cette page est **générée par des scripts** rejouables ; chaque section dit quel script et quel fichier de données l'a produite. Rien n'est écrit dans le dépôt
(lecture seule de `app/src`, `app/supabase`, `app/e2e`, `app/vercel.json`) et le catalogue SQL est lu par `SELECT` en session `read-only` sur la base de schéma
`gerimmo_ci_integ` (sans données). Les analyses de code sont des **lectures par expressions régulières** : elles dénombrent, elles ne prouvent pas un
comportement — pour le comportement observé, voir [[Matrice fonctions rôles droits]] et [[Inventaire de couverture]].

## 0. Contrôles croisés : script contre commande indépendante

Chaque chiffre structurant est recompté par une commande shell ou SQL qui n'utilise pas le code Python (`scripts/00_controles_croises.sh`, résultat brut dans `donnees/controles-croises.tsv`).

| Objet | Commande indépendante et résultat | Résultat du script |
|---|---|---|
| Pages `page.tsx` | `find src/app -name page.tsx \| wc -l` = 116 | 116 |
| Route handlers `route.ts` | `find src/app -name route.ts \| wc -l` = 27 | 27 |
| Layouts | `find src/app -name layout.tsx \| wc -l` = 5 | 5 |
| Fichiers « use server » | `grep -rlE '^\s*"use server"' src \| wc -l` = 70 | 70 |
| Fonctions exportées de `app/actions/` (grep) | `grep -rhE '^export (async )?function' src/app/actions \| wc -l` = 240 | 259 sur tous les fichiers « use server » (dont 240 dans app/actions/) |
| Migrations | `ls supabase/migrations/*.sql \| wc -l` = 308 | 308 |
| Tables `public` (RLS activée partout ?) | SQL : 145 tables, 0 sans RLS | 145 tables ; sans RLS : 0 |
| Politiques RLS | SQL `pg_policies` = 299 | 299 |
| Fonctions `public` | SQL = 554 (dont SECURITY DEFINER 479, EXECUTE authenticated 354, EXECUTE anon 0) | 554 (SD 479) |
| Déclencheurs (tous schémas non système) | SQL = 376 | 376 |
| Types énumérés | SQL = 44 | 44 |
| Tâches `cron.job` | SQL = 8 | 8 |
| Crons Vercel | `grep -c '"path"' vercel.json` = 11 | 11 |
| Variables à `NOM=` dans `.env.example` | `grep -cE '^[A-Z][A-Z0-9_]+=' .env.example` = 69 | 69 |

Les écarts apparents sont expliqués dans la colonne de droite : le script compte aussi les fichiers « use server » hors `app/actions/` ; il compte les déclencheurs de tous les schémas (public, auth, storage).

## 1. Pages et routes de `app/src/app/**`

Produit par `scripts/01_routes.py` → `donnees/routes.json`. **116 pages** et **27 route handlers**, 5 layouts, 5 `loading.tsx`, 1 `error.tsx` (racine), 1 `not-found.tsx`.

| Segment | Pages | Accessible à (d'après proxy.ts, layouts et gardes lues) |
|---|---|---|
| / | 1 | public |
| /admin | 26 | super-administrateur (aal2) |
| /agence | 34 | propriétaire direct, admin d'agence, agent (même coquille) |
| /artisan | 21 | artisan |
| /assistance | 1 | tout compte connecté |
| /attestation-loyer | 1 | compte connecté |
| /auth | 1 | public |
| /compte | 1 | tout compte connecté |
| /conditions | 1 | public |
| /confidentialite | 1 | public |
| /connexion | 1 | public |
| /espaces | 1 | tout compte connecté (aiguillage) |
| /inscription | 1 | public |
| /invitations | 1 | compte invité |
| /journal | 2 | public |
| /locataire | 8 | locataire |
| /mentions-legales | 1 | public |
| /mot-de-passe-oublie | 1 | public |
| /nouveau-mot-de-passe | 1 | public |
| /outils | 6 | public |
| /quittance | 1 | compte autorisé sur la quittance |
| /relais | 1 | compte avec pouvoir de supervision / relais |
| /securite | 1 | tout compte connecté (sas du second facteur) |
| /tarifs | 1 | public |
| /veille | 1 | compte connecté |

Total 116 pages. Handlers par famille : `admin` 1, `agence` 4, `api/artisan-prive` 2, `api/cron` 12, `api/devis` 1, `api/sante` 1, `api/stripe` 1, `api/youtrust` 1, `artisan` 1, `auth` 1, `locataire` 2.

### 1.1 `/agence/[orgId]/**` : écrans partagés entre propriétaire direct, admin d'agence et agent

La coquille `app/src/app/agence/[orgId]/layout.tsx` sert **les trois rôles** (commentaire du layout : « Une seule coquille pour les trois rôles qui partagent ces écrans »). `verifierAccesEspace` exige une adhésion active `admin_agence | agent | proprietaire_direct` ; un super-administrateur y entre en traversée journalisée (`log_sa_access`). Les entrées de menu par rôle viennent de `navigationEspace()` (`src/lib/navigation-espace.ts`, lu par le script) ; la colonne « Observé » vient de la passe automatique sur le banc (`app/e2e/matrice-ecrans.json` + `e2e/.audit/rapport-*.json`).

| Route (sous /agence/[orgId]) | Libellé (matrice d'écrans) | Menu (PD = propriétaire direct, Ag = agent, Adm = admin d'agence) | Observé sur le banc | Indices de rôle dans la page (lecture par motif, bruyante : inclut des rôles de personne) |
|---|---|---|---|---|
| `…` | Tableau de bord agence (partagé propriétaire) | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | ROLES_RESPONSABLES, estProprietaire |
| `…/abonnement` | Abonnement (propriétaire direct) | Adm:Plus; PD:Plus | PD:ouvert | - |
| `…/administration` | Administration (équipe, portefeuilles) | Adm:Plus | Adm:ouvert | estProprietaire, role !== "admin_agence", role === "admin_agence" |
| `…/agenda` | Agenda de l’agence | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | role === "agent", role === "proprietaire_direct" |
| `…/alertes` | Alertes | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | ROLES_RESPONSABLES, estProprietaire |
| `…/artisans` | Réseau d’artisans | Adm:Plus; Ag:Plus | Adm:ouvert; Ag:ouvert; PD:ouvert | ROLES_RESPONSABLES, role === "proprietaire_direct" |
| `…/baux/[bailId]` | Fiche d'un bail | hors menu | Adm:ouvert; Ag:ouvert | role === "garant", role==="colocataire" |
| `…/baux/[bailId]/edl/[edlId]` | État des lieux d'un bail | hors menu | Adm:ouvert; Ag:ouvert | estProprietaire |
| `…/comptabilite` | Comptabilité (quittancement, encaissements) | Adm:menu; Ag:Plus | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire, role !== "agent", role === "admin_agence" |
| `…/comptabilite/fiscal` | Aide fiscale (revenus fonciers) | Adm:menu; Ag:Plus | PD:ouvert | - |
| `…/comptabilite/reprise` | Reprise comptable | Adm:menu; Ag:Plus | Adm:ouvert | ROLES_RESPONSABLES |
| `…/diagnostics/[diagnosticId]` | Diagnostic et alerte associée | hors menu | Adm:redirigé; Ag:redirigé | - |
| `…/documents` | GED — documents de l'organisation | Adm:Plus; PD:Plus | Adm:ouvert; Ag:ouvert; PD:ouvert | - |
| `…/documents/catalogue` | Catalogue documentaire | Adm:Plus; PD:Plus | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire, role!=="agent" |
| `…/faq` | FAQ du propriétaire direct | PD:Plus | PD:ouvert | estProprietaire |
| `…/incidents` | Liste des incidents | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | ROLES_RESPONSABLES, estProprietaire |
| `…/incidents/[incidentId]` | Détail d'un incident | Adm:menu; Ag:menu; PD:menu | Adm:redirigé; Ag:redirigé | - |
| `…/incidents/nouveau` | Déclaration d'un incident | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire |
| `…/journal` | Journal dans l’espace connecté | hors menu | Ag:ouvert; PD:ouvert | - |
| `…/journal/[slug]` | Article dans l’espace connecté | hors menu | Ag:ouvert; PD:ouvert | - |
| `…/lots/[lotId]` | Renvoi d'un lot vers sa fiche (liens « à renseigner » d'un document) | hors menu | Ag:redirigé | - |
| `…/loyers` | Loyers et charges | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire, role === "agent" |
| `…/mandats` | Mandats & versements | Adm:Plus | Adm:ouvert | estProprietaire, role !== "admin_agence" |
| `…/messages` | Messagerie | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire, role === "agent", role === "proprietaire_direct" |
| `…/parc` | Parc / portefeuille de biens | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | ROLES_RESPONSABLES, estProprietaire, role === "agent" |
| `…/parc/[bienId]` | Fiche d'un bien | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert | ROLES_RESPONSABLES, estProprietaire, role === "agent" |
| `…/parc/[bienId]/lots/[lotId]` | Fiche d'un lot | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert | role === "proprietaire_direct" |
| `…/parc/import` | Importer un parc | Adm:menu; Ag:menu; PD:menu | Adm:ouvert | ROLES_RESPONSABLES, estProprietaire |
| `…/parc/nouveau` | Ajout d'un bien | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire, role === "proprietaire_direct" |
| `…/personnes` | Annuaire des personnes | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire, role === "colocataire", role === "garant" |
| `…/personnes/[personId]` | Fiche personne | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert | estProprietaire, role === "Garant", role === "locataire" |
| `…/profil` | Profil de l'agence / du propriétaire | Adm:menu; Ag:Plus | Adm:ouvert; Ag:ouvert; PD:ouvert | ROLES_GERANTS, ROLES_RESPONSABLES, estProprietaire |
| `…/reseau` | Réseau disponible pour les biens | hors menu | Adm:ouvert | estProprietaire |
| `…/statistiques` | Statistiques | Adm:menu; Ag:menu; PD:menu | Adm:ouvert; Ag:ouvert; PD:ouvert | estProprietaire |

**Lecture.** 34 pages ; 23 sont ouvertes sans redirection par au moins deux des trois profils dans la passe automatique (écrans réellement partagés). Les entrées « Abonnement » et « Administration » n'apparaissent qu'aux responsables (admin d'agence, propriétaire direct), pas à l'agent. La fiscalité et les écrans « Mes lots / Finances » sont du vocabulaire propriétaire direct ; « Mandats », « Parc de l'agence », « Administration » sont du côté agence. Les agences sont **hors V1 publique** : le code reste, la vitrine ne les présente plus.

### 1.2 `/locataire/[orgId]/**`

| Route | Libellé | Garde (page + layout + import) | Observé | loading.tsx |
|---|---|---|---|---|
| `/locataire/[orgId]` | Tableau de bord locataire | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/contact` | Contacter la gérance | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/demandes` | Mes demandes | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/documents` | Mes documents | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/faq` | FAQ locataire | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/incident` | Signaler un incident | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/logement` | Mon logement | verifierAccesEspaceLocataire | locataire:ouvert | oui |
| `/locataire/[orgId]/loyers` | Mes loyers & quittances | verifierAccesEspaceLocataire | locataire:ouvert | oui |

### 1.3 `/artisan/**`

| Route | Libellé | Garde (page + layout + import) | Observé | loading.tsx |
|---|---|---|---|---|
| `/artisan` | Accueil artisan | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/agenda` | Agenda artisan | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/attestations` | Attestations artisan | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/chantiers/[chantierId]` |  | verifierAccesArtisan | non dans la matrice | oui |
| `/artisan/clients` | Clients externes | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/clients/[clientId]` |  | verifierAccesArtisan | non dans la matrice | oui |
| `/artisan/devis` | Demandes de devis | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/devis/[sollicitationId]` | Répondre à une demande | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/devis/nouveau` | Nouveau chantier et devis | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/entreprise` | Mon entreprise | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/facturation` | Facturation artisan | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/facturation/[factureId]` |  | verifierAccesArtisan | non dans la matrice | oui |
| `/artisan/inscription` | Inscription artisan | verifierAccesArtisan | agent:ouvert | oui |
| `/artisan/missions/[interventionId]` | Fiche mission | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/missions/[interventionId]/compte-rendu` | Compte rendu de mission | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/missions/[interventionId]/compte-rendu/bilan` | Bilan de mission | verifierAccesArtisan | artisan:redirigé | oui |
| `/artisan/missions/[interventionId]/creneaux` | Proposer des créneaux | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/missions/[interventionId]/facture` | Déposer ma facture | verifierAccesArtisan | artisan:redirigé | oui |
| `/artisan/note` | Ma note artisan | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/panne` | Aide en cas de panne | verifierAccesArtisan | artisan:ouvert | oui |
| `/artisan/regles` | Règles pour les artisans | verifierAccesArtisan | artisan:ouvert | oui |

### 1.4 `/admin/**` (supervision, super-administrateur aal2)

| Route | Libellé | Garde (page + layout + import) | Observé | loading.tsx |
|---|---|---|---|---|
| `/admin` | Vue d’ensemble de la supervision | is_super_admin | superadmin:ouvert | oui |
| `/admin/artisans` | Artisans à valider | is_super_admin | superadmin:ouvert | oui |
| `/admin/autonomie` | Développement du site | is_super_admin | superadmin:ouvert | oui |
| `/admin/brief` | Aujourd’hui — le point du matin | is_super_admin | superadmin:ouvert | oui |
| `/admin/brief/[equipe]` | Le point du matin — détail d’une équipe | is_super_admin | superadmin:ouvert | oui |
| `/admin/clients` | Clients (agences, propriétaires, artisans) | is_super_admin | superadmin:ouvert | oui |
| `/admin/clients/artisans/[artisanId]` | Fiche artisan | is_super_admin | superadmin:ouvert | oui |
| `/admin/comptes/[accountId]` | Fiche de débogage d’un compte (état, rôles, journaux) | is_super_admin | superadmin:ouvert | oui |
| `/admin/consignes` | Consignes versionnées | is_super_admin | superadmin:ouvert | oui |
| `/admin/couverture` | Réseau d’artisans : ouvertures par commune et métier | is_super_admin | superadmin:ouvert | oui |
| `/admin/devis` | Demandes de devis du site vitrine | is_super_admin | superadmin:ouvert | oui |
| `/admin/equipes` | Travail des équipes | is_super_admin | superadmin:ouvert | oui |
| `/admin/journaux` | Historique et conservation | is_super_admin | superadmin:ouvert | oui |
| `/admin/marketing` | Agent marketing | is_super_admin | superadmin:ouvert | oui |
| `/admin/marque-blanche` | Personnalisation des agences | is_super_admin | superadmin:ouvert | oui |
| `/admin/organisations/[orgId]` | Détail d'une organisation | is_super_admin | superadmin:ouvert | oui |
| `/admin/organisations/nouvelle` | Ouvrir une organisation | is_super_admin | superadmin:ouvert | oui |
| `/admin/parametres` | Paramètres | is_super_admin | superadmin:ouvert | oui |
| `/admin/publications` | Journal éditorial | is_super_admin | superadmin:ouvert | oui |
| `/admin/publications/[id]` | Éditer un article | is_super_admin | superadmin:ouvert | oui |
| `/admin/publications/nouvelle` | Créer un article | is_super_admin | superadmin:ouvert | oui |
| `/admin/relais` | Relais en mon absence | is_super_admin | superadmin:ouvert | oui |
| `/admin/retours` | Retours des utilisateurs | is_super_admin | superadmin:ouvert | oui |
| `/admin/sante` | Santé et connexions | is_super_admin | superadmin:ouvert | oui |
| `/admin/territoire` | Développement territorial | is_super_admin | superadmin:ouvert | oui |
| `/admin/veille` | Veille à superviser | is_super_admin | superadmin:ouvert | oui |

### 1.5 Segments publics et transverses

| Route | Libellé | Garde lue | Observé |
|---|---|---|---|
| `/` | Site vitrine (accueil marketing) | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/assistance` | Assistance | aucune dans la page (session exigée par le proxy hors chemins publics) | agent:ouvert |
| `/attestation-loyer/[orgId]` | Attestation de bon paiement | verifierAccesEspaceLocataire | locataire:ouvert |
| `/auth/confirmer` | Lien reçu par e-mail — bouton de confirmation | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/compte` | Sécurité du compte (mot de passe, second facteur) | auth.getUser (via import) | agent:ouvert; locataire:ouvert |
| `/conditions` | Conditions générales d’utilisation et de vente | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/confidentialite` | Politique de confidentialité | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/connexion` | Connexion | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/espaces` | Sélecteur d'espaces (tout utilisateur connecté) | has_supervision_power | agent:redirigé |
| `/inscription` | Inscription (création de compte) | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/invitations/[invitationId]` |  | aucune dans la page (session exigée par le proxy hors chemins publics) | non dans la matrice |
| `/journal` | Journal | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/journal/[slug]` | Article du journal | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/mentions-legales` | Mentions légales | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/mot-de-passe-oublie` | Mot de passe oublié | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/nouveau-mot-de-passe` | Réinitialisation du mot de passe | aucune dans la page (session exigée par le proxy hors chemins publics) | public:redirigé |
| `/outils` | Outils gratuits (index) | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/outils/calcul-irl` | Outil gratuit — calcul de la révision IRL | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/outils/comparateur-gli-visale` | Outil gratuit — comparateur GLI / Visale | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/outils/quittance-de-loyer` | Outil gratuit — quittance de loyer | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/outils/rentabilite-locative` | Outil gratuit — rentabilité locative | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/outils/simulateur-lmnp` | Outil gratuit — simulateur LMNP | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/quittance/[quittanceId]` | Quittance / reçu imprimable (aussi vue côté agence) | aucune dans la page (session exigée par le proxy hors chemins publics) | locataire:ouvert |
| `/relais` | Relais de supervision | has_supervision_power | superadmin:ouvert |
| `/securite` | Sécurité des données | auth.getUser (via import) | superadmin:ouvert |
| `/tarifs` | Tarifs | aucune dans la page (session exigée par le proxy hors chemins publics) | public:ouvert |
| `/veille` | Règles pour les bailleurs | aucune dans la page (session exigée par le proxy hors chemins publics) | admin:ouvert; agent:ouvert; locataire:ouvert; proprietaire:ouvert |

### 1.6 Route handlers (`route.ts`)

| Route | Méthodes | Protection reconnue | Contourne la session du proxy | Clé de service | Fichier |
|---|---|---|---|---|---|
| `/admin/artisans/pieces/[pieceId]/fichier` | GET | is_super_admin | non | non | `admin/artisans/pieces/[pieceId]/fichier/route.ts` |
| `/agence/[orgId]/comptabilite/export` | GET | verifierAccesEspace | non | non | `agence/[orgId]/comptabilite/export/route.ts` |
| `/agence/[orgId]/comptabilite/reprise/modele` | GET | AUCUNE garde reconnue (à lire) | non | non | `agence/[orgId]/comptabilite/reprise/modele/route.ts` |
| `/agence/[orgId]/documents/[documentId]/fichier` | GET | verifierGerant | non | non | `agence/[orgId]/documents/[documentId]/fichier/route.ts` |
| `/agence/[orgId]/parc/import/modele` | GET | AUCUNE garde reconnue (à lire) | non | non | `agence/[orgId]/parc/import/modele/route.ts` |
| `/api/artisan-prive/export` | GET | AUCUNE garde reconnue (à lire) | non | non | `api/artisan-prive/export/route.ts` |
| `/api/artisan-prive/pieces/[pieceId]` | GET | AUCUNE garde reconnue (à lire) | non | non | `api/artisan-prive/pieces/[pieceId]/route.ts` |
| `/api/cron/abonnements` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/cron/abonnements/route.ts` |
| `/api/cron/appels` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/cron/appels/route.ts` |
| `/api/cron/equipes` | GET | secret CRON_SECRET (Bearer) | oui | non | `api/cron/equipes/route.ts` |
| `/api/cron/marketing` | GET | secret CRON_SECRET (Bearer) | oui | non | `api/cron/marketing/route.ts` |
| `/api/cron/orchestrateur` | GET | secret CRON_SECRET (Bearer) | oui | non | `api/cron/orchestrateur/route.ts` |
| `/api/cron/purge` | GET | secret CRON_SECRET (Bearer) | oui | non | `api/cron/purge/route.ts` |
| `/api/cron/quittances` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/cron/quittances/route.ts` |
| `/api/cron/rappels` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/cron/rappels/route.ts` |
| `/api/cron/relances` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/cron/relances/route.ts` |
| `/api/cron/signatures` | GET | secret CRON_SECRET (Bearer) | oui | non | `api/cron/signatures/route.ts` |
| `/api/cron/territoire` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/cron/territoire/route.ts` |
| `/api/cron/veille` | GET | secret CRON_SECRET (Bearer) | oui | non | `api/cron/veille/route.ts` |
| `/api/devis/[sollicitationId]/pdf` | GET, POST | session (auth.getUser); verifierArtisanLecture (via import); verifierArtisanMutation (via import) | non | non | `api/devis/[sollicitationId]/pdf/route.ts` |
| `/api/sante` | GET | secret CRON_SECRET (Bearer) | oui | oui | `api/sante/route.ts` |
| `/api/stripe/webhook` | GET, POST | signature de webhook / secret | oui | oui | `api/stripe/webhook/route.ts` |
| `/api/youtrust/webhook` | GET, POST | signature de webhook / secret | oui | non | `api/youtrust/webhook/route.ts` |
| `/artisan/attestations/[pieceId]/fichier` | GET | session (auth.getUser); verifierAccesArtisan (via import); verifierAccesEspace (via import); verifierArtisanAction (via import); verifierArtisanLecture (via import); verifierArtisanMutation (via import) | non | non | `artisan/attestations/[pieceId]/fichier/route.ts` |
| `/auth/confirm` | GET, POST | AUCUNE garde reconnue (à lire) | non | non | `auth/confirm/route.ts` |
| `/locataire/[orgId]/bail/fichier` | GET | verifierLocataire | non | non | `locataire/[orgId]/bail/fichier/route.ts` |
| `/locataire/[orgId]/documents/[documentId]/fichier` | GET | verifierLocataire | non | non | `locataire/[orgId]/documents/[documentId]/fichier/route.ts` |

`/api/sante` est **publique** (le proxy la laisse passer) : sans secret elle ne répond que `ok`, `base`, `commit`, `revision` ; avec `Authorization: Bearer CRON_SECRET` elle ajoute le détail de la ronde (en-tête du fichier). `/api/stripe/webhook` et `/api/youtrust/webhook` refusent sans signature valide (503 si le secret n'est pas posé, comme sur le banc). À lire à la main (aucune garde reconnue par motif) : `/agence/[orgId]/comptabilite/reprise/modele` et `/agence/[orgId]/parc/import/modele` renvoient un **gabarit CSV statique** (aucune donnée d'organisation, mais la session du proxy est exigée) ; `/api/artisan-prive/export` et `/api/artisan-prive/pieces/[pieceId]` délèguent à `chargerActivitePrivee()` (`src/lib/artisan-prive.ts`) et répondent 403 sans activité privée ; `/auth/confirm` valide un jeton OTP et refuse (403) une requête d'origine étrangère. Aucune de ces lectures n'a été exécutée dans cette cartographie.

### 1.7 `proxy.ts` : ce qu'il protège

Fichier `app/src/proxy.ts` (272 lignes) ; matcher : `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`. Produit par `01_routes.py`.

- **Contourne la session** (appelé par des serveurs : chaque route vérifie son propre secret ou la signature du corps) : `/api/cron/equipes`, `/api/cron/orchestrateur`, `/api/cron/veille`, `/api/cron/quittances`, `/api/cron/appels`, `/api/cron/rappels`, `/api/cron/abonnements`, `/api/cron/territoire`, `/api/cron/relances`, `/api/cron/marketing`, `/api/cron/signatures`, `/api/cron/purge`, `/api/stripe/webhook`, `/api/youtrust/webhook`, `/api/sante`.
- **Chemins publics** (accessibles sans session ET traversables connecté) : `/confidentialite`, `/conditions`, `/mentions-legales`, `/journal`, `/tarifs`, `/outils`, `/connexion`, `/inscription`, `/artisan/inscription`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, `/auth/confirm`, `/auth/confirmer`, `/robots.txt`, `/sitemap.xml` et la racine `/`.
- **Sans session**, toute autre adresse redirige vers `/connexion?suite=…` (303 pour un POST), sauf une adresse dont le premier segment n'existe ni dans `src/app` ni dans `public/` : réponse 404 (liste `SEGMENTS_CONNUS` : actions, admin, agence, api, artisan, assistance, attestation-loyer, auth, compte, conditions, confidentialite, connexion, espaces, inscription, invitations, journal, locataire, mentions-legales, mot-de-passe-oublie, nouveau-mot-de-passe, outils, polices, quittance, relais, securite, tarifs, veille, illustrations, logo, marketing).
- **Connecté** : expiration de session par rôle (inactivité + durée absolue, cookie d'activité signé HMAC) ; renvoi vers `/connexion?raison=session-expiree` ; **second facteur obligatoire** : un compte porteur du rôle `super_admin` sans niveau `aal2` est renvoyé vers `/securite` sur toute page non publique ; vérification d'existence des quittances (404 réel) ; redirection de `/`, `/connexion`, `/inscription`, `/mot-de-passe-oublie` vers `/espaces` pour un compte connecté.
- Contrôle de cohérence proxy / crons / dossiers : 0 écart(s) (`ecarts_proxy_vercel` dans `donnees/routes.json`).

### 1.8 `vercel.json`

Région : `cdg1`. Autres clés : aucune. **11 crons** :

| Chemin | Planification (UTC) |
|---|---|
| `/api/cron/equipes?mission=quittances` | `0 7 * * *` |
| `/api/cron/equipes?mission=abonnements` | `0 4 * * *` |
| `/api/cron/equipes?mission=appels` | `30 7 * * *` |
| `/api/cron/orchestrateur` | `45 5 * * *` |
| `/api/cron/equipes?mission=rappels` | `0 6 * * *` |
| `/api/cron/equipes?mission=territoire` | `0 5 * * *` |
| `/api/cron/equipes?mission=relances` | `45 7 * * *` |
| `/api/cron/equipes?mission=marketing` | `0 8 * * *` |
| `/api/cron/equipes?mission=signatures` | `0 3 * * *` |
| `/api/cron/equipes?mission=purge` | `40 3 * * *` |
| `/api/cron/equipes?mission=veille` | `0 9 * * *` |

Missions dans `src/lib/missions.ts` : 10 (veille, appels, quittances, relances, rappels, abonnements, signatures, marketing, territoire, purge), toutes planifiées (10) ; plus l'orchestrateur. `.env.example` annonce « Neuf missions quotidiennes » : voir l'écart CAR-03 en section 9.

Les tâches `pg_cron` (en base, hors Vercel) sont décrites en 4.6 : **8** tâches.

## 2. Actions serveur (`"use server"`)

Produit par `scripts/02_actions.py` → `donnees/actions.json`. **70 fichiers**, **259 fonctions exportées**. Rôle exigé = jetons de garde reconnus dans la fonction, dans les fonctions locales qu'elle appelle (2 niveaux) ou dans le module importé qui la porte ; **17** fonctions sans garde reconnue et **9** qui ne vérifient que la session. Gardes reconnues : `verifierGerant` = gerant (admin_agence|agent|proprietaire_direct) ; super_admin en traversée tracée; `verifierLocataire` = locataire; `verifierAccesEspace` = gerant (admin_agence|agent|proprietaire_direct) ; super_admin en traversée tracée; `verifierAccesEspaceLocataire` = locataire; `verifierAccesArtisan` = artisan; `verifierArtisanAction` = artisan; `verifierArtisanMutation` = artisan; `verifierArtisanLecture` = artisan; `garderSuperAdmin` = super_admin; `is_super_admin` = super_admin; `is_permanent_super_admin` = super_admin permanent (aal2); `superviseurPermanent` = super_admin permanent (aal2); `has_supervision_power` = supervision (pouvoir); `verifierClientDeLOrganisation` = gerant (client de l'organisation); `accesPreparationDevis` = artisan (préparation de devis).

| Rôle exigé (lu) | Fonctions |
|---|---|
| gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | 158 |
| super_admin permanent (aal2) | 25 |
| artisan | 18 |
| non détecté | 17 |
| super_admin | 10 |
| session seulement (auth.getUser) ; rôle à lire | 9 |
| locataire | 7 |
| super_admin ; super_admin permanent (aal2) | 7 |
| gerant (client de l'organisation) | 5 |
| artisan ; artisan (préparation de devis) | 3 |

Les 9 fonctions « session seulement » ne vérifient que l'existence de la session et **délèguent à une RPC gardée en base** : `definirNouveauMotDePasse` → `log_tech`; `changerMonMotDePasse` → `log_tech`; `donnerMonConge` → `mon_conge_locataire`; `signalerErreurEcran` → `log_tech`; `repondreInvitation` → `repondre_invitation_locataire`; `envoyerMessageLocataire` → `envoyer_message_locataire`; `deposerMaPiece` → `deposer_ma_piece`; `envoyerRetour` → `soumettre_retour`; `retournerDocumentSigne` → `retourner_document_signe`. Leur garde réelle est donc celle de la RPC (voir [[Matrice fonctions rôles droits]], section 4).

#### `actions/abonnement.ts` (5)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `demarrerAbonnement` | gerant (client de l'organisation) ; client de service | abonnement_basculer_grille, abonnement_client_pose, abonnement_client_remplace, etat_abonnement, mon_abonnement, mon_client_stripe | organizations |
| `confirmerHausse` | gerant (client de l'organisation) | abonnement_changements_a_recalculer, etat_abonnement, ma_souscription_stripe, mon_abonnement | organizations |
| `demanderPeriodicite` | gerant (client de l'organisation) | demander_periodicite_suivante, ma_souscription_stripe | - |
| `resilierAbonnement` | gerant (client de l'organisation) | abonnement_changements_a_recalculer, ma_souscription_stripe | - |
| `ouvrirPortailAbonnement` | gerant (client de l'organisation) | mon_client_stripe | - |

#### `actions/agenda-gestion.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `chargerAgendaGestion` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | incident_interventions |

#### `actions/alertes.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerAlerte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | alerts(É) |
| `escaladerAlerte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | alerts(É) |
| `fermerAlerte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | alerts(É) |

#### `actions/annexe-bail.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `deposerAnnexeBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux, document_liens(É) |
| `corrigerClasseDpeBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux, diagnostics(É) |
| `deposerDiagnosticBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux |

#### `actions/annonces.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerAnnonce` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | annonces(É) |
| `supprimerAnnonce` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | annonces(É) |

#### `actions/appels-charges.ts` (6)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerAppelCharges` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | appels_charges(É) |
| `ajouterPosteCharge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | appel_charges_postes(É) |
| `modifierPosteCharge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | appel_charges_postes(É) |
| `supprimerPosteCharge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | appel_charges_postes(É) |
| `validerVentilation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | valider_ventilation | - |
| `supprimerAppelCharges` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | appels_charges(É) |

#### `actions/artisan.ts` (16)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `inscrireMonEntreprise` | artisan | inscrire_mon_entreprise_artisan | - |
| `mettreAJourMetiersZones` | artisan | artisan_definir_metiers_zones | - |
| `definirMaVisibilite` | artisan | definir_ma_visibilite | - |
| `deposerMaPiece` | artisan | deposer_ma_piece_artisan | - |
| `declinerMaSollicitation` | artisan | decliner_sollicitation | - |
| `deposerMonDevis` | artisan | - | - |
| `accepterMaMission` | artisan | accepter_mission | - |
| `refuserMaMission` | artisan | mon_agenda_artisan, refuser_mission | - |
| `proposerMesCreneaux` | artisan | mon_agenda_artisan, proposer_creneaux | - |
| `demarrerMonIntervention` | artisan | demarrer_intervention | - |
| `accepterDateLocataire` | artisan | accepter_creneau_locataire | - |
| `refuserDatesLocataire` | artisan | refuser_creneaux_locataire | - |
| `deposerMaFacture` | artisan | deposer_facture_artisan, mon_agenda_artisan | - |
| `deposerPhotoChantier` | artisan | deposer_photo_intervention, mon_agenda_artisan | - |
| `deposerMonCompteRendu` | artisan | deposer_compte_rendu | - |
| `demanderMonAvenant` | artisan | demander_avenant_devis | - |

#### `actions/attestation-locataire.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `deposerMonAttestation` | locataire | deposer_mon_attestation | memberships |

#### `actions/auth.ts` (6)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `seDeconnecter` | non détecté | - | - |
| `demanderReinitialisation` | non détecté | - | - |
| `definirNouveauMotDePasse` | session seulement (auth.getUser) ; rôle à lire | log_tech | - |
| `inscrireProprietaire` | non détecté | - | - |
| `creerCompteArtisan` | non détecté | - | - |
| `ouvrirEspaceProprietaire` | non détecté | accepter_cgu, initialiser_espace_proprietaire | - |

#### `actions/autonomie.ts` (7)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `actualiserDossiers` | super_admin permanent (aal2) | actualiser_orchestration, is_permanent_super_admin | - |
| `creerDelegation` | super_admin permanent (aal2) | creer_relais_supervision, is_permanent_super_admin | - |
| `revoquerDelegation` | super_admin permanent (aal2) | is_permanent_super_admin, revoquer_relais_supervision | - |
| `deciderAmelioration` | super_admin permanent (aal2) | decider_developpement, is_permanent_super_admin | development_proposals |
| `actualiserCorrection` | super_admin permanent (aal2) | is_permanent_super_admin | development_proposals(É) |
| `signalerPresence` | super_admin permanent (aal2) | is_permanent_super_admin, signaler_presence_supervision | - |
| `enregistrerBilanContact` | non détecté | confirmer_bilan_contact | - |

#### `actions/baux.ts` (15)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux(É), lots, persons(É) |
| `modifierBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux(É), lots, persons(É) |
| `modifierComplementsBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux(É) |
| `deposerBailSigne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | activer_bail, controler_mise_en_location, lot_blocages_location | baux(É), etats_des_lieux, lots |
| `deposerReglementCopropriete` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | activer_bail, controler_mise_en_location, lot_blocages_location | baux(É), etats_des_lieux, lots |
| `corrigerBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | devalider_bail | - |
| `envoyerBailSigne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux(É), persons |
| `enregistrerConge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_conge, enregistrer_conge_avec_justificatif | - |
| `annulerConge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | annuler_conge | - |
| `terminerBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | terminer_bail | - |
| `ajouterInventaireLigne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | inventaire_lignes(É) |
| `supprimerInventaireLigne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | inventaire_lignes(É) |
| `ajouterBailPersonne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | bail_personnes(É), baux |
| `supprimerBailPersonne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | bail_personnes(É), baux |
| `enregistrerDepartColocataire` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_depart_colocataire | - |

#### `actions/catalogue-documents.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `genererDepuisCatalogue` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | - |

#### `actions/chambres.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerChambre` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lot_chambres(É) |
| `enregistrerPlafondColocation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lots(É) |

#### `actions/classe-dpe-lot.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `corrigerClasseDpeLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | diagnostics(É) |

#### `actions/compta.ts` (7)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `genererRapport` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | generer_rapport | - |
| `envoyerRapport` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | - |
| `enregistrerVersement` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_versement | - |
| `ajouterEcriture` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | ecritures(É) |
| `passerContreEcriture` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | contre_ecriture | - |
| `ventilerDepense` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | ventiler_depense_bien | - |
| `cloturerMois` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | cloturer_mois | - |

#### `actions/compte.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `changerMonMotDePasse` | session seulement (auth.getUser) ; rôle à lire | log_tech | - |

#### `actions/conge-locataire.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `donnerMonConge` | session seulement (auth.getUser) ; rôle à lire | mon_conge_locataire | - |

#### `actions/consignes-vacances.ts` (4)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerConsigne` | super_admin permanent (aal2) | is_permanent_super_admin | - |
| `commanderConsigne` | super_admin permanent (aal2) | is_permanent_super_admin | supervision_consignes_taches |
| `enregistrerVacances` | super_admin permanent (aal2) | is_permanent_super_admin | - |
| `commanderRelais` | super_admin permanent (aal2) | is_permanent_super_admin | - |

#### `actions/controle-supervision.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `renvoyerInvitation` | super_admin permanent (aal2) | is_permanent_super_admin | memberships |
| `controlerOrganisation` | super_admin permanent (aal2) | controler_organisation, is_permanent_super_admin | - |
| `controlerCompte` | super_admin permanent (aal2) ; client de service | dossier_compte_supervision, is_permanent_super_admin | - |

#### `actions/depot.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `encaisserDepot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | encaisser_depot | - |
| `supprimerEncaissementDepot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | supprimer_encaissement_depot | - |

#### `actions/devis-admin.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `marquerDevisTraitee` | super_admin permanent (aal2) | demande_devis_traitee, is_permanent_super_admin | - |

#### `actions/devis.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `demanderDevis` | non détecté | - | demandes_devis(É) |

#### `actions/documents-ged.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `remplacerDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | remplacer_document_ged | documents |
| `rattacherDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | document_liens(É), documents |

#### `actions/documents-generes.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `genererDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | document_liens(É) |

#### `actions/dossier.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `deposerPieceDossier` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | document_liens(É), documents, pieces_demandees(É) |
| `validerAttestation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | valider_attestation | - |

#### `actions/edl.ts` (9)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerMentionsEdl` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | etats_des_lieux(É) |
| `creerEdl` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | generer_grille_edl | baux, etats_des_lieux(É) |
| `regenererGrilleEdl` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | generer_grille_edl | - |
| `majGrilleEdl` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_grille_edl, enregistrer_grille_edl_avec_preuve | edl_lignes, etats_des_lieux |
| `enregistrerAnnexesEdl` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_annexes_edl | edl_cles, edl_compteurs |
| `ajouterCompteur` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | edl_compteurs(É), etats_des_lieux |
| `supprimerCompteur` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | edl_compteurs(É), etats_des_lieux |
| `ajouterCle` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | edl_cles(É), etats_des_lieux |
| `supprimerCle` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | edl_cles(É), etats_des_lieux |

#### `actions/equipes.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `commanderMission` | super_admin permanent (aal2) | is_permanent_super_admin, regler_mission | - |
| `enregistrerContinuite` | super_admin permanent (aal2) | enregistrer_plan_continuite, is_permanent_super_admin | - |
| `demanderCorrection` | super_admin permanent (aal2) | is_permanent_super_admin | development_proposals(É) |

#### `actions/erreurs.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `signalerErreurEcran` | session seulement (auth.getUser) ; rôle à lire | log_tech | - |

#### `actions/etapes-bail.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `modifierEtapeBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux(É) |
| `commencerBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux(É), lots |

#### `actions/etudes-territoriales.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerEtude` | super_admin permanent (aal2) | enregistrer_etude_territoriale, is_permanent_super_admin | - |

#### `actions/fiche-lot.ts` (7)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `chargerFicheLot` | non détecté | contrats_du_lot, detenteur_principal_du_lot, fiche_lot | bail_personnes, baux, diagnostics, persons |
| `chargerDocumentsDuLot` | non détecté | documents_du_lot | - |
| `chargerComptabiliteDuLot` | non détecté | comptabilite_du_lot, etat_loyers_bail, rapport_du_lot | - |
| `chargerEcheancierLocataire` | non détecté | mon_echeancier_locataire | - |
| `chargerRelancesDuLot` | non détecté | relances_du_lot | - |
| `chargerHistoriqueDuLot` | non détecté | historique_du_lot | - |
| `envoyerRapportDuLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | generer_rapport, rapport_du_lot | rapports_gestion |

#### `actions/fiscalite.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `qualifierPieceFiscale` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | qualifier_ecriture_fiscale | - |
| `retrouverVentilation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | retrouver_ventilation_fiscale | fiscal_encaissements_composantes |
| `enregistrerExerciceFiscal` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_exercice_fiscal_lot | - |

#### `actions/ged.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `deposerDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | document_liens(É) |

#### `actions/import-parc.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `importerParc` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | importer_parc | - |

#### `actions/incidents-locataire.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `choisirMonCreneau` | locataire | choisir_creneau | - |
| `proposerMesCreneaux` | locataire | contre_proposer_creneaux | - |
| `noterMonIntervention` | locataire | noter_artisan_locataire | - |

#### `actions/incidents.ts` (18)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `declarerMonIncident` | locataire | declarer_mon_incident_reprise | - |
| `contesterImputation` | locataire | contester_imputation | - |
| `signalerProblemePersiste` | locataire | rouvrir_incident | - |
| `ouvrirIncident` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | joindre_photo_incident, ouvrir_incident_agence | documents |
| `qualifierIncident` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | qualifier_incident | - |
| `cloturerIncident` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | cloturer_incident | - |
| `rouvrirIncident` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | rouvrir_incident | - |
| `attribuerIncident` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | attribuer_incident | - |
| `joindrePhotoIncident` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | joindre_photo_incident | documents |
| `ouvrirConsultation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | ouvrir_consultation | - |
| `solliciterArtisan` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | solliciter_artisan | - |
| `retenirDevis` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | retenir_devis | - |
| `fixerRendezVous` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | fixer_creneau_arbitrage_motive | - |
| `reviserImputation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | reviser_imputation_apres_diagnostic | - |
| `annulerMission` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | annuler_mission | - |
| `evaluerArtisan` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | evaluer_artisan_gerant | - |
| `deciderAvenant` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | decider_avenant_devis | - |
| `validerFactureArtisan` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | valider_facture_artisan | - |

#### `actions/invitations.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `inviterLocataire` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | noter_envoi_invitation_locataire, preparer_invitation_locataire | - |
| `annulerInvitation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | annuler_invitation_locataire | - |
| `repondreInvitation` | session seulement (auth.getUser) ; rôle à lire | repondre_invitation_locataire | - |

#### `actions/loyers.ts` (9)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `envoyerQuittance` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | quittance_detail | baux, persons, quittances(É) |
| `ajouterRelance` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | relances(É) |
| `supprimerRelance` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | relances(É) |
| `regulariserCharges` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | regulariser_charges_avec_justificatif | - |
| `genererAppels` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | generer_appels_loyer | - |
| `ajouterEncaissement` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | etat_loyers_bail | encaissements(É) |
| `supprimerEncaissement` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | supprimer_encaissement | - |
| `reviserLoyer` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | reviser_loyer | - |
| `emettreQuittances` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | - |

#### `actions/mandats.ts` (6)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerMandat` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | mandats(É) |
| `ajouterLigneMandat` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | mandat_lignes(É), mandats |
| `supprimerLigneMandat` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | mandat_lignes(É), mandats |
| `changerEtatMandat` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | mandat_lignes, mandats(É) |
| `changerTitulaireMandat` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | mandats(É) |
| `modifierDateMandat` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | mandats(É) |

#### `actions/messages.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `envoyerMessageLocataire` | session seulement (auth.getUser) ; rôle à lire | envoyer_message_locataire | - |
| `repondreMessagePersonne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | repondre_message_personne | - |

#### `actions/organisation.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `modifierProfilOrganisation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | organizations(É) |
| `inviterAgent` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | inviter_agent | - |

#### `actions/organisations-admin.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `ouvrirOrganisation` | non détecté | demande_devis_traitee, enregistrer_parrainage, ouvrir_organisation | organizations |

#### `actions/parc.ts` (17)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | creer_bien_complet | - |
| `modifierBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | biens(É) |
| `modifierLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lots(É) |
| `changerEtatLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lots(É) |
| `decouperBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | decouper_bien | biens |
| `ajouterDetention` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | detentions(É), persons(É) |
| `cloreDetention` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | detentions(É) |
| `supprimerDetention` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | supprimer_detention | - |
| `rouvrirDetention` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | rouvrir_detention | - |
| `deposerDiagnostic` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | diagnostics(É) |
| `ajouterPieceLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lot_pieces(É) |
| `proposerPiecesLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lot_pieces(É), lots |
| `supprimerPieceLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | lot_pieces(É) |
| `enregistrerInfosPratiques` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | bien_infos_pratiques(É) |
| `validerCle` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | valider_cle_repartition | - |
| `ajouterEquipementCatalogue` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | equipements_catalogue(É) |
| `definirEquipementsLot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | definir_equipements_lot | - |

#### `actions/personnes-bail.ts` (5)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `choisirPersonneBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | choisir_personne_bail | baux |
| `creerPersonneBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux |
| `modifierPersonneBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux |
| `retirerPersonneBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux |
| `enregistrerProprietairesBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | enregistrer_proprietaires_bail | baux |

#### `actions/personnes.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerPersonne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | detentions(É), lots, persons(É) |
| `archiverPersonne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | bail_personnes, baux, detentions, mandats, persons(É) |
| `modifierPersonne` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | persons(É) |

#### `actions/pieces-demandees.ts` (4)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `demanderPieceLocataire` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | persons, pieces_demandees(É) |
| `relancerPieceDemandee` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | persons, pieces_demandees(É) |
| `annulerPieceDemandee` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | pieces_demandees(É) |
| `deposerMaPiece` | session seulement (auth.getUser) ; rôle à lire | deposer_ma_piece | - |

#### `actions/publications.ts` (6)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `genererPropositions` | super_admin ; super_admin permanent (aal2) | is_permanent_super_admin, proposer_publications | - |
| `enregistrerPublication` | super_admin ; super_admin permanent (aal2) | is_permanent_super_admin | publications(É) |
| `publierPublicationFacebook` | super_admin ; super_admin permanent (aal2) | is_permanent_super_admin, reserver_diffusion_facebook | publications(É) |
| `publierPublication` | super_admin ; super_admin permanent (aal2) | is_permanent_super_admin | publications(É) |
| `retirerPublication` | super_admin ; super_admin permanent (aal2) | is_permanent_super_admin | publications(É) |
| `refuserPublication` | super_admin ; super_admin permanent (aal2) | is_permanent_super_admin | publications(É) |

#### `actions/quittancement.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `encaisserReste` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | encaisser_reste_atomique | - |
| `emettreQuittanceBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | - |
| `envoyerQuittancesMois` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | quittances |

#### `actions/recherche-espace.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `rechercherDansEspace` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | documents_courants | artisan_agences, artisans, baux, biens, encaissements, incidents, lots, persons |

#### `actions/recherche-supervision.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `rechercherDansSupervision` | super_admin | is_super_admin, rechercher_comptes_supervision | artisans, organizations |

#### `actions/reprise-comptable.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `reprendreSoldes` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | ouvrir_reprise, reprendre_soldes | - |
| `abandonnerReprise` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | abandonner_reprise | - |

#### `actions/reseau.ts` (5)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `confirmerCommuneBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | reseau_confirmer_commune | - |
| `confirmerCommunesEvidentes` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | reseau_confirmer_commune | biens, reseau_communes |
| `signalerInteretReseau` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | reseau_signaler_interet | - |
| `reglerOuvertureReseau` | super_admin | is_super_admin, reseau_regler_ouverture | - |
| `rattacherArtisanReseau` | super_admin | is_super_admin, reseau_rattacher_artisan | - |

#### `actions/restitution.ts` (7)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `demarrerRestitution` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | demarrer_restitution | - |
| `ajouterRetenue` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | ajouter_retenue, ajouter_retenue_avec_justificatif, purger_fichier_sans_fiche | - |
| `supprimerRetenue` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | supprimer_retenue | - |
| `justifierRetenue` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | justifier_retenue_avec_piece, purger_fichier_sans_fiche | - |
| `rafraichirMontantsRestitution` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | rafraichir_montants_restitution | - |
| `marquerDecompteEnvoye` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | marquer_decompte_envoye | - |
| `finaliserDecompte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | finaliser_decompte | - |

#### `actions/retention.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `lancerPurge` | super_admin | appliquer_retention, is_super_admin | purge_fichiers(É) |

#### `actions/retours.ts` (5)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `envoyerRetour` | session seulement (auth.getUser) ; rôle à lire | soumettre_retour | - |
| `soutenirRetour` | non détecté | soutenir_idee | - |
| `deciderRetour` | super_admin | is_super_admin, traiter_retour | - |
| `regrouperRetours` | super_admin | is_super_admin, regrouper_idees | - |
| `cloreRevue` | super_admin | clore_revue_idees, is_super_admin | - |

#### `actions/retrait-bien.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `retirerBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | retirer_bien | - |
| `retablirBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | retablir_bien | - |

#### `actions/session-artisan.ts` (2)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `entrerDansSessionArtisan` | non détecté | ouvrir_session_artisan | - |
| `quitterSessionArtisan` | non détecté | fermer_session_artisan | - |

#### `actions/signature-locataire.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `retournerDocumentSigne` | session seulement (auth.getUser) ; rôle à lire | retourner_document_signe | - |

#### `actions/signature.ts` (5)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerSignature` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | definir_signature_organisation, has_org_role | - |
| `retirerSignature` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | definir_signature_organisation, has_org_role | - |
| `envoyerPourSignature` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | annuler_demande_signature, envoyer_pour_signature, rattacher_signature_youtrust | documents, persons |
| `annulerDemandeSignature` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | annuler_demande_signature | - |
| `partagerDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | partager_document_locataire | - |

#### `actions/supervision-artisans.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `traiterInscriptionArtisan` | super_admin | is_super_admin, traiter_inscription_artisan_atomique | artisans |

#### `actions/supprimer-bail-brouillon.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `supprimerBailBrouillon` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | supprimer_bail_brouillon | - |

#### `actions/veille.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `deciderVeille` | super_admin permanent (aal2) | decider_veille, is_permanent_super_admin | - |

#### `actions/verification-marque.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `verifierConnexionMarque` | super_admin permanent (aal2) ; client de service | is_permanent_super_admin | organizations(É) |

#### `admin/brief/actions.ts` (4)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `analyserBriefIA` | super_admin | is_super_admin | alerts, demandes_devis, organizations, publications, retours_utilisateurs |
| `preparerPointDuMatin` | super_admin permanent (aal2) | is_permanent_super_admin | - |
| `marquerPointLu` | super_admin permanent (aal2) | is_permanent_super_admin, marquer_point_lu | - |
| `deciderDecisionDuMatin` | super_admin ; super_admin permanent (aal2) | decider_point_du_matin, decider_publication_marketing, decider_veille, is_permanent_super_admin, traiter_retour | decisions_du_matin, development_proposals, publications, regulatory_watch, retours_utilisateurs |

#### `admin/marketing/actions.ts` (3)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerReglagesMarketing` | super_admin permanent (aal2) | is_permanent_super_admin | marketing_reglages(É) |
| `programmerCampagne` | super_admin permanent (aal2) | is_permanent_super_admin | marketing_campagnes(É) |
| `deciderPostProgramme` | super_admin permanent (aal2) | decider_publication_marketing, is_permanent_super_admin | - |

#### `admin/publications/nouvelle/actions.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerArticleIA` | super_admin | is_super_admin | publications(É) |

#### `agence/[orgId]/artisans/actions.ts` (5)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `creerOuRattacherArtisan` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | artisan_creer_ou_rattacher | - |
| `definirMetiersEtZones` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | artisan_definir_metiers_zones | - |
| `definirStatutLocalArtisan` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | artisan_statut_local | - |
| `blacklisterArtisanLocal` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | artisan_blacklist_locale | - |
| `leverBlacklistArtisanLocal` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | artisan_lever_blacklist_locale | - |

#### `agence/[orgId]/baux/[bailId]/verifier-dossier.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `verifierDossierBail` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée | - | baux |

#### `artisan/clients/actions.ts` (1)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `enregistrerActivitePrivee` | artisan | artisan_classer_piece, artisan_externe_ecrire, artisan_reglement_ecrire | - |

#### `artisan/devis/actions-preparation.ts` (4)

| Fonction | Rôle exigé (lu) | RPC appelées | Tables (É = écriture) |
|---|---|---|---|
| `preparerPropositionDevis` | artisan ; artisan (préparation de devis) | reperes_devis_realises | artisan_devis_preparations(É) |
| `enregistrerBrouillonDevis` | artisan ; artisan (préparation de devis) | - | artisan_devis_preparations(É) |
| `enregistrerProfilDocuments` | artisan ; client de service | - | artisan_profils_documents(É) |
| `envoyerDevisValide` | artisan ; artisan (préparation de devis) | envoyer_mon_devis_prepare | artisan_devis_preparations(É) |

Les fonctions marquées « non détecté » sont soit publiques par nature (`seDeconnecter`, `demanderReinitialisation`, `inscrireProprietaire`, `creerCompteArtisan`, `demanderDevis`), soit des **lectures déléguées à une RPC** dont la garde est en base (`chargerFicheLot` et voisines : `fiche_lot`, `documents_du_lot`…). Leur garde réelle est donc celle de la RPC : voir [[Matrice fonctions rôles droits]].

## 3. Base de données

Produit par `scripts/03_base.py` → `donnees/base.json` : (a) texte des 308 migrations (`20260727_socle_identite_isolation.sql` … `20261013120000_correctifs_audit_13_octobre.sql`), (b) catalogue de `gerimmo_ci_integ` (PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu) reconstruite par `e2e/local/preparer-ci.mjs`. **L'état final fait foi dans le catalogue** (les migrations s'empilent : `create or replace`, `drop`).

> [!warning] Limite de la lecture
> Catalogue lu sur gerimmo_ci_integ (Postgres 16 nu + amorçage local) : les droits par défaut de anon/authenticated/service_role viennent de e2e/local/bootstrap-supabase-local.sql, pas d'un projet Supabase hébergé.

> [!warning] Limite de la lecture
> pg_cron n'est pas installé dans cette base : cron.job est une table de substitution remplie par les migrations ; le planning réel (Vercel crons + pg_cron en production) n'est pas observable ici.

> [!warning] Limite de la lecture
> Les schémas auth et storage sont des substituts minimaux : leurs politiques/fonctions ne prouvent rien sur Supabase hébergé.

### 3.1 Volumes (migrations, par motif ; catalogue final)

| Objet | Dans les migrations (occurrences de motif) | Catalogue final |
|---|---|---|
| Tables | 151 | 145 tables + 4 vues |
| `enable row level security` | 116 | RLS active sur 145/145 tables (aucune `force`) |
| Politiques (create / drop) | 273 / 78 | 299 |
| Fonctions (create) | 902 | 554 dans `public` |
| SECURITY DEFINER | 796 | 479 ; sans `search_path` fixé : 0 |
| `grant execute` / `revoke` | 246 / 726 | EXECUTE anon : 0 ; authenticated : 354 ; service_role : 511 |
| Déclencheurs | 159 | 376 (public 372, auth 3, storage 1) |
| Types énumérés | 44 | 44 |
| `cron.schedule` | 8 | 8 lignes dans `cron.job` |
| Buckets de stockage | 4 | 4 |

Tables créées par une migration mais absentes du catalogue final (6, supprimées ou renommées ensuite) : `artisan_candidatures`, `controles_solvabilite`, `demandes_pieces`, `invitations`, `signature_circuits`, `signature_signataires`. Tables du catalogue sans `create table` repérable : 0.

### 3.2 Tables : RLS, politiques, droits de table par rôle Postgres

`S/I/U/D` = privilège de table SELECT/INSERT/UPDATE/DELETE (effectif, `has_table_privilege`). Les privilèges de table sont une première barrière ; **la RLS (colonne politiques) tranche ensuite**. Détail des politiques dans `donnees/base.json › catalogue.politiques`.

| Table | Type | RLS | Politiques | Par commande | Prédicats (organisation / super_admin) | anon | authenticated | service_role |
|---|---|---|---|---|---|---|---|---|
| `abonnement_evenements` | table | oui | 0 | - | - | - | - | SIUD |
| `abonnements` | table | oui | 0 | - | - | - | - | SIUD |
| `acceptations_cgu` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `acces_pieces_log` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `accounts` | table | oui | 2 | SELECT:1, UPDATE:1 | org:0 / super_admin:2 | - | S | SIUD |
| `agent_missions` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `agent_passages` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `alerts` | table | oui | 7 | ALL:1, DELETE:1, INSERT:1, SELECT:2, UPDATE:2 | org:3 / super_admin:3 | - | SIUD | SIUD |
| `annonces` | table | oui | 6 | DELETE:2, INSERT:2, SELECT:2 | org:3 / super_admin:0 | - | SIUD | SIUD |
| `appel_charges_postes` | table | oui | 2 | ALL:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `appels_charges` | table | oui | 2 | ALL:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `appels_loyer` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `artisan_agences` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `artisan_chantiers` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_clients` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_devis_externes` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_devis_preparations` | table | oui | 0 | - | - | - | - | SIUD |
| `artisan_evaluations` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `artisan_evenements_prives` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_factures_externes` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_metiers` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_modules_locaux` | table | oui | 0 | - | - | - | - | SIUD |
| `artisan_pieces` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `artisan_pieces_privees` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_profils_documents` | table | oui | 0 | - | - | - | - | SIUD |
| `artisan_reglements` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_rendez_vous` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisan_validations` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `artisan_zones` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `artisans` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `audit_log` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `automation_events` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `automation_stats_30d` | vue | non | 0 | - | - | - | SIUD | SIUD |
| `avantages_parrainage` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `bail_personnes` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:2 | org:3 / super_admin:1 | - | SIUD | SIUD |
| `baux` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `bien_infos_pratiques` | table | oui | 4 | ALL:1, INSERT:1, SELECT:1, UPDATE:1 | org:3 / super_admin:0 | - | SIUD | SIUD |
| `biens` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `brief_direction_snapshots` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `cle_repartition_lignes` | table | oui | 2 | INSERT:1, SELECT:1 | org:2 / super_admin:1 | - | SI | SIUD |
| `cles_repartition` | table | oui | 4 | ALL:1, INSERT:1, SELECT:1, UPDATE:1 | org:3 / super_admin:1 | - | SI | SIUD |
| `clotures_comptables` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `commandes_encaissement_reste` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `commandes_incidents_locataire` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `conges` | table | oui | 2 | SELECT:2 | org:1 / super_admin:1 | - | S | SIUD |
| `continuity_plan` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `continuity_rules` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SIUD | SIUD |
| `decisions_du_matin` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `declencheur_marketing` | table | oui | 0 | - | - | - | - | SIUD |
| `demandes_devis` | table | oui | 3 | INSERT:1, SELECT:1, UPDATE:1 | org:0 / super_admin:2 | S | SUD | SIUD |
| `demandes_lien_mot_de_passe` | table | oui | 0 | - | - | - | - | SIUD |
| `demandes_signature` | table | oui | 2 | ALL:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `depot_encaissements` | table | oui | 3 | DELETE:1, SELECT:2 | org:2 / super_admin:0 | - | SIUD | SIUD |
| `depots_photos_incident` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `detentions` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `development_proposals` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SIU | SIUD |
| `devis_avenants` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `diagnostics` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `document_liens` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:2 | org:3 / super_admin:1 | - | SID | SIUD |
| `documents` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:2 / super_admin:1 | - | SI | SIUD |
| `dossier_contacts` | table | oui | 2 | ALL:1, SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `ecritures` | table | oui | 3 | INSERT:1, SELECT:2 | org:2 / super_admin:0 | - | SUD | SIUD |
| `edl_cles` | table | oui | 5 | ALL:1, DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:4 / super_admin:0 | - | SIUD | SIUD |
| `edl_compteurs` | table | oui | 5 | ALL:1, DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:4 / super_admin:0 | - | SIUD | SIUD |
| `edl_lignes` | table | oui | 5 | DELETE:1, INSERT:1, SELECT:2, UPDATE:1 | org:4 / super_admin:1 | - | SIUD | SIUD |
| `encaissements` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:2 | org:3 / super_admin:0 | - | SID | SIUD |
| `equipements_catalogue` | table | oui | 3 | INSERT:1, SELECT:1, UPDATE:1 | org:3 / super_admin:1 | - | SIUD | SIUD |
| `etats_des_lieux` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `factures_honoraires` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `fiscal_encaissements_composantes` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `fiscal_exercices_lots` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `fiscal_qualifications_ecritures` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `incident_consultations` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `incident_devis` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `incident_evenements` | table | oui | 2 | SELECT:2 | org:1 / super_admin:1 | - | S | SIUD |
| `incident_interventions` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `incident_sollicitations` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `incidents` | table | oui | 2 | SELECT:2 | org:1 / super_admin:1 | - | S | SIUD |
| `intentions_conge` | table | oui | 2 | ALL:1, SELECT:1 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `intervention_comptes_rendus` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `intervention_creneaux` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `intervention_factures` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `intervention_photos` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `intervention_rappels` | table | oui | 2 | ALL:1, SELECT:1 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `inventaire_lignes` | table | oui | 5 | DELETE:1, INSERT:1, SELECT:2, UPDATE:1 | org:4 / super_admin:0 | - | SIUD | SIUD |
| `invitations_locataires` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `lot_chambres` | table | oui | 2 | ALL:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `lot_equipements` | table | oui | 3 | DELETE:1, INSERT:1, SELECT:1 | org:3 / super_admin:1 | - | SIUD | SIUD |
| `lot_pieces` | table | oui | 5 | ALL:1, DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:4 / super_admin:0 | - | SIUD | SIUD |
| `lots` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `mandat_lignes` | table | oui | 5 | DELETE:1, INSERT:1, SELECT:2, UPDATE:1 | org:4 / super_admin:1 | - | SIUD | SIUD |
| `mandats` | table | oui | 4 | INSERT:1, SELECT:2, UPDATE:1 | org:3 / super_admin:1 | - | SIU | SIUD |
| `marketing_campagnes` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SIUD | SIUD |
| `marketing_mesures` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SIUD | SIUD |
| `marketing_reglages` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SU | SIUD |
| `memberships` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:3 / super_admin:4 | - | SD | SIUD |
| `messages` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | SIUD | SIUD |
| `mouvements_mandants` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `orchestration_cases` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `orchestration_history` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `organizations` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:1 / super_admin:3 | - | SIUD | SIUD |
| `parrainages` | table | oui | 1 | SELECT:1 | org:1 / super_admin:1 | - | S | SIUD |
| `persons` | table | oui | 8 | DELETE:2, INSERT:1, SELECT:3, UPDATE:2 | org:3 / super_admin:4 | - | SIUD | SIUD |
| `pieces_demandees` | table | oui | 5 | ALL:1, DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:4 / super_admin:0 | - | SIUD | SIUD |
| `points_du_matin` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `publication_veines` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SIUD | SIUD |
| `publications` | table | oui | 2 | ALL:1, SELECT:1 | org:0 / super_admin:1 | S | SIUD | SIUD |
| `purge_fichiers` | table | oui | 2 | SELECT:1, UPDATE:1 | org:0 / super_admin:2 | - | SU | SIUD |
| `quittances` | table | oui | 3 | SELECT:2, UPDATE:1 | org:2 / super_admin:0 | - | SID | SIUD |
| `rapports_gestion` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `regularisations_charges` | table | oui | 2 | ALL:1, SELECT:1 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `regulatory_watch` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `regulatory_watch_diffusion` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `regulatory_watch_published` | vue | non | 0 | - | - | - | S | SIUD |
| `relances` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:2 | org:3 / super_admin:0 | - | SIUD | SIUD |
| `reprise_soldes` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | S | SIUD |
| `reprises_portefeuille` | table | oui | 1 | SELECT:1 | org:1 / super_admin:0 | - | S | SIUD |
| `reseau_artisan_communes` | table | oui | 2 | SELECT:2 | org:0 / super_admin:1 | - | S | SIUD |
| `reseau_communes` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `reseau_interets` | table | oui | 2 | SELECT:2 | org:1 / super_admin:1 | - | S | SIUD |
| `reseau_ouvertures` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `restitutions` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `retention_rules` | table | oui | 4 | DELETE:1, INSERT:1, SELECT:1, UPDATE:1 | org:0 / super_admin:3 | - | SIUD | SIUD |
| `retenues` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `retours_historique` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `retours_revues` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `retours_soutiens` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `retours_utilisateurs` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | - | S | SIUD |
| `revisions_loyer` | table | oui | 2 | SELECT:2 | org:1 / super_admin:0 | - | SIUD | SIUD |
| `security_function_audit` | vue | non | 0 | - | - | - | S | SIUD |
| `signature_evenements` | table | oui | 0 | - | - | - | - | SIUD |
| `site_pages` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | S | SIUD | SIUD |
| `supervision_alertes_internes` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_arrets` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_consignes` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_consignes_accords` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_consignes_taches` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_consignes_versions` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_delegations` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SIU | SIUD |
| `supervision_operations` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `supervision_presence` | table | oui | 1 | ALL:1 | org:0 / super_admin:1 | - | SD | SIUD |
| `supervision_sessions_artisan` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `supervision_vacances` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | S |
| `tarif_formules` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | S | S | SIUD |
| `tarif_tranches` | table | oui | 1 | SELECT:1 | org:0 / super_admin:0 | S | S | SIUD |
| `tech_log` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `territory_market_data` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `territory_studies` | table | oui | 1 | SELECT:1 | org:0 / super_admin:1 | - | S | SIUD |
| `territory_studies_latest` | vue | non | 0 | - | - | - | SIUD | SIUD |

- Tables avec RLS **sans aucune politique** (refus total pour `authenticated`/`anon`, accès par fonctions `SECURITY DEFINER` ou clé de service) : `abonnement_evenements`, `abonnements`, `artisan_devis_preparations`, `artisan_modules_locaux`, `artisan_profils_documents`, `declencheur_marketing`, `demandes_lien_mot_de_passe`, `signature_evenements`.
- Tables lisibles par `anon` (privilège + politique) : `demandes_devis` (S), `publications` (S), `site_pages` (S), `tarif_formules` (S), `tarif_tranches` (S). Politiques `anon` : `demandes_devis.demandes_devis_insert_public` (INSERT); `publications.publications_lecture_publique` (SELECT); `tarif_formules.tarif_formules_lecture` (SELECT).
- Vues : `automation_stats_30d` {security_invoker=true}, `regulatory_watch_published` {security_invoker=true,security_barrier=true}, `security_function_audit` {security_invoker=true}, `territory_studies_latest` {security_invoker=true} (toutes `security_invoker`).
- À l'inverse, 12 tables portent des politiques pour `authenticated`/`public` **sans le privilège de table correspondant** (politique sans effet par REST ; l'écriture passe alors par des fonctions `SECURITY DEFINER` ou la clé de service) : `accounts` (accounts_update:UPDATE); `cles_repartition` (cles_repartition_agent_portefeuille:UPDATE, cles_repartition_agent_portefeuille:DELETE, cles_update_invalidation:UPDATE); `demandes_devis` (demandes_devis_insert_public:INSERT); `development_proposals` (development_proposals_supervision:DELETE); `documents` (documents_agent_portefeuille_maj:UPDATE); `dossier_contacts` (dossier_contacts_agent_portefeuille:INSERT, dossier_contacts_agent_portefeuille:UPDATE, dossier_contacts_agent_portefeuille:DELETE); `ecritures` (ecritures_insert:INSERT); `marketing_reglages` (marketing_reglages_super_admin:INSERT, marketing_reglages_super_admin:DELETE); `memberships` (memberships_insert:INSERT, memberships_update:UPDATE); `quittances` (quittances_update:UPDATE); `supervision_delegations` (supervision_delegations_permanents:DELETE); `supervision_presence` (supervision_presence_soi:INSERT, supervision_presence_soi:UPDATE). Cas notable : `memberships` n'accorde à `authenticated` que `SELECT` et `DELETE` — les politiques INSERT/UPDATE n'ont aucun effet, seules les fonctions d'attribution créent des adhésions.
- Privilèges de table accordés à `authenticated` **sans politique correspondante** (refusés par la RLS, donc sans effet, mais plus larges que nécessaire) : 17 tables — `annonces` (UPDATE), `appels_loyer` (INSERT/UPDATE/DELETE), `bail_personnes` (UPDATE), `clotures_comptables` (INSERT/UPDATE/DELETE), `demandes_devis` (DELETE), `depot_encaissements` (INSERT/UPDATE), `ecritures` (UPDATE/DELETE), `equipements_catalogue` (DELETE), `lot_equipements` (UPDATE), `messages` (INSERT/UPDATE/DELETE), `quittances` (INSERT/DELETE), `rapports_gestion` (INSERT/UPDATE/DELETE), `relances` (UPDATE), `restitutions` (INSERT/UPDATE/DELETE), `retenues` (INSERT/UPDATE/DELETE), `revisions_loyer` (INSERT/UPDATE/DELETE), `site_pages` (INSERT/UPDATE/DELETE). Observation, voir CAR-07.

### 3.3 Politiques RLS par famille de rôle

| Famille de prédicat (lecture du texte) | Politiques |
|---|---|
| membre d'organisation (par rôles) | 102 |
| autre | 62 |
| super_admin + membre d'organisation (par rôles) | 32 |
| super_admin | 26 |
| super_admin permanent | 18 |
| artisan | 12 |
| compte (propre ligne) | 6 |
| sans prédicat (true / aucun) | 6 |
| super_admin + compte (propre ligne) | 4 |
| super_admin + artisan + compte (propre ligne) | 2 |
| membre d'organisation (par rôles) + locataire + compte (propre ligne) | 2 |
| super_admin + membre d'organisation (par rôles) + artisan | 2 |
| membre d'organisation (par rôles) + compte (propre ligne) | 2 |
| super_admin + membre d'organisation (par rôles) + compte (propre ligne) | 1 |
| super_admin permanent + compte (propre ligne) | 1 |

Rôles Postgres visés par les politiques : `{authenticated}` 238, `{public}` 58, `{anon,authenticated}` 3.

### 3.4 Fonctions SQL

554 fonctions dans `public` : 479 `SECURITY DEFINER` (toutes avec `search_path` fixé), 75 `SECURITY INVOKER`, 94 fonctions de déclencheur, 354 exécutables par `authenticated`, 157 réservées à `service_role`, 43 sans aucun EXECUTE (appelées seulement par d'autres fonctions), **0 exécutable par `anon`**. Liste complète avec droits EXECUTE et garde lue : [[Matrice fonctions rôles droits]] (section B) et `donnees/matrice.json`.

| Classe de garde lue dans le corps | Fonctions |
|---|---|
| membre d'organisation | 170 |
| interne (service_role seulement) | 99 |
| déclencheur | 94 |
| SECURITY INVOKER (garde par RLS) | 36 |
| super_admin permanent aal2 | 32 |
| compte connecté (périmètre propre) | 31 |
| artisan | 28 |
| super_admin | 26 |
| super_admin + membre d'organisation | 22 |
| interne (aucun EXECUTE) | 7 |
| super_admin permanent aal2 + membre d'organisation | 4 |
| aucune garde détectée | 3 |
| super_admin + artisan + membre d'organisation | 2 |

### 3.5 Déclencheurs, types énumérés

376 déclencheurs sur 142 tables. Les plus chargées : `public.baux` 14, `public.biens` 13, `public.encaissements` 10, `public.lots` 9, `public.mandats` 9, `public.documents` 8, `public.organizations` 8, `public.ecritures` 7, `public.etats_des_lieux` 7, `public.depot_encaissements` 6. Liste complète : `donnees/base.json › catalogue.triggers`.

| Type énuméré | Valeurs |
|---|---|
| `alerte_criticite` | informative, normale, critique |
| `alerte_statut` | ouverte, fermee |
| `artisan_decision_plateforme` | validation, refus, remise_en_attente, blacklist_globale, levee_blacklist, suspension |
| `artisan_metier` | plomberie, chauffage, electricite, menuiserie, serrurerie, nuisibles, autre |
| `artisan_piece_type` | decennale, rc_pro, urssaf, kbis, certification |
| `artisan_relation_statut` | actif, desactive |
| `artisan_siret_etat` | verifie, non_verifie, invalide |
| `artisan_statut_plateforme` | en_attente, valide, refuse |
| `artisan_visibilite` | privee, publique |
| `bail_etat` | brouillon, actif, preavis, termine |
| `bail_type` | nu, meuble, colocation |
| `bien_type` | appartement, maison, immeuble, local, parking, terrain, autre |
| `cle_mode` | surface, tantiemes, parts_egales |
| `conge_par` | locataire, bailleur |
| `consultation_statut` | ouverte, close, annulee |
| `creneau_auteur` | artisan, locataire, agence |
| `creneau_statut` | propose, retenu, refuse, caduc |
| `devis_statut` | depose, retenu, non_retenu, expire, annule |
| `diagnostic_type` | dpe, electricite, gaz, plomb, amiante_privatif, amiante_communes, erp, termites |
| `document_type` | piece_identite, justificatif, attestation_assurance, quittance, bail, etat_des_lieux, mandat, diagnostic, courrier, photo_incident, rapport_gestion, autre, document_test, reglement_copropriete, devis, facture_artisan |
| `edl_etat` | brouillon, signe |
| `edl_type` | entree, sortie |
| `entite_liee` | organisation, personne, lot, bail, mandat, incident |
| `etat_element` | neuf, bon, usage, mauvais, absent |
| `evaluation_source` | gerant, locataire |
| `incident_canal` | espace_locataire, agence |
| `incident_cloture` | resolu, sans_suite, transmis_syndic |
| `incident_etat` | declare, qualifie, affecte, en_cours, termine, clos, rouvert |
| `incident_imputation` | locataire, proprietaire, degradation_fautive |
| `incident_urgence` | normale, urgente |
| `intervention_photo_moment` | avant, pendant, apres |
| `intervention_statut` | proposee, acceptee, planifiee, en_cours, terminee, refusee, annulee |
| `lot_etat` | brouillon, disponible, loue, preavis, archive |
| `mandat_etat` | brouillon, a_signer, actif, preavis, resilie |
| `membership_role` | super_admin, admin_agence, agent, proprietaire_direct, proprietaire_mandant, locataire, artisan, garant |
| `membership_status` | active, inactive |
| `message_auteur` | locataire, gerant |
| `nature_travaux` | entretien_courant, remplacement_equipement, clos_et_couvert, reseaux_encastres, gros_oeuvre |
| `organization_status` | essai, active, suspendue, archivee |
| `organization_type` | agence, proprietaire_direct |
| `rappel_destinataire` | locataire, artisan |
| `rappel_echeance` | j7, veille |
| `retention_sort` | suppression, anonymisation, conservation |
| `sollicitation_statut` | envoyee, declinee, devis_depose, retenue, non_retenue, expiree, annulee |

### 3.6 Tâches planifiées `pg_cron` (en base)

`cron.job` contient 8 lignes **dans la base de schéma, où `pg_cron` n'est pas installé** (table de substitution remplie par les migrations) : elles prouvent ce que les migrations programment, pas ce qui s'exécute. Migrations contenant `cron.schedule` : 8.

| # | Nom | Planification | Commande |
|---|---|---|---|
| 1 | retention-quotidienne | `0 3 * * *` | `select public.appliquer_retention()` |
| 2 | alertes-diagnostics-quotidiennes | `30 3 * * *` | `select public.generer_alertes_diagnostics()` |
| 3 | alertes-assurance-quotidiennes | `45 3 * * *` | `select public.generer_alertes_assurance()` |
| 4 | alertes-restitutions-quotidiennes | `15 4 * * *` | `select public.generer_alertes_restitution()` |
| 5 | propositions-publication-hebdo | `0 6 * * 1` | `select public.proposer_publications_interne()` |
| 6 | cycle-mensuel | `0 5 1 * *` | `select public.cycle_mensuel_interne()` |
| 7 | alertes-impayes-quotidiennes | `30 5 * * *` | `select public.generer_alertes_impayes()` |
| 8 | marketing-declencheur | `*/5 5-19 * * *` | `select public.declencher_marketing()` |

### 3.7 Rôles Postgres

| Rôle | Superuser | BYPASSRLS |
|---|---|---|
| anon | false | false |
| authenticated | false | false |
| postgres | true | true |
| service_role | false | true |

`service_role` contourne la RLS (clé de service côté serveur uniquement) ; `anon` et `authenticated` y sont soumis.

## 4. Stockage

Produit par `03_base.py` (buckets et politiques de `storage.objects`) et `04_transverse.py` (usages dans le code).

| Bucket | Public | Limite (octets) | Types MIME | Fichiers du code qui l'utilisent |
|---|---|---|---|---|
| `artisan-prive` | false | 10485760 | {application/pdf,image/jpeg,image/png} | `app/api/artisan-prive/pieces/[pieceId]/route.ts`, `app/artisan/clients/actions.ts` |
| `devis-preparations` | false | 10485760 | {application/pdf} | `app/api/devis/[sollicitationId]/pdf/route.ts` |
| `documents` | false | 10485760 | {application/pdf,image/jpeg,image/png} | `app/actions/artisan.ts`, `app/actions/attestation-locataire.ts`, `app/actions/documents-ged.ts`, `app/actions/incidents.ts`, `app/actions/pieces-demandees.ts`, `app/actions/retention.ts` |
| `marketing-visuels` | true | 10000000 | {image/jpeg} | `app/api/cron/marketing/route.ts` |

21 politiques sur `storage.objects` :

| Politique | Commande | Rôles | Prédicat (USING) |
|---|---|---|---|
| artisan_prive_depot | INSERT | {authenticated} | (WITH CHECK seulement) |
| artisan_prive_lecture | SELECT | {authenticated} | ((bucket_id = 'artisan-prive'::text) AND (split_part(name, '/'::text, 1) = (( SELECT artisan_identite_reelle() AS artisan_identite_reelle))::text)) |
| artisan_prive_orphelin | DELETE | {authenticated} | ((bucket_id = 'artisan-prive'::text) AND (split_part(name, '/'::text, 1) = (( SELECT artisan_identite_reelle() AS artisan_identite_reelle))::text) AND (NOT (EX… |
| depot_photo_incident_lecture_retrait | SELECT | {authenticated} | ((bucket_id = 'documents'::text) AND photo_incident_supprimable(name)) |
| depot_photo_incident_retrait | DELETE | {authenticated} | ((bucket_id = 'documents'::text) AND photo_incident_supprimable(name)) |
| diagnostic_artisan_storage_delete | DELETE | {authenticated} | (NOT session_artisan_diagnostic_active()) |
| diagnostic_artisan_storage_insert | INSERT | {authenticated} | (WITH CHECK seulement) |
| diagnostic_artisan_storage_update | UPDATE | {authenticated} | (NOT session_artisan_diagnostic_active()) |
| ged_delete | DELETE | {authenticated} | ((bucket_id = 'documents'::text) AND ( SELECT is_super_admin() AS is_super_admin)) |
| ged_insert | INSERT | {authenticated} | (WITH CHECK seulement) |
| ged_insert_artisan | INSERT | {authenticated} | (WITH CHECK seulement) |
| ged_insert_locataire | INSERT | {authenticated} | (WITH CHECK seulement) |
| ged_select | SELECT | {authenticated} | ((bucket_id = 'documents'::text) AND (( SELECT is_super_admin() AS is_super_admin) OR ((EXISTS ( SELECT 1 FROM documents d WHERE ((d.storage_path = objects.nam… |
| ged_select_artisan | SELECT | {authenticated} | ((bucket_id = 'documents'::text) AND ((name IN ( SELECT chemins_fichiers_artisan() AS chemins_fichiers_artisan)) OR ((mon_artisan_id() IS NOT NULL) AND (name ~… |
| ged_select_artisan_sa | SELECT | {authenticated} | ((bucket_id = 'documents'::text) AND (name ~~ 'artisans/%'::text) AND ( SELECT is_super_admin() AS is_super_admin)) |
| ged_select_locataire | SELECT | {authenticated} | ((bucket_id = 'documents'::text) AND (name IN ( SELECT chemins_pieces_locataire() AS chemins_pieces_locataire))) |
| ged_select_signature | SELECT | {authenticated} | ((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1 FROM organizations o WHERE ((o.signature_path = objects.name) AND (o.id IN ( SELECT org_ids_avec_roles(… |
| signature_depot_metier | INSERT | {authenticated} | (WITH CHECK seulement) |
| signature_lecture_metier | SELECT | {authenticated} | ((bucket_id <> 'documents'::text) OR fichier_signature_autorise(name, false)) |
| signature_modification_metier | UPDATE | {authenticated} | ((bucket_id <> 'documents'::text) OR fichier_signature_autorise(name, true)) |
| signature_retrait_metier | DELETE | {authenticated} | ((bucket_id <> 'documents'::text) OR fichier_signature_autorise(name, true)) |

Le bucket `marketing-visuels` est le **seul public** (images JPEG de communication). Les trois autres sont privés ; le téléchargement par un intrus est testé par l'auditeur (13 objets, 0 accès, voir matrice d'accès).

## 5. Authentification et sessions

Produit par `04_transverse.py`. Appels Supabase Auth repérés dans `app/src` (fichiers) :

| Appel | Fichiers |
|---|---|
| `signInWithPassword` | `app/actions/auth.ts`, `app/actions/compte.ts`, `app/connexion/formulaire-connexion.tsx` |
| `signUp` | - |
| `resetPasswordForEmail` | `lib/lien-mot-de-passe.ts` |
| `updateUser` | `app/actions/auth.ts`, `app/actions/compte.ts` |
| `mfa.enroll` | `app/compte/second-facteur.tsx`, `app/securite/formulaire-mfa.tsx` |
| `mfa.challenge` | `app/compte/second-facteur.tsx`, `app/securite/formulaire-mfa.tsx` |
| `mfa.verify` | - |
| `mfa.unenroll` | `app/compte/second-facteur.tsx`, `app/securite/formulaire-mfa.tsx` |
| `getAuthenticatorAssuranceLevel` | `app/compte/second-facteur.tsx`, `app/relais/page.tsx`, `app/securite/formulaire-mfa.tsx`, `proxy.ts` |
| `admin.generateLink` | `app/actions/auth.ts`, `lib/lien-mot-de-passe.ts`, `lib/supabase/service.ts` |
| `admin.createUser` | - |
| `admin.deleteUser` | - |
| `signOut` | `app/actions/auth.ts`, `app/actions/compte.ts`, `proxy.ts` |
| `verifyOtp` | `app/auth/confirm/route.ts` |

- **Connexion** : e-mail + mot de passe (`signInWithPassword`) ; liens d'inscription et de mot de passe fabriqués par `auth.admin.generateLink` puis envoyés par Resend (`src/lib/lien-mot-de-passe.ts`) — sans clé Resend, ni inscription ni réinitialisation sur le banc, sauf confirmation automatique de l'émulateur.
- **Second facteur** : TOTP (`mfa.enroll/challenge/verify`), `src/lib/mfa.ts` : `doitVerifierSecondFacteur(roles, niveau)` = `roles.includes('super_admin') && niveau !== 'aal2'`. Appliqué par `proxy.ts` (sas `/securite`) **et** par les fonctions SQL (`is_super_admin()` et `is_permanent_super_admin()` exigent `jwt.aal = aal2`). Aucun autre rôle n'est soumis au second facteur.
- **Sessions par rôle** (`src/lib/session-policy.ts`, la limite la plus stricte des adhésions actives s'applique) :

| Rôle | Inactivité | Durée absolue |
|---|---|---|
| super_admin | 30 * MINUTE | 8 * HOUR |
| admin_agence | 2 * HOUR | 12 * HOUR |
| agent | 4 * HOUR | 12 * HOUR |
| proprietaire_direct | 4 * HOUR | 12 * HOUR |
| proprietaire_mandant | 7 * DAY | 30 * DAY |
| locataire | 7 * DAY | 30 * DAY |
| artisan | 7 * DAY | 30 * DAY |
| garant | 7 * DAY | 30 * DAY |

- **Cookie d'activité** `gerimmo-derniere-activite` signé HMAC (`GERIMMO_SESSION_SECRET`, repli sur la clé de service, sinon non signé).
- **Aiguillage après connexion** (`app/src/app/espaces/page.tsx`) : super-administrateur → `/admin/brief` ; une seule adhésion gérante → `/espace/[orgId]` pour un propriétaire direct, `/agence/[orgId]` pour une agence ou un agent (D27-B, PR #191, depuis le 16/10 ; relevé du 14/10 : `/agence/[orgId]` pour tous) ; locataire → `/locataire/[orgId]` ; artisan → `/artisan` ; compte neuf `espace=proprietaire_direct` → `initialiser_espace_proprietaire()` puis son espace.

## 6. Intégrations

Produit par `04_transverse.py`. « Statut sur le banc » = présence de la variable (booléen, **aucune valeur lue ni écrite**) dans le processus du serveur du banc (`/proc/<pid>/environ`) et dans `app/.env.local`.

| Intégration | Fichiers qui l'appellent | Variables | Posées sur le serveur du banc | Statut annoncé / constat |
|---|---|---|---|---|
| Supabase (base, auth, stockage) | `scripts/sauvegarde/fichiers.mjs`, `app/actions/artisan.ts`, `app/actions/compte.ts`, `app/actions/incidents.ts`, `app/admin/brief/lecture.ts` (+64) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY | émulateur maison http://127.0.0.1:54321 + Postgres 16 local |
| Stripe (abonnements, portail, webhook) | `app/api/stripe/webhook/route.ts`, `lib/stripe-offres.ts`, `lib/stripe.ts` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRIX_BIEN`, `STRIPE_PRIX_LOT_AGENCE` | aucune variable posée | sans clé sur le banc : aucun paiement possible |
| Resend (e-mails transactionnels) | `lib/email.ts`, `lib/sante-service.ts`, `lib/verification-marque.ts` | `RESEND_API_KEY`, `RESEND_EXPEDITEUR`, `RESEND_DOMAIN_READ_KEY` | aucune variable posée | sans clé sur le banc : aucun e-mail ne part |
| YouTrust / signature électronique | `app/actions/signature.ts`, `app/agence/[orgId]/documents/circuit-document.tsx`, `app/api/cron/signatures/route.ts`, `app/api/youtrust/webhook/route.ts`, `lib/editeur.ts` (+4) | `YOUTRUST_WEBHOOK_SECRET` | aucune variable posée | sans clé sur le banc : aucune signature |
| OpenAI (brief, veille, devis, publications, visuels) | `app/admin/brief/actions.ts`, `app/admin/brief/page.tsx`, `app/admin/publications/nouvelle/actions.ts`, `lib/analyse-veille.ts`, `lib/proposition-devis-ia.ts` (+3) | `OPENAI_API_KEY`, `OPEN_AI_KEY`, `OPENAI_BRIEF_MODEL`, `OPENAI_DEVIS_MODEL`, `OPENAI_VEILLE_MODEL`, `OPENAI_PUBLICATION_MODEL`, `OPENAI_MARKETING_IMAGE_MODEL` | aucune variable posée | sans clé sur le banc : aucun appel |
| Meta (Facebook page, Ads) | `lib/facebook.ts`, `lib/marketing-meta.ts` | `META_FACEBOOK_PAGE_ID`, `META_FACEBOOK_PAGE_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN`, `META_GRAPH_API_VERSION` | aucune variable posée | sans jeton sur le banc : aucune publication |
| Vercel (crons, déploiement) | `scripts/deploiement/publier.mjs`, `app/actions/equipes.ts`, `app/admin/equipes/page.tsx`, `app/admin/territoire/page.tsx`, `app/api/cron/orchestrateur/route.ts` (+7) | `CRON_SECRET`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET` | aucune variable posée | crons non exécutés par Vercel sur le banc ; déclenchement manuel possible avec CRON_SECRET |
| GitHub (agent, publication contrôlée) | `scripts/atelier/proposer.mjs`, `scripts/deploiement/publier.mjs`, `app/actions/equipes.ts`, `app/admin/equipes/page.tsx`, `lib/suivi-corrections.ts` | `GITHUB_AGENT_TOKEN` | aucune variable posée | hors application (scripts / CI) |
| Sauvegarde / restauration | `scripts/sauvegarde/base.mjs`, `scripts/sauvegarde/fichiers.mjs`, `scripts/sauvegarde/restaurer-archive.mjs` | `GERIMMO_BACKUP_KEY`, `GERIMMO_BACKUP_SOURCE_URL`, `GERIMMO_BACKUP_SERVICE_KEY`, `GERIMMO_BACKUP_DB_URL`, `GERIMMO_RESTORE_URL` | aucune variable posée | scripts/sauvegarde (hors application) |

Constat : parmi les variables d'intégration ci-dessus, le processus du serveur du banc (`processus 28188`) ne porte que les trois variables Supabase ; **aucune clé Stripe, Resend, OpenAI, Meta, YouTrust ni `CRON_SECRET`** — aucun e-mail, paiement, signature ni publication réels ne peut partir. Les crons Vercel ne tournent pas sur le banc ; les routes `/api/cron/*` répondent 503 sans secret (voir `.env.example`). Variables posées (noms seulement, 18) : `E2E_BASE_URL`, `E2E_CI`, `E2E_USE_BUILD`, `GERIMMO_ARTISAN_CLIENTS_LOCAUX`, `GERIMMO_ARTISAN_REGLEMENTS_LOCAUX`, `GERIMMO_CATALOGUE_PDF_DIR`, `GERIMMO_CHROME`, `GERIMMO_TEST_PDF`, `GITHUB_TOKEN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `PATH`, `PLANNING_CONFLITS_CONCURRENCE`, `PLAYWRIGHT_CHROMIUM`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPALOCAL_DB`. **Hygiène du banc** : `GITHUB_TOKEN` figure dans cet environnement alors que le code de l'application ne le lit pas (lu seulement par `scripts/deploiement/publier.mjs`) — il vient du shell qui a lancé le serveur (CAR-11).

## 7. Variables d'environnement (noms seulement)

Produit par `04_transverse.py` : 112 noms (lus dans `src/`, `scripts/`, `e2e/`, `tests/`, `next.config.ts` ou nommés dans `.env.example`). Aucune valeur. « Nommée » = le nom figure dans le texte de `.env.example` (la règle de `tests/env-example.test.ts`). Lues par le code et **non nommées** dans `.env.example` : `CREATION_BIEN_PREVIEW`, `FISCAL_ABONNEMENT_PREVIEW`, `FISCAL_GARDES_PREVIEW`, `FISCAL_MIGRATION_PREVIEW`, `GERIMMO_CATALOGUE_PDF_DIR`, `GERIMMO_PREVIEW_SUPERVISION`, `GERIMMO_STRIPE_TEST_KEY`, `GERIMMO_TEST_LOGO`, `GERIMMO_TEST_PDF`, `INVITATIONS_ANNULATION_PREVIEW`, `INVITATIONS_PREVIEW`, `INVITATIONS_STATUT_PREVIEW`, `PGSSLMODE`, `PLANNING_CONFLITS_CONCURRENCE`, `PLANNING_CONFLITS_PREVIEW`, `PLANNING_MIGRATION_PREVIEW`, `SUPERVISION_MIGRATION_PREVIEW` (toutes lues seulement par `e2e/`, `tests/` ou `scripts/` : drapeaux de prévisualisation et variables d'essai ; la règle du dépôt ne les exige pas).

| Nom | Nommée dans .env.example | Origine | Exposition | Fichiers lecteurs | Exemples | Banc (serveur 3100) |
|---|---|---|---|---|---|---|
| `AWS_LAMBDA_FUNCTION_NAME` | oui | plateforme/CI | serveur | 1 | `lib/documents/rendu.ts` | non posée |
| `CREATION_BIEN_PREVIEW` | non |  | serveur | 1 | `tests/creation-bien-reprise.test.ts` | non posée |
| `CRON_SECRET` | oui |  | serveur | 17 | `app/actions/equipes.ts`, `app/admin/equipes/page.tsx` | non posée |
| `E2E_A11Y_PAGES` | oui |  | serveur | 1 | `e2e/a11y.spec.ts` | non posée |
| `E2E_AUDIT_DIR` | oui |  | serveur | 4 | `e2e/a11y.spec.ts`, `e2e/audit-ecrans.spec.ts` | non posée |
| `E2E_AUDIT_WIDTH` | oui |  | serveur | 1 | `e2e/audit-ecrans.spec.ts` | non posée |
| `E2E_BASE_URL` | oui |  | serveur | 4 | `e2e/audit-lecture-live.mjs`, `e2e/audit-production.mjs` | posée |
| `E2E_CI` | oui |  | serveur | 1 | `e2e/playwright.config.ts` | posée |
| `E2E_DEMONSTRATION` | oui |  | serveur | 1 | `e2e/demonstration.spec.ts` | non posée |
| `E2E_DEMO_DIR` | oui |  | serveur | 1 | `e2e/demonstration.spec.ts` | non posée |
| `E2E_INTERACTIONS` | oui |  | serveur | 1 | `e2e/audit-production.mjs` | non posée |
| `E2E_MAX_PAGES` | oui |  | serveur | 1 | `e2e/audit-production.mjs` | non posée |
| `E2E_MOT_DE_PASSE` | oui |  | serveur | 7 | `e2e/audit-lecture-live.mjs`, `e2e/audit-production.mjs` | non posée |
| `E2E_USE_BUILD` | oui |  | serveur | 1 | `e2e/playwright.config.ts` | posée |
| `E2E_VIEWPORT_HEIGHT` | oui |  | serveur | 1 | `e2e/audit-production.mjs` | non posée |
| `E2E_VIEWPORT_WIDTH` | oui |  | serveur | 1 | `e2e/audit-production.mjs` | non posée |
| `FISCAL_ABONNEMENT_PREVIEW` | non |  | serveur | 1 | `tests/fiscalite-persistance.test.ts` | non posée |
| `FISCAL_GARDES_PREVIEW` | non |  | serveur | 1 | `tests/fiscalite-persistance.test.ts` | non posée |
| `FISCAL_MIGRATION_PREVIEW` | non |  | serveur | 1 | `tests/fiscalite-persistance.test.ts` | non posée |
| `GERIMMO_ARTISAN_CLIENTS_LOCAUX` | oui |  | serveur | 1 | `lib/artisan-prive.ts` | posée |
| `GERIMMO_ARTISAN_REGLEMENTS_LOCAUX` | oui |  | serveur | 1 | `lib/artisan-prive.ts` | posée |
| `GERIMMO_AUTORISER_PROD` | oui |  | serveur | 1 | `tests/garde-base.ts` | non posée |
| `GERIMMO_BACKUP_DB_URL` | oui |  | serveur | 1 | `scripts/sauvegarde/base.mjs` | non posée |
| `GERIMMO_BACKUP_KEY` | oui |  | serveur | 3 | `scripts/sauvegarde/base.mjs`, `scripts/sauvegarde/fichiers.mjs` | non posée |
| `GERIMMO_BACKUP_SERVICE_KEY` | oui |  | serveur | 1 | `scripts/sauvegarde/fichiers.mjs` | non posée |
| `GERIMMO_BACKUP_SOURCE_URL` | oui |  | serveur | 1 | `scripts/sauvegarde/fichiers.mjs` | non posée |
| `GERIMMO_CATALOGUE_PDF_DIR` | non |  | serveur | 3 | `tests/catalogue-documents.test.ts`, `tests/facture-honoraires.test.ts` | posée |
| `GERIMMO_CHARGE_DB` | oui |  | serveur | 1 | `scripts/recette/charge-300-lots.mjs` | non posée |
| `GERIMMO_CHROME` | oui |  | serveur | 9 | `scripts/kit-recette/commun.mjs`, `lib/documents/rendu.ts` | posée |
| `GERIMMO_CODEX_ENABLED` | oui |  | serveur | 2 | `app/actions/equipes.ts`, `app/admin/equipes/page.tsx` | non posée |
| `GERIMMO_DEBUG_PDF_DIR` | oui |  | serveur | 1 | `lib/documents/rendu.ts` | non posée |
| `GERIMMO_PREVIEW_SUPERVISION` | non |  | serveur | 1 | `tests/consignes-vacances.test.ts` | non posée |
| `GERIMMO_PRODUCTION_ORIGIN` | oui |  | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GERIMMO_RELEASE_ENABLED` | oui |  | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GERIMMO_RESTORE_URL` | oui |  | serveur | 1 | `scripts/sauvegarde/restaurer-archive.mjs` | non posée |
| `GERIMMO_SESSION_SECRET` | oui |  | serveur | 1 | `lib/session-policy.ts` | non posée |
| `GERIMMO_STRIPE_TEST_KEY` | non |  | serveur | 1 | `tests/stripe-bac-a-sable.test.ts` | non posée |
| `GERIMMO_TEST_LOGO` | non |  | serveur | 1 | `tests/devis-document.test.ts` | non posée |
| `GERIMMO_TEST_PDF` | non |  | serveur | 1 | `tests/devis-document.test.ts` | posée |
| `GITHUB_AGENT_TOKEN` | oui | plateforme/CI | serveur | 2 | `app/actions/equipes.ts`, `app/admin/equipes/page.tsx` | non posée |
| `GITHUB_ENV` | oui | plateforme/CI | serveur | 1 | `scripts/recette-production-comptes.mjs` | non posée |
| `GITHUB_EVENT_NAME` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GITHUB_REF` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GITHUB_REPOSITORY` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GITHUB_RUN_ID` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GITHUB_STEP_SUMMARY` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `GITHUB_TOKEN` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | posée |
| `INVITATIONS_ANNULATION_PREVIEW` | non |  | serveur | 1 | `tests/invitations-cycle.test.ts` | non posée |
| `INVITATIONS_PREVIEW` | non |  | serveur | 1 | `tests/invitations-cycle.test.ts` | non posée |
| `INVITATIONS_STATUT_PREVIEW` | non |  | serveur | 1 | `tests/invitations-cycle.test.ts` | non posée |
| `META_ADS_ACCESS_TOKEN` | oui |  | serveur | 1 | `lib/marketing-meta.ts` | non posée |
| `META_AD_ACCOUNT_ID` | oui |  | serveur | 1 | `lib/marketing-meta.ts` | non posée |
| `META_FACEBOOK_PAGE_ACCESS_TOKEN` | oui |  | serveur | 2 | `lib/facebook.ts`, `lib/marketing-meta.ts` | non posée |
| `META_FACEBOOK_PAGE_ID` | oui |  | serveur | 2 | `lib/facebook.ts`, `lib/marketing-meta.ts` | non posée |
| `META_GRAPH_API_VERSION` | oui |  | serveur | 2 | `lib/facebook.ts`, `lib/marketing-meta.ts` | non posée |
| `NEXT_PUBLIC_SITE_URL` | oui |  | navigateur | 6 | `lib/sante-service.ts`, `lib/site.ts` | posée |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | oui |  | navigateur | 13 | `e2e/incidents-reprise.spec.ts`, `app/actions/compte.ts` | posée |
| `NEXT_PUBLIC_SUPABASE_URL` | oui |  | navigateur | 22 | `e2e/auth.setup.ts`, `e2e/incidents-reprise.spec.ts` | posée |
| `NODE_ENV` | oui | plateforme/CI | serveur | 4 | `next.config.ts`, `lib/documents/rendu.ts` | non posée |
| `OPENAI_API_KEY` | oui |  | serveur | 8 | `app/admin/brief/actions.ts`, `app/admin/brief/page.tsx` | non posée |
| `OPENAI_BRIEF_MODEL` | oui |  | serveur | 3 | `app/admin/brief/actions.ts`, `lib/analyse-veille.ts` | non posée |
| `OPENAI_DEVIS_MODEL` | oui |  | serveur | 1 | `lib/proposition-devis-ia.ts` | non posée |
| `OPENAI_MARKETING_IMAGE_MODEL` | oui |  | serveur | 1 | `lib/visuel-marketing.ts` | non posée |
| `OPENAI_PUBLICATION_MODEL` | oui |  | serveur | 2 | `app/admin/publications/nouvelle/actions.ts`, `lib/redaction-veille.ts` | non posée |
| `OPENAI_VEILLE_MODEL` | oui |  | serveur | 2 | `lib/analyse-veille.ts`, `lib/redaction-veille.ts` | non posée |
| `OPEN_AI_KEY` | oui |  | serveur | 8 | `app/admin/brief/actions.ts`, `app/admin/brief/page.tsx` | non posée |
| `PATH` | non | plateforme/CI | serveur | 2 | `scripts/sauvegarde/base.mjs`, `scripts/sauvegarde/restaurer-archive.mjs` | posée |
| `PGDATABASE` | oui | plateforme/CI | serveur | 2 | `e2e/recette-production/inscription-recuperation.spec.ts`, `scripts/recette-production-comptes.mjs` | non posée |
| `PGHOST` | oui | plateforme/CI | serveur | 2 | `e2e/recette-production/inscription-recuperation.spec.ts`, `scripts/recette-production-comptes.mjs` | non posée |
| `PGPASSWORD` | oui | plateforme/CI | serveur | 3 | `e2e/recette-production/inscription-recuperation.spec.ts`, `scripts/recette-production-comptes.mjs` | non posée |
| `PGSSLMODE` | non |  | serveur | 1 | `tests/sauvegarde-base.test.ts` | non posée |
| `PGUSER` | oui | plateforme/CI | serveur | 2 | `e2e/recette-production/inscription-recuperation.spec.ts`, `scripts/recette-production-comptes.mjs` | non posée |
| `PLANNING_CONFLITS_CONCURRENCE` | non |  | serveur | 1 | `tests/planning-conflits-concurrence.test.ts` | posée |
| `PLANNING_CONFLITS_PREVIEW` | non |  | serveur | 1 | `tests/planning-conflits.test.ts` | non posée |
| `PLANNING_MIGRATION_PREVIEW` | non |  | serveur | 1 | `tests/validation-creneaux.test.ts` | non posée |
| `PLAYWRIGHT_CHROMIUM` | oui |  | serveur | 2 | `e2e/playwright.config.ts`, `e2e/recette-production/playwright.config.ts` | posée |
| `RECETTE_SUFFIXE` | oui |  | serveur | 1 | `scripts/recette-production-comptes.mjs` | non posée |
| `RECETTE_URL` | oui |  | serveur | 2 | `e2e/recette-production/outils.ts`, `e2e/recette-production/playwright.config.ts` | non posée |
| `RELEASE_CI_RUN_ID` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `RELEASE_DATABASE_COMPATIBLE` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `RELEASE_DEPLOYMENT_ID` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `RELEASE_PUBLISH` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `RELEASE_SHA` | oui | plateforme/CI | serveur | 1 | `scripts/deploiement/publier.mjs` | non posée |
| `RESEND_API_KEY` | oui |  | serveur | 3 | `lib/email.ts`, `lib/sante-service.ts` | non posée |
| `RESEND_DOMAIN_READ_KEY` | oui |  | serveur | 1 | `lib/verification-marque.ts` | non posée |
| `RESEND_EXPEDITEUR` | oui |  | serveur | 2 | `lib/email.ts`, `lib/sante-service.ts` | non posée |
| `STRIPE_PRIX_BIEN` | oui |  | serveur | 1 | `lib/stripe.ts` | non posée |
| `STRIPE_PRIX_LOT_AGENCE` | oui |  | serveur | 1 | `lib/stripe.ts` | non posée |
| `STRIPE_SECRET_KEY` | oui |  | serveur | 2 | `lib/sante-service.ts`, `lib/stripe.ts` | non posée |
| `STRIPE_WEBHOOK_SECRET` | oui |  | serveur | 2 | `lib/sante-service.ts`, `lib/stripe.ts` | non posée |
| `SUPABASE_DB_URL` | oui |  | serveur | 106 | `e2e/local/preparer-ci.mjs`, `tests/abonnement-lecture-seule.test.ts` | posée |
| `SUPABASE_SERVICE_ROLE_KEY` | oui |  | serveur | 4 | `e2e/personne-reprise.spec.ts`, `lib/sante-service.ts` | posée |
| `SUPALOCAL_DB` | oui |  | serveur | 15 | `e2e/console-clients.spec.ts`, `e2e/creation-bien-reprise.spec.ts` | posée |
| `SUPALOCAL_PORT` | oui |  | serveur | 1 | `e2e/local/serveur-supabase-local.mjs` | non posée |
| `SUPALOCAL_STORAGE` | oui |  | serveur | 1 | `e2e/local/serveur-supabase-local.mjs` | non posée |
| `SUPERVISION_MIGRATION_PREVIEW` | non |  | serveur | 1 | `tests/supervision-direction-diagnostic.test.ts` | non posée |
| `TEST_ADMIN_A` | oui |  | serveur | 2 | `tests/api-isolation.test.ts`, `tests/catalogue-api.test.ts` | non posée |
| `TEST_ADMIN_B` | oui |  | serveur | 1 | `tests/api-isolation.test.ts` | non posée |
| `TEST_MOT_DE_PASSE` | oui |  | serveur | 2 | `tests/api-isolation.test.ts`, `tests/catalogue-api.test.ts` | non posée |
| `TEST_MULTI` | oui |  | serveur | 1 | `tests/api-isolation.test.ts` | non posée |
| `TEST_SUPERADMIN` | oui |  | serveur | 1 | `tests/api-isolation.test.ts` | non posée |
| `VERCEL` | oui | plateforme/CI | serveur | 3 | `next.config.ts`, `lib/documents/rendu.ts` | non posée |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | oui |  | serveur | 2 | `scripts/deploiement/publier.mjs`, `app/actions/equipes.ts` | non posée |
| `VERCEL_ENV` | oui | plateforme/CI | serveur | 1 | `lib/facebook.ts` | non posée |
| `VERCEL_GIT_COMMIT_SHA` | oui | plateforme/CI | serveur | 1 | `app/api/sante/route.ts` | non posée |
| `VERCEL_PROJECT_ID` | oui |  | serveur | 4 | `scripts/deploiement/publier.mjs`, `app/actions/equipes.ts` | non posée |
| `VERCEL_PROJECT_PRODUCTION_URL` | oui | plateforme/CI | serveur | 4 | `lib/sante-service.ts`, `lib/site.ts` | non posée |
| `VERCEL_TEAM_ID` | oui |  | serveur | 2 | `scripts/deploiement/publier.mjs`, `lib/verification-marque.ts` | non posée |
| `VERCEL_TOKEN` | oui |  | serveur | 4 | `scripts/deploiement/publier.mjs`, `app/actions/equipes.ts` | non posée |
| `YOUTRUST_API_KEY` | oui |  | serveur | 2 | `lib/sante-service.ts`, `lib/youtrust.ts` | non posée |
| `YOUTRUST_ENV` | oui |  | serveur | 2 | `lib/sante-service.ts`, `lib/youtrust.ts` | non posée |
| `YOUTRUST_WEBHOOK_SECRET` | oui |  | serveur | 2 | `app/api/youtrust/webhook/route.ts`, `lib/sante-service.ts` | non posée |

## 8. Rôles

Produit par `03_base.py` (énumération `membership_role`, contrainte de `memberships`) et `04_transverse.py` (usages). Un compte peut cumuler plusieurs adhésions (`memberships`), **un rôle par adhésion** ; l'adhésion `super_admin` n'a pas d'organisation (contrainte CHECK : `super_admin` ⇔ `organization_id IS NULL`).

| Rôle (`membership_role`) | Comment il est attribué | Ce qu'il voit | Session (inactivité / absolue) | Citations |
|---|---|---|---|---|
| `super_admin` | Aucune fonction ni action ne l'octroie : création directe en base (SQL / clé de service) — `authenticated` n'a que `SELECT` et `DELETE` sur `memberships`, et le DELETE est réservé à `is_super_admin()` par politique. Second facteur obligatoire. | `/admin/**` (supervision), traversée journalisée des espaces clients, jamais d'usurpation (« Voir comme » n'existe pas) | 30 * MINUTE / 8 * HOUR | 7 fichiers src, 9 migrations |
| `admin_agence` | `ouvrir_organisation` (super-administrateur : crée l'agence et son responsable) ; hors V1 publique. | `/agence/[orgId]` : parc de l'agence, mandats, abonnement, administration, comptabilité | 2 * HOUR / 12 * HOUR | 20 fichiers src, 159 migrations |
| `agent` | `inviter_agent` (réservé à l'admin d'agence ou au super-administrateur, uniquement pour une organisation de type agence). | `/agence/[orgId]` restreint à son portefeuille de lots ; pas d'abonnement ni d'administration | 4 * HOUR / 12 * HOUR | 16 fichiers src, 152 migrations |
| `proprietaire_direct` | `initialiser_espace_proprietaire` (auto-inscription `/inscription`, une seule fois, idempotent) ou `ouvrir_organisation`. | `/espace/[orgId]` depuis le 16/10 (D27-B, PR #191 : alias réécrit par le proxy vers les écrans de `app/agence/[orgId]`, `/agence/[orgId]` redirigé en 308), en vocabulaire propriétaire : « Mes lots », finances, fiscalité, abonnement | 4 * HOUR / 12 * HOUR | 39 fichiers src, 159 migrations |
| `proprietaire_mandant` | Présent dans l'énumération et la table des durées de session ; **aucune fonction d'attribution trouvée** ; le code l'emploie comme libellé de rôle de personne (`personnes.ts`, `libelles.ts`). Exclusivité PD/PM mentionnée par `/espaces`. | aucun espace dédié repéré | 7 * DAY / 30 * DAY | 3 fichiers src, 2 migrations |
| `locataire` | `repondre_invitation_locataire` (acceptation d'une invitation) ; désactivation par `terminer_bail` (adhésion `inactive` : lecture seule des documents). | `/locataire/[orgId]` : logement, loyers, documents, demandes, messages | 7 * DAY / 30 * DAY | 41 fichiers src, 63 migrations |
| `artisan` | Compte artisan : `/artisan/inscription` (action `creerCompteArtisan`) crée la fiche `artisans.account_id` ; adhésions `artisan` créées par les parcours de rattachement (`solliciter_artisan_interne`, interne). | `/artisan` : missions, devis, planning, factures, clients externes | 7 * DAY / 30 * DAY | 25 fichiers src, 21 migrations |
| `garant` | Valeur de l'énumération citée dans `inviter_agent` ; usage à confirmer (hypothèse à vérifier). | aucun espace dédié repéré | 7 * DAY / 30 * DAY | 15 fichiers src, 7 migrations |

Types d'organisation (`organization_type`) : agence, proprietaire_direct. Statuts d'adhésion : active, inactive. Statuts d'organisation : essai, active, suspendue, archivee. **Profils de test du banc** : `proprietaire@` (propriétaire direct), `locataire.pd@`, `locataire.alpha@`, `artisan.alpha@`, `superadmin@`, `admin.alpha@`, `admin.beta@`, `agent.alpha@`, `multi@` (admin Beta + agent Alpha).

## 9. Écarts relevés par la cartographie (fiches CAR)

Détail complet (préconditions, étapes, attendu, observé, preuve) dans `rapport.json › anomalies`. Rappel : une anomalie non reproduite est une hypothèse à vérifier.

| Id | Sévérité | Titre | Reproduit |
|---|---|---|---|
| CAR-01 | P3 | La référence de tests candidate porte sur b9a7107, non sur la tête 9396669, et son parcours navigateur n'est pas vert | True |
| CAR-02 | P3 | La matrice de droits du super-administrateur cite une ligne de code qui ne contient pas ce qu'elle désigne | True |
| CAR-03 | P3 | `.env.example` annonce « Neuf missions quotidiennes » alors que le code et vercel.json en comptent dix | True |
| CAR-04 | P3 | Aucun journal de parcours navigateur ni d'audit des écrans pour la référence e9f31ac : la comparaison avec la candidate est impossible hors lint, types, build, vitest | True |
| CAR-05 | P3 | Privilèges de table et politiques RLS ne se recouvrent pas : 17 tables ont des privilèges d'écriture sans politique, 12 tables ont des politiques sans privilège | True |
| CAR-06 | P3 | Deux valeurs de `membership_role` (`proprietaire_mandant`, `garant`) n'ont ni fonction d'attribution repérée ni espace dédié | False |
| CAR-07 | P3 | Lacunes de couverture : 4 pages jamais ouvertes, 43 écrans ouverts ni exercés ni regardés, 43 actions serveur sans aucune trace | True |
| CAR-08 | P3 | Matrice des droits du super-administrateur : l'autorisation positive en aal2 n'est pas rejouée sur les 99 fonctions (profil aal1 seulement) | False |
| CAR-09 | P3 | Les relevés d'audit par écran sont écrasés à chaque largeur : seule la passe 1440 px est détaillée, les passes 390 et 768 px ne survivent que par leurs totaux | True |
| CAR-10 | P3 | La matrice du super-administrateur décrit la politique d'écriture de `memberships` de façon incomplète | True |
| CAR-11 | P3 | Le serveur du banc hérite d'un jeton GitHub du shell de lancement alors que l'application ne l'utilise pas | True |

## 10. Ce que cette cartographie ne couvre pas

- Le comportement à l'exécution des gardes lues : seules les fonctions des deux matrices rejouées sur le banc (99 fonctions de supervision × 7 profils, 354 RPC × 9 comptes) ont un constat — voir la matrice.
- Les composants React (`src/components/**`) et les actions non exportées ne sont pas inventoriés ; les pages ne sont reliées qu'à leurs gardes, pas à leurs composants.
- Les notifications (e-mails, alertes internes), les logs (`tech_log`, `audit_log`), les sauvegardes et les déploiements sont mentionnés par leurs variables et tables mais ne sont pas cartographiés fonction par fonction ici.
- Le projet Supabase hébergé, Vercel et la production : non consultés (interdit). Les droits par défaut de la base de schéma viennent de l'amorçage local.
- `pg_cron` : non installé dans la base de schéma ; seule la programmation décrite par les migrations est lisible.
- Les boutons sans action et les états de chargement/vide/erreur par écran ne sont pas parcourus ici (voir [[Inventaire de couverture]] pour la passe automatique et les rapports du designer).

