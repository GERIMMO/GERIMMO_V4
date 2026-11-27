---
type: synthesis
tags: [roles, permissions, rbac, multi-tenant]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-module-18-administration]]", "app/supabase/migrations (état du 26/11/2026)"]
---

# Modèle de rôles et permissions

Cette synthèse décrit les rôles du code actuel et ce que chacun peut faire. Voir aussi
[[Isolation multi-organisation]] et [[Compte, personne et adhésion]]. Les chemins de
migration sont relatifs à `app/supabase/migrations`.

> [!note] Constat du 26/11/2026
> La version précédente décrivait le code V3 ([[Dépôt Gerimmo-V3]]) : deux axes,
> `roles.key` et `organization_members.member_type`, des tables `permissions` et
> `role_permissions`, et les fonctions `has_organization_role`, `can_manage_users` et
> `can_manage_rent`. Aucune de ces tables ni de ces fonctions n'existe dans les migrations
> actuelles. Il n'y a plus qu'un seul axe : le rôle de l'adhésion.

## Principe : le rôle est porté par l'adhésion
Table `memberships` (`20260727_socle_identite_isolation.sql`). Une ligne contient
`account_id`, `organization_id`, `role` et `status` (`active` ou `inactive`).
- Une seule adhésion par couple compte × organisation (`memberships_unique_compte_agence`).
  Une même personne peut donc avoir un rôle différent dans chaque organisation, ce que
  demande RM-A1.5 ([[2026-07-24-gerimmo-v3-a1-modele-identite|Livrable A1]]).
- Le super admin est une adhésion **sans** organisation. Tout autre rôle en exige une
  (contrainte `memberships_super_admin_sans_org`).
- L'application n'écrit jamais directement dans `memberships`. Les droits INSERT et UPDATE
  sont retirés à `authenticated` (`20260927145000_adhesions_journalisees.sql`,
  `20261116141945_adhesions_ecriture_par_actions.sql`). Les adhésions naissent et changent
  par des fonctions de la base : `ouvrir_organisation`, `initialiser_espace_proprietaire`,
  `inviter_agent`, l'acceptation d'une invitation de locataire, la sollicitation d'un
  artisan et `gerer_collaborateur_agence`.
- Toute création, modification ou suppression d'adhésion est inscrite dans `audit_log` par
  le déclencheur `memberships_audit` (`20260927145000_adhesions_journalisees.sql`).

## Les rôles (enum `membership_role`)

| Rôle | Espace (route) | En bref | Persona |
|---|---|---|---|
| `super_admin` | `/admin` (accueil `/admin/brief`) | Supervision de la plateforme : lit tout, n'écrit pas dans les données de gestion | [[Super Admin]] |
| `admin_agence` | `/agence/[orgId]` | Responsable de l'agence : équipe, mandats, réouverture d'un mois | [[Administrateur d'agence]] |
| `agent` | `/agence/[orgId]` | Gestion limitée à son portefeuille de mandats | [[Agent immobilier]] |
| `proprietaire_direct` | `/espace/[orgId]` (alias de `/agence`, décision D27) | Responsable de sa propre organisation | [[Propriétaire bailleur]] |
| `locataire` | `/locataire/[orgId]` | Lit son bail, ses loyers et ses pièces ; fait des demandes | [[Locataire]] |
| `artisan` | `/artisan` (toutes agences réunies) | Sollicitations, devis, interventions ; l'adhésion n'ouvre aucune donnée de l'agence | [[Artisan]] |
| `proprietaire_mandant` | aucun | Valeur de l'enum. Aucune fonction ne crée cette adhésion | — |
| `garant` | aucun | Valeur de l'enum. Aucune fonction ne crée cette adhésion ; le garant est une ligne `bail_personnes` avec `role = 'garant'` | [[Garantie]] |

Sources :
- `app/src/app/espaces/page.tsx` (`cheminEspace`) : la route de chaque rôle ;
  `proprietaire_mandant` et `garant` n'en ont pas ;
- `app/src/lib/espace.ts` et `app/src/lib/racine-espace.ts` : les gardes et la décision D27 ;
- `app/src/lib/session-policy.ts` : les durées de session par rôle.

Durées de session (inactivité / durée absolue) :
- `super_admin` : 30 min / 8 h ;
- `admin_agence` : 2 h / 12 h ;
- `agent` et `proprietaire_direct` : 4 h / 12 h ;
- locataire, artisan, mandant et garant : 7 j / 30 j.

## Groupes de rôles
- **Gérants** : `admin_agence`, `agent`, `proprietaire_direct` (`ROLES_GERANTS`,
  `app/src/lib/ged.ts`). C'est le tableau de rôles qu'on retrouve dans la plupart des
  politiques RLS. Voir [[Gérant]].
- **Responsables** : `admin_agence` et `proprietaire_direct` (`ROLES_RESPONSABLES`, même
  fichier).

## Ce que chaque rôle peut faire (vérifié dans le code)

**`admin_agence`** : un « agent ++ ». Il a tous les droits de gérant sur l'organisation
entière, plus les gestes suivants.
- Il voit les adhésions de son agence (`memberships_select`, `20260728_socle_durcissement_optimisation_rls.sql`).
- Il invite un agent avec `inviter_agent(p_org, p_email)`, dans une agence seulement
  (`20260927184000_inviter_agent_par_admin.sql`).
- Il change le rôle d'un collaborateur (agent ou admin), ou retire son accès, avec
  `gerer_collaborateur_agence` (`20261116083200_gestion_collaborateurs_agence.sql`). Pour un
  retrait, un **repreneur** est obligatoire : il reprend les mandats en cours, et chaque
  réattribution est journalisée (`mandat_reattribue`). L'adhésion passe à `inactive`, elle
  n'est pas supprimée. C'est la réponse du code à RM-18.1.4 (désactivation bloquée tant que
  les mandats ne sont pas réaffectés).
- Il est seul à gérer les mandats : un agent restreint en est empêché par
  `garde_portefeuille_agent` (`20260909230000_perimetre_agent_serveur_et_base.sql`).
- Il rouvre un mois clos, avec un motif (`rouvrir_mois`, admin d'agence ou propriétaire
  direct, `20260830100000_s9a_proprietaire_direct.sql`).
- Il modifie la fiche de son organisation (`can_manage_organization`) et sa signature
  (`definir_signature_organisation`). Voir [[Organisation]].

**`agent`** : il a les mêmes écrans que l'admin, mais ne voit que **son portefeuille**.
Celui-ci comprend les lots des mandats dont il est titulaire et les lots qu'il a créés et
qu'aucun mandat ne couvre encore. Voir [[Isolation multi-organisation]] (RM-18.1.3). Il
peut créer un bien (`20260912220000_agent_peut_ajouter_un_bien.sql`).

**`proprietaire_direct`** : il est le responsable de sa propre organisation, avec les
droits d'un gérant mais sans mandat (`20260830100000_s9a_proprietaire_direct.sql`).
- Un compte n'a qu'un espace de propriétaire direct actif.
- Un propriétaire direct ne peut pas être aussi mandant d'une agence.

**`locataire`** : aucune politique ne lui ouvre directement les tables de gestion.
- Il lit par des RPC `security definer` (`mon_*`, `mes_*_locataire`).
- Après sa sortie, son adhésion passe à `inactive`. Il garde la **lecture** de ses
  quittances, de son décompte et de ses justificatifs. Les gestes, eux, exigent une
  adhésion active (`verifierAccesEspaceLocataire`, `app/src/lib/espace.ts` ;
  `mon_echeancier_locataire` accepte `status in ('active','inactive')`).
- Il est invité par un gérant (`inviter_locataire`, `20261013101000_invitations_locataire_cycle.sql`).

**`artisan`** (`20260911180000_module8_artisans_socle.sql`) :
- Sa fiche est **globale** (`artisans`, rattachée à un `account_id`).
- Le super admin la valide pour toute la plateforme (`artisan_validations`). Décisions
  possibles : `validation`, `refus`, `remise_en_attente`, `blacklist_globale`,
  `levee_blacklist`, et `suspension` ajoutée par `20260927202000_artisan_decision_suspension.sql`.
- Sa relation avec chaque agence est dans `artisan_agences` : actif ou désactivé, et liste
  noire locale.
- La sélection d'un devis (`retenir_devis`) est réservée aux gérants (admin, agent,
  propriétaire direct). Le locataire ne choisit jamais. Voir [[Demande et sélection de devis]].

**`super_admin`** : voir la section suivante.

## La supervision
- **Second facteur obligatoire** :
  - `is_super_admin()` exige l'adhésion `super_admin` active et une session AAL2
    (`20260914160000_supervision_second_facteur.sql`) ;
  - `is_permanent_super_admin()` exige en plus que l'adhésion soit sans organisation
    (`20260922120000_autonomie_v3.sql`). Il est requis pour les gestes sensibles de la
    console.
- **Délégations temporaires** : la table `supervision_delegations` accorde des pouvoirs
  `lecture`, `incidents` ou `qualite`, pour 90 jours au plus. Seul un superviseur permanent
  peut en créer. `has_supervision_power(p)` les lit. Une délégation n'est jamais assimilée à
  un super admin (`20260922120000_autonomie_v3.sql`).
- **Lecture partout, traversée journalisée** : `org_ids_avec_roles` renvoie toutes les
  organisations au super admin. Chaque traversée est tracée par `log_sa_access` dans
  `audit_log`.
- **Lecture seule depuis le 16/10/2026** (décision D08-C,
  `20261016172453_traversee_lecture_seule.sql`). La règle du 25/09, « tout voir, agir en son
  nom », ne vaut plus : toute écriture de gestion faite pendant une traversée est refusée
  par un déclencheur. Restent possibles :
  - les gestes de console (suspension, archivage) ;
  - des gestes de support motivés et bornés dans le temps. Par exemple, un encaissement de
    support exige un superviseur permanent, un motif de 10 à 500 caractères et expire au
    bout de 5 minutes (`preparer_encaissement_support`).
- **Espace d'un artisan** : la session de supervision dure 30 minutes
  (`20260919170000_session_supervision_artisan.sql`). Elle est en **lecture seule**
  (diagnostic) depuis `20261012222100_diagnostic_artisan_lecture.sql`. La supervision
  n'agit donc plus « comme » l'artisan.
- **Fiche par compte** : `/admin/comptes/[accountId]` et la RPC `dossier_compte_supervision`,
  réservées au superviseur permanent en AAL2 (`20260925150000_dossier_compte_supervision.sql`).
  Elles donnent l'état de connexion, le second facteur, le blocage et le journal du compte.
  Aucune identité n'est empruntée.
- **Signature** : la supervision ne signe pas au nom d'une organisation
  (`peut_utiliser_signature_organisation`, `20260914170000_signature_hors_supervision.sql`).

## Fonctions d'autorisation (SQL, `security definer`)

| Fonction | Rôle | Migration (dernière version) |
|---|---|---|
| `is_super_admin()` | Super admin actif, session AAL2 | `20260914160000_supervision_second_facteur.sql` |
| `is_permanent_super_admin()`, `has_supervision_power(text)` | Supervision permanente, délégations | `20260922120000_autonomie_v3.sql` |
| `user_org_ids()` | Organisations où le compte a une adhésion active | `20260728_socle_durcissement_optimisation_rls.sql` |
| `org_ids_avec_roles(roles[])` | Organisations où le compte a l'un des rôles (toutes pour le super admin) | `20260909190000_correctifs_audit_hors_documents.sql` |
| `is_active_member(org)`, `has_org_role(org, roles[])` | Fonctions par ligne du socle, encore utilisées ponctuellement | `20260727_socle_identite_isolation.sql` |
| `can_manage_organization(org)` | Super admin, admin d'agence ou propriétaire direct de l'organisation | `20260830100000_s9a_proprietaire_direct.sql` |
| `est_agent_restreint(org)`, `lots_de_mon_portefeuille(org)`, `*_hors_portefeuille(...)`, `perimetre_persons_gerant(org)` | Portefeuille de l'agent | `20260909230000_perimetre_agent_serveur_et_base.sql`, `20261116083200_gestion_collaborateurs_agence.sql` |
| `est_traversee_organisation(org)` | Le super admin est-il en traversée, sans rôle de gérance dans l'organisation ? | `20261016172453_traversee_lecture_seule.sql` |
| `peut_utiliser_signature_organisation(org)` | Signature réservée à un rôle réellement détenu | `20260914170000_signature_hors_supervision.sql` |
| `log_sa_access(org, action, details)` | Trace d'une traversée dans `audit_log` | `20260927201000_console_journal_supervision.sql` |

## Écart avec le référentiel (module 18, 2026-07-24)
- **Rôles** : le référentiel prévoit trois rôles (agent, admin d'agence, super admin)
  (RM-18.1.1). Locataire, artisan et propriétaire direct y ont des **espaces**, pas des rôles
  d'administration, et le mandant n'a rien. Le code garde huit valeurs d'enum, dont six ont
  un espace. Dans les faits, l'administration (équipe, mandats) reste réservée à
  `admin_agence` et au super admin, ce qui est cohérent avec le référentiel.
- **Aucun rôle personnalisé ni permission fine** (RM-18.1.2) : conforme, il n'y a pas de
  table de permissions.
- **Périmètre par mandat de l'agent** (RM-18.1.3) : implémenté (`20260909230000`).
- **Désactivation après réaffectation des mandats** (RM-18.1.4) : implémentée par le
  repreneur obligatoire (`20261116083200`).
- **Transfert temporaire pour absence** (RM-18.1.6/7) : non trouvé dans les migrations.
- **Journal d'audit** (18.5) : `audit_log`, conservé 36 mois (`retention_rules`,
  `journal:audit_log`, `20260728_sprint1_ged_alertes_retention.sql`).

> [!warning] Points à trancher / contradictions
> - **`proprietaire_mandant` et `garant`** sont des valeurs de l'enum `membership_role`,
>   mais aucune fonction ne crée d'adhésion avec ces rôles et ils n'ont pas d'espace. Il faut
>   décider s'ils restent prévus (futur espace mandant) ou s'ils sont retirés.
> - **Transfert temporaire d'un agent absent** (RM-18.1.6/7) : aucune trace dans les
>   migrations au 26/11/2026. Son absence est **à vérifier** côté application et dans la
>   feuille de route.
> - **Règle de supervision du 25/09** (« agir en son nom ») : remplacée par la lecture seule
>   D08-C. Les pages [[Super Admin]] et personas qui citeraient encore l'ancienne règle sont
>   à aligner.
