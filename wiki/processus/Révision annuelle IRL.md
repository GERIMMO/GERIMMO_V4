---
type: process
tags: [irl, revision, loyer, prescription]
status: draft
created: 2026-07-24
updated: 2026-09-29
sources: ["[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-08-05-bailpdf-contrat-de-bail]]"]
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
- **Même trimestre** : l'IRL nouveau est celui du **trimestre de référence du bail**
  (ex. IRL du 2e trimestre → IRL du 2e trimestre de l'année suivante). Gerimmo fait
  saisir le trimestre de l'indice (« T2 2026 ») et refuse un autre trimestre, ou une
  année qui n'avance pas ; un bail ancien sans trimestre lisible prend celui de sa
  première révision (audit des parcours métier du 29/09, art. 17-1 I de la loi du 6 juillet 1989).

## Date d'effet : jamais rétroactive

Règle corrigée le 29/09 (art. 17-1 I de la loi n° 89-462, rédaction issue de la loi
ALUR) :

- demandée **à la date anniversaire** (date convenue au bail), la révision prend
  effet à cette date ;
- demandée **après**, elle prend effet **à la date de la demande** — **aucune
  rétroactivité** ;
- le bailleur dispose d'**un an** après la date anniversaire pour la demander ; passé
  ce délai, il est réputé y avoir renoncé pour l'année écoulée.

**Date d'effet = max(date anniversaire, date de la demande).** Gerimmo saisit la
**date de la demande** (par défaut le jour même, jamais dans le futur), retrouve
l'échéance (dernière date anniversaire atteinte à la demande) et conserve les trois
dates sur la révision. La lettre de révision dit « à compter du » la date d'effet
réelle et, pour une demande tardive, précise qu'elle prend effet à la date de la
demande, sans effet rétroactif. Une seule révision **par année de bail** (entre deux
anniversaires) : une révision tardive n'empêche pas celle de l'anniversaire suivant.
Auparavant, la date d'effet était forcée à l'anniversaire, même pour une révision
demandée des mois plus tard — un rappel rétroactif interdit.

## Déroulé

Tâche quotidienne → détection des dates anniversaires → vérification de la clause →
**proposition** du nouveau loyer à l'agent → **validation ou renonciation explicite**
(tracée, RM-3.8.4) → application aux appels suivants + notification du locataire
(courrier) → historisation.

## Garde-fous

| Cas | Comportement |
|---|---|
| **DPE F ou G (passoire thermique)** | **Blocage — révision légalement interdite** depuis août 2022 (RM-3.8.6, confirmé par [[2026-08-05-bailpdf-contrat-de-bail\|BailPDF]] : ni révision ni augmentation, en cours de bail comme au renouvellement ; l'interdiction de **louer** suit son propre calendrier — [[Diagnostic]]) |
| Date anniversaire + 1 an dépassée | **Révision prescrite pour l'année écoulée** : la demande se rattache alors à l'anniversaire suivant ; alerte forte avant expiration ([[Agenda et échéances]]) |
| Demande après l'anniversaire | **Effet à la date de la demande**, jamais à l'anniversaire passé (pas de rappel rétroactif) |
| Indice d'un autre trimestre que la référence | **Blocage** — l'IRL comparé est celui du même trimestre |
| IRL en baisse | Le loyer baisse — rare mais légalement dû |
| Dépôt de garantie, provisions | **Jamais modifiés** par la révision (RM-3.8.8, RM-2.1.5) |

## Relations

Consomme le loyer et l'IRL de référence du [[Bail]] ; alimente les
[[Période de loyer|appels de loyer]] suivants ; indices et alertes via
[[Administrateur d'agence]] (module 18) et [[Agenda et échéances]] (module 14) ;
dépend du [[Diagnostic]] DPE du lot.

> [!warning] Points à trancher / contradictions
> - Le parcours 3.8 (module 3) déclenche la révision « à la date anniversaire » et
>   présentait l'effet comme toujours fixé à cette date : c'est vrai seulement si la
>   demande est faite ce jour-là. La règle ci-dessus (effet à la date de la demande
>   quand elle est tardive) vient de l'audit des parcours métier du 29/09 et du texte de l'article 17-1 I ;
>   ce texte n'est pas encore une source ingérée dans `raw/` — à ajouter (Légifrance).
> - Une demande antérieure à l'anniversaire (notifiée d'avance) n'est pas saisissable :
>   Gerimmo n'enregistre qu'une demande datée d'une échéance déjà atteinte.
