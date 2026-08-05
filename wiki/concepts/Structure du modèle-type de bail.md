---
type: concept
tags: [bail, modele-type, template, generation, decret-2015-587, bail-nu]
status: draft
created: 2026-08-05
updated: 2026-08-05
sources: ["[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]", "[[2026-08-05-bailpdf-contrat-de-bail]]"]
---

# Structure du modèle-type de bail

**Définition :** structure section par section du **modèle-type réglementaire** d'un
bail d'habitation (décret n° 2015-587, loi du 6 juillet 1989), relevée sur les
formulaires officiels vide ([[2026-08-05-bailpdf-modele-bail-non-meuble]]) et meublé
([[2026-08-05-bailpdf-modele-bail-meuble]]) — **les deux partagent le même squelette
de 11 sections**, seules 4 sections varient (tableau des variantes plus bas).
C'est le **gabarit de référence pour le générateur de baux Gerimmo** (parcours 1.16,
[[Bail]]) : chaque section liste les champs à alimenter et leur provenance dans le
modèle de données. Le cadre légal des mentions : [[Mentions obligatoires du bail]].

## Les 11 sections et leur alimentation Gerimmo

| # | Section | Contenu | Alimentation Gerimmo |
|---|---|---|---|
| I | **Désignation des parties** | Bailleur (nom/dénomination, domicile/siège, personne physique ou morale, SCI familiale oui/non, email), mandataire éventuel (raison sociale, adresse, activité, **carte professionnelle**), garant (nom, adresse), locataire(s) (nom, email) | [[Dossier locataire]] (0b), [[Mandat de gestion]], [[Organisation]] |
| II | **Objet du contrat** | Adresse, bât/escalier/étage/porte, **identifiant fiscal (13 positions)**, collectif/individuel, mono-propriété/copro, période de construction (5 tranches), surface habitable, pièces principales, autres parties (grenier, terrasse…), équipements, chauffage et eau chaude (individuel/collectif + répartition), **niveau de performance énergétique + rappel décence**, destination (habitation / mixte), accessoires privatifs (cave, parking n°…), parties communes, accès TIC (TV, Internet) | [[Bien]] + [[Lot]] (⚠️ identifiant fiscal : champ manquant), [[Diagnostic]] DPE |
| III | **Prise d'effet et durée** | Date d'effet, durée 3 ans (personne physique) / 6 ans (personne morale) / **durée réduite ≥ 1 an avec événement justifié**, rappel congés | [[Bail]] (1.1) ; durée réduite non prévue au module 1 |
| IV | **Conditions financières** | Loyer initial ; zone tendue : évolution à la relocation oui/non, **loyer de référence et référence majoré (€/m²), complément de loyer justifié** ; loyer du dernier locataire (< 18 mois : montant + 2 dates) ; révision (date + trimestre IRL) ; charges : **provisions avec régularisation / paiement périodique sans provision / forfait (colocation uniquement)** ; contribution partage d'économies de charges (travaux d'énergie) ; assurance pour compte des colocataires (récupérable par douzième) ; modalités de paiement (date, décomposition du total mensuel) ; **réévaluation d'un loyer sous-évalué au renouvellement (par tiers ou sixième)** | [[Bail]], [[Révision annuelle IRL]], [[Régularisation des charges]] ; complément de loyer et réévaluation non couverts |
| V | **Travaux** | Travaux d'amélioration/décence depuis le dernier bail (montant, nature), **majoration de loyer pour travaux du bailleur**, **diminution de loyer pour travaux du locataire** (+ dédommagement si départ anticipé) | Non couvert (hors périmètre module 3 actuel) |
| VI | **Garanties** | Montant du [[Dépôt de garantie]] en chiffres **et en toutes lettres** (≤ 1 mois HC) | [[Dépôt de garantie]] (2.1) |
| VII | **Clause de solidarité** | Solidarité et **indivisibilité** entre locataires multiples | [[Bail]] colocation (1.3) |
| VIII | **Clause résolutoire** | 4 cas : impayé (loyer, provisions **ou régularisation annuelle**), dépôt non versé, défaut d'assurance (sauf assurance pour compte), **trouble de voisinage constaté par décision de justice** | [[Clauses abusives et clauses résolutoires]] |
| IX | **Honoraires de location** | Rappel art. 5-I loi 1989, plafonds €/m² (visite/dossier/rédaction + état des lieux), détail bailleur / locataire | [[Mandat de gestion]] (honoraires) |
| X | **Conditions particulières** | Champ libre | Clauses libres du modèle 1.16 — à encadrer ([[Clauses abusives et clauses résolutoires]]) |
| XI | **Annexes** | Extrait règlement de copro, DDT ([[Diagnostic]]s : DPE, CREP < 1949, amiante, élec/gaz, ERP), notice d'information, [[État des lieux]], autorisation préalable de mise en location le cas échéant, références de loyers du voisinage le cas échéant | GED ([[Document]]), génération 1.6 |

Signatures : lieu + date, mention « Lu et approuvé », **un exemplaire original par
signataire** ; le garant ne signe pas le bail ([[Garantie]] — acte de cautionnement
distinct).

## Variantes vide / meublé (sections divergentes)

Le tableau ci-dessus vaut pour les deux types ; seules ces sections changent
([[2026-08-05-bailpdf-modele-bail-meuble|diff relevé sur le modèle meublé]]) :

| Section | Bail vide | Bail meublé |
|---|---|---|
| III. Durée | 3 ans (physique) / 6 ans (morale) / durée réduite ≥ 1 an motivée ; reconduction 3 ou 6 ans | Libre, **min. 1 an ou 9 mois étudiant** ; reconduction **1 an** — **jamais pour le bail étudiant** ; pas de durée réduite ni de règle personne morale |
| IV.B Charges | Provisions / périodique / **forfait en colocation uniquement** | Provisions / périodique / **forfait libre**, révisé comme le loyer |
| IV.C | Contribution au partage des économies de charges (travaux d'énergie) | **Section absente** |
| VI. Garanties | « Le cas échéant », plafond **1 mois HC** | « Il est prévu » (quasi systématique), plafond **2 mois HC** |
| XI. Annexes | État des lieux | État des lieux **+ inventaire et état détaillé du mobilier** (remise des clés, date ≤ conclusion) |

**La liste des meubles du décret 2015 n'est pas imprimée dans le formulaire meublé** :
la conformité repose sur l'inventaire annexé. L'inventaire **structuré** de Gerimmo
(module 1.2, [[Bail]]) va plus loin que le formulaire — il rend l'annexe générable et
comparable à l'[[État des lieux]].

## Champs sans équivalent Gerimmo aujourd'hui

À arbitrer avant le développement du générateur (1.16) — trous relevés en croisant
avec [[Bail]] et les modules 0/1/3 :

1. **Identifiant fiscal du logement** — aucun champ au [[Lot]]/[[Bien]]
   ([[Mentions obligatoires du bail]], trou déjà signalé).
2. **Complément de loyer** (encadrement renforcé) et loyer de référence/majoré €/m².
3. **Durée réduite** (≥ 1 an, événement à motiver) — [[Types de baux]].
4. **Réévaluation d'un loyer sous-évalué** au renouvellement (par tiers/sixième).
5. **Section Travaux** (majoration/diminution de loyer, contribution économies de
   charges).
6. **Assurance pour compte des colocataires** récupérable par douzième.
7. Période de construction, modalités de répartition chauffage/eau chaude collectifs,
   accès TIC — champs descriptifs du [[Bien]] à compléter.

> [!warning] Points à trancher
> - Lesquels de ces 7 champs entrent au périmètre V1 du modèle 1.16 ? Un formulaire
>   incomplet par rapport au modèle-type fragilise le bail généré ; a minima les
>   champs « le cas échéant » peuvent rester vides mais doivent **exister** dans le
>   gabarit.
> - ~~Le modèle meublé restait à ingérer~~ → **fait le 2026-08-05**
>   ([[2026-08-05-bailpdf-modele-bail-meuble]]) : même squelette, variantes ci-dessus.
>   Le blueprint couvre désormais les deux types du périmètre V3 (la colocation
>   utilise le même formulaire — « location/colocation » en titre).

## Relations

Gabarit du parcours 1.16 ([[Bail]]) · cadre légal : [[Mentions obligatoires du bail]] ·
clauses : [[Clauses abusives et clauses résolutoires]] · panorama des régimes :
[[Types de baux]] · données sources : [[Bien]], [[Lot]], [[Dossier locataire]],
[[Mandat de gestion]], [[Diagnostic]].
