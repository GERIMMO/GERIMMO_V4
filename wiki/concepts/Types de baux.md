---
type: concept
tags: [bail, typologie, perimetre, mobilite, saisonnier, commercial]
status: draft
created: 2026-08-05
updated: 2026-09-04
sources: ["[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]"]
---

# Types de baux

**Définition :** panorama des régimes locatifs français. Chaque type de bail a sa durée,
son dépôt de garantie, son préavis et son régime juridique. Les baux d'**habitation**
(vide, meublé, étudiant, mobilité, colocation) relèvent de la **loi du 6 juillet 1989**
(cadre protecteur du locataire) ; les autres (commercial, professionnel, garage,
saisonnier, occupation précaire) relèvent de régimes plus libres.
Source : [[2026-08-05-bailpdf-contrat-de-bail|BailPDF]].

## Panorama et périmètre Gerimmo

| Type | Durée | Dépôt de garantie | Préavis locataire | Gerimmo V3 |
|---|---|---|---|---|
| **Bail vide (nu)** | 3 ans min. (6 ans personne morale) | 1 mois HC | 3 mois (1 mois zone tendue) | ✅ **Périmètre** ([[Bail]]) |
| **Bail meublé** | 1 an min. | 2 mois HC | 1 mois | ✅ **Périmètre** ([[Bail]]) |
| **Bail étudiant** | 9 mois, **jamais reconduit tacitement** ([[2026-08-05-bailpdf-modele-bail-meuble\|formulaire officiel]]) | 2 mois HC | 1 mois | ✅ Variante du meublé ([[Bail]]) |
| **Colocation (bail unique)** | selon type | selon type | selon type | ✅ **Périmètre** — solidarité 6 mois ([[Bail]]) |
| Colocation (contrats séparés) | selon type | selon type | selon type | 🔜 V2 (parcours 1.4) |
| Bail mobilité | 1 à 10 mois, non renouvelable | **Interdit** (Visale seule) | 1 mois | ❌ Hors périmètre |
| Location saisonnière | 90 jours consécutifs max. | libre | — | ❌ Hors périmètre |
| Bail garage / parking | libre (hors loi 1989) | libre | libre | ❌ Hors périmètre* |
| Bail commercial (3-6-9) | 9 ans min. | libre | 6 mois (triennal) | ❌ Hors périmètre |
| Bail professionnel | 6 ans min. | libre | 6 mois | ❌ Hors périmètre |
| Convention d'occupation précaire | variable, motif objectif exigé | libre | libre | ❌ Hors périmètre |

\* Un parking loué **en accessoire d'un logement** (même bailleur, même locataire) suit
le bail d'habitation principal et y est simplement mentionné — cas couvert par le
[[Lot]] et ses annexes. Loué séparément, il exige son propre contrat, hors périmètre.

## Repères utiles hors périmètre

- **Bail mobilité** (loi Élan 2018) : mobilité temporaire justifiée (stage, alternance,
  mutation, mission, service civique), logement obligatoirement meublé, **aucun dépôt
  de garantie** — seule la garantie Visale est admise. Toute prolongation impose un
  bail meublé classique.
- **Saisonnier** : au-delà de 90 jours consécutifs pour un même locataire,
  requalification en bail d'habitation. Déclaration en mairie si le bien n'est pas la
  résidence principale du bailleur ; autorisation de changement d'usage dans les
  grandes villes ; taxe de séjour.
- **Dérogation de durée du bail vide** : un bailleur personne physique peut conclure
  un bail vide d'**1 an minimum** pour un événement familial/professionnel précis et
  motivé au contrat ; si l'événement ne survient pas, prolongation automatique à 3 ans.
  Le champ existe dans le formulaire officiel (section III,
  [[2026-08-05-bailpdf-modele-bail-non-meuble]]). Non prévu par le module 1 — à
  considérer seulement si un client le demande.

## Relations

- Détail du périmètre couvert : [[Bail]] (module 1 — nu, meublé, colocation bail unique).
- Un bail est porté par un [[Lot]] ; les plafonds de dépôt par type : [[Dépôt de garantie]].
- Mentions et clauses communes aux baux d'habitation : [[Mentions obligatoires du bail]],
  [[Clauses abusives et clauses résolutoires]].

> [!note] Décision 2026-09-04 — périmètre V0 : les natures de la maquette v3
> Carte blanche de Tahir à l'intégration de la
> [[2026-09-04-maquette-v3-prototype|maquette v3]] (qui réduit l'offre de
> création à 4 natures). Arbitrage : la **V0 s'en tient au module 1** — bail
> **nu**, **meublé**, **colocation à bail unique** (ce que l'application offre
> déjà). La **colocation à contrats séparés** (4ᵉ nature de la v3) est
> **différée en V1** : elle contredit la règle « un seul bail actif par lot »
> (29/08) et exige sa propre modélisation. Mobilité, étudiant, commercial,
> saisonnier… restent hors périmètre produit (catalogue documentaire
> seulement), réintroduits à la demande.
