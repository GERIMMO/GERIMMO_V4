---
type: synthesis
tags: [design-system, charte, visuel, ux, accessibilite, refonte, audit]
status: in-progress
created: 2026-11-20
updated: 2026-11-20
sources: []
---

# Refonte visuelle « Maison » et Design System — 20 novembre 2026

**En une phrase :** le 20/11/2026, à la demande du dirigeant, les 133 pages de Gerimmo ont été auditées puis
harmonisées sous une identité commune, « Maison », formalisée en Design System ; le travail est dans la pull request
#350, **non fusionnée et non publiée**.

Version auditée : `be3bf5b0` (production). Livrables : dossier `livrables/refonte-design-20261120/`.

## Pourquoi

Le logiciel fonctionnait (786 passages du parcours automatique sans erreur), mais il était **inégal** d'une session à
l'autre : couleurs, titres et boutons propres à chaque espace, pages qui donnaient l'impression de sortir de Gerimmo.
Le dirigeant a demandé le même niveau de finition pour toutes les sessions : [[Propriétaire bailleur]] (particulier et
SCI), [[Agent immobilier]], [[Administrateur d'agence]], [[Locataire]], [[Artisan]], [[Super Admin]], pages publiques et
transversales.

## Ce que l'audit a trouvé

- **559 constats** relevés dans le code des 133 pages (154 agence et propriétaire, 152 supervision, 60 locataire,
  89 artisan, 104 pages publiques et transversales).
- Titres en Georgia, police absente d'Android et de Linux ; **14 tailles** de titre d'écran.
- **1 748 couleurs écrites en dur** dans 63 feuilles de page et de composant.
- Bouton principal or dans le seul espace locataire, bleu nuit ailleurs.
- **Rupture de navigation** : conditions, aide, compte, quittance s'ouvraient avec la vitrine publique devant une
  personne connectée, sans retour vers son espace.
- Une erreur ou une page introuvable faisait disparaître le menu de l'espace.
- Accessibilité : 36 éléments en défaut grave sur 16 écrans (nom accessible, contraste).

## La direction retenue

Trois directions ont été maquettées. **« Maison »** est retenue : la marque existante, mieux tenue — papier chaud,
bleu nuit `#14304f`, trait de champagne `#b7975a`, titres à empattements (police Fraunces embarquée). Les directions
« Clarté » (très blanche, bleu vif) et « Nuit et or » (fonds sombres) sont écartées.

Cinq principes : une seule voix ; l'action d'abord ; la couleur a un sens (rouge, ambre et vert ne servent qu'aux
états) ; le mouvement explique ; lisible au doigt (44 px, rien sous 12 px).

La contrainte [[Marque blanche]] est respectée : la couleur d'une agence colore toujours son action principale, et
le bandeau de retour ne nomme pas la marque.

## Ce qui a été fait

- **Fondations** : jetons de couleur, de typographie, de rayon, d'ombre et de mouvement dans une feuille commune ;
  une seule taille de titre d'écran ; action principale bleu nuit partout.
- **Navigation** : bandeau « Revenir à mon espace… » sur les pages servies hors d'un espace ; écrans d'erreur et
  « page introuvable » dans la coquille de l'espace.
- **Harmonisation** des 133 pages, un lot par espace, présentation seulement : aucune requête, action serveur, garde
  d'accès, calcul, prix ni texte juridique modifié.
- **Mesuré après** : 4 couleurs en dur restantes dans les feuilles de page (un test les lit), tous les titres dans la
  police embarquée, aucun débordement à 375 px.

Une leçon retenue : un **fondu d'arrivée** des écrans avait été posé, puis retiré. Pendant son quart de seconde le
texte était semi-transparent, donc sous le contraste requis, et les contrôles d'accessibilité échouaient.

## Avancement

<!-- avancement:début -->
| Session | Pages | Améliorées | Testées aux 4 largeurs | Terminées |
|---|---:|---:|---:|---:|
| [[Propriétaire bailleur]] (particulier et SCI) | 34 | 32 | 34 | 34 |
| [[Agent immobilier]] (gestionnaire) | 27 | 25 | 27 | 27 |
| [[Administrateur d'agence]] | 34 | 32 | 34 | 34 |
| [[Locataire]] | 13 | 13 | 13 | 13 |
| [[Artisan]] | 22 | 22 | 22 | 22 |
| [[Super Admin]] (supervision) | 33 | 33 | 33 | 33 |
| Relais et veille | 2 | 2 | 2 | 2 |
| Pages publiques | 22 | 22 | 22 | 22 |
| Pages transversales | 5 | 5 | 5 | 5 |
| **Total (page × session)** | **192** | 186 | 192 | **192** |

133 pages, 192 lignes page × session. Les six lignes « non améliorées » sont deux pages sans écran (elles renvoient vers la
fiche du lot), vues par trois profils. « Terminée » veut dire : harmonisée, ouverte à 375, 768, 1024 et 1440 px sans erreur,
sans débordement ni défaut grave d'accessibilité, et relue à 375 et 1440 px. Cela ne veut dire ni essayée sur un vrai
téléphone, ni fusionnée, ni publiée.

**Tests, sur banc isolé et données fictives :** style et types 0 erreur ; 12 949 tests unitaires réussis ; 282 parcours
navigateur réussis ; second parcours des écrans : 932 passages, 0 erreur, 0 débordement, 0 défaut grave d'accessibilité
(36 éléments avant) ; les 180 écrans ouverts aussi dans un vrai moteur WebKit (celui de Safari, version Linux) à 390 et
360 px : un débordement trouvé, corrigé.

**Intégration continue de la pull request :** **rouge** sur `9a656950`, à la seule étape des parcours WebKit mobile (verte sur `main`) ; le journal de cette étape n'est pas lisible depuis l'environnement de travail (accès réseau refusé), la cause reste à lire.

**Production : rien n'est publié** (version en ligne : `be3bf5b0`).
<!-- avancement:fin -->

## Ce qui reste

- **Intégration continue de la pull request** : une étape reste en échec (parcours WebKit mobile). Cause à confirmer ;
  piste : un test de la vitrine appuie sur le curseur du simulateur de prix avant que la page soit active.
- Essais sur de vrais appareils (iPhone, Android) : tous les essais « téléphone » sont simulés.
- Relecture et décision du dirigeant sur la pull request ; fusion et publication ne sont pas faites.
- Pages très longues (bail, fiche d'un lot, fiche d'une personne) et blocs repliés empilés côté propriétaire :
  hiérarchie améliorée, structure inchangée (elle est vérifiée par des tests).
- Libellés jugés peu clairs mais vérifiés par des tests (« À faire », « à qualifier », « appelés ») : inchangés.
- Écrans propres à la SCI : non relus à l'œil (pas de compte SCI sur le banc).

## Relations

Prolonge [[Audit UX-UI complet — dca39641 — 18 novembre 2026]] et [[État des lieux du design et des parcours]] ·
supplante [[Charte visuelle v3 bleue]] pour les couleurs et la typographie · suit
[[Corrections après l'audit PR 347 — 19 novembre 2026]].

> [!warning] Points à trancher / contradictions
> - [[Charte visuelle v3 bleue]] décrit une marque bleue `#2457f5` ; le code en production porte déjà du bleu nuit et du
>   champagne. La refonte « Maison » prolonge ce second état, pas la charte bleue.
> - L'assistant de l'espace locataire dit « Demander à Gerimmo » : à neutraliser pour une agence en marque blanche,
>   mais un test automatique exige ce libellé pour une agence sans marque propre. Décision à prendre.
> - Dans la supervision, le menu dit « Vue d'ensemble » et le titre « Aujourd'hui » : les tests figent les deux.
