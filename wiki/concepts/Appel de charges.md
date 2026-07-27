---
type: concept
tags: [copropriete, appel-de-charges, ventilation, syndic, recuperable]
status: draft
created: 2026-07-24
updated: 2026-07-24
sources: ["[[2026-07-24-gerimmo-v3-module-0c-copropriete]]"]
---

# Appel de charges

**Définition :** le document par lequel le **syndic** appelle les charges de
copropriété d'un [[Lot]]. Gerimmo n'étant pas un logiciel de syndic, le module 0c fait
une seule chose : **recevoir l'appel, le saisir poste par poste, et le ventiler** —
récupérable (locataire) ou non récupérable (propriétaire).
Source : [[2026-07-24-gerimmo-v3-module-0c-copropriete|Module 0c]].

![Schéma — le syndic écrit au propriétaire, qui transmet à l'agence](../../raw/assets/GERIMMO-V3-Module-0c-Copropriete/media/d4dd78413a2cc9d6dfa0206ffc85560028d2987f.png)

## Le circuit (décision actée)

Le syndic adresse l'appel au **propriétaire**, qui le transmet à l'agence — **l'agence
n'est pas destinataire directe**. Elle dépend donc d'un tiers pour un document sans
lequel la [[Régularisation des charges]] est **bloquée** (RM-0c.6.4), d'où la
**relance automatique du propriétaire** (0c.6) :

| Moment | Destinataire | Niveau |
|---|---|---|
| Clôture d'exercice (défaut : 31/12) | Agent | Information |
| +3 puis +6 semaines | Agent | Warning (relances) |
| **+9 semaines (3 relances)** | **Admin agence** | **Critique — escalade** |
| Échéance de régularisation | Admin agence | **Bloquant** |

Chaque relance est **horodatée et conservée comme preuve de diligence** (RM-0c.6.5) ;
l'admin agence peut clôturer par une **renonciation motivée et tracée** (RM-0c.6.6).
Blocage plutôt que régularisation partielle : un décompte incomplet mélangerait deux
exercices, voire réclamerait un complément à un locataire déjà parti.

## La saisie (0c.2)

**Poste par poste, jamais en montant global** (RM-0c.2.1) — le locataire peut
légalement exiger la justification ligne à ligne. Total des postes = total de l'appel
(**bloquant**, RM-0c.2.2) ; document original conservé ; rattaché à un lot et une
période ; collage d'un tableau possible (extraction automatique du document : V2).
Appel commun à plusieurs lots : réparti au prorata des **tantièmes** (portés par le
lot). La saisie enchaîne obligatoirement sur la ventilation.

## La ventilation (0c.3) — « le parcours le plus critique de tout le projet »

« Une erreur de ventilation ne se voit pas : elle produit une régularisation plausible
mais fausse » — et l'agence ne peut pas se défendre, le décompte est effectivement faux.

- **La grille propose, l'agent corrige** (RM-0c.3.2) : un appel compte 20–40 postes,
  une qualification 100 % manuelle « ne serait pas tenue en production ».
- Un poste inconnu est signalé « à qualifier » et **bloque la validation** (RM-0c.3.3).
- **Poste mixte scindable** (RM-0c.3.5) — le piège entretien/remplacement :
  l'entretien de l'ascenseur est récupérable, son remplacement non ; « intervention
  ascenseur » peut être l'un ou l'autre.
- Qualifications manuelles **tracées** (auteur + date, RM-0c.3.7) et ajoutables à la
  grille pour les prochains appels.
- **Figée dès qu'une régularisation s'appuie dessus** (RM-0c.3.6) — correction ensuite
  uniquement par régularisation rectificative.
- Part récupérable → [[Régularisation des charges]] (3.9) ; part propriétaire →
  rapport de gestion (6.2) (RM-0c.3.8).

## Récupérable ou non — décret 87-713

| Récupérable (locataire) | Non récupérable (propriétaire) |
|---|---|
| Ascenseur (entretien, électricité) | Honoraires du syndic |
| Eau froide/chaude, compteurs | Gros travaux (ravalement, toiture, remplacements) |
| Chauffage collectif (combustible, entretien) | **Fonds travaux ALUR — jamais, blocage absolu** (RM-0c.3.4) |
| Ménage des communs, espaces verts | Assurance immeuble |
| Ordures ménagères | Frais de procédure |

## La grille de récupérables (0c.4)

Fournie par défaut (décret 87-713), **propre à chaque agence**, paramétrée par
l'[[Administrateur d'agence]] au module 18 ; correspondance sur libellé en recherche
approchée ; **jamais rétroactive** (RM-0c.4.3 — même logique que la
[[Clé de répartition]] datée) ; la règle du fonds ALUR est **système, non modifiable**
(RM-0c.4.4).

## L'appel de fonds travaux (0c.5)

**Formulaire dédié, sans étape de ventilation** — protection par la conception : le
fonds ALUR et les travaux votés en AG sont enregistrés **non récupérables** d'office et
n'apparaissent jamais dans la régularisation du locataire (RM-0c.5.1/2). Contribution
du locataire aux travaux d'amélioration : hors périmètre V1.

## Relations

[[Lot]] (tantième, onglet Charges) · [[Régularisation des charges]] (bloquée sans
appel) · [[Comptabilité]] (module 4 — catégories distinctes) · rapport propriétaire
(module 6) · [[Agenda et échéances]] (5 seuils de relance, module 14) · grille au
module 18.
