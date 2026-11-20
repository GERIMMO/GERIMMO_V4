# Design System Gerimmo — « Maison » (résumé)

**Date : 20 novembre 2026.** Le document de référence est dans le code : `app/docs/design-system.md` (branche `claude/refonte-design-gerimmo`). Ce résumé dit l'essentiel à qui ne lit pas le code.

## L'idée en une phrase

Gerimmo est une **maison bien tenue** : du papier chaud, du bleu nuit, un trait de champagne, des titres à empattements. On y lit d'abord ce qu'il y a à faire, puis le détail.

## Cinq principes

| Principe | Ce que cela change à l'écran |
|---|---|
| Une seule voix | Mêmes titres, mêmes boutons, mêmes cartes dans toutes les sessions. |
| L'action d'abord | Un écran a une action principale, bleu nuit, visible sans défiler. |
| La couleur a un sens | Rouge, ambre et vert ne servent qu'aux états. Le champagne est l'accent de la marque. |
| Le mouvement explique | Une animation montre un changement ; elle s'éteint si l'utilisateur le demande. |
| Lisible au doigt | 44 px pour tout ce qui se touche, rien sous 12 px, rien ne déborde à 375 px. |

## Où il vit dans le code

| Fichier | Rôle |
|---|---|
| `src/app/prestige.css` (premier bloc) | Couleurs de la marque. |
| `src/app/globals.css` | Couleurs d'état, durées, classes historiques. |
| `src/app/systeme.css` | **Le Design System** : typographie, rayons, ombres, composants communs, mouvement. Chargé en dernier. |
| `src/app/polices/` | Police de titre Fraunces, embarquée (licence libre OFL 1.1). |
| `src/components/ui/*` | Composants partagés. |
| `src/components/ecran-erreur.tsx`, `ecran-introuvable.tsx`, `continuite-espace.tsx`, `valeur-vivante.tsx` | Composants créés pour cette refonte. |

Règle d'or : **aucune couleur, aucun rayon, aucune ombre en dur dans une page**. Un jeton.

## Les jetons principaux

| Famille | Jetons |
|---|---|
| Couleur | `--marque` (bleu nuit `#14304f`), `--prestige-champagne` (`#b7975a`, décor), `--prestige-champagne-texte` (`#826838`, texte), `--champagne-vif` (sur le bleu nuit), `--creme` (papier `#f7f5f0`), `--carte` (blanc), `--filet`, `--filet-leger`, `--filet-champ` (contour 3:1), `--encre`, `--texte-secondaire`, `--success` / `--warning` / `--destructive` |
| Typographie | `--font-display` (Fraunces), `--font-interface` (Figtree), `--titre-1` (titre d'écran), `--titre-2` (section), `--titre-3` (carte) |
| Géométrie | `--rayon-champ`, `--rayon-bouton` (10 px), `--rayon-carte` (14 px), `--rayon-fenetre` (18 px), `--cible-tactile` (44 px) |
| Élévation | `--ombre-1` (repos), `--ombre-2` (survol), `--ombre-3` (fenêtre) |
| Mouvement | `--duree-rapide` (0,15 s), `--duree` (0,24 s), `--duree-lente` (0,36 s), `--courbe` |

## Les composants, en clair

| Besoin | À utiliser |
|---|---|
| Action principale / secondaire / dangereuse | `<Button>`, `<Button variant="outline">`, `<Button variant="destructive">` |
| Carte ; carte d'état | `.loc-carte` ou `<Card>` ; `data-tone="warning"` pour un état |
| Titre d'écran ; titre de carte | `TitreEcran` ; `<h2 class="titre-carte">` |
| Lien de retour | `.lien-retour` : « ← Nom de la page d'arrivée » |
| Statut | `.puce` avec son libellé |
| État vide | `.vide-guide` : titre, explication, geste |
| Onglets | `.dossier-nav`, onglet courant en `aria-current="page"` |
| Chiffre de tableau de bord | `<ValeurVivante>` |
| Erreur d'écran ; page introuvable | `<EcranErreur>` ; `<EcranIntrouvable>` — dans la coquille de l'espace |

## Les trois directions étudiées

Prototypes : [canevas « Gerimmo — directions visuelles »](https://claude.ai/artifact/22UMhhxGxRdEV2Hxj1fbNz) (privé : visible avec votre compte)

- **A — Maison** (retenue) : la marque existante, mieux tenue.
- **B — Clarté** : très blanche, sans empattements, accent bleu vif. Écartée : elle efface ce qui distingue Gerimmo.
- **C — Nuit et or** : fonds sombres, or dominant. Écartée : fatigante au quotidien, contrastes difficiles.

Le choix est **réversible** : il tient dans les jetons. Changer une valeur dans `prestige.css` ou `systeme.css` change toute l'application.

## Ce qui reste hors du système

- `globals.css` et `prestige.css` contiennent encore des couleurs en dur : pour l'essentiel les **définitions** des jetons et les palettes de saison. Les blocs « vitrine » et « outils » de `globals.css` sont à déplacer dans `vitrine.css`.
- Les libellés de la barre basse du téléphone (10 à 10,5 px), les pastilles de compteur et les miniatures d'écran de la vitrine restent sous 12 px : exceptions assumées.
- Pas encore de jeton pour le rayon des petites tuiles d'icône (8 à 12 px) ni pour celui des puces.
- **Aucun écran ne s'anime à l'arrivée** : un fondu avait été posé puis retiré, car il faisait passer le texte sous le contraste requis pendant un quart de seconde.
