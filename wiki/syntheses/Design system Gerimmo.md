---
type: synthesis
tags: [design-system, charte, maison, couleurs, typographie, logo, marque-blanche, accessibilite, ux]
status: stable
created: 2026-09-24
updated: 2026-11-26
sources: ["[[Refonte visuelle « Maison » et Design System — 20 novembre 2026]]", "[[Vision de l'écosystème Gerimmo]]", "[[Marque blanche]]", "[[Charte visuelle v3 bleue]]", "[[Charte visuelle de l'espace agent]]", "livrables/refonte-design-20261120/DESIGN-SYSTEM.md", "app/docs/design-system.md", "Code : app/src/app/{prestige,systeme,globals,harmonie,proprietaire,experience-unifiee,vitrine,ambiances}.css, app/src/app/layout.tsx, app/src/lib/charte-gerimmo.ts, app/src/lib/marque-organisation.ts, app/src/components/marque-gerimmo.tsx", "Artefact claude.ai : Logo officiel (29/09)"]
---

# Design system Gerimmo

**En une phrase :** le design system **en production depuis le 20/11/2026** (PR #350, version `d315257d`) est
la direction **« A — Maison »** : papier chaud, bleu nuit `#14304f`, trait de champagne, titres Fraunces, appliquée aux
133 pages et à toutes les sessions ([[Refonte visuelle « Maison » et Design System — 20 novembre 2026]]). Cette page
remplace la version du 24/09, qui décrivait la charte bleue.

> [!info] Ce qui fait foi
> Pour une valeur, **le code d'abord**, puis cette page. Les couleurs sont dans le premier bloc de
> `app/src/app/prestige.css`. La typographie, les rayons, les ombres et les règles communes sont dans
> `app/src/app/systeme.css`, la dernière feuille chargée par `app/src/app/layout.tsx`. Les couleurs d'état et les
> durées sont dans `app/src/app/globals.css`. La documentation pour les développeurs est `app/docs/design-system.md`,
> et le résumé pour le dirigeant `livrables/refonte-design-20261120/DESIGN-SYSTEM.md`. En cas de désaccord, le code
> l'emporte et cette page se corrige.
>
> **Piège :** le premier bloc `:root` de `globals.css` déclare encore la palette bleue de septembre
> (`--marque: #2457f5`…). `prestige.css`, chargée après, l'écrase. Ne lisez jamais une couleur dans `globals.css` seul.

## 1. Les principes de la direction « Maison »

Gerimmo est **une maison bien tenue** : du papier chaud, du bleu nuit, un trait de champagne, des titres à
empattements. On y lit d'abord ce qu'il y a à faire, puis le détail (`app/docs/design-system.md`, § 1).

1. **Une seule voix.** Les titres, les boutons et les cartes sont les mêmes dans toutes les sessions : propriétaire
   (particulier et SCI), agence, locataire, artisan, supervision et pages publiques.
2. **L'action d'abord.** Un écran a **une seule** action principale. Elle est en bleu nuit et visible sans défiler.
3. **La couleur a un sens.** Le rouge, l'ambre et le vert ne servent qu'aux états métier. Le champagne est l'accent de
   la marque : repère, étape en cours, liseré.
4. **Le mouvement explique.** Une animation montre un changement. Elle ne décore pas et s'éteint sous
   `prefers-reduced-motion`.
5. **Lisible au doigt.** Tout ce qui se touche mesure 44 px. Aucun texte sous 12 px, aucun débordement à 375 px.

Deux règles transversales :
- **Marque blanche** ([[Marque blanche]]) : la couleur d'une agence colore toujours son action principale. Le bandeau
  de retour vers l'espace ne nomme pas la marque.
- **Règle d'or** : aucune couleur, aucun rayon et aucune ombre en dur dans une page, un composant ou un module CSS.
  On passe toujours par un jeton (en-tête de `systeme.css` ; `app/docs/design-system.md`, § 2).

Trois directions ont été maquettées le 20/11 :
- **A — Maison**, retenue : « la marque existante, mieux tenue » ;
- **B — Clarté**, écartée : très blanche, en bleu vif, elle efface ce qui distingue Gerimmo ;
- **C — Nuit et or**, écartée : ses fonds sombres fatiguent au quotidien et ses contrastes sont difficiles.

Le choix est réversible, puisqu'il tient dans les jetons (`livrables/refonte-design-20261120/DESIGN-SYSTEM.md`).

## 2. Les couleurs

### Marque, surfaces et texte (`app/src/app/prestige.css`, premier bloc)

| Rôle | Jeton | Valeur |
|---|---|---|
| Bleu nuit : action principale, menus, titres forts | `--marque` = `--prestige-nuit` = `--encre-profond` | `#14304f` |
| Survol de l'action principale | `--marque-sombre` (= `--graphite`, `--bleu`) | `#293a51` |
| Fond pâle de sélection | `--marque-clair` | `#edf0f4` |
| Texte sur le bleu nuit | `--sur-marque`, `--sur-encre` | `#fff` |
| Champagne : décor (liseré, pastille, icône), **jamais en texte** | `--prestige-champagne` = `--or` | `#b7975a` |
| Champagne lisible : surtitres, anneau de focus (5:1 sur blanc) | `--prestige-champagne-texte` = `--or-texte` = `--or-sombre` | `#826838` |
| Champagne vif : liseré et repère **posés sur le bleu nuit** | `--champagne-vif` (dans `systeme.css`) | `#d5b777` |
| Fond champagne très pâle, filet champagne | `--or-clair`, `--or-filet` | `#fbf8f1`, `#e3d6bc` |
| Texte sur un aplat champagne | `--sur-or` | `#16243a` |
| Papier (fond de page) | `--creme` (= `--background`) | `#f7f5f0` |
| Carte, champ | `--carte` = `--ivoire` | `#fff` |
| Contour de carte, séparateur | `--filet` | `#e2ddd3` |
| En-tête de tableau, fond discret | `--filet-leger` (= `--ardoise`) | `#efebe3` |
| Contour des champs (3:1 sur blanc, WCAG 1.4.11) | `--filet-champ` (dans `systeme.css`) | `#9a9387` |
| Survol d'un rang | `--survol` | `#f4f1ea` |
| Texte | `--encre` = `--corps` | `#16243a` |
| Texte d'appoint, libellé (7:1 sur le papier) | `--texte-secondaire` = `--libelle` | `#4b5870` |

### Menus des espaces (`app/src/app/systeme.css`)

| Rôle | Jeton | Valeur |
|---|---|---|
| Fond du menu | `--nuit-menu` | `#14304f` |
| Lien au repos | `--sur-nuit-doux` | `#cad4e1` |
| Survol, entrée active | `--nuit-menu-survol`, `--nuit-menu-actif` | `#1c3d62`, `#234870` |

L'entrée active porte un liseré de champagne vif (`box-shadow: inset 3px 0 var(--champagne-vif)`). Au pied du menu,
la photo de saison est posée en vignette de 230 px sous un voile bleu nuit (`--vignette-menu`).

### États métier (`app/src/app/globals.css`, `:root`)

| État | Couleur / fond doux / texte sur fond doux | Valeurs |
|---|---|---|
| À jour, encaissé, loué | `--success` / `--success-soft` / `--success-soft-foreground` | `#0f7a55` / `#e3f6ec` / `#0b5c40` |
| En attente, en préparation | `--warning` / `--warning-soft` / `--warning-soft-foreground` | `#b26d12` / `#fff1dc` / `#7a4a08` |
| Critique, retard, impayé | `--destructive` / `--destructive-soft` / `--destructive-soft-foreground` | `#d13c3c` / `#fdeaea` / `#a12a2a` |

Ces valeurs datent de la charte de septembre. La direction « Maison » ne les a pas redéfinies.

### Marque blanche (`app/src/lib/marque-organisation.ts`, fonction `styleMarque`)

Une agence qui a défini ses couleurs les pose sur son espace :
- sa **couleur principale**, assombrie si besoin jusqu'à un contraste de 5:1 sur le blanc, remplace `--marque`, `--or`,
  `--primary` et `--ring`. Elle remplace aussi `--bouton-principal`, `--bouton-principal-survol` et
  `--sur-bouton-principal`, que lit le bouton principal (`.btn-or`, dans `prestige.css`) ;
- sa **couleur secondaire** remplace `--encre`.

Sans couleur d'agence, rien ne change.

### Couleurs de décor, sans valeur d'état

- **Tons de rubrique** (`app/src/app/harmonie.css`) : bleu, or, vert et violet. L'attribut `data-ton` les pose sur
  l'icône d'un titre d'écran ou d'une rubrique, par quatre jetons `--ton-*-fond`, `-fin`, `-filet` et `-encre`. Pour
  l'or, par exemple : `#f8ebce`, `#fffbf2`, `#e5d2aa`, `#785b2c`. Ces tons ne remplacent jamais un état métier.
- **Ambiances de saison** (`app/src/app/ambiances.css`) : une couche décorative qui suit le calendrier de Paris (composant
  `AmbianceSite`). Par défaut, l'accent vaut `#d5b777`, l'encre `#74603c` et le fond `#faf7f1`. Chaque saison ou fête
  change ces trois valeurs et ajoute un motif. Aucun jeton de marque, d'alerte ou d'état n'est modifié, et rien ne
  s'imprime.
- **Pas de mode sombre.** Le bloc `.dark` de shadcn a été retiré le 24/09 (`globals.css`).

## 3. La typographie

Les polices sont **embarquées** dans `app/src/app/polices/`, sous licence OFL. `app/src/app/layout.tsx` les déclare par
`next/font/local` : aucun téléchargement externe.

| Police | Variable | Fichiers | Emploi |
|---|---|---|---|
| **Fraunces** (axe optique, sans italique) | `--font-affiche` et `--font-affiche-etendue`, réunies dans `--font-display` (`systeme.css`) ; repli Georgia | `fraunces-latin-opsz-normal.woff2` (67 Ko), `fraunces-latin-ext-opsz-normal.woff2` (59 Ko) | Titres `h1` et `h2`, titres de fenêtre, titres de `<Card>` (`[data-slot="card-title"]`, dans `prestige.css`) |
| **Figtree** | `--font-interface` (classe Tailwind `font-sans`) | `figtree-latin-wght-normal.woff2`, `figtree-latin-ext-wght-normal.woff2` | Tout le reste : texte, libellés, boutons, champs, `h3`, titres de carte `h2.titre-carte` |
| **Manrope** | `--font-titres` (classe Tailwind `font-heading`) | `manrope-latin-wght-normal.woff2`, `manrope-latin-ext-wght-normal.woff2` | Chiffres des tableaux de bord (`.loc-kpi .v`, tuiles), toujours alignés (`lining-nums tabular-nums`) |
| **Caladea** | `policeDocument` (`app/src/components/outils/police-document.ts`) | `caladea-latin-400-normal.woff2`, `caladea-latin-700-normal.woff2` | Documents : PDF en 10,5 pt (`app/src/lib/documents/gabarit.ts`) et feuille imprimable des outils gratuits (lettre de révision, quittance) |
| **Cormorant Garamond** | aucune : la police n'est pas chargée | aucun | **Uniquement dans le logo**, où le nom et la devise sont dessinés dans l'image ([[Vision de l'écosystème Gerimmo]], § 10). Aucune page ne l'emploie. C'était la police de titre de la charte v2 d'août, abandonnée le 17/09 : ses chiffres elzéviriens faisaient lire « II » pour « 11 » (commentaire de `globals.css`). |

**Échelle et réglages** (`systeme.css`, `prestige.css`, `globals.css`) :

| Élément | Valeur |
|---|---|
| Titre d'écran, le même dans tous les espaces (`--titre-1`) | `clamp(26px, 2.2vw, 34px)` |
| Titre de section ou de fenêtre (`--titre-2`) | `22px` |
| Titre de carte (`--titre-3`) | `16px`, Figtree 600 |
| Graisse des titres en Fraunces (`--graisse-titre`) | `430` |
| `h1` et `h2` | interlettrage `-0.02em`, interligne 1,2, couleur `--encre`, `text-wrap: balance`, chiffres alignés |
| Corps de texte | 15 px, interligne 1,6 (bloc RESPIRATION de `globals.css`) |
| Champ de saisie | 14 px ; 16 px sous 640 px de large |
| Libellé de champ | 12 px, graisse 600 |
| Surtitre (`.eyebrow`) | 12 px, graisse 600, capitales espacées de `0.13em`, couleur `#826838` |
| Plus petit texte (`--pas-mention`) | `0.75rem` (12 px) ; un `<small>` ne descend jamais sous 12 px |
| Héros de l'accueil public (`--vitrine-affiche`, dans `vitrine.css`) | `clamp(38px, 4.6vw, 62px)` |

Au téléphone (640 px et moins), dans les espaces, les `h2` passent en Figtree 18 px, graisse 600, et les surtitres
perdent leurs capitales (fin de `prestige.css`).

**Deux règles de chargement** (`layout.tsx` ; `app/docs/design-system.md`, § 3) :
- **une police déclarée est une police préchargée** : on n'écrit jamais `preload: false`. Dans Safari, une police
  déclarée mais pas encore chargée figeait l'affichage tant que les scripts n'étaient pas arrivés ;
- **pas de fichier italique** : il pesait 81 Ko pour une seule phrase. Un `em` dans un titre reste droit
  (`font-synthesis: none`) et l'emphase se marque par la couleur.

Ces deux règles sont gardées par `app/tests/polices-prechargees.test.ts` et par le parcours WebKit
`e2e/bouton-envoi-hydratation`.

## 4. Espacement, rayons, ombres et composants de base

### Espacement

- **Rythme vertical** (`--rythme-1` à `--rythme-6`, dans `globals.css`, après le bloc RESPIRATION du 25/09) :
  4 · 8 · 18 · 28 · 48 · 72 px. Dans l'ordre : dans un rang, entre libellé et valeur, dans une carte, entre deux
  cartes, entre deux sections, entre deux sections de la vitrine.
- **Contenu d'un espace** (`prestige.css`) : marges de 32 px en haut, 36 px sur les côtés et 64 px en bas, pour une
  largeur maximale de 1 400 px. Au téléphone : 22, 16 et 88 px. L'espace propriétaire va jusqu'à 1 480 px
  (`proprietaire.css`).
- **Cartes** : marge intérieure de 28 px par défaut (`prestige.css`), 22 px dans les espaces unifiés
  (`experience-unifiee.css`), 18 px chez le propriétaire (`proprietaire.css`), 14 à 16 px au téléphone.
- **Rangs de liste** : 14 px × 16 px (`harmonie.css`, `experience-unifiee.css`).
- **Coquille** : menu de 275 px de large (`--largeur-late`, dans `prestige.css`), 248 px chez le propriétaire ; en-tête
  de 76 px (`--hauteur-haut`).

### Rayons (`systeme.css`)

| Jeton | Valeur | Emploi |
|---|---|---|
| `--rayon-champ`, `--rayon-bouton` | `10px` | Champs, boutons, onglets d'un dossier |
| `--rayon-carte` | `14px` | Cartes, panneaux, listes, tuiles, chiffres clés |
| `--rayon-fenetre` | `18px` | Fenêtres, tiroirs, recherche |
| `--radius`, pour Tailwind (dans `globals.css`) | `0.625rem` (10 px) | Échelle de `--radius-sm` à `--radius-4xl`, calculée à partir de lui |

### Ombres (`systeme.css`)

| Jeton | Valeur | Emploi |
|---|---|---|
| `--ombre-1` (alias historique `--ombre-portee`) | `0 1px 2px rgb(22 36 58 / 0.04), 0 3px 12px rgb(22 36 58 / 0.04)` | Carte au repos |
| `--ombre-2` | `0 2px 6px rgb(22 36 58 / 0.06), 0 12px 28px rgb(22 36 58 / 0.09)` | Carte survolée, menu flottant |
| `--ombre-3` | `0 24px 70px rgb(20 48 79 / 0.22)` | Fenêtre, tiroir |

### Cible tactile et mouvement (`globals.css`, `systeme.css`)

- `--cible-tactile: 44px` s'applique aux boutons, aux champs, aux liens de menu, aux lignes qui se déplient au doigt,
  au bouton de recherche et au lien de retour.
- Durées : `--duree-rapide` 0,15 s (survol, pression, couleur), `--duree` 0,24 s (ouverture, dépliage), `--duree-lente`
  0,36 s (jauge, grande transition). Courbe : `--courbe`, soit `cubic-bezier(0.2, 0.7, 0.2, 1)`.
- Mouvements en place :
  - un bouton s'enfonce d'un pixel quand on appuie ;
  - une carte qui est un lien monte de 2 px au survol, avec `--ombre-2` ;
  - l'entrée active du menu change en transition ;
  - un champ actif prend un contour bleu nuit et un halo de champagne vif de 3 px ;
  - une valeur qui change (`ValeurVivante`) reçoit un halo champagne de 1,2 s, annoncé aux lecteurs d'écran.
- **Aucune animation à l'arrivée d'un écran.** Tout mouvement s'éteint sous `prefers-reduced-motion: reduce`.

### Composants de base (`app/docs/design-system.md`, § 4 ; règles dans `systeme.css` et `prestige.css`)

| Besoin | Composant ou classe | Rendu |
|---|---|---|
| Action principale | `<Button>`, `<BoutonEnvoi>`, `.btn-or` | Bleu nuit (ou `--bouton-principal` de l'agence), texte blanc, 44 px de haut, rayon 10 px, 13 px graisse 600, marge intérieure de 10 × 18 px |
| Action secondaire | `<Button variant="outline">`, `.btn-secondaire` | Fond blanc, contour `--filet-champ` ; au survol, contour bleu nuit et fond `--survol` |
| Action dangereuse | `<Button variant="destructive">` | Rouge `--destructive` |
| Champ | `input`, `select`, `textarea` | 44 px de haut, contour de 1 px en `--filet-champ`, rayon 10 px, 14 px ; en erreur (`aria-invalid`), contour `--destructive` |
| Carte | `<Card>`, `.loc-carte` | Blanche, filet `--filet`, rayon 14 px, `--ombre-1` ; une carte qui est un lien se soulève au survol |
| Carte d'état | `data-tone="warning"`, `"destructive"` ou `"success"` | Bord gauche de 3 px à la couleur de l'état, réservé aux états |
| Titre d'écran | `TitreEcran` (icône et `h1`) dans `.entete-page` | `--titre-1`, icône dans une tuile au ton de la rubrique |
| Titre de carte | `<h2 class="titre-carte">` | Figtree 16 px |
| Lien de retour | `.lien-retour` | « ← Libellé de la page d'arrivée », 14 px, au-dessus du titre, 44 px de haut |
| Statut | `.puce` (avec `.puce-loue`, `-prep`, `-rouge` ou `-grise`), `<Statut>` | Toujours accompagné d'un libellé, chiffres alignés |
| Liste | `.colonne-liste` et `.rang` | Rayon 14 px ; tout le rang est cliquable |
| Tableau | `.tableau` dans `.tableau-defilant` | En-tête sur `--filet-leger` |
| Onglets d'un dossier | `.dossier-nav`, avec `aria-current="page"` sur l'onglet ouvert | Onglet ouvert en bleu nuit plein |
| Chiffre de tableau de bord | `<ValeurVivante>` | Manrope, halo champagne quand la valeur change |
| État vide | `.vide-guide` | Un titre, une explication et un geste ; motif du toit et de la clé dans l'angle |
| Erreur de formulaire | `<AlerteFormulaire>` | Encadré d'erreur commun |
| Fenêtre, panneau | `<Modale>`, `<Tiroir>` | Rayon 18 px, `--ombre-3` |
| Chargement | `loading.tsx` de l'espace (squelette), `<Spinner>` dans un bouton | Jamais d'écran blanc |
| Erreur d'écran, page introuvable | `<EcranErreur>`, `<EcranIntrouvable>` | Affichés dans la coquille de l'espace : menu, en-tête et marque restent en place |
| Retour vers l'espace | `ContinuiteEspace` (`.retour-espace`) | Bandeau bleu nuit collant de 48 px, « Revenir à mon espace… », sur une page publique ouverte depuis une session ; ne nomme jamais la marque |

**Navigation** : les quatre espaces ont la même structure. À gauche, un menu bleu nuit ; en haut, un en-tête blanc ;
le contenu est posé sur le papier. Au téléphone, une barre basse de quatre entrées et un bouton « Menu ».

## 5. Les règles d'usage

| À faire | À ne pas faire |
|---|---|
| Passer par un jeton pour toute couleur, tout rayon, toute ombre | Écrire une couleur en dur dans une page, un composant ou un module CSS ; écrire `Georgia` en dur (écrire plutôt `font: var(--graisse-titre) 24px/1.25 var(--font-display)`) |
| Une seule action principale par écran, visible sans défiler | Deux actions principales ; un bouton principal qui ne fait que naviguer |
| Le rouge, l'ambre et le vert pour un état métier, avec son libellé | Du rouge pour autre chose qu'une suppression ou une alerte ; une couleur d'état sans libellé |
| `#b7975a` pour un décor sur fond clair, `#826838` pour un texte champagne, `#d5b777` sur le bleu nuit | `#b7975a` en couleur de texte |
| Des cartes blanches avec un filet | Un fond en dégradé ; un bord gauche coloré qui ne signale aucun état |
| Un seul `h1` par écran (`TitreEcran`), puis des `h2` | Un `h1` nu ou d'une taille propre à la page ; un `h3` juste sous le `h1` ; un `h2` de carte en Fraunces |
| L'emphase d'un titre par la couleur | De l'italique dans un titre |
| Précharger toute police déclarée | `preload: false` dans `localFont` |
| Un lien de retour « ← Page d'arrivée » | « ‹ » ; `router.back()` sans solution de repli ; un libellé qui ne correspond pas à la destination |
| Erreur et page introuvable dans la coquille de l'espace | Une erreur qui fait disparaître le menu ; une page hors coquille pour afficher un détail |
| Une animation qui explique un changement | Un fondu à l'arrivée d'un écran : le texte, semi-transparent, passe sous le contraste requis ; un compteur qui défile au chargement |
| Un tableau dans `.tableau-defilant` | Plus de 4 colonnes au téléphone ; un tableau qui fait défiler toute la page |
| Un état vide `.vide-guide` avec un geste | Une liste vide sans explication ni action |
| `aria-current="page"` sur l'onglet ouvert | Une classe « actif » sans `aria-current` |

**Accessibilité, niveau WCAG 2.2 AA** (`app/docs/design-system.md`, § 7) :
- contraste d'au moins 4,5:1 pour le texte et 3:1 pour le contour des champs ;
- focus toujours visible : anneau de 3 px en `--prestige-champagne-texte`, décalé de 3 px, et en `--champagne-vif` sur
  le bleu nuit ;
- cibles tactiles de 44 px ;
- aucun texte sous 12 px. Exceptions tenues : pastilles de compteur, raccourcis clavier, libellés de la barre basse du
  téléphone (10 à 10,5 px) et miniatures d'écran de la vitrine ;
- un `h1`, puis des `h2` ;
- le nom accessible d'un bouton contient son libellé visible ;
- une information ne passe jamais par la couleur seule.

## 6. Les règles du logo

Les règles viennent de l'artefact claude.ai « Logo officiel » du 29/09/2026, résumé dans
[[Vision de l'écosystème Gerimmo]], § 10. Elles sont appliquées dans `app/src/components/marque-gerimmo.tsx`,
`app/src/lib/charte-gerimmo.ts` et `app/src/app/prestige.css`.

- **Dessin** : un toit en arc, une clé et une ligne de sol. Dessous, le nom **GERIMMO** en capitales espacées
  (Cormorant Garamond, graisse 500), puis la devise **« L'immobilier en confiance »** en petites capitales espacées.
  Le texte est vectorisé : aucune police à installer.
- **Couleurs** : or champagne `#D3B677` sur encre `#14304F`. Le nuancier de l'artefact ajoute une encre profonde
  `#0F2640`, un bleu accent `#2F6FB0` et une teinte claire `#E8EEF4`.
- **Déclinaisons** prévues par l'artefact :
  - horizontale, pour les en-têtes de site, les documents et les signatures ;
  - symbole seul, pour le favicon, les icônes et la barre latérale réduite ;
  - verticale sans devise, pour les petits formats.
- **Règles d'usage** de l'artefact :
  - toujours l'or en aplat sur l'encre. Sur un fond clair, utiliser la version transparente **posée sur un aplat
    d'encre**, jamais l'or seul sur du blanc ;
  - zone de protection : au moins un tiers de la hauteur du symbole de chaque côté ;
  - sous 120 px de large, le symbole seul ; sous 220 px, la version sans devise ;
  - ne pas déformer, ne pas recolorer, ne pas ajouter d'ombre ni de contour.
- **Dans le code, le logo est une image.** `MarqueGerimmo` affiche `public/logo/gerimmo-officiel-transparent.png`
  (1 410 × 1 115 px), avec le texte alternatif « Gerimmo — L'immobilier en confiance ».
  - Sur un fond sombre (menu, bandeau bleu nuit), l'option `surEncre` l'affiche sans tuile.
  - Sur un fond clair, l'option `tuile` le pose sur une tuile bleu nuit `#152f4b`, avec une marge de 4 × 12 px. C'est la
    décision D28 A de l'audit du 13/10 : le doré posé directement sur un fond clair n'offrait qu'un contraste d'environ
    1,5:1, contre 13,6:1 dans la tuile (garde : `app/tests/marque-tuile.test.ts`).
  - Largeurs : 170 px dans les menus, 180 px sur le panneau de connexion, 56 à 88 px dans l'en-tête public, 64 à
    72 px au téléphone et sur le rail de la tablette.
  - Icônes d'onglet et d'écran d'accueil : le même logo réduit (`gerimmo-icone-96.png`, `gerimmo-icone-228.png`).
- **Signature graphique** : le motif du toit et de la clé, tracé en champagne vif `#d5b777` à 55 % d'opacité, occupe
  l'angle des états vides (`.vide-guide`, dans `systeme.css`).

## Historique

- **Août** : les principes d'usage de la [[Charte visuelle de l'espace agent]], puis la charte v2 de la maquette
  (encre, laiton `#C9A227`, crème, Cormorant Garamond).
- **17/09** : la [[Charte visuelle v3 bleue]] remplace cette identité par un **bleu électrique `#2457f5`**, du blanc,
  du gris perle, Manrope et Figtree. Elle est validée le 18/09, puis remise au propre le 24/09 dans la première version
  de cette page. Le compte rendu de cette remise au propre est dans `log.md`, aux entrées du 24/09.
- **Octobre** : la charte bleue reste la référence écrite. Dans le code, le bleu nuit et l'or du logo officiel (29/09)
  reviennent pourtant, d'abord avec la tuile bleu nuit du logo (décision D28 A, audit du 13/10). Le 16/11,
  l'[[Audit avant vente — ergonomie, visuel et fonctions — 16 novembre 2026|audit avant vente]] décrit déjà une
  identité « bleu nuit, or champagne, titres à empattements ».
- **20/11** : la direction **« A — Maison »** fait de cet état un design system et part en production.

Les deux chartes sont archivées depuis le 26/11. Elles gardent la mémoire des décisions, plus les valeurs.

## Relations

Résume, pour les valeurs, [[Refonte visuelle « Maison » et Design System — 20 novembre 2026]] (le chantier) et la
charte du logo ([[Vision de l'écosystème Gerimmo]], § 10) · contrainte [[Marque blanche]] · personas
[[Propriétaire bailleur]], [[Agent immobilier]], [[Administrateur d'agence]], [[Locataire]], [[Artisan]],
[[Super Admin]] · mémoire des décisions : [[Charte visuelle v3 bleue]], [[Charte visuelle de l'espace agent]],
[[État des lieux du design et des parcours]], [[Audit UX-UI complet — dca39641 — 18 novembre 2026]].

> [!warning] Points à trancher / contradictions
> - **Quatre teintes d'or, et le code n'utilise pas celle de la charte du logo.**
>   - Ce qu'utilise le code : à l'écran, l'or posé sur le bleu nuit est **`#D5B777`** (`--champagne-vif`, dans
>     `systeme.css`). C'est aussi la couleur du motif des états vides et de l'ambiance par défaut. Sur fond clair,
>     l'interface emploie `#b7975a` en décor et `#826838` en texte.
>   - `#D3B677`, l'or de la charte du logo (artefact du 29/09, [[Vision de l'écosystème Gerimmo]]), n'apparaît nulle
>     part dans le code. Le logo est une image : ses pixels varient autour de cette teinte.
>   - `#C9A227`, le laiton de la charte v2 d'août, ne survit que dans les PDF (`laitonFilet`, dans
>     `app/src/lib/documents/gabarit.ts`) et dans deux fichiers SVG qu'aucun écran ne charge.
>   - Une même intention, « l'or posé sur l'encre », a donc deux valeurs (`#D5B777` et `#D3B677`). Il faut en choisir
>     une.
> - **Plusieurs bleus nuit.** La charte et `--marque` donnent `#14304f`. La tuile du logo est écrite en dur en
>   `#152f4b` (`prestige.css`). Le fond du PNG officiel vaut `#1b2f4d` (relevé sur le fichier). L'artefact du logo
>   ajoute une « encre profonde » `#0F2640`. Le mot « encre » lui-même change de sens : il désigne `#14304F` dans la
>   charte du logo et dans les PDF, mais `#16243a`, la couleur du texte, dans les jetons de l'interface.
> - **`globals.css` garde la palette bleue de septembre** dans son premier `:root`, sous l'en-tête « Charte graphique
>   GERIMMO v3 — bleu » (`--marque: #2457f5`, `--encre: #0f2352`, `--creme: #f2f5fb`), ainsi que le `--filet: #e2e8f3`
>   du bloc RESPIRATION. `prestige.css` écrase ces valeurs : elles sont sans effet, mais trompeuses. L'ancienne version
>   de cette page s'y fiait. À nettoyer.
> - **`app/src/lib/charte-gerimmo.ts`**, qu'utilisent les écrans de secours, annonce « les mêmes couleurs que
>   prestige.css ». Trois valeurs diffèrent pourtant : crème `#f7f8fa` au lieu de `#f7f5f0`, texte secondaire `#626f82`
>   au lieu de `#4b5870`, filet `#dce2e9` au lieu de `#e2ddd3`.
> - **Le turquoise « information »** de la v4.3 (19/09) est toujours défini dans `globals.css` (`--turquoise` `#0d9488`,
>   `--turquoise-doux` `#d7f3ee`, `--turquoise-texte` `#0b6b62`). Il y sert une quinzaine de fois : tuile neutre,
>   suggestion de l'assistant, avatar, outils. Il ne fait pas partie de la palette « Maison » documentée.
> - **Titre de carte.** La documentation prévoit Figtree 16 px, graisse 600 (`h2.titre-carte`, 57 usages). Mais
>   `<CardTitle>` (59 usages) s'affiche par défaut en Fraunces 22 px (`prestige.css`), sauf sur les écrans qui le
>   corrigent un par un.
> - **Taille du logo.** Le code affiche toujours le logo complet avec sa devise, entre 56 et 180 px de large. La charte
>   demande le symbole seul sous 120 px et la version sans devise sous 220 px. `public/logo/` ne contient ni l'une ni
>   l'autre de ces versions : les icônes sont le logo complet réduit.
> - **Logo de l'en-tête public.** Il est posé directement sur l'en-tête clair, et un filtre assombrit son or
>   (`brightness(.67) saturate(1.25)`, dans `vitrine.css`). Cela revient à recolorer le logo et à poser l'or sur du
>   blanc, deux usages que la charte interdit. Partout ailleurs, la tuile bleu nuit (D28 A) est la règle.
>   `app/tests/marque-tuile.test.ts` inscrit l'en-tête public comme exception, avec la mention « décision
>   antérieure ».
> - **SVG périmés.** `public/logo/gerimmo-mark.svg` et `gerimmo-logo-horizontal.svg` portent l'ancien tracé (toit, G et
>   clé), le laiton `#C9A227` et le nom en Manrope 800. Aucun écran ne les charge. Il faut les retirer, ou les
>   remplacer par le logo officiel vectorisé (le « gerimmo-logo-pack » de l'artefact).
> - **Les PDF ont leur propre charte** : Caladea 10,5 pt, encre `#14304f`, laiton lisible `#854f0b`, filet or
>   `#c9a227`, crème `#faf7f0` (`app/src/lib/documents/gabarit.ts`). Le commentaire du fichier affirme qu'ils reflètent
>   les jetons de `globals.css`, ce qui n'est plus vrai. Faut-il les aligner ? La décision revient au dirigeant ; elle
>   est ouverte depuis le 24/09.
> - **Restes du 20/11** (`livrables/refonte-design-20261120/DESIGN-SYSTEM.md`,
>   [[Refonte visuelle « Maison » et Design System — 20 novembre 2026]]) :
>   - aucun jeton de rayon pour les petites tuiles d'icône (8 à 12 px) ni pour les puces ;
>   - les essais « téléphone » sont tous simulés, aucun n'a eu lieu sur un vrai iPhone ou Android ;
>   - le titre sans italique de l'accueil public attend la validation du dirigeant.
