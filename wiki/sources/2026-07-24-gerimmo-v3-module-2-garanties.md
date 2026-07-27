---
type: source
tags: [depot-de-garantie, caution, garant, visale, gli, vetuste, restitution, module-2]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-2-Garanties.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 2 : Garanties

**En une phrase :** les trois manières de sécuriser le bailleur — [[Dépôt de garantie]],
caution et garanties externes ([[Garantie]]) — et le parcours le plus exposé du module :
la [[Restitution du dépôt de garantie]], à **criticité MAXIMALE** (« délai légal
sanctionné »). 7 parcours, 3 objets (Dépôt de garantie, Garantie, Retenue), 7 US,
11 critères. **Module clos — aucune question ouverte.** Dépend du comparatif d'états
des lieux du module 1 ; alimente le solde de tout compte (3.11) et la comptabilité (4.1).

## Affirmations clés

1. **Le dépôt de garantie n'est pas un solde comptable — décision actée** (RM-2.1.3) :
   un montant **encaissé à l'entrée, restitué à la sortie**. Pas de compte mandant, pas
   de séquestre, pas de suivi d'intérêts — « cohérent avec la [[Comptabilité|comptabilité
   déclarative]] retenue au module 4 ». Seul le dépôt se restitue ; caution et garanties
   externes **s'éteignent avec le bail**. → [[Dépôt de garantie]]
2. **Plafonds légaux bloquants** (RM-2.1.1/2) : 1 mois de loyer **hors charges** en nu,
   2 mois en meublé, interdit en bail mobilité (hors périmètre). Le dépôt n'est **jamais
   révisé en cours de bail** (RM-2.1.5), même après révision du loyer. Versant tiers
   tracé (RM-2.1.4) ; encaissement partiel signalé sans invalider le bail ; **Visale
   peut se substituer au dépôt, qui reste à zéro** (RM-2.3.3).
3. **La caution est rattachée à un bail, jamais à une personne en général** (RM-2.2.1 —
   confirme RM-0b.3.3) : le garant est une personne du [[Dossier locataire|module 0b]],
   son engagement est par bail. **Solidaire par défaut** (cas majoritaire, RM-2.2.2) ;
   **l'acte de cautionnement signé conditionne l'activation** (RM-2.2.3), signature
   électronique Yousign via le module 13 (RM-2.2.6). En colocation, chaque garant couvre
   un colocataire identifié et **son engagement s'éteint avec la solidarité de celui-ci**
   (RM-2.2.4/5, cohérent RM-1.3.8). → [[Garantie]]
4. **Garanties externes enregistrées sans aucune intégration** (RM-2.3.1) : Visale, GLI,
   caution bancaire, garantie employeur — Gerimmo trace l'existence et les
   caractéristiques ; vérification en ligne et déclaration de sinistre restent hors
   application. Plusieurs garanties peuvent coexister sur un bail (RM-2.3.2).
5. **Restitution (2.4) : le délai court depuis la remise des clés** (RM-2.4.1), pas
   depuis l'EDL — **1 mois sans écart, 2 mois avec écarts** (RM-2.4.2). Rappel bloquant :
   **sans EDL d'entrée, aucune retenue** (RM-2.4.3 = RM-1.13.4), restitution intégrale
   imposée. **Les impayés s'imputent sur le dépôt avant les dégradations** (RM-2.4.7) ;
   provision de **20 % max** si régularisation de charges en attente (RM-2.4.8) ;
   retenue > dépôt → créance sur le locataire (module 3) ; colocation → restitution
   unique conjointe. → [[Restitution du dépôt de garantie]]
6. **Décote de vétusté linéaire, grille par défaut modifiable — décision actée**
   (RM-2.4.4/9) : chaque type d'élément porte une durée de vie (peinture 7 ans, sol
   souple 10, parquet 25…), part amortie au prorata de l'âge, sans palier — « la décote
   linéaire est celle que retiennent les tribunaux ». **Élément amorti = blocage, zéro
   retenue** (RM-2.4.5). Grille paramétrée au module 18, sans effet rétroactif.
   → [[Vétusté et décote]]
7. **Retenue sans justificatif : acceptée avec alerte explicite** (RM-2.4.6, décision
   actée) — « difficilement défendable en cas de contestation », l'absence est tracée.
8. **Le locataire ne voit aucune retenue avant l'arrêté du décompte** (RM-2.6.2) — un
   montant provisoire affiché puis modifié créerait attente injustifiée et contestation.
   Il voit montant/date du dépôt dès l'encaissement (RM-2.6.1) et l'identité de son
   garant. Le décompte reçu détaille chaque retenue (coût, âge, décote — RM-2.7.1),
   justificatifs accessibles (RM-2.7.2) ; **décompte figé après envoi**, correction =
   décompte rectificatif (RM-2.7.3).
9. **Reports et hors périmètre** : litige structuré sur retenue → **V2** (en V1 :
   messagerie module 15 + traçage) ; pénalité de retard de 10 % par mois, intégrations
   Visale/GLI et commission de conciliation → **hors périmètre**.

## Décisions actées

Grille de vétusté par défaut modifiable · décote linéaire sans palier · retenue estimée
acceptée avec alerte · dépôt suivi comme encaissement, pas comme solde · acte de
cautionnement en signature électronique.

## Ce que ce module impose ailleurs

Module 3 (solde de tout compte intègre dépôt et retenues), module 4 (encaissement et
restitution = deux écritures), module 13 (l'acte de cautionnement y transite),
module 14 (délai de restitution, échéance de garantie — [[Agenda et échéances]]),
module 18 (**la grille de vétusté se paramètre ici**).

> [!warning] Écarts avec le livrable A3 (canal du décompte)
> - Le parcours 2.7 envoie le décompte par **« Email + espace »** ; le
>   [[Notification et valeur probante|livrable A3]] prescrit **« LRAR recommandé »**
>   pour le décompte de restitution. Le module 2 (clos) n'a pas été corrigé.
> - Le champ « **date de première présentation** » (RM-A3.5) manque toujours au
>   module 2 — rattachement prioritaire n° 1 de la
>   [[2026-07-24-gerimmo-v3-matrice-tracabilite|matrice de traçabilité]].

## Pages mises à jour par cet ingest

[[Dépôt de garantie]] (créée) · [[Garantie]] (créée) ·
[[Restitution du dépôt de garantie]] (créée) · [[Vétusté et décote]] (créée) ·
[[Bail]] · [[État des lieux]] · [[Locataire]] · [[Dossier locataire]] ·
[[Agenda et échéances]] · [[Comptabilité]] · [[État du projet et décisions ouvertes]]
