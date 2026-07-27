---
type: process
tags: [irl, revision, loyer, prescription]
status: draft
created: 2026-07-24
updated: 2026-07-24
sources: ["[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]"]
---

# Révision annuelle IRL

**En une phrase :** réviser le loyer à la date anniversaire du [[Bail]] selon l'indice
IRL — criticité maximale car **la révision se prescrit par un an** : non demandée dans
l'année, elle est **définitivement perdue** (RM-3.8.5).
Source : [[2026-07-24-gerimmo-v3-module-3-loyers-et-charges|Module 3]], parcours 3.8.
La révision ne nécessite **pas d'avenant** (RM-1.9.3).

## Prérequis et calcul

- **Clause de révision expresse au bail** (sinon : aucune révision, alerte informative).
- **Formule** : nouveau loyer = loyer hors charges × IRL nouveau / **IRL de référence
  figé au bail** (RM-3.8.2). Exemple : 750 € × 148,03 / 145,17 = **764,78 €** (+1,97 %).
- **Indice saisi manuellement par l'[[Administrateur d'agence]]** (module 18, 4 fois
  par an, **historisé** — décision actée : pas de récupération automatique en V1, une
  dépendance externe sur une donnée à valeur juridique ; V2 envisagée). Indice absent =
  blocage.
- Chaque révision **conserve l'indice utilisé** pour rester recalculable (RM-3.8.7).

## Déroulé

Tâche quotidienne → détection des dates anniversaires → vérification de la clause →
**proposition** du nouveau loyer à l'agent → **validation ou renonciation explicite**
(tracée, RM-3.8.4) → application aux appels suivants + notification du locataire
(courrier) → historisation.

## Garde-fous

| Cas | Comportement |
|---|---|
| **DPE F ou G (passoire thermique)** | **Blocage — révision légalement interdite** depuis août 2022 (RM-3.8.6) |
| Date anniversaire + 1 an dépassée | **Blocage — révision prescrite** ; alerte forte avant expiration ([[Agenda et échéances]]) |
| IRL en baisse | Le loyer baisse — rare mais légalement dû |
| Dépôt de garantie, provisions | **Jamais modifiés** par la révision (RM-3.8.8, RM-2.1.5) |

## Relations

Consomme le loyer et l'IRL de référence du [[Bail]] ; alimente les
[[Période de loyer|appels de loyer]] suivants ; indices et alertes via
[[Administrateur d'agence]] (module 18) et [[Agenda et échéances]] (module 14) ;
dépend du [[Diagnostic]] DPE du lot.
