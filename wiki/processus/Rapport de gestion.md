---
type: process
tags: [rapport, mandat, versement, rectificatif, fiscalite]
status: draft
created: 2026-07-24
updated: 2026-07-25
sources: ["[[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite]]", "[[2026-07-24-gerimmo-v3-a6-doctrine-financiere]]"]
---

# Rapport de gestion

**En une phrase :** le document mensuel envoyé au [[Propriétaire bailleur|propriétaire
mandant]] — **son seul contact avec le service** (« c'est à travers lui qu'il juge la
qualité — et décide de renouveler son mandat »).
Source : [[2026-07-24-gerimmo-v3-module-6-rapport-et-fiscalite|Module 6]].

## La chaîne de génération

1. À la **date de rapport propre au [[Mandat de gestion|mandat]]** (RM-6.1.1), le
   système vérifie la **clôture comptable** — non clôturé = **blocage** (RM-6.1.2,
   renvoi au 4.4, [[Comptabilité]]).
2. Rapport généré « à valider » (même sans mouvement, RM-6.1.3) → **l'agent relit,
   peut commenter, valide et envoie** — jamais d'envoi automatique (RM-6.2.3).
3. **Figé définitivement à l'envoi** (RM-6.2.4) ; transmis par email (le mandant n'a
   aucun accès) ; **alerte de versement à J+15** programmée.

## Structure (RM-6.2.1/2)

**Un feuillet par bien** (recettes encaissées par lot, dépenses par famille,
honoraires au taux de la ligne, **net du bien**, impayés signalés jamais comptés,
incidents ouverts) + **récapitulatif consolidé** (net global à reverser) + **annexe**
(détail des écritures). Net négatif = appel de fonds.

## Le versement

Virement hors application, mais **enregistré** (date, montant) et rapproché du net
annoncé ; écart = alerte ; **aucun versement enregistré à J+15 = alerte** (RM-6.2.7).

## Ce qui fait foi dans un rapport (A6, 2026-07-24)

Le [[2026-07-24-gerimmo-v3-a6-doctrine-financiere|livrable A6]] le précise : le
rapport porte ce sur quoi **Gerimmo fait foi** (imputations, honoraires calculés,
**net dû** au propriétaire) et des saisies **déclaratives** dont la banque reste
juge (montants et dates réellement reçus, versement effectué). C'est parce qu'un
rapport envoyé **engage l'agence** que les écritures qui le composent sont
**immuables dès leur création** (RM-A6.3) : « si elles peuvent être modifiées après
coup, plus rien ne permet d'expliquer un montant contesté six mois plus tard ».
D'où le circuit rectificatif ci-dessous — et la réouverture de période impossible
après envoi (RM-4.4.6, RM-A6.9).

## Le rectificatif (6.3)

Un rapport envoyé **ne se modifie jamais** : correction comptable par
**contre-écriture** (RM-4.4.3), puis rapport **rectificatif daté, motif obligatoire**
transmis au propriétaire ; l'original reste consultable marqué « rectifié le … » ;
rectificatifs successifs possibles. « Le modifier silencieusement créerait deux
versions d'un même document sans que personne ne sache laquelle fait foi. »

## Le récapitulatif fiscal annuel (6.4)

**Calé sur les rubriques de la déclaration 2044** — aide à la déclaration, pas
déclaration (télétransmission, calcul d'impôt, conseil : hors périmètre). Agrégé sur
la **date de pièce** (le rapport mensuel suit la date d'imputation — RM-4.1.2) :
recettes brutes, charges récupérées, frais d'administration (honoraires), assurances
PNO/GLI, réparations, **charges de copro non récupérables uniquement**, taxe
foncière. **Fonds travaux ALUR signalé à part** (déductible l'année des travaux, pas
du versement) ; **intérêts d'emprunt non suivis** (rubrique vide, à compléter par le
propriétaire). Ne couvre que la période sous mandat ; émis avant extinction si
résiliation (RM-5.5.4). Utile aussi au propriétaire direct. Voir [[Fiscalité]].

## Relations

Consomme : [[Comptabilité]] (clôture, écritures), [[Mandat de gestion]] (date, taux),
[[Quittancement des loyers]]/[[Relances et mise en demeure]] (loyers, impayés),
[[Appel de charges]] (part non récupérable), [[Incident|incidents]] ouverts.
Transmis via [[Document]] (module 12) ; alerte de versement au module 14
([[Agenda et échéances]]).
