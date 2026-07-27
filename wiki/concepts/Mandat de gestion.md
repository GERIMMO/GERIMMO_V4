---
type: concept
tags: [mandat, honoraires, seuil-delegation, agence]
status: draft
created: 2026-07-24
updated: 2026-07-24
sources: ["[[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion]]"]
---

# Mandat de gestion

**Définition :** le contrat entre le [[Propriétaire bailleur|propriétaire]] (mandant)
et l'agence, portant sur **des [[Lot|lots]], jamais des biens** (RM-5.1.1) — le pivot
qui fonde tout : « sans mandat, pas de bail à signer, pas de loyer à encaisser, pas
d'honoraires à percevoir. »
Source : [[2026-07-24-gerimmo-v3-module-5-mandat-de-gestion|Module 5]].

## Structure

**Mandat** (rattaché à la personne) + **lignes de mandat** (un lot couvert, avec **son
propre taux d'honoraires** — dégressif possible, RM-5.1.4, et ses dates
d'entrée/sortie). Un lot n'a **qu'un mandat actif à la fois** (RM-5.1.3) ; seuls les
lots dont la personne est propriétaire sont intégrables ; retrait bloqué si bail actif
(RM-5.2.1) ; toute modification de composition ou de paramètre passe par **avenant
signé, sans rétroactivité** (RM-5.2.2, RM-5.3.5). Un immeuble à trois propriétaires =
trois mandats, trois rapports.

## Les trois paramètres décisifs (5.3)

| Paramètre | Portée | Défaut | Impact |
|---|---|---|---|
| **Taux d'honoraires** | **Par lot** | 7 % | Écritures d'honoraires ([[Comptabilité]], RM-4.2.3) |
| **Date de rapport** | Mandat | Le 10 | Clôture + rapport mensuel (module 6) |
| **Seuil de délégation** | Agence, **surchargeable par mandat** | 500 € | [[Devis]] 9.5 — sous le seuil l'agent décide seul, au-dessus il consulte le propriétaire (**hors plateforme**, accord tracé — le mandant n'a pas d'accès) |

Également : durée (1 an, plafonnée à 10), préavis de résiliation (3 mois),
**honoraires de location** — part locataire **plafonnée au m² selon la zone**
(EDL 3 €/m² max), dépassement en **alerte non bloquante** (RM-5.3.7).

## Cycle de vie

brouillon → à signer → **actif** → préavis → résilié (machine A5). **Signature
électronique V1** (module 13) : le mandant **signe par email via Yousign sans jamais
entrer dans l'application** (RM-5.6.2), avant l'agence ; **le mandat signé active la
gestion des lots** (RM-5.6.1). Renouvellement : alerte à **4 mois** du terme (3 mois
de préavis + 1 de discussion), reconduction tacite. Résiliation (3 mois) : **les baux
continuent** (RM-5.5.2) mais les lots n'alimentent plus aucun rapport (RM-5.5.3) —
**dernier rapport + récapitulatif fiscal émis avant extinction** (RM-5.5.4).
Vente de tous les lots : mandat sans objet. Décès : hors périmètre, traitement manuel.

## Relations

Lie [[Propriétaire bailleur]] (mandant) et l'agence sur des [[Lot|lots]] ; conditionne
le [[Bail]] (alerte si mandat non actif) ; pilote la [[Comptabilité]] (taux, date de
rapport) et le rapport propriétaire (module 6) ; borne la sollicitation sur
[[Devis]] (seuil) ; signé via le module 13 ; alertes au module 14
([[Agenda et échéances]]).
