---
type: concept
tags: [depot-de-garantie, bail, encaissement, restitution, plafond]
status: draft
created: 2026-07-24
updated: 2026-11-25
sources: ["[[2026-09-14-service-public-depot-colocation]]", "[[2026-07-24-gerimmo-v3-module-2-garanties]]", "[[2026-08-05-bailpdf-contrat-de-bail]]", "[[2026-08-05-bailpdf-modele-bail-non-meuble]]", "[[2026-08-05-bailpdf-modele-bail-meuble]]", "[[Le jour de référence est le jour de Paris]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "[[Mission palier 1 — audit du 22 novembre 2026]]", "[[Recueil des textes officiels (v6)]]", "DECISIONS-2026-11-24.md (Q49)", "QUESTIONS.md (Q49, Q109, Q111)", "JURISTE.md (partie 9, point 25)", "JOURNAL.md (lots D3, T2 et T3, 24-25/11/2026)", "livrables/notes-banc/ (notes-T2, notes-T3, relecture-T3R)", "livrables/recueil/analyse-refs-10-24.md (réf. 11 et 20)", "code de la branche fusionnée claude/palier-1-fusion (89cb87ff, lecture seule)"]
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
| **Colocation à bail commun** | **1 mois en nu, 2 en meublé** | Loyer **hors charges du bail entier** |
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

*Textes fournis (25/11)* : le [[Recueil des textes officiels (v6)]] (non recontrôlé sur Légifrance) donne l'article 22
(dépôt « ne peut être supérieur à un mois de loyer en principal », ne porte pas intérêt, aucune révision en cours de
bail) et l'article 24 (clause résolutoire pour « non-versement du dépôt de garantie »). Il **ne contient pas**
l'article 25-6 : le plafond de **deux mois en meublé**, déjà dans le code, n'a pas pu être relu (Q111).

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

## Application dans le produit (2026-09-09)

Le plafond est désormais **bloquant à la saisie ET en base** (audit fonctionnel
du 09/09, P2) : l'action serveur du bail refuse un dépôt qui dépasse, et un
trigger sur `baux` (migration `20260909240000`) le refuse aussi sur toute
insertion ou modification de type/loyer/dépôt — les baux déjà en place ne sont
pas re-vérifiés tant qu'on n'y touche pas. Base retenue : **loyer hors
charges** ; nu → 1 mois, meublé → 2 mois.

> [!warning] Points à trancher / contradictions
> - **Colocation à contrats séparés** : non couverte par cette correction. Ne pas appliquer un plafond par personne au bail commun. La génération du contrat de colocation reste à traiter séparément.
> - **Bail mobilité** : dépôt interdit par la loi ELAN ; le type n'existe pas
>   encore dans l'application — à couvrir quand il arrivera.

## Cohérence du dépôt en colocation (2026-09-14)

La source officielle [[2026-09-14-service-public-depot-colocation]] distingue
le bail commun nu du bail commun meublé. Elle remplace l'hypothèse précédente
« toute colocation = bail nu ». Le produit utilise le caractère meublé de la
fiche du lot pour le type `colocation`, déjà utilisé par son encaissement.
Un bail explicitement `nu` reste plafonné à un mois HC, même si le lot est
marqué meublé ; un bail `meuble` est plafonné à deux mois.

La migration `20260914110000` harmonise insertion, modification, contrôle
d'activation et encaissement. Les actions serveur relisent le lot autorisé
avant de calculer le plafond : un indicateur reçu du navigateur ne fait pas foi.
Aucun dépôt existant n'est recalculé, augmenté ni réécrit. Le dépôt contractuel
reste la limite de l'encaissement cumulé. Les locations à paiement mensuel
sont le périmètre actuel ; les exceptions de versement anticipé de plus de
deux mois ne constituent pas un nouveau parcours implémenté.

> [!info] Jour de référence (depuis le 15/10/2026)
> L'encaissement d'un dépôt saisi sans date, sa pièce comptable et la contre-passation d'un
> dépôt retiré sont datés du **jour de Paris** (PR #189). La **restitution** l'est aussi
> depuis le 16/10/2026 (PR #195, migration `20261014851000` : décompte finalisé, écritures
> de restitution, date d'envoi du décompte) ; c'est une **interprétation** de la décision
> du 15/10, **à faire ratifier par le dirigeant**. Les alertes du délai de restitution
> restent au jour de la session. Voir [[Le jour de référence est le jour de Paris]].

## État dans l'application au 24/11/2026 (préproduction, non publié)

Le chiffrage des retenues n'est plus imprimé dans l'[[État des lieux]] de sortie signé : il est dans le décompte de
restitution et dans le décompte des retenues, datés de leur émission ([[Restitution du dépôt de garantie]] ;
`QUESTIONS.md`, Q49 ; `JURISTE.md`, partie 5, point 14). Source : [[Mission palier 1 — audit du 22 novembre 2026]],
phase 3 (lot 41).

## Version préparée, à publier (état au 25/11/2026) — reçu, notice, espace du locataire

> [!info] Ce qui est en production et ce qui ne l'est pas
> Rien de cette section n'est en production : la production sert la version du 21/11/2026 (`81740dec`), gelée depuis
> le 22/11. Ce qui suit est lu dans le code de la branche fusionnée `claude/palier-1-fusion` (`89cb87ff`, vérifiée en entier sur le banc et poussée le 25/11 sur la branche de préproduction,
> non publiée en production ; `JOURNAL.md`, entrée du 25/11) et dans les notes des lots T2, T3 et D3
> (`livrables/notes-banc/`, `JOURNAL.md`). Aucun point de droit n'est donné pour acquis.

- **Reçu de dépôt : le plafond imprimé suit le bail** (écart R11-A2 du recueil), avec la règle même de la base : un
  bail nu sur un logement coché « meublé » imprime « un mois » (avant : « deux mois »), un bail meublé sur un logement
  non coché « deux mois » (avant : « un mois »). Aucun montant imprimé ne change. En-tête : « Article 22 de la loi
  n° 89-462 du 6 juillet 1989 » pour un bail nu ; « Loi n° 89-462 du 6 juillet 1989 », sans article, pour un bail
  meublé, puisque l'article 25-6 manque au recueil (reprise T3R-7).
- **Résumé de la notice** (lot T2, écart R11-A1) : la phrase fausse « il produit intérêt au profit du locataire » est
  remplacée par la majoration de 10 % du loyer mensuel hors charges par période mensuelle commencée en retard, « non
  due si le retard vient de ce que le locataire n'a pas communiqué l'adresse de son nouveau domicile ». Les résumés
  déjà rangés gardent leur fichier, donc l'ancienne phrase (Q109).
- **Espace du [[Locataire]]** (écart R11-A3) : trois endroits disent maintenant un mois après un état des lieux de
  sortie conforme à celui d'entrée, deux mois sinon — et non plus « 2 mois si des retenues sont justifiées ».
- **Retenues** (décision Q49, lot D3) : chaque retenue doit avoir sa pièce, un devis suffit ; sans elle, ni le décompte
  de restitution ni le décompte des retenues ne se produisent ([[Restitution du dépôt de garantie]]).
- **Plafond à la saisie et en base** : inchangé (section du 09/09 et du 14/09).

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Plafond de deux mois en meublé** : gardé dans le code, la base, le reçu et le résumé de la notice, mais non relu
>   (article 25-6 absent du recueil ; `JURISTE.md`, partie 9, point 25). Lu seul, le recueil laisse croire que
>   l'article 22 (un mois) s'applique au meublé, puisqu'il figure dans la liste des articles applicables aux meublés.
> - **Changement de propriétaire** : en cas de « mutation à titre gratuit ou onéreux des locaux loués », le texte fourni
>   (art. 22) met la restitution à la charge du **nouveau bailleur** ; Gerimmo ne connaît pas ce cas (nouveauté relevée
>   par l'analyse du recueil, non codée).
> - **Pas de dépôt si le loyer est payable d'avance pour plus de deux mois** (art. 22) : sans objet aujourd'hui, les
>   baux de Gerimmo étant à paiement mensuel.
