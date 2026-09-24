---
type: synthesis
tags: [design-system, charte, ux, ergonomie, animation, marque-blanche, personas]
status: stable
created: 2026-09-24
updated: 2026-09-24
sources: ["[[Charte visuelle v3 bleue]]", "[[Charte visuelle de l'espace agent]]", "[[2026-08-08-maquette-prototype-cliquable]]", "[[Marque blanche]]"]
---

# Design system Gerimmo

**En une phrase :** la page unique qui réunit ce que trois pages disaient
séparément — les **principes d'usage** (charte v1, août), la **structure des
écrans** (maquette v2, août) et les **valeurs** (charte v3 bleue, septembre) —
après la remise au propre du 24/09/2026 : une feuille de style sans couches
mortes, des cibles tactiles à 44 px, une couche de mouvement nommée, et 60
défauts d'ergonomie corrigés persona par persona.

> [!info] Ce qui fait foi
> Pour une valeur (couleur, police, rayon, durée) : cette page, puis le code
> (`app/src/app/globals.css`, section `:root`). Pour l'histoire d'une décision :
> [[Charte visuelle v3 bleue]] et [[Charte visuelle de l'espace agent]], qui
> restent en lecture. En cas de désaccord, le code l'emporte et cette page se
> corrige.

## 1. Principes

1. **Concevoir pour un agent immobilier débutant.** L'écran enseigne le métier
   en même temps qu'il le fait faire ([[Charte visuelle de l'espace agent]]).
2. **La couleur a une fonction, elle ne décore pas.** Le bleu dit « action » ou
   « actif » ; le turquoise dit « information » ; vert / ambre / rouge disent un
   **état** ; tout le reste est blanc et gris perle. Une tuile de chiffre porte
   le ton de la puce du même statut, pour qu'une couleur vue en haut se
   retrouve dans la liste en dessous.
3. **Une seule grande surface colorée par écran** : le bandeau d'accueil. Les
   cartes restent blanches.
4. **Le mouvement dit trois choses et rien d'autre** : un écran est arrivé, un
   geste a été pris, un contenu s'est ouvert. Tout s'éteint sous
   `prefers-reduced-motion`.
5. **Marque blanche** ([[Marque blanche]]) : aucune couleur en dur. Toute nuance
   intermédiaire s'écrit en `color-mix()` **dans la règle**, jamais en jeton
   dérivé posé sur `:root` — un jeton dérivé ne suivrait pas une agence qui
   redéfinit `--marque` sur son espace.
6. **Français intégral, aucun code interne à l'écran** : les références
   `RM-x.y.z` vivent en commentaire de code, les valeurs d'enum passent par une
   table de libellés avec un repli en français.
7. **Une alerte est une obligation non tenue**, jamais un état vide. Une
   pastille rouge partout n'alerte plus.

## 2. Jetons

### Couleurs (`:root`, `globals.css`)

| Rôle | Jeton | Valeur |
|---|---|---|
| Marque (action, actif) | `--marque` / `--marque-sombre` / `--marque-clair` | `#2457f5` / `#1a44cf` / `#dfe9ff` |
| Texte sur la marque | `--sur-marque` | `#ffffff` |
| Information | `--turquoise` / `--turquoise-doux` / `--turquoise-texte` | `#0d9488` / `#d7f3ee` / `#0b6b62` |
| Marine des titres | `--encre` / `--graphite` | `#0f2352` / `#17306b` |
| Corps / secondaire / libellé | `--corps` / `--texte-secondaire` / `--libelle` | `#151b2b` / `#4b5870` / `#53617a` |
| Fond de page / carte | `--creme` / `--ivoire` | `#f2f5fb` / `#ffffff` |
| Filets | `--filet` / `--filet-leger` / `--or-filet` | `#d9e1ef` / `#e9eef7` / `#cfdbff` |
| Survol d'un rang | `--survol` | `#edf2ff` |
| État : en ordre | `--success` / `--success-soft` | `#0f7a55` / `#e3f6ec` |
| État : attention | `--warning` / `--warning-soft` | `#b26d12` / `#fff1dc` |
| État : critique | `--destructive` / `--destructive-soft` | `#d13c3c` / `#fdeaea` |

Les alias de la coquille (`--surface`, `--trait`, `--texte-2`…) et les alias
historiques (`--or`, `--ardoise`, `--bleu`…) pointent sur ces jetons ; les
composants les lisent, une agence en marque blanche ne redéfinit que
`--marque`, `--encre` et leurs dérivés (`lib/marque-organisation.ts`).

**Il n'y a pas de mode sombre.** Le bloc `.dark` de shadcn a été retiré le
24/09 : il n'avait ni basculeur ni jetons de marque.

### Typographie

- **Manrope** (`--font-titres`) : titres, mot-marque, chiffres clés. Chiffres
  toujours alignés (`lining-nums tabular-nums`).
- **Figtree** (`--font-interface`) : tout le reste. Les libellés en capitales
  (sur-titres, en-têtes de tableau) suivent **une seule métrique** : 11 px,
  600, interlettrage 0,08 em.
- Échelle nommée (`--pas-*`) : affiche 44 · titre 29 · section 20 ·
  sous-titre 16 · corps 14 · appui 13 · mention 11 px.
  Attention Tailwind : une taille s'écrit `text-[length:var(--pas-section)]` ;
  `text-[var(--pas-section)]` est compilé en **couleur** (défaut trouvé sur 20
  titres de la console le 24/09).

### Formes, élévation, cibles

- Rayons : contrôles 10 px (`--radius`), cartes 14–16 px, bandeaux 16–24 px.
- Deux élévations, teintées de marine : `--ombre-portee` (carte posée),
  `--ombre-flottante` (fenêtre, tiroir).
- **`--cible-tactile: 44px`** : au doigt (`pointer: coarse`), boutons, champs,
  sélecteurs, pastilles cliquables, liens-boutons **et liens discrets** montent
  à 44 px. C'était 40 px jusqu'au 24/09, sous le seuil que la charte
  elle-même fixait.

### Mouvement

| Jeton | Valeur | Sert à |
|---|---|---|
| `--duree-rapide` | 0,15 s | survol, pression, couleur |
| `--duree` | 0,24 s | ouverture, dépliage, pastille, fenêtre |
| `--duree-lente` | 0,36 s | arrivée d'un écran |
| `--courbe` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | tout ce qui se déplace |

Ce que fait la couche de mouvement (fin de `globals.css`) :
tuiles de chiffres et KPI **en cascade** (50 ms d'écart, six rangs au plus) ·
`details` qui se déplient en glissant · fenêtres qui se posent (voile en fondu,
fenêtre qui monte d'un souffle) · jauges qui se remplissent depuis la gauche ·
pastilles de compte qui apparaissent d'un petit rebond (le seul « pop » du
produit) · boutons qui s'enfoncent d'un pixel à l'appui · flèches de lien qui
avancent au survol. Jamais de rotation décorative, jamais de rebond ailleurs.

## 3. Composants et primitives

| Primitive | Classe / composant | Règle |
|---|---|---|
| Coquille des espaces | `.coquille`, `barre-laterale.tsx` | Colonne 232 px → rail d'icônes < 1024 px → **barre basse de 4 entrées + tiroir « Menu »** < 640 px. Les 4 entrées sont **choisies par rôle** (`navigation-espace.ts`), pas les 4 premières |
| Espace locataire | `.loc-*`, `nav-locataire.tsx` | Même barre basse que l'agence sur téléphone (24/09) ; nom de l'agence et « Espace locataire » l'un sous l'autre |
| Bandeau d'accueil | `.accueil-bandeau` | Encre → bleu, texte blanc ; photo à droite sous un voile qui s'ouvre vers elle ; sans photo, des anneaux. Il **remplace** le repère photo de la coquille (une seule photo par écran) |
| Tuile de chiffre | `.tuile.{ok,attention,probleme,accent,neutre}` | Fond, chiffre et pastille d'icône au ton de l'état ; grille `auto-fit` sur la largeur du **conteneur** |
| KPI (fiches) | `.kpi.{vert,ambre,rouge,bleu}` + `.grille-kpi` | Liseré gauche 4 px, jamais `sm:grid-cols-3` |
| Assistant | `.assistant`, `.assistant-tete` | En-tête bleu plein : c'est lui qui parle. Il explique et propose, il ne décide pas |
| Puce de statut | `ui/statut.tsx`, `.puce` | Nommée par le sens (ok / attention / problème / accent / neutre) ; à préférer au `BadgeStatut` texte quand un geste est attendu |
| Fenêtre | `ui/modale.tsx` | **En-tête blanc** à filet (plus d'aplat marine, 24/09) ; variante critique : liseré rouge. Montée dans `<body>` par portail |
| Tiroir | `ui/tiroir.tsx` | Feuille montante du téléphone : menu, filtre, choix |
| Titre de page | `.entete-page` | Dans la coquille : un titre et un filet, pas de boîte. Hors coquille (locataire, portails) : bandeau clair à liseré bleu |
| Carte | `[data-slot="card"]`, `.loc-carte`, `.artisan-carte` | Un seul habillage : blanc, filet, `--ombre-portee`, 16 px |
| État vide | `.vide`, `.vide-guide` | Guide vers l'action ; « rien pour l'instant » ≠ « aucun résultat avec ces filtres » |
| Erreur | `.err`, `role="alert"` | **À côté du bouton qui a échoué** ; jamais `form action={async () => …}` qui avale l'erreur |

Les six patterns de l'espace agent (« À faire maintenant », section repliée +
pastille, ligne actionnable, questionnaire progressif, proposé / validé en un
clic, alerte = obligation non tenue) restent décrits dans
[[Charte visuelle de l'espace agent]].

## 4. La remise au propre du 24/09 — ce qui a été fait

### La feuille de style

`globals.css` empilait six couches (v3, v4, v4.1, v4.2, v4.3, « contraste »,
« grammaire ») qui se redéfinissaient : un audit sélecteur par sélecteur a
compté ~60 déclarations mortes, 8 classes inutilisées, 30 couleurs en dur hors
jetons (dont un `#1c3fb8` qui n'était aucun jeton et échappait à la marque
blanche), un bloc `.dark` sans basculeur et 25 commentaires périmés
(« laiton », « Plex Mono », « serif »). Résultat : **une définition par
composant**, 2 800 lignes au lieu de 2 960 malgré la couche de mouvement
ajoutée, zéro couleur en dur hors `:root`, deux composants morts supprimés
(`nav-proprietaire`, `nav-agence-premium`), la page d'erreur de fichier passée
de la palette v2 (crème, laiton) à la v3.

### L'ergonomie, persona par persona

Deux audits en lecture du code ont relevé **82 défauts** ; **~60 corrigés** le
jour même, dont les plus graves :

- **Artisan** — les codes postaux étaient **impossibles à saisir au
  téléphone** (`inputMode="numeric"` sur une liste séparée par des virgules :
  le clavier iOS n'a pas de virgule) ; un jeton `--danger` inexistant laissait
  une erreur sans couleur ; un état vide s'affichait malgré un échec de
  lecture ; décimales au point ; « le gérant » pour « l'agence ».
- **Propriétaire direct** — l'accueil affirmait « tout est en ordre » et
  « 0 lot » quand ses lectures **échouaient** ; un abonnement suspendu
  s'affichait « actif » en vert ; la fenêtre du lot lui parlait de mandat et
  d'honoraires.
- **Locataire** — jargon de gestionnaire (« imputation », « qualification »,
  « opposable », « lot ») ; « Gerimmo » qui parlait à la place de l'agence en
  marque blanche ; numéros d'urgence non cliquables ; erreurs loin de leur
  bouton ; deux noms pour la même page (« Mes signalements » / « Mes
  demandes »).
- **Agent / administrateur** — des codes internes visibles (six `RM-x.y.z`,
  `depot_garantie`, types d'alerte bruts) ; les **alertes absentes de la barre
  basse** du téléphone ; « Agenda & alertes » qui ne menait qu'aux alertes ;
  un bouton « Corriger » qui **supprimait** ; des erreurs avalées sur l'ajout
  de pièces ; un essai terminé caché à l'agent ; « arrive avec le chantier
  rôles » lu par un client.
- **Super admin** — pas d'écran de chargement ; deux pastilles « À
  surveiller » écrites en dur ; 20 titres sans taille (`text-[var(--pas-…)]`
  compilé en couleur) ; des dizaines de couleurs en dur sur Marketing et
  Territoire ; « Journal » à côté de « Journaux et conservation » ; les
  titres des bandeaux Marketing et Territoire, **marine sur bleu sombre**
  (illisibles, défaut antérieur vu sur les captures), passés en blanc.
- **Portes d'entrée** — `minLength={12}` bloquait la connexion d'un mot de
  passe plus court ; toute erreur devenait « Identifiants invalides » ; un
  compte sans accès tombait dans un cul-de-sac.

Vérification : typage, lint, 1 562 tests unitaires, build de production, et
captures des cinq personas à 1 280 et 390 px avant / après.

## 5. Ce qui reste ouvert

> [!warning] Points à trancher / à faire
> - **Un compte sans espace** : « Créer mon espace propriétaire » ne peut pas
>   pointer sur `/inscription` (le proxy renvoie tout compte connecté vers
>   `/espaces`). Il faut décider d'une voie d'entrée pour un compte existant.
> - **La coquille est hors couche CSS** : ses règles priment sur les
>   utilitaires des pages. La faire entrer dans `@layer components` est un
>   chantier à part, écran par écran, avec le garde-fou visuel.
> - **Références visuelles** (`e2e/visuel.spec.ts-snapshots`) à régénérer sur
>   le banc après cette passe : le bandeau et la barre du locataire ont changé.
> - **Symbole du logo** : toujours le tracé provisoire d'août.
> - **Tablette au doigt (641–1023 px)** : le rail n'affiche que des icônes avec
>   un `title` que le doigt ne voit pas ; garder un mot court sous l'icône.
> - **22 défauts non corrigés** de l'audit (P2/P3 structurels) : scission
>   des relances hors du long formulaire de profil, liste des lots sans
>   titulaire, actions sur la page Santé, pastille de niveau des sections du
>   dossier de bail, recherche et pagination des listes de la console.
> - **PDF** : ils gardent leur charte (bleu, or, ivoire). Aligner ou non reste
>   une décision du porteur.

## Relations

Réunit et supplante pour les **valeurs** [[Charte visuelle v3 bleue]] et
[[Charte visuelle de l'espace agent]] (qui restent la mémoire des décisions) ·
contrainte [[Marque blanche]] · personas [[Agent immobilier]],
[[Administrateur d'agence]], [[Propriétaire bailleur]], [[Locataire]],
[[Artisan]], [[Super Admin]] · prolonge
[[État des lieux du design et des parcours]] (relevé du 11/09 : « chaque écran
l'a fait dans son coin ») · documents : [[Etat des lieux generation de documents]].
