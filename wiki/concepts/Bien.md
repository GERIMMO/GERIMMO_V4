---
type: concept
tags: [bien, lot, immobilier]
status: in-progress
created: 2026-07-21
updated: 2026-07-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a5-etats-et-evenements]]", "[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]"]
---

# Bien

**Définition :** l'unité immobilière gérée — appartement, maison, local, parking,
terrain, autre. Table `biens`. **Entité opérationnelle centrale** du métier.

> [!note] Redéfinition V3 (module 0, 2026-07-24)
> Le référentiel V3 distingue le **bien** (unité **physique** : adresse,
> [[Clé de répartition]], [[Diagnostic]]s communs, copropriété) du **[[Lot]]** (unité
> **locative** : propriétaires, bail, loyer, diagnostics privatifs, équipements,
> mandat). Tout bien créé génère automatiquement un « lot unique » (RM-0.1.2) — le
> multi-lots reste invisible dans ~90 % des cas. **La propriété et le bail sont au
> niveau du lot, jamais du bien** (RM-0.2.5). Dans le code actuel, `biens` cumule les
> deux notions.

## Attributs métier notables
- `type`, `status` (`vacant`/`occupe`/`travaux`/`archive`).
- Adresse : `address_line1`, `postal_code`, `city`, `floor`, `surface_m2`, `rooms`.
- Montants (en centimes) : **`monthly_rent_cents`** (loyer), **`monthly_charges_cents`** (charges).

## Rôle dans le métier
- Support de toute l'activité : occupation, loyers, incidents, documents.
- Le loyer mensuel du bien alimente la génération des [[Période de loyer|échéances de loyer]].

## Relations
- Relève d'**une seule** [[Organisation]] : un **propriétaire indépendant** OU une **agence**, jamais
  les deux (pas de « propriétaire client d'une agence » pour l'instant — voir [[Propriétaire bailleur]]).
- Appartient à un [[Patrimoine et résidences|patrimoine]] (obligatoire) et éventuellement à une résidence.
- Occupé via [[Occupation d'un bien]] (`bien_occupants`).
- Cible des [[Incident|incidents]] (`incidents.bien_id` obligatoire).
- Échéances/tâches datées : `bien_echeances` (voir [[Agenda et échéances]]) ; journal des changements : `bien_history`.
- Voir [[Modèle de données]].

## Machine à états du lot (référentiel V3)
Version complète du module 0 : **brouillon** (créé, incomplet) → **disponible**
(champs + [[Diagnostic]]s OK + détention à 100 %) → **loué** ⇄ **préavis** →
**archivé** (réactivation par l'admin agence uniquement, RM-0.9.4).
Interdits : disponible → préavis ; le lot ne passe en **loué** qu'à l'enregistrement
du bail signé. Voir [[Lot]] et [[Machines à états et événements]].

> [!warning] Écart interne au référentiel (A5 vs module 0)
> Le registre A5 donne un lot à **4 états** (sans « brouillon ») et pose l'archivage
> comme **définitif** (« archivé → disponible » interdit), alors que le module 0 ajoute
> l'état **brouillon** et permet la **réactivation par l'admin agence** (RM-0.9.4).
> Le module 0, plus détaillé, semble faire foi — à confirmer.

## Implications pour l'application
- Cycle de vie par statut (`vacant`/`occupe`/`travaux`/`archive`).
- Loyer + charges portés par le bien → repris à la génération des quittances.

> [!warning] Points à trancher / contradictions
> - Pas de vraie table « bail/contrat » : le bail est approximé par [[Occupation d'un bien]] +
>   [[Période de loyer]] + un [[Document]] de type `contrat`.
> - **États du code ≠ registre V3** : `vacant/occupe/travaux/archive` vs
>   disponible/loué/**préavis**/archivé — « préavis » manque en code, « travaux » manque
>   au registre. Correspondance et migration à définir ([[Machines à états et événements]]).
>