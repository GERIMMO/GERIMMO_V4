---
type: concept
tags: [diagnostic, dpe, obligation-legale, bien, lot]
status: draft
created: 2026-07-24
updated: 2026-08-05
sources: ["[[2026-07-24-gerimmo-v3-module-0-biens-et-lots]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]"]
---

# Diagnostic

**Définition :** document réglementaire daté, rattaché au [[Bien]] ou au [[Lot]] selon
sa nature. Obligation légale : **un diagnostic obligatoire expiré bloque la génération
d'un bail** (RM-0.6.3) et le passage du lot en disponible (RM-0.7.3).
Source : [[2026-07-24-gerimmo-v3-module-0-biens-et-lots|Module 0]], parcours 0.6–0.8.

## Répartition bien / lot

| Diagnostic | Niveau | Validité | Obligatoire si |
|---|---|---|---|
| **DPE** | **Lot** | 10 ans | **Toujours (habitation, RM-0.7.4)** |
| Électricité / Gaz | Lot | 6 ans | Installation > 15 ans |
| Plomb (CREP) | Lot | Illimité si négatif, 6 ans si positif | Construction < 1949 |
| Amiante privatif | Lot | Illimité / 3 ans | Permis < 1997 |
| Amiante parties communes | **Bien** | Illimité / 3 ans | Permis < 1997 |
| **ERP — état des risques** | **Bien** | **6 mois** | **Toujours** |
| Termites | **Bien** | **6 mois** | Zone déclarée par arrêté |

Les diagnostics attendus se déduisent du **type** et de l'**année de construction** du
bien (RM-0.6.1). Attention aux validités courtes : ERP et termites (6 mois) expireront
le plus souvent en production. La surface Carrez n'est **pas** un diagnostic (champ
simple du lot, RM-0.5.7). Sur un bien à lot unique, les onglets bien/lot fusionnent.

## Alertes d'expiration (parcours 0.8, tâche quotidienne)

| Seuil | Niveau | Effet |
|---|---|---|
| **J-90** | Information | Aucun blocage |
| **J-30** | Warning | Aucun blocage |
| **J+0** | **Critique** | **Bloque la création de bail** |

- Lot **déjà loué** : alerte critique **non bloquante** + relance hebdomadaire
  (RM-0.8.3) — « bloquer un bail en cours n'aiderait personne » (**confirmé par
  l'humain le 2026-07-25**).
- Lot **disponible** : bloquant — aucun nouveau bail tant que le diagnostic n'est pas
  redéposé (le dépôt lève le blocage sans autre action, RM-0.8.5).
- Destinataire : l'agent en charge du mandat, à défaut l'admin agence (RM-0.8.4).
  Alimente le module 14 ([[Agenda et échéances]]).

## Passoires thermiques — calendrier Climat et Résilience

Au-delà de l'expiration du DPE, sa **lettre** conditionne le droit même de louer
(loi Climat et Résilience 2021, [[2026-08-05-bailpdf-contrat-de-bail|BailPDF]]) :

| Classe DPE | Interdiction de location (métropole) | Outre-mer (971/972/973/974/976) |
|---|---|---|
| **G** | Depuis le **1er janvier 2025** | **2028** |
| **F** | **2028** | **2031** |
| **E** | **2034** | — |

Le calendrier outre-mer et la formulation exacte (« niveau de performance minimal »)
viennent du rappel de décence imprimé dans le formulaire officiel
([[2026-08-05-bailpdf-modele-bail-non-meuble]], section II).

Le wiki documentait déjà le **gel de révision IRL** pour F/G ([[Révision annuelle IRL]],
RM-3.8.6) ; l'interdiction de louer est plus forte. Depuis 2024, le bail doit en outre
afficher la classe DPE et le calendrier d'interdiction
([[Mentions obligatoires du bail]]).

> [!warning] À trancher
> Le module 0 bloque la création de bail sur DPE **expiré**, pas sur DPE **G** (ni F/E
> aux échéances). Faut-il un blocage — ou au moins une alerte forte — à la création
> d'un bail sur une passoire thermique ? À vérifier sur Légifrance et arbitrer.

## Cycle de vie

Dépôt avec date de réalisation, date d'expiration (obligatoire sauf « illimité »,
RM-0.6.4) et diagnostiqueur ; statut calculé (valide / expire bientôt / expiré) ;
remplacement = l'ancien est archivé ; **historique conservé pendant la gestion du
bien + 5 ans, puis supprimé** (décision du 2026-07-25 — corrige le « indéfiniment »
de RM-0.6.5, contraire à RM-A2.2 ; la traçabilité en litige est couverte par la
prescription). Formats PDF/JPG/PNG. Le diagnostic est **annexé au
bail** ; côté preuve, « le bail fait foi » ([[Notification et valeur probante]]).

## Relations

Conditionne l'état du [[Lot]] et la génération du [[Bail]] · alertes via
[[Agenda et échéances]] (module 14) · stockage et versions : [[Document]].

> [!info] Blocage DPE passoire (ingest bailpdf, 2026-08-01)
> Au-delà de l'expiration, la **classe** du DPE bloque : location d'un logement classé
> **G interdite** (2025), **F** à venir (2028). À ajouter : Gerimmo devrait **bloquer
> la génération / l'activation d'un bail** si DPE = G (alerte si F) — cohérent avec la
> révision IRL déjà bloquée en F/G. Voir [[Documents a generer et automatisation WhatsApp]].
