---
type: business-rule
tags: [multi-tenant, securite, rls]
status: in-progress
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a1-modele-identite]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "app/supabase/migrations (état du 26/11/2026)"]
---

# Isolation multi-organisation

**Énoncé :** les données d'une [[Organisation]] ne doivent **jamais** être visibles ni
accessibles par une autre organisation.

> [!note] Constat du 26/11/2026
> La version précédente citait les fonctions V3 (`has_organization_role`,
> `is_active_organization_member`, `can_manage_users`, `can_manage_rent`…) et le document
> `docs/00-principes-gerimmo.md` du [[Dépôt Gerimmo-V3]]. Aucune de ces fonctions n'existe
> dans `app/supabase/migrations`. La page décrit maintenant le code actuel. Les chemins de
> migration sont relatifs à ce dossier.

## Exigences du référentiel (Livrable A1, 2026-07-24)
- **RM-A1.6** : `organization_id` obligatoire sur toute table de données d'agence.
- **RM-A1.7** : **un test d'isolation automatisé par table** (une agence ne lit jamais les
  données d'une autre). C'est la contrepartie du compte global : le compte unique simplifie
  l'expérience mais concentre le risque ([[Compte, personne et adhésion]]).
- **RM-A1.10** : les pièces d'un dossier ne franchissent jamais une frontière d'agence.
- **RM-A1.11** : le [[Super Admin]] peut traverser les agences, mais chaque traversée est
  **journalisée** (journal d'audit, 3 ans, A4).
- **RM-A1.12** : identifiants techniques jamais séquentiels.

Le [[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] reprend ces règles comme volet
« cloisonnement applicatif » du [[Socle de sécurité]]. Le
[[2026-07-24-gerimmo-v3-architecture-lot-0|lot 0]] a retenu la RLS : « même si le code se
trompe, la base refuse de renvoyer les lignes ».

## Mise en œuvre dans le code
1. **`organization_id not null`** sur les tables de gestion, et identifiants UUID tirés au
   hasard (`gen_random_uuid()`, RM-A1.12) depuis `20260727_socle_identite_isolation.sql`.
2. **RLS sur toute table `public`**, avec des politiques fondées sur l'appartenance. Elles
   reposent sur deux fonctions `stable security definer` sans argument lié à la ligne,
   donc évaluées **une fois par requête** (`20260728_socle_durcissement_optimisation_rls.sql`) :
   - `user_org_ids()` : les organisations où le compte a une adhésion active ;
   - `org_ids_avec_roles(roles[])` : les organisations où il détient l'un des rôles.
     Depuis le 09/09, elle renvoie **toutes** les organisations au super admin
     (`20260909160000_super_admin_acces_transverse.sql`, dernière version dans
     `20260909190000_correctifs_audit_hors_documents.sql`).

   Politique type : `organization_id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']))`.
   La vigilance de performance du lot 0 (une sous-requête `memberships` par ligne) est
   ainsi traitée. Les fonctions par ligne du socle, `is_active_member(org)` et
   `has_org_role(org, roles)`, restent définies. `has_org_role` sert encore à quelques
   contrôles, par exemple pour la signature (`20260914170000_signature_hors_supervision.sql`).
3. **Clés étrangères composites** `(parent_id, organization_id) → parent(id, organization_id)`,
   nommées `*_meme_org_fk`. Une ligne ne peut pas viser un parent d'une autre organisation,
   même quand la RLS l'autorise à écrire dans sa propre organisation
   (`20260730_sprint2_revue2_integrite_inter_agences.sql`). La règle est généralisée par
   `20260910140000_etancheite_org_par_cles_composites.sql`, après le rejeu d'une faille :
   un encaissement de l'agence B sur un bail de l'agence A.
4. **Les tiers ne lisent pas les tables de gestion.**
   - `persons` n'est lisible que par les gérants (`20260728_socle_durcissement_optimisation_rls.sql`).
   - Le [[Locataire]] lit par des RPC `security definer` filtrées sur sa propre fiche
     (`mon_*` / `mes_*_locataire(p_org)`, par exemple `mon_echeancier_locataire`,
     `20260927164000_echeancier_locataire_detail_du_terme.sql`). Il lit l'organisation par
     la vue `organisations_portail` (`20261112120500_organisation_portail_limite.sql`).
   - L'adhésion `artisan` n'ouvre **aucune** donnée de l'agence : elle sert seulement à
     afficher l'agence dans `/espaces` (`20260911180000_module8_artisans_socle.sql`).
5. **Fichiers** (RM-A1.10) : dans le compartiment Storage `documents`, le premier dossier du
   chemin est l'`organization_id`. Les politiques `ged_select` et `ged_insert` le comparent
   aux organisations du compte (`20260728_sprint1_ged_alertes_retention.sql`,
   `20260728_sprint1_ged_select_sa_purge.sql`). Les consultations de pièces sont tracées
   dans `acces_pieces_log`.
6. **Privilèges** : les fonctions d'aide sont révoquées à `public` et `anon`. `anon`
   n'écrit nulle part, à une exception près : l'insertion par colonne dans `liste_attente`
   (`app/tests/socle.test.ts`). Sur `organizations`, `persons` et `memberships`, le DELETE
   est réservé au super admin (`20260728_socle_durcissement_optimisation_rls.sql`).

## Les trois niveaux de données : référentiel et code

| Niveau (A1) | Exemples du référentiel | Dans le code |
|---|---|---|
| **Données d'agence**, cloisonnées strictement | biens, lots, baux, écritures, mandats | Tables à `organization_id not null` : `biens`, `lots`, `baux`, `persons`, `mandats`, `ecritures`, `appels_loyer`… |
| **Données partagées**, lisibles selon la visibilité | profil artisan public, modèles Gerimmo | `artisans` est global (rattaché à un `account_id`) ; la relation avec chaque agence est dans `artisan_agences`, avec la liste noire locale (`20260911180000_module8_artisans_socle.sql`) |
| **Données globales** | comptes, personnes, indices IRL | `accounts` est global. **`persons` est par organisation** (`organization_id not null`). Il n'y a pas de table d'indices IRL : la série est lue chez l'Insee (`app/src/lib/indice-revision.ts`) |

## Cloisonnement à l'intérieur d'une agence : le portefeuille de l'agent
RM-18.1.3 est durci dans `20260909230000_perimetre_agent_serveur_et_base.sql`.
- `est_agent_restreint(org)` est vrai pour un compte qui n'est **qu'**agent dans
  l'organisation (ni admin, ni propriétaire direct, ni super admin).
- Son portefeuille, `lots_de_mon_portefeuille(org)`, contient les lots des lignes ouvertes
  des mandats dont il est titulaire (`mandats.agent_account_id`, états `brouillon`,
  `a_signer`, `actif`, `preavis`). Il contient aussi les lots qu'il a créés et qu'aucun
  mandat ne couvre encore (dernière version dans `20261116083200_gestion_collaborateurs_agence.sql`).
- Trois étages de protection :
  - des politiques **restrictives** `*_agent_portefeuille` en lecture ;
  - le déclencheur `garde_portefeuille_agent` sur les écritures : 23 tables au départ,
    puis d'autres (par exemple `20260927181000_portefeuille_agent_tables_restantes.sql`) ;
  - le durcissement des RPC de lecture.

  Voir [[Agent immobilier]].

## Super admin : il lit tout, mais n'écrit pas
- `is_super_admin()` exige une adhésion `super_admin` active **et** une session avec second
  facteur, c'est-à-dire AAL2 (`20260914160000_supervision_second_facteur.sql`).
- **Lecture transverse** par `org_ids_avec_roles` (point 2).
- **Traversée tracée** (RM-A1.11) : `log_sa_access` écrit dans `audit_log`, en ignorant une
  même consultation répétée dans la minute (`20260927201000_console_journal_supervision.sql`).
  Côté application, `verifierAccesEspace` (`app/src/lib/espace.ts`) appelle
  `tracerTraversee` (`app/src/lib/traversee.ts`). Si la trace ne peut pas être enregistrée,
  la page ne s'ouvre pas.
- **Écriture de gestion refusée** (décision D08-C, `20261016172453_traversee_lecture_seule.sql`).
  Le déclencheur `traversee_lecture_seule` est posé sur toute table à `organization_id` et
  sur `storage.objects` (`poser_gardes_traversee()`). Seuls passent les gestes de support
  motivés (par exemple `preparer_encaissement_support`) et les gestes de console
  (`controler_organisation`). La supervision ne peut pas non plus s'attribuer un rôle de
  gérance pour contourner cette garde (`refuser_auto_habilitation`).

## Tests
- `app/tests/socle.test.ts` contient trois tests :
  - « RLS est actif partout, et toute table atteignable porte une politique » ;
  - « anon n'écrit nulle part » ;
  - « une agence ne voit jamais les données d'une autre (RM-A1.7) », qui porte sur
    `organizations`, `persons` et la vue `organisations_portail`.
- `app/tests/api-isolation.test.ts` vérifie l'isolation à travers Supabase Auth, PostgREST
  et la RLS.
- `app/tests/abonnement-lecture-seule.test.ts` vérifie qu'aucune table à `organization_id`
  n'est dépourvue de garde d'abonnement.

## Conséquences si la règle n'est pas respectée
- Fuite de données entre clients : faille critique.

## Implications pour l'application
Toute nouvelle table de gestion doit :
- porter `organization_id not null` et des FK composites `*_meme_org_fk` vers ses parents ;
- avoir ses politiques RLS ;
- appeler `select public.poser_gardes_abonnement()` en fin de migration. Cette fonction
  pose aussi la garde de traversée, depuis D08-C ;
- révoquer les droits d'`anon`.

Écrire le test d'isolation **en même temps** que la table (RM-A1.7). Voir
[[Modèle de rôles et permissions]] et [[Modèle de données]].

> [!warning] Points à trancher / contradictions
> - **RM-A1.7, un test par table** : le test SQL du socle ne couvre que `organizations`,
>   `persons` et la vue portail. Beaucoup de tests de module contrôlent la RLS de leur propre
>   table (`relrowsecurity`), mais la couverture table par table est **à vérifier**.
> - **« Personnes » en données globales (A1)** : dans le code, `persons` est une fiche
>   par organisation. Seul le compte (`accounts`) est global. Le vocabulaire est à aligner
>   avec [[Compte, personne et adhésion]].
> - **Décision du 25/09 remplacée** : « la supervision agit en son nom » est remplacée par
>   la lecture seule D08-C du 16/10/2026 (`20261016172453_traversee_lecture_seule.sql`). Les
>   pages qui citeraient encore l'ancienne règle sont à mettre à jour.
