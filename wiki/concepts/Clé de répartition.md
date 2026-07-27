---
type: concept
tags: [cle-repartition, charges, lot, regularisation]
status: draft
created: 2026-07-24
updated: 2026-07-24
sources: ["[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]"]
---

# Clé de répartition

**Définition :** la règle qui découpe une **dépense commune du [[Bien]]** entre ses
[[Lot|lots]] (puis, via la [[Régularisation des charges]], entre les locataires).
**Parcours le plus critique du module 0** : « une clé fausse fausse TOUTES les
régularisations de charges du bien, sur tous les lots, sur tous les exercices. »
Source : [[2026-07-24-gerimmo-v3-module-0-biens-et-lots|Module 0]], parcours 0.4.

![Schéma — une dépense du bien découpée sur les lots par la clé, puis refacturée à chaque locataire](../../raw/assets/GERIMMO-V3-Module-0-Biens-et-lots/media/4c6f2242ab3501d5bd404e8a249003e49351cb30.png)

Exemple : chaudière collective en panne, 3 000 € — la clé découpe la dépense entre les
lots. À 98 %, 60 € ne sont refacturés à personne : **le propriétaire les paie sans le
savoir**, sans aucune alerte — d'où le contrôle bloquant.

## Les règles

| Règle | Énoncé | Bloquant |
|---|---|---|
| **RM-0.4.1** | La somme fait **exactement 100 %** | **Oui** |
| **RM-0.4.2** | **Toute clé est datée** — les documents émis figent la clé en vigueur à leur date | Structurel |
| RM-0.4.3 | Mode par défaut : surface | — |
| **RM-0.4.4** | **Aucun recalcul rétroactif** des régularisations émises | Structurel |
| RM-0.4.5 | Arrondis au centième ; écart résiduel au lot de plus grande surface | — |

Sans clé datée, modifier une répartition invaliderait rétroactivement tous les
décomptes déjà envoyés — « une source de litige directe » (une régularisation contestée
ressortirait avec un montant différent de celui réclamé).

## Les trois modes

| Mode | Calcul | Quand |
|---|---|---|
| **Surface** | Surface du lot / somme des surfaces | **Défaut** — le plus souvent juste |
| **Tantièmes** | Tantièmes / somme des tantièmes | Copropriété avec tantièmes officiels |
| **Parts égales** | 100 % / nombre de lots | Lots identiques |

## Cycle de vie

- L'écran n'apparaît **que** pour un bien multi-lots (lot unique : clé implicite 100 %).
- Déclenché par le découpage (0.3) ou tout changement du nombre de lots — le bien
  retourne en brouillon tant que la clé n'est pas revalidée.
- Modification **bloquée** pendant une régularisation en cours.
- En **copropriété**, le syndic a déjà réparti les charges : la clé sert peu — le
  **tantième stocké sur le lot** sert alors de contrôle de cohérence des
  [[Appel de charges|appels de charges]] et de clé alternative (décision actée,
  module 0c).

## Consommateurs

[[Régularisation des charges]] (parcours 3.9) · [[Comptabilité]] (4.1 — ventilation
d'une dépense commune entre propriétaires de lots) · rapports de gestion (module 6).
