---
type: concept
tags: [loyer, quittance, facturation-locative]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "app/supabase/migrations (état du 26/11/2026)"]
---

# Période de loyer

**Définition :** le terme mensuel d'un [[Bail]], c'est-à-dire ce que le locataire doit pour
un mois donné. Dans le code actuel, une période correspond à **une ligne `appels_loyer`**.
Il y a un appel par bail et par mois (`unique (bail_id, periode)`), et `periode` vaut le
1er du mois (`app/supabase/migrations/20260801_s5_appels_loyer.sql`). C'est le point de
départ du flux « appel → encaissement → quittance ou relance » (voir
[[Quittancement des loyers]]). Les chemins de migration ci-dessous sont relatifs à
`app/supabase/migrations`.

> [!note] Constat du 26/11/2026
> La table V3 `rent_periods` du [[Dépôt Gerimmo-V3]] n'existe plus. Elle portait un
> triplet bien + locataire + mois, une `due_date` au 4 du mois, des `amount_cents`, un
> `status` stocké et un `quittance_status`. Le modèle suit désormais la cible du
> [[2026-07-24-gerimmo-v3-module-3-loyers-et-charges|module 3]] : des objets distincts
> (appel, encaissement, quittance), tous rattachés au **bail** et non plus au couple bien +
> locataire. La fonction V3 `can_manage_rent` n'existe plus non plus.

## L'appel de loyer (`appels_loyer`)
- **Colonnes** :
  - `periode`, `date_echeance` ;
  - `loyer_hc` et `charges`, séparés pour la [[Quittance conforme]] ;
  - `montant_du`, `prorata` ;
  - `base_loyer_hc` et `base_charges` : la base mensuelle qui a servi au calcul
    (`20261112120300_conge_ajuste_dernier_terme_et_depot_au_centime.sql`) ;
  - `email_envoye_at` : date d'envoi de l'avis d'échéance
    (`20260918050000_appel_loyer_part_au_locataire.sql`).
- Les montants sont en **euros** (`numeric`), pas en centimes.
- La clé composite `appels_loyer_bail_meme_org_fk` garantit que l'appel et le bail sont
  dans la même organisation (`20260910140000_etancheite_org_par_cles_composites.sql`).

## Échéance
- Elle se paramètre sur le bail :
  - `baux.jour_echeance` : de 1 à 28, 1 par défaut (`20260731_sprint4_bail_fondation.sql`) ;
  - `baux.paiement_echeance` : `echoir` par défaut, ou `echu`
    (`20260909140000_bail_complet_champs.sql`).
- **À échoir**, l'échéance du mois M tombe au jour d'échéance du mois M. **À terme échu**,
  elle tombe au jour d'échéance du mois M+1 (`20260927102000_appels_terme_echu.sql`).
- Il n'y a plus d'échéance fixe au 4 du mois comme en V3.

## Génération
- **Par un gérant**, `generer_appels_loyer(p_bail)` ; **chaque mois sans intervention
  humaine**, par le cycle automatique. Les deux passent par
  `generer_appels_loyer_interne` (`20260911200000_cycle_mensuel_automatique.sql`, terme échu
  dans `20260927102000_appels_terme_echu.sql`).
- Un appel est créé pour chaque mois **absent**, de l'entrée jusqu'au mois courant, sur un
  bail `actif`, `preavis` ou `termine`.
- **Prorata** :
  - au premier mois, si l'entrée a lieu en cours de mois (`20260801_s5_appels_loyer.sql`) ;
  - au dernier terme, quand un congé est saisi ou annulé, par `ajuster_appel_fin_de_bail`
    (`20261112120300_conge_ajuste_dernier_terme_et_depot_au_centime.sql`). Exception : si la
    quittance a déjà été envoyée, l'appel n'est pas modifié et une alerte
    `terme_a_regulariser` prévient le gérant.
- **Bail repris en cours** : `baux.loyers_suivis_depuis` indique le premier mois suivi.
  Aucun terme antérieur n'est appelé (`20261120200000_loyers_suivis_depuis.sql`).

## Le statut est calculé, jamais stocké
`etat_loyers_bail_brut(p_bail)` (dernière version dans
`20261112120300_conge_ajuste_dernier_terme_et_depot_au_centime.sql`) fait la somme des
encaissements du bail et l'**impute du terme le plus ancien au plus récent** (RM-3.3.2). Pour
chaque terme, la fonction rend `montant_du`, `cumul_du`, `montant_couvert` et `statut`.

| `statut` | Sens |
|---|---|
| `paye` | Terme couvert en totalité |
| `partiel` | Terme couvert en partie |
| `impaye` | Terme non couvert et échéance passée (jour de Paris, voir [[Le jour de référence est le jour de Paris]]) |
| `attendu` | Terme non couvert, échéance à venir |
| `non_du` | Terme d'un mois postérieur à la fin du bail : montant dû ramené à 0 |

Qui peut lire ce statut :
- les gérants, par `etat_loyers_bail`, qui vérifie l'appartenance et le portefeuille de
  l'agent (`20260910130000_rpc_appartenance_organisation.sql`) ;
- le locataire, par `mon_echeancier_locataire(p_org)`
  (`20260927164000_echeancier_locataire_detail_du_terme.sql`).

## Encaissements, quittances, relances
- **`encaissements`** (`20260801_s5_encaissements_etat_quittances.sql`) :
  - colonnes `bail_id`, `montant`, `date_paiement` (jour de Paris par défaut), `mode`,
    `note` ;
  - le montant est positif et au centime ;
  - `cle_envoi` empêche qu'un même envoi soit enregistré deux fois
    (`20261014100000_cle_envoi_encaissement_loyer.sql`).

  Les encaissements sont saisis à la main. Une fois créé, un encaissement ne se modifie
  pas : pour corriger, on le supprime (contre-passation automatique) puis on le ressaisit
  (`20260910160000_durcissement_ecritures_et_cycles.sql`). Un excédent se reporte sur les
  termes suivants, puisque l'imputation est cumulée.
- **`quittances`** :
  - au plus une par appel (`appel_id unique`) ;
  - `est_quittance = true` pour une quittance (terme payé en totalité), `false` pour un
    **reçu** (paiement partiel) ;
  - colonnes `montant`, `date_emission`, `email_envoye_at`.

  Le déclencheur `encaissement_quittances` sur `encaissements` resynchronise quittances et
  reçus à chaque mouvement (`resynchroniser_quittances`,
  `20260910120000_quittances_suivent_les_encaissements.sql`). Ainsi, aucune quittance ne
  survit à l'encaissement qui la justifiait (RM-3.4.1 et RM-3.4.2). L'application ne peut
  modifier que `email_envoye_at`. L'envoi est automatique si
  `organizations.quittances_envoi_auto` est actif (`20260911220000_quittances_partent_seules.sql`).
- **`relances`** (`20260801_s5_relances_regularisation.sql`,
  `20260920030000_relances_loyer_automatiques.sql`) :
  - `niveau` : `relance_1`, `relance_2` ou `mise_en_demeure` ;
  - `origine` : `gerant` ou `automatique` ;
  - colonnes `date_envoi`, `date_premiere_presentation`, `numero_recommande`.

  Chaque organisation règle ses relances : `relances_envoi_auto`, `relance_1_jours` (5 par
  défaut), `relance_2_jours` (15) et `relance_seuil_montant`. Voir
  [[Relances et mise en demeure]].
- Autres objets rattachés au bail : `plans_apurement` ([[Plan d'apurement]]) et
  `rectifications_quittances`.

## Qui peut gérer
- **Gérants** (`admin_agence`, `agent`, `proprietaire_direct`) : les politiques de
  `appels_loyer`, `encaissements`, `quittances` et `relances` passent par
  `org_ids_avec_roles` (migrations `20260801_s5_*`).
- **Agent restreint** : il ne voit que les baux de son portefeuille. Les politiques
  restrictives `*_agent_portefeuille` et le déclencheur `garde_portefeuille_agent` l'y
  limitent (`20260909230000_perimetre_agent_serveur_et_base.sql`).
- **Super admin** : il lit tout, en traversée journalisée, mais n'écrit pas. Un encaissement
  de support passe par un geste motivé (`preparer_encaissement_support`,
  `20261016172453_traversee_lecture_seule.sql`).
- **[[Locataire]]** : il lit son échéancier et ses quittances par RPC, y compris après sa
  sortie (adhésion `inactive`).
- **Clôture mensuelle** : un mois clos est enregistré dans `clotures_comptables`.
  `rouvrir_mois` exige un motif et un admin d'agence ou un propriétaire direct
  (`20260830100000_s9a_proprietaire_direct.sql`). Voir [[Comptabilité]].

## Relations
- Rattachée à un [[Bail]], lui-même porté par un [[Lot]].
- Voir [[Quittancement des loyers]], [[Relances et mise en demeure]],
  [[Révision annuelle IRL]] et [[Modèle de données]].

> [!warning] Points à trancher / contradictions
> - **Nom de la notion** : le code parle d'« appel de loyer » et de « terme », pas de
>   « période ». Il n'existe pas de page [[Appel de loyer]]. Faut-il en créer une, ou garder
>   cette page comme page de référence ?
> - **« Échéancier paramétré une fois »** (module 3) : le paramétrage tient dans des colonnes
>   du bail (`jour_echeance`, `paiement_echeance`). La table `echeanciers_charges` est autre
>   chose : elle étale le solde d'une régularisation de charges
>   (`20261101152354_echeanciers_charges_suivi.sql`). Il ne faut pas les confondre.
