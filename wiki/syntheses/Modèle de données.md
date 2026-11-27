---
type: synthesis
tags: [modele-donnees, schema, supabase]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "app/supabase/migrations (état du 26/11/2026)"]
---

# Modèle de données

Synthèse du schéma relationnel actuel (Postgres / Supabase). La source est
`app/supabase/migrations`, soit **576 migrations** au 26/11/2026. Le schéma `public`
compte environ **235 tables** : 241 ont été créées et 6 supprimées. Quatre tables vivent
dans des schémas privés (`support_interne.*`, `gerimmo_session_interne.*`). Cette page
présente les domaines et les tables pivots, sans être exhaustive. Les chemins de migration
sont relatifs à `app/supabase/migrations`.

> [!note] Constat du 26/11/2026
> La version précédente décrivait le schéma V3 ([[Dépôt Gerimmo-V3]]) : `profiles`,
> `organization_members`, `roles`, `permissions`, `patrimoines`, `residences`,
> `bien_occupants`, `bien_echeances`, `rent_periods`, `quote_requests`,
> `schedule_requests`, `interventions`, `communication_conversations`,
> `organization_subscriptions`, `subscription_plans`, `billing_invoices` et `audit_logs`.
> **Aucune de ces tables n'existe** dans les migrations actuelles. Le « socle cible » du
> [[2026-07-24-gerimmo-v3-architecture-lot-0|lot 0]] est, lui, en place
> (`20260727_socle_identite_isolation.sql`, `20260728_sprint1_ged_alertes_retention.sql`),
> sauf la table `events`.

## Schéma relationnel simplifié

```
organizations (type agence | proprietaire_direct ; status essai | active | suspendue | archivee)
 ├──< memberships >── accounts (miroir de auth.users)   rôle + état, une par compte × organisation
 ├──< persons            fiches métier de l'organisation ; account_id facultatif
 ├─── abonnements (1-1, Stripe) ; parrainages (parrain ↔ filleul)
 │
 ├──< biens              unité physique : adresse, type, copropriété, syndic
 │     ├──< lots         unité locative : brouillon → disponible → loue ⇄ preavis → archive
 │     │     ├──< detentions >── persons            propriétaires, quote-part
 │     │     ├──< lot_pieces, lot_equipements, lot_chambres (colocation)
 │     │     ├──< mandat_lignes >── mandats >── persons (mandant) ; mandats.agent_account_id → accounts
 │     │     └──< baux                              locataire_principal → persons
 │     │            ├──< bail_personnes             colocataire | garant
 │     │            ├──< appels_loyer ──1 quittances (terme mensuel, voir Période de loyer)
 │     │            ├──< encaissements, relances, plans_apurement, rectifications_quittances
 │     │            ├──< revisions_loyer, avenants_bail, conges
 │     │            ├──< etats_des_lieux ──< edl_lignes ; inventaire_lignes
 │     │            ├──< depot_encaissements ; restitutions ──< retenues
 │     │            └──< regularisations_charges ──1 echeanciers_charges
 │     ├──< diagnostics                             sur un bien ou un lot
 │     ├──< cles_repartition ──< cle_repartition_lignes (lots) ; appels_charges (lot)
 │     └──< compteurs_consommation ; contrats_fourniture ──< factures_fourniture
 │
 ├──< incidents          sur un lot ou un bien (parties communes) ; bail ; déclarant → persons
 │     └──< incident_consultations ──< incident_sollicitations (→ artisans) ──< incident_devis
 │          incident_interventions (→ devis) ──< intervention_* (créneaux, photos, factures…)
 ├──< ecritures          bail, lot, mandat ; clotures_comptables (mois clos) ; fiscal_*
 ├──< rapports_gestion, factures_honoraires, mouvements_mandants (par mandat)
 ├──< documents ──< document_liens (entite : organisation | personne | lot | bail | mandat | incident)
 ├──< messages (fil d'un locataire → persons), annonces (bien), alerts
 └──< audit_log          également possible sans organisation (supervision)

artisans (fiche globale, account_id) ──< artisan_agences >── organizations
artisans ──< artisan_validations (décision de la plateforme)
```

Migrations fondatrices :
- identité : `20260727_socle_identite_isolation.sql` ;
- documents et alertes : `20260728_sprint1_ged_alertes_retention.sql` ;
- parc : `20260729_sprint2_parc_biens_lots.sql` ;
- mandats : `20260731_sprint3_mandat_gestion_fondation.sql` ;
- baux : `20260731_sprint4_bail_fondation.sql` ;
- loyers : `20260801_s5_appels_loyer.sql`, `20260801_s5_encaissements_etat_quittances.sql` ;
- comptabilité : `20260801_s6_ecritures_fondation.sql` ;
- incidents : `20260821093624_s7_incidents_fondation.sql` ;
- artisans : `20260911180000_module8_artisans_socle.sql` ;
- abonnement : `20260911300000_encaissement_stripe.sql` ;
- parties communes : `20261101161444_incidents_parties_communes.sql` (`incidents.lot_id`
  devient facultatif, ajout de `incidents.bien_id`) ;
- consommations : `20261028143735_patrimoine_consommations_releves.sql`.

## Identité : compte, personne, adhésion
- `accounts` : compte d'authentification global. Il est alimenté par un déclencheur sur
  `auth.users`. L'email est unique sur toute la plateforme (RM-A1.1).
- `persons` : identité métier **par organisation**. Elle peut exister sans compte (RM-A1.4).
- `memberships` : compte + organisation + rôle + état (RM-A1.5).

Voir [[Compte, personne et adhésion]] et [[Modèle de rôles et permissions]]. Il n'y a pas
de tables `tenants`, `owners` ou `contractors`. Le rôle d'une personne vient du contexte :
- locataire : `baux.locataire_principal` ou `bail_personnes` ;
- propriétaire : `detentions` ;
- mandant : `mandats.person_id` ;
- garant : `bail_personnes.role = 'garant'`.

## Notions transverses
- **Multi-tenant strict** :
  - `organization_id not null` sur les tables de gestion et RLS partout ;
  - clés étrangères composites `*_meme_org_fk`, pour qu'un enfant ne puisse pas viser le
    parent d'une autre organisation (`20260730_sprint2_revue2_integrite_inter_agences.sql`,
    `20260910140000_etancheite_org_par_cles_composites.sql`).

  Voir [[Isolation multi-organisation]].
- **Le [[Bail]] porte sur un [[Lot]], jamais sur un [[Bien]]** (RM-0.2.5,
  `20260729_sprint2_parc_biens_lots.sql`). Tout bien naît avec un lot unique (RM-0.1.2).
- **Archivage plutôt que suppression** :
  - `persons.archived_at` (socle) ;
  - `biens.archived_at` et `archived_by` (`20260927162000_retrait_bien_archivage.sql`) ;
  - l'état `archive` du lot ;
  - `documents.purged_at` pour une pièce purgée ;
  - sur `organizations`, `persons` et `memberships`, le DELETE est réservé au super admin.

  Voir [[Archivage plutôt que suppression]].
- **Traçabilité** :
  - `audit_log`, conservé 36 mois, `tech_log`, 6 mois, et `acces_pieces_log`, 12 mois. Ces
    durées viennent de `retention_rules` (`20260728_sprint1_ged_alertes_retention.sql`) ;
  - des journaux par module : `incident_evenements`, `abonnement_evenements`,
    `signature_evenements`, `courriels_evenements`…

  Voir [[Durées de conservation]].
- **Statuts** : ce sont des enums ou des contraintes CHECK (`lot_etat`, `bail_etat`,
  `mandat_etat`, `organization_status`, `devis_statut`…). Exception notable : le statut d'un
  loyer **n'est pas stocké**, il est calculé par `etat_loyers_bail_brut` (voir
  [[Période de loyer]]).
- **Montants** : il y a **deux conventions**.
  - Loyers, encaissements, écritures et dépôt de garantie sont en euros (`numeric`), au
    centime (par exemple `20261014412000_encaissements_montant_au_centime.sql`).
  - D'autres modules comptent en centimes entiers (`*_cents`) : l'abonnement
    (`abonnements.montant_mensuel_cents`), les devis d'artisans
    (`incident_devis.montant_ttc_cents`), les échéanciers de charges
    (`echeanciers_charges.total_cents`).
- **Jour de référence** : les dates par défaut suivent le jour de Paris (`aujourdhui_paris()`,
  par exemple `20261014504000_jour_de_paris_encaissements.sql`). Voir
  [[Le jour de référence est le jour de Paris]].
- **Documents** : une ligne `documents` (type, chemin, empreinte SHA-256) et des
  rattachements multiples dans `document_liens`. Il n'y a pas de clé étrangère polymorphe :
  l'intégrité du rattachement est assurée par l'application. Le fichier est rangé dans le
  compartiment Storage `documents`, sous `<organization_id>/…`. Voir [[Document]].
- **Idempotence** : il n'y a pas de table `events`, contrairement au lot 0. Des clés
  uniques par geste jouent ce rôle : `encaissements.cle_envoi`
  (`20261014100000_cle_envoi_encaissement_loyer.sql`), `biens.creation_cle`,
  `retours_utilisateurs.cle_envoi`.

## Trois « facturations » à ne pas confondre
- **Loyers du locataire** : `appels_loyer`, `encaissements`, `quittances` (voir
  [[Période de loyer]] et [[Quittancement des loyers]]).
- **Honoraires de gestion facturés au mandant** : `factures_honoraires`, rattachées à un
  mandat (`20260914190000_facture_honoraires.sql`). Voir [[Mandat de gestion]].
- **Abonnement de l'organisation à Gerimmo** : `abonnements`, `abonnement_evenements`, et
  les barèmes `tarif_formules` et `tarif_tranches` (`20260928090000_tarification_2026.sql`).
  Voir [[Abonnement]] et [[Grille tarifaire]].

## Tables supprimées depuis l'ouverture du dépôt V4
- `demandes_pieces` : `20260906100000_correctifs_audit.sql`.
- `invitations`, `artisan_candidatures`, `controles_solvabilite`, `signature_circuits` et
  `signature_signataires` : `20260921110000_indexes_fk_et_tables_obsoletes.sql`.

Les invitations de locataires vivent dans `invitations_locataires`, celles des artisans
dans `invitations_artisans`, et le circuit de signature du bail dans
`bail_signature_circuits`.

Voir aussi [[Organisation]], [[Patrimoine et résidences]] (notion V3 remplacée par
bien/lot) et [[État du projet et décisions ouvertes]].
