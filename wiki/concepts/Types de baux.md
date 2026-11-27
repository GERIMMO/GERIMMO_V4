---
type: concept
tags: [bail, typologie, perimetre, mobilite, saisonnier, commercial, duree-reduite, epoux-pacs]
status: draft
created: 2026-08-05
updated: 2026-11-26
sources: ["[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]", "[[Recueil des textes officiels (v6)]]", "[[Bail]]", "DECISIONS-2026-11-24.md", "QUESTIONS.md (Q103, Q107, Q111, Q115)", "JURISTE.md (partie 9)", "livrables/notes-banc/ (notes-T1, notes-T2, notes-T3, notes-mariage, relecture-T2R, relecture-T3R)", "livrables/recueil/analyse-refs-01-09.md", "livrables/recueil/analyse-refs-10-24.md", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)"]
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
| **Bail vide (nu)** | 3 ans min. (personne physique, SCI familiale, indivision) — 6 ans personne morale hors SCI familiale | 1 mois HC | 3 mois (1 mois zone tendue¹) | ✅ **Périmètre** ([[Bail]]) |
| **Bail meublé** | 1 an min. | 2 mois HC² | 1 mois | ✅ **Périmètre** ([[Bail]]) |
| **Bail étudiant** | 9 mois, **jamais reconduit tacitement** ([[2026-08-05-bailpdf-modele-bail-meuble\|formulaire officiel]] ; aussi le texte fourni, art. 25-7) | 2 mois HC² | 1 mois | ✅ Variante du meublé ([[Bail]]) |
| **Colocation (bail unique)** | selon type | selon type | selon type | ✅ **Périmètre** — solidarité 6 mois ([[Bail]]) |
| Location à deux époux ou partenaires de PACS (bail commun) | selon type | selon type | selon type | Version `062296e2`, en production depuis le 25/11/2026 : case « mariés ou pacsés » — **hors régime de la colocation**, pas de fin de solidarité à six mois³ ([[Bail]]) |
| Colocation (contrats séparés) | selon type | selon type | selon type | 🔜 V2 (parcours 1.4) dans le référentiel — **contrats individuels développés le 14/09/2026** ([[Bail]]) ; hors contrat type⁴ |
| Bail mobilité | 1 à 10 mois, non renouvelable | **Interdit** (Visale seule) | 1 mois | ❌ Hors périmètre |
| Location saisonnière | 90 jours consécutifs max. | libre | — | ❌ Hors périmètre |
| Bail garage / parking | libre (hors loi 1989) | libre | libre | ❌ Hors périmètre* |
| Bail commercial (3-6-9) | 9 ans min. | libre | 6 mois (triennal) | ❌ Hors périmètre |
| Bail professionnel | 6 ans min. | libre | 6 mois | ❌ Hors périmètre |
| Convention d'occupation précaire | variable, motif objectif exigé | libre | libre | ❌ Hors périmètre |

\* Un parking loué **en accessoire d'un logement** (même bailleur, même locataire) suit
le bail d'habitation principal et y est simplement mentionné — cas couvert par le
[[Lot]] et ses annexes. Loué séparément, il exige son propre contrat, hors périmètre.

Notes du 25/11/2026 (version préparée ce jour-là ; en production depuis le 25/11/2026, version `062296e2` ; textes du
[[Recueil des textes officiels (v6)]], fournis par le dirigeant et non recontrôlés sur Légifrance) :
1. Le texte fourni (art. 15 I) exige que le locataire « précise le motif invoqué et le justifie au moment de l'envoi de
   la lettre de congé. A défaut, le délai de préavis applicable à ce congé est de trois mois. » Version `062296e2` : trois
   mois par défaut, un mois si la personne qui enregistre le congé confirme que la lettre le précise et le justifie
   (Q103). Jusqu'au 25/11 (`81740dec`), un mois était accordé d'office en zone tendue.
2. Le plafond de deux mois en meublé vient de l'article 25-6, **absent du recueil** : il est gardé tel que le code le
   tenait, sans avoir été relu (Q111). Le reçu de dépôt d'un bail meublé ne cite plus d'article ; le plafond suit le type
   du bail, non la case « meublé » du logement (lot T3).
3. Texte fourni (art. 8-1 I) : la colocation s'entend « à l'exception de la location consentie exclusivement à des époux
   ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat ».
4. Texte fourni (décret n° 2015-587) : le contrat type ne s'applique pas aux colocations formalisées par plusieurs
   contrats ; le modèle de Gerimmo s'intitule « Contrat indépendant — article 8-1 ».

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
  *Texte fourni (art. 11 et 13, recueil) : faculté ouverte au bailleur personne physique, à la SCI familiale et à
  l'indivision ; le contrat mentionne les raisons et l'événement ; confirmation de l'événement deux mois avant le terme,
  un seul report, et à défaut bail réputé de trois ans. L'article 11 n'est pas applicable au meublé. Dans le code, un
  champ « événement de durée réduite » existait pourtant et le bail nu imprimait « trois ans » à côté de l'événement
  (écart R17-A2). Version `062296e2` (lot T2, en production depuis le 25/11/2026) : **un bail nu dont ce champ est
  rempli n'est plus produit** (message qui dit quoi faire ; un bail déjà signé reste activable — Q107) ; le bail meublé
  ne lit plus le champ ni n'imprime la rubrique. Le vrai parcours (durée, raisons, contrôle de la qualité du bailleur,
  confirmation) n'est pas fait.*
- **Terme d'un bail commencé en fin de mois** (version `062296e2`, lot T3, en production depuis le 25/11/2026) : un
  bail commencé un 29 février finit le 28 février (27 avant) ; certains baux étudiants de neuf mois commencés un 29, 30
  ou 31 finissent un jour plus tard (Q115 ; `JURISTE.md`, partie 9, point 24).

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

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Colocation à contrats séparés** : « V2 » (parcours 1.4, référentiel), « différée en V1 » (décision du 04/09),
>   classée P1 par le référentiel fourni (09.4), puis **contrats individuels développés le 14/09/2026** ([[Bail]]). La
>   ligne du tableau garde ces étiquettes ; la note du 04/09 est antérieure à la réalisation.
> - **Bail étudiant** : la note du 04/09 le classe hors périmètre produit, alors que Gerimmo imprime le bail meublé de
>   neuf mois « non reconductible tacitement » (en ligne avec le texte fourni, art. 25-7, d'après
>   `livrables/recueil/analyse-refs-10-24.md`, réf. 20) — à lire « variante du meublé », pas « hors périmètre ».
> - **Dépôt de deux mois en meublé** : article 25-6 absent du recueil (Q111) ; lu seul, le recueil laisserait croire que
>   l'article 22 (un mois) s'applique au meublé (même analyse, réf. 20, E).
> - **Zones tendues** : un nouveau décret (n° 2026-831) est annoncé par la notice du recueil à partir du 1er janvier
>   2027, non reproduit ; le préavis d'un mois sera à relire à cette date (`JURISTE.md`, partie 9, point 6).
> - **Époux ou partenaires de PACS** : hors colocation selon le texte fourni, mais quelle solidarité, combien de
>   temps, et que faire à trois personnes ou en cas de mariage après la signature ? (`livrables/notes-banc/notes-mariage.md`,
>   § 6 ; `JURISTE.md`, partie 9, point 11).
