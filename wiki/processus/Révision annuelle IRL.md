---
type: process
tags: [irl, revision, loyer, prescription]
status: draft
created: 2026-07-24
updated: 2026-11-25
sources: ["[[2026-07-24-gerimmo-v3-module-3-loyers-et-charges]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "[[Recueil des textes officiels (v6)]]", "[[Référentiel du palier 1]]", "DECISIONS-2026-11-24.md (Q23, Q34, Q43, Q100)", "QUESTIONS.md (Q23, Q34, Q43, Q70 à Q72, Q100)", "JURISTE.md (partie 5, point 6 ; partie 6, point 16 ; partie 7)", "JOURNAL.md (lots 14, 39, 52 et D2, 22-25/11/2026)", "livrables/recueil/analyse-refs-01-09.md (réf. 01) et analyse-refs-10-24.md (réf. 16 et 23)", "code de la branche fusionnée claude/palier-1-fusion (89cb87ff, lecture seule)"]
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

C'est la règle **en production aujourd'hui**. Dans la **version préparée** (décision Q43 du 24/11, section
« Version préparée » plus bas), la date d'effet reste calculée ainsi, mais le loyer révisé n'est appelé qu'à partir du
**premier mois qui commence après la demande**.

## Déroulé

Tâche quotidienne → détection des dates anniversaires → vérification de la clause →
**proposition** du nouveau loyer à l'agent → **validation ou renonciation explicite**
(tracée, RM-3.8.4) → application aux appels suivants + notification du locataire
(courrier) → historisation.

## Garde-fous

| Cas | Comportement |
|---|---|
| **DPE F ou G (passoire thermique)** | **Blocage — révision légalement interdite** depuis août 2022 (RM-3.8.6, confirmé par [[2026-08-05-bailpdf-contrat-de-bail\|BailPDF]] : ni révision ni augmentation, en cours de bail comme au renouvellement ; l'interdiction de **louer** suit son propre calendrier — [[Diagnostic]]). Gerimmo bloque **tout** bail, quelle que soit sa date : voir l'avertissement du 25/11 en fin de page |
| Date anniversaire + 1 an dépassée | **Révision prescrite pour l'année écoulée** : la demande se rattache alors à l'anniversaire suivant ; alerte forte avant expiration ([[Agenda et échéances]]). Version préparée : refus même avec une demande antidatée, date limite affichée |
| Demande après l'anniversaire | **Effet à la date de la demande**, jamais à l'anniversaire passé (pas de rappel rétroactif). Version préparée : loyer révisé appelé à partir du premier mois qui commence après la demande |
| Indice d'un autre trimestre que la référence | **Blocage** — l'IRL comparé est celui du même trimestre |
| Année de bail non révisée (version préparée) | **Pas de rattrapage** : calcul sur un an, l'indice du même trimestre de l'année précédente est demandé |
| Indices invraisemblables (version préparée) | **Refus** si le rapport des deux indices sort de 0,8 à 1,25 — contrôle de saisie, pas une règle de droit (Q71) |
| Bail terminé (version préparée) | **Refus** de la révision |
| IRL en baisse | Le loyer baisse — rare mais légalement dû |
| Dépôt de garantie, provisions | **Jamais modifiés** par la révision (RM-3.8.8, RM-2.1.5) |

## Relations

Consomme le loyer et l'IRL de référence du [[Bail]] ; alimente les
[[Période de loyer|appels de loyer]] suivants ; indices et alertes via
[[Administrateur d'agence]] (module 18) et [[Agenda et échéances]] (module 14) ;
dépend du [[Diagnostic]] DPE du lot. Dans la version préparée, chaque terme porte le loyer qui valait pour lui :
révision par son premier terme révisé, avenant au [[Bail]] par sa date d'effet. Textes fournis :
[[Recueil des textes officiels (v6)]] (réf. 01, 16 et 23, non recontrôlés sur Légifrance) ; règle unifiée du palier 1 :
[[Référentiel du palier 1]].

> [!warning] Points à trancher / contradictions
> - Le parcours 3.8 (module 3) déclenche la révision « à la date anniversaire » et
>   présentait l'effet comme toujours fixé à cette date : c'est vrai seulement si la
>   demande est faite ce jour-là. La règle ci-dessus (effet à la date de la demande
>   quand elle est tardive) vient de l'audit des parcours métier du 29/09 et du texte de l'article 17-1 I ;
>   ce texte n'est pas encore une source ingérée dans `raw/` — à ajouter (Légifrance).
>   → *25/11 : l'article 17-1 figure maintenant dans [[Recueil des textes officiels (v6)]] (réf. 01, en vigueur
>   depuis le 24/08/2022), texte fourni par le dirigeant et non recontrôlé sur Légifrance : la révision « prend effet à compter
>   de sa demande » ; faute de demande dans l'année, le bailleur « est réputé avoir renoncé » pour l'année écoulée.*
> - Une demande antérieure à l'anniversaire (notifiée d'avance) n'est pas saisissable :
>   Gerimmo n'enregistre qu'une demande datée d'une échéance déjà atteinte.

> [!note] Outil public (30/09/2026)
> L'outil gratuit `/outils/calcul-irl` lit la série officielle de l'Insee (IRL
> France métropolitaine, série 001515333) côté serveur et choisit lui-même les
> indices : référence = dernier indice **publié** à la signature (art. 17-1, à
> défaut de clause), nouvel indice = même trimestre, dernière année publiée.
> Corse et outre-mer : indices spécifiques, saisie manuelle. DPE F ou G : révision
> interdite. L'application agence, elle, garde la saisie de l'indice (pas de
> récupération automatique en V1).
>
> **Version préparée (non publiée)** : aucun indice n'est plus écrit dans le code de l'outil, et aucun champ n'est
> prérempli ; l'exemple n'apparaît qu'en texte grisé dans le champ vide (décision du 25/11, Q100). La lettre ne
> s'imprime que si ses six champs sont saisis. L'outil n'a **pas** reçu les règles du lot D2 (année perdue, délai d'un
> an, premier mois révisé) : il peut donner un autre résultat que l'application (Q72, en attente).

> [!info] Jour de référence (depuis le 15/10/2026)
> La date de demande par défaut et le refus d'une demande « future » se comptent au **jour
> de Paris** (PR #189) : avant, une révision datée d'aujourd'hui, saisie après minuit à
> Paris, était refusée comme « Révision anticipée ». Voir [[Le jour de référence est le jour de Paris]].

## État dans l'application au 24/11/2026 (préproduction, non publié) — le mois de l'effet (mission palier 1, phase 3)

Relu dans le code après le lot 39 ([[Mission palier 1 — audit du 22 novembre 2026]] ; `QUESTIONS.md`, Q43 ;
`JURISTE.md`, partie 5, point 6). *Dépassé par la décision Q43 du 24/11 (section suivante) : ces phrases ne restent
imprimées que pour les révisions enregistrées avant la migration `20261124100000`, qui n'ont pas de « premier terme ».*
**Le calcul n'est pas modifié** ; la lettre de révision dit désormais ce qui se passe :
- Gerimmo ne change que le loyer du [[Bail]] ; les termes appelés **ensuite** portent le loyer révisé, chacun pour le
  mois entier. La lettre dit à partir de quel terme (« Le loyer révisé est appelé à compter du terme de … »), et ajoute
  « pour le mois entier, y compris du … au …, avant la date d'effet » quand ce terme commence avant la date d'effet.
- Un terme **déjà appelé** avant l'enregistrement de la révision reste à l'ancien loyer : la lettre dit « aucun
  complément n'est appelé pour la période du … au … » en cas de hausse, « aucune déduction n'est appliquée » en cas de
  baisse.
- Un loyer révisé égal au précédent : la lettre dit que la révision ne modifie le montant d'aucun terme.

> [!warning] Points à trancher / contradictions (24/11/2026)
> - **« Jamais rétroactive » (section ci-dessus) et mois entier** : quand le terme est appelé après la révision, le mois
>   entier est au nouveau loyer, jours d'avant l'effet compris. Est-ce compatible avec l'absence de rétroactivité ? Et
>   écrire « aucun complément n'est appelé » vaut-il renonciation du bailleur à la différence ? (juriste, point 6). À
>   trancher par le dirigeant : complément ou avoir au prorata de la date d'effet, ou révision appliquée au terme
>   suivant (Q43).
>   → *Tranché le 24/11 par le dirigeant (Q43) : « la révision ne s'applique jamais à des jours antérieurs à la demande
>   du bailleur. Applique-la au premier terme qui suit la demande et écris-le dans la lettre. » Appliqué dans la version
>   préparée (section suivante). La question de la renonciation reste posée au juriste (`JURISTE.md`, partie 7,
>   point 2).*

## Version préparée, à publier (état au 25/11/2026) — décisions Q23, Q34 et Q43 (lot D2)

> [!info] Ce qui est en production et ce qui ne l'est pas
> Rien de cette section n'est en production : la production sert la version du 21/11/2026 (`81740dec`), gelée depuis
> le 22/11. Ce qui suit est lu dans le code de la branche fusionnée `claude/palier-1-fusion` (`89cb87ff`, complétée par `ee28d874`, vérifiée en entier sur le banc et poussée le 25/11 sur la branche de préproduction,
> non publiée en production ; `JOURNAL.md`, entrée du 25/11) et dans `JOURNAL.md` (lots 14 et D2),
> `QUESTIONS.md` (Q23, Q34, Q43, Q70 à Q72) et `JURISTE.md` (partie 7). Aucun point de droit n'est donné pour acquis.

- **Rappel et indice** (lot 14) : un rappel « Révision annuelle du loyer possible » paraît dans « À faire » dès la date
  anniversaire, pendant 60 jours, sauf pour un bail en préavis, un loyer déjà révisé ou un logement dont le dernier DPE
  est classé F ou G. Un bouton « Chercher l'indice publié par l'Insee » propose l'indice de la série officielle, avec
  la source et le jour de lecture ; si l'Insee ne répond pas, la saisie à la main reste possible. La lecture réelle chez
  l'Insee n'a pas été vérifiée.
- **Date limite** (Q23) : la révision d'une année se demande jusqu'à la **veille de l'anniversaire suivant** (révision
  le 15/10/2025 : jusqu'au 14/10/2026). La date limite est affichée ; un **second rappel** paraît dans les 30 jours qui
  la précèdent ; passé ce jour, la révision de cette année-là est **refusée**, même avec une demande antidatée. La même
  date limite apparaît au calendrier du [[Propriétaire bailleur]] (Q34, [[Agenda et échéances]]).
- **Premier terme révisé** (Q43) : le loyer révisé s'applique au premier terme (mois civil) qui commence **après la date
  de la demande**, **après le jour de l'enregistrement** (une demande antidatée ne fait pas gagner un mois) et qui n'est
  pas déjà appelé. Demande le 15/10 : novembre ; demande le 03/12 : janvier. Les termes d'avant ne changent pas : ni
  complément, ni déduction, en hausse comme en baisse. La lettre le dit : « Le loyer révisé ne s'applique à aucun jour
  antérieur à la demande. Il s'applique à partir du terme de … ». Le premier terme est écrit sur la révision
  (`revisions_loyer.premier_terme`). Tant que ce mois n'est pas commencé, l'attestation de loyer, le récapitulatif pour
  la CAF et l'espace du [[Locataire]] donnent les deux montants (`JURISTE.md`, partie 7, point 5).
- **Calcul toujours sur un an** : nouveau loyer = loyer × indice de l'échéance ÷ indice du même trimestre de l'année
  précédente. L'indice attendu est exactement celui de l'échéance (ni celui de la révision suivante, ni un plus ancien).
  Après une année non révisée, l'indice de l'année précédente est demandé et l'année perdue n'est pas rattrapée
  (exemple du journal : bail du 15/10/2023, 700 €, rien en 2024, révision en 2025 : 720,39 € et non 742,00 €).
- **Lettre** (lot 52, lot T2) : elle cite la date de la demande, les indices à deux décimales et l'origine de l'indice
  de référence ; le renvoi à la fiche Service-Public est retiré de la lettre au locataire ; l'ancienne rédaction ne
  cite plus « rédaction issue de la loi n° 2014-366 » (écart R01-A3 du recueil).
- **Aucune ligne existante n'est réécrite** : révisions, appels de loyer et baux déjà enregistrés gardent leurs valeurs.
- À la publication, les migrations du lot D2 (`20261124100000` à `20261124170000`) passent avant le code.

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Fiche officielle, texte fourni et règle de Gerimmo** : la fiche Service-Public lue le 24/11 dit que le loyer révisé
>   s'applique « à partir de la date de la demande » ; l'article 17-1 du [[Recueil des textes officiels (v6)]] (non
>   recontrôlé sur Légifrance) dit qu'elle « prend effet à compter de sa demande ». La version préparée applique le
>   loyer révisé plus tard (premier mois suivant), au bénéfice du locataire : faut-il l'écrire comme une renonciation ?
>   (`JURISTE.md`, partie 6, point 16 et partie 7, point 2).
> - **Gel en classe F ou G et date du bail** (écarts R01-A1 et R23-A1 du recueil, non corrigés) : selon le texte fourni
>   (art. 17-1 III ; loi n° 2021-1104, art. 159 IV), le gel ne vise que les contrats conclus, renouvelés ou reconduits
>   depuis le 24/08/2022 (outre-mer : après le 01/07/2024). Gerimmo refuse la révision pour **tout** bail F ou G, y
>   compris un bail de six ans plus ancien non encore reconduit : plus sévère que le texte, au détriment du bailleur. À
>   décider par le dirigeant (corriger ou l'écrire comme une prudence).
> - **Date de révision convenue** (R01-A2) : Gerimmo révise toujours à la date anniversaire ; un bail repris qui prévoit
>   une autre date ne peut pas être suivi. **Bail repris en cours** : l'indice inscrit peut être celui d'origine ou un
>   indice déjà mis à jour ; Gerimmo préfère refuser que calculer faux (Q70).
> - **Indice « saisi manuellement » (décision actée, section Prérequis)** ≠ version préparée, qui propose l'indice lu
>   chez l'Insee (le gérant le valide ou le saisit lui-même).
> - Restent au juriste (`JURISTE.md`, partie 7, points 1, 3 et 4) : le calcul sur un an après une année perdue ; la
>   date de la demande (celle que le bailleur saisit, sans preuve d'envoi ni de réception) ; le dernier jour du délai
>   d'un an (veille de l'anniversaire ou anniversaire lui-même). Le texte fourni (art. 7-1, réf. 16) dit seulement que
>   l'action « est prescrite un an après la date convenue par les parties dans le contrat de bail pour réviser ledit
>   loyer ».
