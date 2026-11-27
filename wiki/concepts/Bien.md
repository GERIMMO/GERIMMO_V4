---
type: concept
tags: [bien, lot, immobilier, bail, occupation]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[Audit complet du 29 septembre 2026]]", "app/supabase/migrations/20260729_sprint2_parc_biens_lots.sql et migrations suivantes citées dans la page", "app/supabase/migrations/20260731_sprint4_bail_fondation.sql", "app/supabase/migrations/20260910176000_coherence_etat_lot_et_bail.sql", "app/supabase/migrations/20260914180000_colocation_contrats_individuels.sql", "app/src/lib/occupation-lot.ts"]
---

# Bien

**Définition :** l'unité **physique** gérée : un appartement, une maison, un immeuble, un local, un parking, un
terrain ou autre. Il porte l'adresse, la copropriété et les diagnostics communs. Table `biens`, créée par
`app/supabase/migrations/20260729_sprint2_parc_biens_lots.sql`.

**Le bien n'est pas loué : c'est son [[Lot]] qui l'est.** Le lot est l'unité **locative** : détention, bail, loyer,
diagnostics privatifs. La règle du module 0 est appliquée telle quelle : « le bail porte toujours sur un LOT, jamais
sur un bien » (RM-0.2.5, commentaire d'en-tête de la migration). Tout bien naît avec un « Lot unique » (RM-0.1.2). Le
découpage en plusieurs lots reste invisible dans la plupart des cas.

## La table `biens` (relue le 26/11/2026)

| Groupe | Colonnes | Migration |
|---|---|---|
| Identité | `id`, `organization_id`, `nom` (référence interne, par exemple « 12 rue des Lilas »), `type` | `20260729_sprint2_parc_biens_lots.sql` |
| Adresse | `address_line1`, `address_line2`, `postal_code`, `city`, `commune_insee` (commune confirmée, pour le réseau d'artisans) | idem, `20260928081000` |
| Bâtiment | `annee_construction`, `copropriete`, `parties_communes`, `acces_tic` (fibre, câble, TNT) | idem, `20260909140000` |
| Copropriété | `syndic_nom`, `syndic_email`, `reference_copropriete` | `20260801_s8_copropriete_appels_charges.sql` |
| Zone tendue | `zone_tendue` : oui, non, ou vide = « non vérifiée » | `20260801_s4_zone_tendue_preavis_locataire.sql`, `20260929130000` |
| Retrait | `archived_at`, `archived_by` | `20260927162000` |
| Traçabilité | `created_by`, `creation_cle`, `creation_requete` (un second envoi du formulaire est sans effet) | `20260912220000`, `20261013103000` |

**Types** (`bien_type`) : `appartement`, `maison`, `immeuble` (ajouté le 02/08, `20260802_bien_type_immeuble.sql`),
`local`, `parking`, `terrain`, `autre`.

**Le bien ne porte ni loyer ni statut d'occupation.** Les colonnes de l'ancien dépôt (`monthly_rent_cents`,
`monthly_charges_cents`, statut `vacant/occupe/travaux/archive`, `floor`, `rooms`, `surface_m2`) n'existent pas dans
`biens`. La surface, les pièces et l'étage sont sur le lot. Le loyer et les charges sont sur le bail.

**Aucune table** `bien_occupants`, `bien_echeances`, `bien_history`, patrimoine ou résidence n'existe dans les
migrations. L'occupation se lit par les baux (plus bas). L'agenda lit les dates déjà enregistrées ailleurs
(`app/src/lib/echeances-agenda.ts`, [[Agenda et échéances]]).

## Créer, modifier, retirer un bien

- **Création** : `creer_bien_verifie` (`20261113021755`), puis `creer_bien_complet` (`20261013103000`), puis
  `creer_bien_avec_lot`.
  - Au moins un lot, avec une surface et un nombre de pièces valides pour chacun.
  - Un appartement ou un parking ne forme qu'une seule unité locative.
  - Un bien de même nom et de même adresse, déjà présent dans l'espace, est signalé comme doublon avant la création.
  - Chez un propriétaire en gestion directe, sa fiche de détenteur est créée au besoin, avec une détention à 100 % du
    lot. Son identité, son adresse et son e-mail doivent d'abord être complets dans « Mon profil ».
- **Découpage** en lots supplémentaires : `decouper_bien`. Un lot loué ne se redécoupe pas (RM-0.3.8). Les nouveaux
  lots héritent des propriétaires du lot d'origine (RM-0.3.6). Toute variation du nombre de lots invalide la
  [[Clé de répartition]] (RM-0.3.3).
- **Adresse verrouillée** dès qu'un lot du bien est loué ou en préavis : déclencheur `verifier_bien_verrouille`
  (RM-0.5.1 ; la modification passe par un avenant).
- **Retrait = archivage** (`retirer_bien`, `retablir_bien`, `20260927162000`), jamais suppression
  ([[Archivage plutôt que suppression]]). Le retrait est refusé si le bien porte un bail en cours, en préavis ou en
  préparation, ou un lot sous mandat actif. Il est réservé à l'administrateur d'agence ou au propriétaire en gestion
  directe. L'effet du retrait sur l'abonnement : voir [[Abonnement]].

## Le lot et sa machine à états

Table `lots` (même migration) : `bien_id`, `nom`, `etat`, `surface_m2`, `pieces`, `surface_carrez`, `meuble`,
`etage`, `description`, `tantieme`. S'y ajoutent ensuite `identifiant_fiscal`, `chauffage`, `eau_chaude`,
`locaux_privatifs` et `colocation_loyer_reference`. La **détention** (propriétaire ↔ lot, quote-parts datées, jamais
supprimées) est la table `detentions` ; la somme des quote-parts actives ne dépasse jamais 100 % (RM-0.2.1). Détail :
[[Lot]].

**États** (`lot_etat`) : `brouillon`, `disponible`, `loue`, `preavis`, `archive`. Transitions admises par
`verifier_transition_lot`, dans sa version en vigueur (`20260914180000`, complétée par `20261120190000`) :

| Depuis | Vers |
|---|---|
| `brouillon` | `disponible` (aucun blocage de mise en location), `loue` (bail déjà en cours activé par son contrat signé, décision du 20/11), `archive` |
| `disponible` | `brouillon`, `loue`, `archive` |
| `loue` | `preavis`, `disponible` |
| `preavis` | `loue`, `disponible` |
| `archive` | `brouillon` : réactivation par l'administrateur d'agence, le propriétaire en gestion directe ou le super admin (RM-0.9.4) |

**Le bail fait foi, le lot suit** (`20260910176000_coherence_etat_lot_et_bail.sql`). Un bail actif impose « loué »,
un bail en préavis impose « préavis ». Sans bail en cours, le lot n'est ni « loué » ni « en préavis ». Un déclencheur
différé sur `lots` et `baux` refuse toute transaction qui laisserait un lot en désaccord avec son bail. Le départ du
locataire ne se décrète donc pas depuis le lot. Il se constate sur le bail : congé (`enregistrer_conge`), puis clôture
(`terminer_bail`), qui exige l'état des lieux de sortie signé (RM-3.11.2) et remet le lot en « disponible ».

**Blocages de mise en location** (`lot_blocages_location`) : nom et surface ; détention à exactement 100 % ; DPE
valide au lot pour une habitation ; ERP valide au bien ; aucun diagnostic déposé expiré ; clé de répartition valide si
le bien a plusieurs lots. Depuis le 20/11 (`20261120190000`), les diagnostics **manquants** ne bloquent plus un bail
dont la date d'entrée est passée : ils restent signalés dans les actions à mener du bail.

## L'occupation : par les baux

L'occupation d'un logement n'est pas un attribut du bien. Elle se lit dans les baux du lot (table `baux`,
`20260731_sprint4_bail_fondation.sql`) :
- **États du bail** (`bail_etat`) : `brouillon`, `actif`, `preavis`, `termine`. Un bail « actif » ou « en préavis » est
  un bail **vivant**. Il occupe le lot.
- **Qui occupe** : `locataire_principal`, plus les colocataires et les garants de `bail_personnes` (rôles
  `colocataire` et `garant`).
- **Montants** : `loyer_hc`, `charges`, `depot_garantie` (en euros, `numeric(10,2)`), `jour_echeance`.
- **Sortie** : `date_sortie_reelle`, posée à la clôture du bail. Un nouveau bail n'entre pas avant la sortie réelle du
  précédent sur le même lot, ou sur la même chambre (`20261014121000`).
- **Un seul bail vivant par logement entier** (index `baux_un_seul_vivant_par_lot`).
- **Colocation à contrats individuels** (`20260914180000`) : un lot peut avoir des chambres (`lot_chambres`), chacune
  louée par son propre bail (`baux.chambre_id`, index `baux_un_seul_vivant_par_chambre`). La somme des loyers des
  contrats individuels ne dépasse pas le loyer de référence du logement entier (`colocation_loyer_reference`). Un
  bail du logement entier et un contrat de chambre ne vivent pas en même temps sur le lot
  (`controler_contrat_individuel`).
- **Lecture à l'écran** : `occupationLot` (`app/src/lib/occupation-lot.ts`) compte les contrats vivants, dit si le
  logement entier est occupé, et compte les chambres louées et les chambres sans bail. Des chambres préparées dans un
  logement loué en entier ne sont pas vacantes.

Voir [[Bail]] (l'ancienne page « Occupation d'un bien » y est fusionnée).

## Relations

- Relève d'**une** [[Organisation]] (`organization_id` obligatoire) : une agence, ou l'espace d'un propriétaire en
  gestion directe (`organization_type` : `agence`, `proprietaire_direct`). En agence, le [[Propriétaire bailleur]] est
  une fiche personne détentrice des lots, liée par un [[Mandat de gestion]].
- Porte un ou plusieurs [[Lot|lots]] ; chaque lot porte ses baux ([[Bail]]).
- [[Diagnostic|Diagnostics]] : au bien (ERP…) ou au lot (DPE…), jamais aux deux (contrainte
  `diagnostics_un_seul_niveau`). [[Clé de répartition]] au bien. [[Appel de charges|Appels de charges]] de copropriété.
- [[Incident|Incidents]] : sur un lot, ou sur les parties communes du bien (`incidents.bien_id`, `20261101161444`).
- Annonces d'immeuble aux locataires (`annonces.bien_id`, `20260905120000`).
- Schéma d'ensemble : [[Modèle de données]] ; machines à états : [[Machines à états et événements]] ; ancienne notion
  de regroupement : [[Patrimoine et résidences]].

## Commune et zone tendue (audit de gestion du 29/09/2026)

- **Commune (réseau d'artisans)** : le formulaire du bien propose les communes desservies par le code postal
  (référentiel officiel). Une seule commune possible, ou une seule au nom de la ville saisie, est présélectionnée.
  Pour les biens existants, le geste groupé « Confirmer les communes évidentes » (page Réseau) confirme bien par bien
  les cas sans ambiguïté. La comparaison du nom de ville tolère la casse, les accents, les tirets, « St »/« Saint »,
  l'arrondissement et « Cedex ». Une correction d'adresse **ne fait plus perdre** la commune tant qu'elle reste
  cohérente. Depuis le 23/10, le réseau suit la zone choisie par l'artisan, mais la commune du bien reste à confirmer
  ([[Demande et sélection de devis]]).
- **Zone tendue** : trois réponses, oui, non ou **non vérifiée** (voir [[Bail]]).

Source : [[Audit complet du 29 septembre 2026]].

> [!warning] Points à trancher / contradictions
> - ~~Pas de vraie table « bail »~~ → **levé** : la table `baux` existe depuis le 31/07
>   (`20260731_sprint4_bail_fondation.sql`).
> - ~~États du code ≠ registre V3~~ → **levé** : le lot a les cinq états du module 0 (brouillon, disponible, loué,
>   préavis, archivé), avec la réactivation par l'administrateur (RM-0.9.4). L'état « travaux » de l'ancien dépôt
>   n'existe plus.
> - **Écart A5 / module 0 tranché par le code** : le registre A5 pose un archivage définitif et quatre états ; le code
>   suit le module 0 (brouillon et réactivation). Décision du 25/07 citée dans l'en-tête de la migration du 29/07.
> - **Transition « loué → disponible »** : admise par la liste des transitions depuis le 14/09, mais refusée par la
>   garde de cohérence tant qu'un bail vit sur le lot. Le chemin réel reste la clôture du bail.
> - **Patrimoine et résidences** : aucune table dans le schéma actuel. La page [[Patrimoine et résidences]] décrit une
>   notion de l'ancien dépôt (à vérifier si elle a encore un objet).
