---
type: concept
tags: [patrimoine, immobilier]
status: in-progress
created: 2026-07-21
updated: 2026-07-21
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Patrimoine et résidences

**Définition :** les deux niveaux de regroupement au-dessus du [[Bien]] dans la hiérarchie
du parc immobilier d'une [[Organisation]].

## Patrimoine (`patrimoines`)
- Regroupement de plus haut niveau d'un portefeuille de biens au sein d'une organisation.
- Attributs : `name`, `reference`.

## Résidence (`residences`)
- Ensemble immobilier (immeuble, copropriété) rattaché à un patrimoine ; **porte l'adresse**.

## Hiérarchie
```
Organisation
  └── Patrimoine (obligatoire)
        └── Résidence (immeuble/copropriété — optionnel)
              └── Bien (lot : appartement, maison, local, parking…)
```
Un [[Bien]] appartient **toujours** à un patrimoine ; le rattachement à une résidence est optionnel.

## Rôle dans le métier
- Structurer et regrouper le parc pour la gestion, le reporting et les documents.

## Relations
- Contient des [[Bien|biens]]. Géré par [[Administrateur d'agence]], [[Agent immobilier]], [[Propriétaire bailleur]].
- Voir [[Modèle de données]].

> [!warning] Points à trancher / contradictions
> - Le doc cible parlait de `properties` : nomenclature non suivie, se référer aux tables réelles.
>