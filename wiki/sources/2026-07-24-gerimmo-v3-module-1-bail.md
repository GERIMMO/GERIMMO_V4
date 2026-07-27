---
type: source
tags: [bail, colocation, solidarite, preavis, conge, edl, signature, module-1]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-Module-1-Bail.md
source-type: module du référentiel des parcours clients (V3)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Module 1 : Bail

**En une phrase :** le cœur métier — 15 parcours, 4 objets (Bail, Occupant, Lien de
garantie, État des lieux), **« densité réglementaire la plus forte »** du référentiel.
Cible : **baux conclus à partir du 1er octobre 2026** (nouveau contrat type).
**Module clos.** Périmètre : bail nu, meublé, colocation (bail unique) ; hors
périmètre : commercial, mobilité, rural, saisonnier.

## Affirmations clés

1. **Décision révisée — la signature électronique est en V1** (Yousign, module 13) :
   le bail part en signature depuis l'application et revient signé automatiquement ;
   les parcours 1.6/1.7 fusionnent. Signature **séquentielle** : locataire →
   colocataires → garants → **bailleur en dernier** (RM-13.1.2). C'est toujours **la
   réception du bail signé qui active le bail et passe le lot en loué** (RM-1.7.1),
   même si l'entrée est ultérieure ; le lot reste *disponible* tant que rien n'est
   signé (candidat désistable). → [[Bail]]
2. **Création encadrée par le socle** : diagnostics valides obligatoires (blocage,
   RM-1.1.2), pas de chevauchement de baux sur un lot (RM-1.1.3), dossier incomplet =
   alerte sans blocage, **dépôt de garantie plafonné** (1 mois en nu, 2 en meublé),
   premier loyer **au prorata des jours réels** (proposé, corrigeable, tracé),
   **zone tendue figée au bail à sa signature** (RM-1.1.7).
3. **Colocation en bail unique = le parcours le plus délicat** : **un seul appel de
   loyer, jamais fractionné** (RM-1.3.1 — fractionner nierait la solidarité) ; le
   départ d'un colocataire n'éteint pas sa solidarité — **extinction à 6 mois ou à
   l'arrivée d'un remplaçant**, date **calculée, tracée et alertée** (RM-1.3.4/5) ;
   chaque garant couvre **un colocataire identifié**, jamais le bail en bloc
   (RM-1.3.8) ; l'extinction ne libère pas des dettes antérieures. Contrats séparés
   (1.4) et remplacement (1.5) : **V2** — nécessiteront sous-lots ou assouplissement
   de RM-1.1.3.
4. **Préavis du locataire (1.10)** : 3 mois (nu) / 1 mois (meublé, zone tendue, ou
   motif dérogatoire parmi 8 — mutation, perte d'emploi, RSA/AAH, santé, violences
   conjugales…). **Justificatif obligatoire sinon blocage** (RM-1.10.5 — sans pièce,
   « l'agence a accordé une faveur indéfendable »). Préavis en jours calendaires,
   depuis la **réception** du congé ; **la zone figée au bail prime sur la zone
   actuelle** (RM-1.10.7).
5. **Congé du bailleur (1.11)** : uniquement au terme, 3 motifs (reprise, vente,
   motif légitime et sérieux), préavis 6 mois (nu) / 3 mois (meublé) — **insuffisant
   = blocage, le congé serait nul** (RM-1.11.3). Congé pour vente : prix obligatoire
   + **alerte de préemption à 2 mois** (le droit de préemption lui-même est hors
   périmètre). Locataire protégé (> 65 ans, ressources modestes) : alerte forte sans
   blocage. Reconduction tacite : **alerte à 6 mois avant terme** (pas moins — sinon
   le congé bailleur devient impossible), jamais silencieuse.
6. **États des lieux (1.12/1.13) — saisie native pièce par pièce sur mobile** (hors
   ligne, signature tactile) : grille **générée depuis les équipements du lot**
   (liste fermée du module 0), sortie = **exactement la grille d'entrée** →
   comparatif automatique des écarts. Échelle neuf/bon/usagé/mauvais ; **la vétusté
   n'est pas une dégradation** ; « le module 1 constate, il ne juge pas »
   (imputabilité au module 2). **Sans EDL d'entrée, aucune retenue possible**
   (RM-1.13.4). → [[État des lieux]]
7. **Le bail meublé** : durée 1 an (9 mois étudiant, sans reconduction), inventaire
   mobilier **structuré** (pas un PDF joint — sinon comparatif de sortie impossible),
   mobilier minimum du décret 2015 contrôlé (alerte de requalification en nu).
8. **Modèles datés (1.16)** : un modèle par type, date d'entrée en vigueur, **un bail
   conserve la version du modèle en vigueur à sa signature** (RM-1.16.3) — même
   logique anti-rétroactivité que la clé et la zone tendue. Mentions légales non
   retirables.
9. **Le propriétaire en gestion directe est traité en variante** sur chaque parcours
   (le parcours 1.15 dédié n'existe plus) : même déroulé, sans mandat, honoraires ni
   rapport de gestion. La **révision IRL ne nécessite pas d'avenant** — traitée au
   module 3 (RM-1.9.3).

## Ce que la signature déclenche (chaîne critique)

Lot → loué · échéancier de loyer créé (calé sur la date d'entrée) · alerte d'EDL
d'entrée · document signé rapatrié avec horodatage (« le document signé fait foi »,
RM-1.7.2). Aucune modification du bail pendant une signature en cours (RM-1.7.4).
Cohérent avec [[Machines à états et événements]] (RM-A5.3) et
[[Notification et valeur probante]] (Yousign porte la preuve).

## Décisions actées / reports

Actées : Yousign V1 (révisée), prorata, extinction de solidarité tracée, EDL natif
mobile, justificatif de préavis réduit, ordre de signature, alerte préemption,
PD en variante. **V2** : contrats séparés, remplacement de colocataire. **Hors
périmètre** : droit de préemption, contentieux de congé. 22 US, 37 critères.

## Ce que ce module impose ailleurs

Module 2 (écarts d'EDL → restitution du dépôt), module 3 (échéancier né du bail
signé), module 13 (fusion 1.6/1.7), module 14 (reconduction, préemption, extinction
de solidarité, EDL), module 19 (**l'EDL est le parcours mobile le plus exigeant**).

## Pages mises à jour par cet ingest

[[État des lieux]] (créée) · [[Bail]] (consolidée) · [[Locataire]] ·
[[Agenda et échéances]] · [[Administrateur d'agence]] ·
[[État du projet et décisions ouvertes]]
