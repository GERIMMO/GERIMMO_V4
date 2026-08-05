---
type: concept
tags: [depot-de-garantie, bail, encaissement, restitution, plafond]
status: draft
created: 2026-07-24
updated: 2026-08-05
sources: ["[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]"]
---

# Dépôt de garantie

**Définition :** somme versée par le [[Locataire]] à la signature du [[Bail]], conservée
pendant la location et restituée à la sortie, déduction faite des retenues justifiées.
C'est la seule des trois garanties qui **se restitue** — la caution et les garanties
externes ([[Garantie]]) s'éteignent avec le bail.
Source : [[2026-07-24-gerimmo-v3-module-2-garanties|Module 2]], parcours 2.1 / 2.4 / 2.6.

**Décision actée — ce n'est pas un solde comptable** (RM-2.1.3) : le dépôt est suivi
comme un **montant encaissé à l'entrée, puis restitué à la sortie**. Pas de compte
mandant, pas de séquestre, pas de suivi d'intérêts — cohérent avec la
[[Comptabilité|comptabilité déclarative]] du module 4. Encaissement et restitution
produisent chacun une écriture comptable (4.2 / 4.1).

## Plafonds légaux (bloquants)

| Type de bail | Plafond | Base de calcul |
|---|---|---|
| **Bail nu** | **1 mois maximum** (RM-2.1.1) | Loyer **hors charges** |
| **Bail meublé** | **2 mois maximum** (RM-2.1.2) | Loyer **hors charges** |
| **Bail mobilité** | Interdit | Hors périmètre |

Le système **bloque la validation** si le montant saisi dépasse le plafond (US-2.1.1) —
un dépôt excessif exposerait le bailleur à une restitution forcée. Plafonds, base hors
charges et non-révision confirmés par [[2026-08-05-bailpdf-contrat-de-bail|BailPDF]]
(loi ALUR) ; exiger un **complément de dépôt à l'état des lieux d'entrée** est une
clause réputée non écrite ([[Clauses abusives et clauses résolutoires]]), tandis que le
**défaut de versement** est l'un des quatre motifs de clause résolutoire admis.
Dans les formulaires officiels, le montant s'écrit **en chiffres et en toutes lettres**
(section VI) — détail à reprendre dans le gabarit
([[Structure du modèle-type de bail]]).

## Règles d'encaissement (2.1)

- Le montant est repris du bail (1.1) ; l'agent enregistre date, moyen et montant reçu ;
  le dépôt est marqué **encaissé** (badge sur le bail).
- **Jamais révisé en cours de bail** (RM-2.1.5), même après révision du loyer.
- **Versant tiers tracé** (RM-2.1.4) : un parent qui verse pour un étudiant est identifié.
- **Encaissement partiel** : solde restant signalé, le bail reste valide.
- **Aucun dépôt** : possible, champ à zéro — notamment quand **Visale se substitue au
  dépôt** (RM-2.3.3, [[Garantie]]).
- **Propriétaire en gestion directe** : il encaisse lui-même, aucun compte de gérance.

## Ce que voit le locataire (2.6)

| Information | Visible | Quand |
|---|---|---|
| Montant et date d'encaissement | **Oui** (RM-2.6.1) | Dès l'encaissement |
| Délai de restitution en cours | Oui | Après remise des clés |
| **Retenues envisagées** | **Non** (RM-2.6.2) | **Seulement au décompte final** |
| Identité de son garant | Oui | S'il en a un |

Raison du masquage : un montant provisoire affiché puis modifié créerait une attente
injustifiée et une source de contestation — le locataire voit le décompte quand il est
**arrêté**, pas pendant son élaboration.

## Relations

- Rattaché au [[Bail]] (montant fixé en 1.1, plafond contrôlé en 2.1).
- Restitué via la [[Restitution du dépôt de garantie]] (parcours 2.4, criticité
  MAXIMALE) : impayés imputés d'abord, retenues décotées selon [[Vétusté et décote]],
  décompte envoyé au locataire (2.7).
- Alimente le solde de tout compte (module 3.11) et la [[Comptabilité]] (4.1/4.2).
- Délai de restitution alerté par le module 14 ([[Agenda et échéances]]).
