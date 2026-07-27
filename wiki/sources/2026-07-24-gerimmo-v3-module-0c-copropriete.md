---
type: source
tags: [copropriete, syndic, charges, ventilation, tantieme, module-0c]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-0c-Copropriete.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 0c : Copropriété

**En une phrase :** 6 parcours pour **recevoir l'appel de charges du syndic, le saisir
poste par poste et le ventiler** entre le locataire (récupérable) et le propriétaire
(non récupérable). Criticité maximale — « la ventilation conditionne toutes les
régularisations » ; le parcours 0c.3 est **« le plus critique de tout le projet »**.
**Module clos.** Avec 0 et 0b : **le socle est terminé** (25 parcours, aucune question
ouverte) — le module 1 (Bail) peut commencer.

## Cadrage

**Gerimmo n'est pas un logiciel de syndic** : pas d'AG, pas de comptabilité de
copropriété, pas d'appels de fonds émis. L'agence gère un [[Lot]] dans une copropriété
administrée par un syndic **tiers**.

## Affirmations clés

1. **Circuit en trois acteurs** (décision actée) : le syndic écrit au **propriétaire**,
   qui transmet à l'agence — l'agence n'est pas destinataire directe. Conséquence :
   elle dépend d'un tiers pour un document indispensable, d'où le parcours de
   **relance 0c.6** (« pas un confort, une nécessité »). → [[Appel de charges]]
2. **Deux natures de charges** : **récupérable** (locataire → [[Régularisation des
   charges]] 3.9 — ascenseur, eau, chauffage, ménage) vs **non récupérable**
   (propriétaire → rapport de gestion 6.2 — travaux, honoraires du syndic, fonds
   ALUR). « Une erreur de ventilation ne se voit pas : elle produit une régularisation
   plausible mais fausse » — le locataire à qui on facture le ravalement.
3. **Saisie poste par poste, jamais en montant global** (RM-0c.2.1, décision actée) :
   le locataire peut légalement exiger la justification ligne à ligne. Total des
   postes = total de l'appel (bloquant).
4. **Ventilation assistée par une grille** (fondée sur le **décret 87-713**) : la
   grille propose, l'agent corrige ; un poste inconnu **bloque la validation** tant
   qu'il n'est pas qualifié (RM-0c.3.3) ; un poste mixte se **scinde** (entretien
   récupérable vs remplacement non récupérable — le piège classique) ; chaque
   qualification manuelle est **tracée** et peut **enrichir la grille**.
5. **Le fonds travaux ALUR n'est JAMAIS récupérable** — blocage absolu (RM-0c.3.4),
   règle **système non modifiable** (RM-0c.4.4), et **formulaire de saisie dédié sans
   ventilation** (0c.5) : une protection par la conception.
6. **La ventilation est figée dès qu'une régularisation s'appuie dessus** (RM-0c.3.6) ;
   la grille n'est **jamais rétroactive** (RM-0c.4.3) — même logique que la
   [[Clé de répartition]] datée.
7. **Régularisation bloquée sans appel saisi** (RM-0c.6.4, décision actée) : plutôt
   bloquer que régulariser partiellement (rattrapage inter-exercices, locataire parti
   entre-temps…). Relances : clôture d'exercice → toutes les 3 semaines → **escalade à
   l'admin agence après 3 relances** ; chaque relance **horodatée comme preuve de
   diligence** (RM-0c.6.5) ; renonciation motivée et tracée possible (RM-0c.6.6).

## Objets créés

| Objet | Rattaché à |
|---|---|
| Copropriété (syndic, référence, règlement) | [[Bien]] |
| **Appel de charges** (saisi poste par poste) | [[Lot]] |
| Poste de charge (ventilé) | Appel de charges |
| Grille de récupérables (défaut décret 87-713) | Agence (paramétrée module 18) |

Le **tantième** est porté par le lot (RM-0c.1.1, acté au module 0) : contrôle de
cohérence des appels + clé alternative.

## Décisions actées / reports

Extraction automatique des postes depuis le document : **V2**. Contribution du
locataire aux travaux d'amélioration : **hors périmètre V1** (RM-0c.5.4).
12 user stories, 21 critères.

## Ce que ce module impose ailleurs

Module 3 (régularisation bloquée sans appel), module 4 (deux parts → catégories
comptables distinctes), module 6 (part non récupérable en dépense propriétaire),
module 14 (**cinq seuils de relance**), module 18 (paramétrage de la grille).

## Pages mises à jour par cet ingest

[[Appel de charges]] (créée) · [[Régularisation des charges]] · [[Lot]] ·
[[Clé de répartition]] · [[Agenda et échéances]] · [[Administrateur d'agence]] ·
[[Propriétaire bailleur]] · [[État du projet et décisions ouvertes]]
