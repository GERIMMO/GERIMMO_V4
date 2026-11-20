# Design System Gerimmo — « Maison »

Version du 20 novembre 2026. Ce document dit **quoi utiliser** pour qu'un écran ressemble à Gerimmo, dans les cinq
sessions (propriétaire, agence, locataire, artisan, supervision) et sur les pages publiques.

Prototypes des trois directions étudiées et de la direction retenue : canevas « Gerimmo — directions visuelles ».

## 1. L'idée

Gerimmo est une **maison bien tenue** : du papier chaud, du bleu nuit, un trait de champagne, des titres à
empattements. On y lit d'abord ce qu'il y a à faire, puis le détail.

| Principe | Ce que cela veut dire à l'écran |
|---|---|
| Une seule voix | Mêmes titres, mêmes boutons, mêmes cartes dans toutes les sessions. |
| L'action d'abord | Un écran a **une** action principale, en bleu nuit, visible sans défiler. |
| La couleur a un sens | Rouge, ambre et vert ne servent qu'aux états métier. Le champagne est l'accent de la marque. |
| Le mouvement explique | Une animation montre un changement. Elle ne décore pas et s'éteint si l'utilisateur le demande. |
| Lisible au doigt | Toute cible tactile fait au moins 44 px. Rien ne déborde à 375 px. |

## 2. Où vit quoi

| Fichier | Rôle |
|---|---|
| `src/app/prestige.css` (premier bloc) | Jetons de **couleur** de la marque. |
| `src/app/globals.css` | Jetons d'**état** (succès, attention, erreur), durées et courbe du mouvement, classes historiques. |
| `src/app/systeme.css` | **Design System** : typographie, rayons, ombres, règles communes des composants, mouvement. Chargé en dernier. |
| `src/app/proprietaire.css`, `experience-unifiee.css` | Géométrie propre à un espace. **Aucune couleur en dur.** |
| `src/components/ui/*` | Composants React partagés. |

Règle d'or : **aucune couleur, aucun rayon, aucune ombre en dur dans un composant ou un module CSS.** Un jeton.

## 3. Jetons

### Couleurs

| Jeton | Valeur | Emploi |
|---|---|---|
| `--marque` / `--prestige-nuit` | `#14304f` | Action principale, menus, titres forts. |
| `--marque-sombre` | `#293a51` | Survol de l'action principale. |
| `--prestige-champagne` | `#b7975a` | Accent décoratif (liseré, pastille, icône). **Jamais pour du texte.** |
| `--prestige-champagne-texte` | `#826838` | Surtitres, anneau de focus (5:1 sur blanc). |
| `--champagne-vif` | `#d5b777` | Liseré et repère posés **sur le bleu nuit**. |
| `--creme` | `#f7f5f0` | Fond de page (papier chaud). |
| `--carte` / `--ivoire` | `#ffffff` | Fond des cartes et des champs. |
| `--filet` | `#e2ddd3` | Contour des cartes, séparateurs. |
| `--filet-leger` | `#efebe3` | En-tête de tableau, fond discret. |
| `--filet-champ` | `#9a9387` | Contour des champs (3:1 sur blanc, WCAG 1.4.11). |
| `--survol` | `#f4f1ea` | Fond d'un rang survolé. |
| `--encre` / `--corps` | `#16243a` | Texte. |
| `--texte-secondaire` | `#4b5870` | Texte d'appoint (7:1 sur le papier). |
| `--success`, `--warning`, `--destructive` et leurs `-soft` | voir `globals.css` | États métier uniquement. |

Une agence en marque blanche pose ses propres `--bouton-principal`, `--sur-bouton-principal` et
`--bouton-principal-survol` (voir `styleMarque`). Le Design System les respecte.

### Typographie

| Jeton | Valeur | Emploi |
|---|---|---|
| `--font-display` | Fraunces (embarquée), repli Georgia | Titres `h1`, `h2`, titres de fenêtre. |
| `--font-interface` | Figtree | Tout le reste. |
| `--font-titres` | Manrope | Chiffres des tableaux de bord (alignés). |
| `--graisse-titre` | `430` | Graisse des titres. |
| `--titre-1` | `clamp(26px, 2.2vw, 34px)` | Titre d'écran, dans tous les espaces. |
| `--titre-2` | `22px` | Titre de section, de fenêtre. |
| `--titre-3` | `16px` | Titre de carte (Figtree, 600). |

Fraunces est embarquée parce que Georgia n'existe ni sur Android ni sur Linux : les titres y changeaient de dessin.

Dans un module CSS : `font: var(--graisse-titre) 24px/1.25 var(--font-display);` — jamais `Georgia` en dur.

### Géométrie et élévation

| Jeton | Valeur | Emploi |
|---|---|---|
| `--rayon-champ`, `--rayon-bouton` | `10px` | Champs, boutons. |
| `--rayon-carte` | `14px` | Cartes, panneaux, listes. |
| `--rayon-fenetre` | `18px` | Fenêtres, tiroirs. |
| `--ombre-1` | très légère | Carte au repos. |
| `--ombre-2` | portée | Carte survolée, menu flottant. |
| `--ombre-3` | profonde | Fenêtre, tiroir. |
| `--cible-tactile` | `44px` | Hauteur minimale de tout ce qui se touche. |

### Mouvement

| Jeton | Valeur | Emploi |
|---|---|---|
| `--duree-rapide` | `0.15s` | Survol, pression, couleur. |
| `--duree` | `0.24s` | Ouverture, dépliage, arrivée d'un écran. |
| `--duree-lente` | `0.36s` | Jauge, grande transition. |
| `--courbe` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Toutes les transitions de position. |

## 4. Composants

| Besoin | À utiliser | À ne pas faire |
|---|---|---|
| Action principale | `<Button>` (variante par défaut), `<BoutonEnvoi>` ou `.btn-or` | Deux actions principales sur un écran. Un bouton principal qui ne fait que naviguer. |
| Action secondaire | `<Button variant="outline">` ou `.btn-secondaire` | Un lien souligné pour une action. |
| Action dangereuse | `<Button variant="destructive">` | Du rouge pour autre chose qu'une suppression ou une alerte. |
| Carte | `<Card>` ou `.loc-carte` | Fond en dégradé, bord gauche coloré décoratif. |
| Titre d'écran | `TitreEcran` (icône + `h1`) dans `.entete-page` | Un `h1` nu, une taille propre à la page. |
| Lien de retour | « ← Libellé de la page d'arrivée », au-dessus du titre | « ‹ », `router.back()` sans repli, un libellé qui ne correspond pas à la destination. |
| Statut | `.puce` + `.puce-loue` / `-prep` / `-rouge` / `-grise`, ou `<Statut>` | Une couleur d'état sans libellé. |
| Liste | `.colonne-liste` + `.rang` | Un tableau à plus de 4 colonnes sur téléphone. |
| Tableau | `.tableau` dans `.tableau-defilant` | Un tableau qui fait défiler toute la page. |
| État vide | `.vide-guide` (titre, explication, geste) | Une liste vide sans explication ni action. |
| Erreur de formulaire | `<AlerteFormulaire>` | Un paragraphe rouge maison. |
| Fenêtre | `<Modale>` ; panneau : `<Tiroir>` | Une page hors coquille pour un détail. |
| Chiffre de tableau de bord | `<ValeurVivante valeur={n}>…</ValeurVivante>` | Un compteur qui défile au chargement. |
| Chargement | `loading.tsx` de l'espace (squelette), `<Spinner>` dans un bouton | Un écran blanc. |

## 5. Navigation

- Les quatre espaces ont la même structure : menu bleu nuit à gauche, en-tête blanc, contenu sur papier. Sur
  téléphone : barre basse de quatre entrées et bouton « Menu ».
- L'entrée active porte un **liseré champagne**.
- Une page servie hors d'un espace (conditions, confidentialité, aide, compte, quittance, outils, journal) affiche
  le bandeau **« Revenir à mon espace… »** dès que l'on vient d'un espace (`ContinuiteEspace`, layout racine). Les
  appels « Se connecter » et « Créer mon compte » s'effacent alors. Un bloc d'appel à l'inscription porte
  l'attribut `data-appel-inscription` pour suivre la même règle.

## 6. Mouvement : ce qui est en place

| Effet | Où | Détail |
|---|---|---|
| Arrivée d'un écran | Contenu des quatre espaces | Fondu seul, `--duree`. Aucun déplacement : le contenu est cliquable aussitôt. |
| Retour au toucher | Tous les boutons | Enfoncement d'un pixel. |
| Survol d'une carte-lien | Cartes cliquables | Élévation de 2 px, ombre `--ombre-2`. |
| Entrée active du menu | Quatre menus | Fond et liseré en transition. |
| Focus d'un champ | Tous les champs | Contour bleu nuit et halo champagne. |
| Valeur qui change | `ValeurVivante` | Halo champagne d'une seconde, annoncé aux lecteurs d'écran. |
| Fenêtres, tiroirs, notifications, jauges | Composants `ui` | Animations existantes, conservées. |

Tout s'éteint sous `prefers-reduced-motion: reduce`.

## 7. Accessibilité (WCAG 2.2 AA)

- Texte : 4,5:1 au moins. Contour des champs : 3:1.
- Focus toujours visible : anneau de 3 px, champagne foncé sur clair, champagne vif sur le bleu nuit.
- Cibles tactiles : 44 px.
- Un `h1` par écran, puis des `h2` : pas de saut de niveau.
- Le nom accessible d'un bouton contient son libellé visible.
- L'information ne passe jamais par la couleur seule.
