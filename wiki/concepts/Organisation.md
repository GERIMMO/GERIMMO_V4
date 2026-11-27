---
type: concept
tags: [multi-tenant, organisation, socle]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "app/supabase/migrations (état du 26/11/2026)"]
---

# Organisation

**Définition :** l'entité cliente de Gerimmo, c'est-à-dire une agence immobilière ou un
propriétaire qui gère ses biens lui-même. C'est aussi la **racine de l'isolation des
données**. Table `organizations`, créée par
`app/supabase/migrations/20260727_socle_identite_isolation.sql`. Toute donnée de gestion
porte un `organization_id` non nul : c'est l'unité du multi-tenant (voir
[[Isolation multi-organisation]]).

> [!note] Constat du 26/11/2026
> La version précédente de cette page décrivait le schéma V3 ([[Dépôt Gerimmo-V3]]) :
> types `agency` / `independent_owner` / `internal`, colonne `slug`, statut
> `suspended`, tables `organization_members` et `profiles`. Rien de cela n'existe dans
> `app/supabase/migrations`. Les chemins de migration ci-dessous sont relatifs à ce dossier.

## Types (`organizations.type`, enum `organization_type`)
- **`agence`** (valeur par défaut) : agence immobilière, gérée par l'[[Administrateur d'agence]]
  et ses [[Agent immobilier|agents]].
- **`proprietaire_direct`** : [[Propriétaire bailleur]] (particulier ou SCI) qui gère son
  parc sans agence. Il est sa propre organisation. Elle est créée à l'inscription en ligne
  par `initialiser_espace_proprietaire()`.

Source : `20260830100000_s9a_proprietaire_direct.sql`. Il n'y a pas de type « interne » :
la supervision Gerimmo est une adhésion `super_admin` **sans** organisation (voir
[[Modèle de rôles et permissions]]).

## Statut (`organizations.status`, enum `organization_status`)
- Valeurs : `essai` (par défaut), `active`, `suspendue`, `archivee`
  (`20260727_socle_identite_isolation.sql`).
- `essai_fin` : fin de l'essai gratuit, soit **2 mois calendaires** à partir du jour de Paris
  (`essai_ordinaire_fin()`, dernière version dans `20261115094646_essai_deux_mois_permanent.sql`).
- **Champs réservés au super admin** : `status`, `type`, `essai_fin` et `grille_tarifaire`.
  Le déclencheur `organizations_champs_reserves_sa` refuse leur modification par quelqu'un
  d'autre (dernière version dans `20260928090000_tarification_2026.sql`). Le changement de
  statut se fait depuis la console (`controler_organisation`, voir
  `20261016172453_traversee_lecture_seule.sql`).
- Gestes de la console (`controler_organisation`,
  `20260927203000_console_gestes_de_controle.sql`) : suspendre, archiver, puis réactiver
  une organisation suspendue ou archivée. La synchronisation Stripe ne modifie plus une
  organisation archivée (`20260911300000_encaissement_stripe.sql`).
- **Écriture ouverte ou fermée** : `org_ecriture_ouverte(org)`
  (`20261024110000_vente_et_impaye.sql`). L'écriture est ouverte si l'essai n'est pas
  expiré, ou si le compte est actif et sans défaut de prélèvement depuis quinze jours.
  Quand elle est fermée, les données restent lisibles et exportables. Le refus ne vise que
  les gérants (admin d'agence, agent, propriétaire direct). Les locataires et les artisans
  continuent d'écrire dans les limites de la RLS (`refuser_ecriture_si_fermee`,
  `20260929140000_gel_sans_bloquer_locataires_artisans.sql`). Cette garde est posée sur
  toute table qui porte `organization_id` par `poser_gardes_abonnement()`
  (`20260911190000_gardes_abonnement_rejouables.sql`). Voir [[Cycle de vie de l'abonnement]].

## Attributs notables

| Groupe | Colonnes | Migration |
|---|---|---|
| Identité | `name` (nom affiché et raison sociale) | `20260727_socle_identite_isolation.sql` |
| Coordonnées des courriers | `address_line1`, `postal_code`, `city`, `telephone`, `email_contact`, `siret` | `20260831100000_documents0_identite.sql` |
| Mentions professionnelles | `carte_pro`, `garantie_financiere`, `iban` | `20260909140000_bail_complet_champs.sql` |
| TVA des honoraires | `tva_intracom`, `tva_franchise` | `20260914190000_facture_honoraires.sql` |
| Signature préenregistrée | `signature_path` | `20260908120000_signature_documentaire.sql` |
| Envois automatiques | `quittances_envoi_auto`, `appels_envoi_auto`, `relances_envoi_auto`, `relance_1_jours` (5 par défaut), `relance_2_jours` (15), `relance_seuil_montant` (5) | `20260911220000_quittances_partent_seules.sql`, `20260918050000_appel_loyer_part_au_locataire.sql`, `20260920030000_relances_loyer_automatiques.sql`, `20260929130000_audit_gestion.sql` |
| [[Marque blanche]] | `logo_url`, `couleur_primaire`, `couleur_secondaire`, `nom_portail`, `domaine_personnalise`, `email_expediteur` (et leurs dates de vérification) | `20260922120000_autonomie_v3.sql` |
| Commercial | `code_parrainage` (unique, 8 caractères hexadécimaux), `grille_tarifaire` (`historique` ou `2026-09-28`) | `20260919120000_parrainage.sql`, `20260928090000_tarification_2026.sql` |

Les colonnes `slug`, `legal_name` et `siren` de V3 n'existent pas. La raison sociale est
`name` et l'identifiant légal est `siret`. Voir [[Quittance conforme]],
[[Relances et mise en demeure]], [[Parrainage]] et [[Grille tarifaire]].

## Qui lit, qui modifie (RLS)
- **Lecture de la fiche complète** : les gérants (`admin_agence`, `agent`,
  `proprietaire_direct`) et le super admin. C'est la politique `organizations_select`, dans
  sa dernière version (`20261112202241_fermer_fiche_interne_apres_bascule.sql`).
- **Locataires et artisans** : ils ne lisent pas la table. Ils passent par la vue
  `organisations_portail`, qui expose `id`, `name`, `type`, le logo, les couleurs et
  `nom_portail`. L'`iban` n'y apparaît que pour un locataire actif
  (`20261112120500_organisation_portail_limite.sql`).
- **Modification** : `can_manage_organization(org)` est vrai pour le super admin, et pour
  l'admin d'agence ou le propriétaire direct de **cette** organisation
  (`20260830100000_s9a_proprietaire_direct.sql`). En traversée de supervision, seules la
  console et les champs `status` et `essai_fin` passent (déclencheur `traversee_lecture_seule`,
  `20261016172453_traversee_lecture_seule.sql`).
- **Création** :
  - par le super admin, avec `ouvrir_organisation(...)` depuis la console. La fonction crée
    l'organisation, le compte du premier responsable et leur adhésion
    (`20260911260000_ouvrir_une_organisation.sql`, dernière version dans
    `20261115130412_cloture_audit_contrats_marketing.sql`) ;
  - par l'auto-inscription d'un propriétaire direct (`initialiser_espace_proprietaire()`,
    dernière version dans `20261105141000_coordonnees_courriers_ouverture.sql`).

## Relations
- `memberships` relie un compte (`accounts`, miroir de `auth.users`) à l'organisation, avec
  un rôle et un état. Il ne peut y avoir qu'une adhésion par couple compte × organisation
  (`memberships_unique_compte_agence`, RM-A1.3). C'est l'**adhésion** du
  [[Compte, personne et adhésion|modèle canonique d'identité]].
- `persons` : les fiches métier (locataires, garants, propriétaires, mandants) **propres à
  l'organisation** (`organization_id not null`). Une fiche peut exister sans compte.
- Contient : [[Bien|biens]] et [[Lot|lots]], [[Bail|baux]], [[Mandat de gestion|mandats]],
  [[Incident|incidents]], [[Document|documents]], écritures… (voir [[Modèle de données]]).
- `abonnements` : une ligne par organisation (clé primaire `organization_id`, identifiants
  Stripe), voir [[Abonnement]].
- Un compte peut adhérer à plusieurs organisations. Une donnée de gestion appartient en
  revanche à **une seule**, ce que garantissent les clés étrangères composites
  `*_meme_org_fk` (voir [[Isolation multi-organisation]]).
- **Exclusivité propriétaire direct / mandant** : un compte qui gère en direct ne peut pas
  être mandant d'une agence, et inversement (déclencheur `mandats_exclusivite_pd_trg`,
  `20260830100000_s9a_proprietaire_direct.sql`). Un compte n'a qu'un espace de propriétaire
  direct actif (index `memberships_un_seul_espace_proprietaire`,
  `20260910172000_espace_proprietaire_sans_course.sql`).

## Signature préenregistrée
`organizations.signature_path` contient l'image de signature (PNG ou JPEG, 1 Mo au plus).
Le **responsable** (admin d'agence ou propriétaire direct) la dépose au profil de
l'organisation. Elle est apposée sur les documents émis seuls ([[Signature électronique]]).
Seul le responsable la pose, jamais la supervision : `definir_signature_organisation` et
`peut_utiliser_signature_organisation` (`20260914170000_signature_hors_supervision.sql`).
Au remplacement ou au retrait, l'ancien fichier part dans la file de purge
(`purge_fichiers`). Une signature manuscrite est une donnée personnelle et ne doit pas
rester stockée ([[RGPD]]).

## Fin de vie d'une organisation
- **Référentiel (A2, 2026-07-24)** : une agence est **archivée 10 ans** (durée comptable)
  **puis anonymisée**. C'est la correction de RM-18.4.4
  ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|livrable A2]]). L'agence est
  **responsable de traitement** de ses données de gestion locative et Gerimmo est son
  **sous-traitant** (RM-A2.8, voir [[RGPD]]).
- **Code** : la fermeture du compte du seul gérant actif **efface l'organisation**
  (`executer_fermeture_compte`, `20261024130000_fermeture_comptes.sql`). La fonction
  supprime les lignes de toutes les tables `public` qui portent `organization_id`, puis la
  ligne `organizations`. Avant cela, la preuve du contrat (identité, acceptations, dates
  d'abonnement) et les factures Gerimmo sont copiées dans `archives_comptes`. La preuve y
  est conservée 10 ans après la fin du dernier abonnement payé, et chaque facture 6 ans
  (`20261024090000_versions_conditions_et_archives_comptes.sql`). Voir
  [[Fermeture de compte]].

> [!warning] Points à trancher / contradictions
> - **Fin de vie** : le référentiel A2 prévoit « archivée 10 ans puis anonymisée ». Le code
>   efface toutes les données de l'organisation à la fermeture du compte de son seul gérant
>   et ne garde que la preuve du contrat et les factures Gerimmo (`archives_comptes`). Les
>   données de gestion de l'agence, comptabilité comprise, ne sont donc pas conservées
>   10 ans par Gerimmo. Il faut décider laquelle des deux règles fait foi.
> - **Statut `archivee` et fermeture de compte** : l'archivage par la console
>   (`controler_organisation`) et l'effacement à la fermeture du compte
>   (`executer_fermeture_compte`) sont deux chemins distincts. Leur articulation avec la
>   règle A2 reste à décider.
