---
type: concept
tags: [occupation, bail, locataire]
status: in-progress
created: 2026-07-21
updated: 2026-07-22
sources: ["[[Dépôt Gerimmo-V3]]"]
---

# Occupation d'un bien

**Définition :** le lien entre une personne et un [[Bien]] sur une période donnée.
Table `bien_occupants`. **Tient lieu de « bail » simplifié** dans le modèle actuel —
un vrai objet [[Bail]] est **décidé** (2026-07-22) mais pas encore implémenté.

## Attributs métier notables
- `occupant_type` : `locataire` / `proprietaire` / `autre`.
- `started_at` / `ended_at` (période d'occupation).

## Rôle dans le métier
- Détermine qui occupe quel bien et depuis quand.
- Les **locations actives** (`occupant_type = 'locataire'`, sans `ended_at`) déclenchent la
  génération des [[Période de loyer|échéances de loyer]] (voir [[Quittancement des loyers]]).

## Relations
- Relie un [[Bien]] à un [[Locataire]] ou un [[Propriétaire bailleur]].
- Voir [[Modèle de données]].

> [!warning] Points à trancher / contradictions
> - **Il n'existe pas encore de vraie entité « bail/contrat de location » dans le code.**
>   Le bail réel est approximé par : `bien_occupants` (dates) + [[Période de loyer]] (loyers
>   mensuels) + un [[Document]] de type `contrat`. **Décision tranchée le 2026-07-22** : un
>   objet [[Bail]] (ALUR, clauses, signature) est acté au périmètre — reste à spécifier son
>   articulation avec `bien_occupants` (migration, qui crée quoi).
>