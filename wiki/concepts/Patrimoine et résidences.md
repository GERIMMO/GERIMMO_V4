---
type: concept
tags: [patrimoine, immobilier, renvoi]
status: stable
created: 2026-07-21
updated: 2026-11-26
sources: ["[[Dépôt Gerimmo-V3]]", "app/supabase/migrations (état du 26/11/2026)"]
---

# Patrimoine et résidences

> [!info] Page de renvoi : notion V3 absente du code (constat du 26/11/2026)
> Il n'y a aucune table `patrimoines` ni `residences` dans `app/supabase/migrations`
> (recherche du 26/11/2026 sur les 576 migrations). La notion est remplacée par le couple
> **[[Bien]] / [[Lot]]**.

## Ce que c'était en V3
Dans le [[Dépôt Gerimmo-V3]], deux niveaux regroupaient les biens d'une [[Organisation]] :
- `patrimoines` : le portefeuille de biens, avec `name` et `reference`. Ce niveau était
  obligatoire.
- `residences` : l'immeuble ou la copropriété, qui portait l'adresse. Ce niveau était
  facultatif.

Hiérarchie V3 : Organisation > Patrimoine > Résidence > Bien.

## Ce qui le remplace aujourd'hui
La hiérarchie compte deux niveaux sous l'organisation :

```
Organisation (organizations)
  └── Bien (biens) : unité physique. Adresse, type, copropriété, syndic
        └── Lot (lots) : unité locative. Bail, loyer, propriétaires, mandat
```

- **`biens`** (`app/supabase/migrations/20260729_sprint2_parc_biens_lots.sql`) :
  - il porte l'adresse (`address_line1`, `postal_code`, `city`) ;
  - son `type` vaut `appartement`, `maison`, `immeuble`, `local`, `parking`, `terrain` ou
    `autre`. La valeur `immeuble` a été ajoutée par `20260802_bien_type_immeuble.sql` ;
  - il porte la copropriété : `copropriete`, `syndic_nom`, `syndic_email` et
    `reference_copropriete` (`20260801_s8_copropriete_appels_charges.sql`).

  Un immeuble ou une copropriété est donc **un bien découpé en lots**. C'est ce qui
  remplace la « résidence ».
- **`lots`** : `bien_id` est obligatoire. La clé composite `lots_bien_meme_org_fk` impose que
  le lot et son bien soient dans la même organisation
  (`20260730_sprint2_revue2_integrite_inter_agences.sql`). Tout bien naît avec un lot
  unique (RM-0.1.2).
- **Regrouper des biens** : il n'y a plus de niveau « patrimoine ». Les regroupements
  existants passent :
  - par l'organisation elle-même ;
  - par propriétaire, avec `detentions` (lot ↔ personne, quote-part) ;
  - par mandat, avec `mandat_lignes`.

## Attention au mot « patrimoine » dans le code actuel
Le mot existe encore, avec deux autres sens. Aucun ne désigne un niveau de regroupement de
biens :
- dans l'interface, « patrimoine » désigne **l'organisation ou l'espace sélectionné** : le
  sélecteur « Changer de patrimoine » mène vers `/espace/<id>`
  (`app/src/components/selecteur-patrimoine.tsx`) ;
- c'est aussi le **nom d'une formule tarifaire** des propriétaires directs, « Patrimoine »,
  jusqu'à 20 biens (`tarif_formules`, `20260928090000_tarification_2026.sql`). Voir
  [[Grille tarifaire]].

Voir : [[Bien]], [[Lot]], [[Organisation]], [[Modèle de données]].
