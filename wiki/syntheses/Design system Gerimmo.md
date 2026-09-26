---
type: synthesis
tags: [design-system, charte, ux, ergonomie, animation, marque-blanche, personas]
status: stable
created: 2026-09-24
updated: 2026-09-26
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
| Coquille des espaces | `.coquille`, `barre-laterale.tsx` | Colonne 232 px → rail d'icônes < 1024 px → **barre basse de 4 entrées + tiroir « Menu »** < 640 px. Les 4 entrées sont **choisies par rôle** (`navigation-espace.ts`), pas les 4 premières. **Agenda et Statistiques sont des entrées principales** (retour du porteur, 24/09 : « un clic en trop » derrière « Plus ») |
| Espace locataire | `.loc-*`, `nav-locataire.tsx` | Même barre basse que l'agence sur téléphone (24/09) ; nom de l'agence et « Espace locataire » l'un sous l'autre |
| Bandeau d'accueil | `.accueil-bandeau` | Encre → bleu, texte blanc ; photo à droite sous un voile qui s'ouvre vers elle ; sans photo, des anneaux. **C'est la seule photo d'un espace** : le « repère photographique » qui coiffait chaque page a été retiré partout (retour du porteur, 24/09 : « le bandeau est en trop ») |
| Agenda | `agenda/page.tsx`, `.agenda-calendrier`, `.agenda-jour` | **Calendrier mensuel** : une case par jour, le chiffre dit combien de rendez-vous commencent ce jour-là, un clic sur le jour lit ses rendez-vous dessous (retour du porteur, 24/09). Les vues « Dates à confirmer » et « À vérifier » restent des listes |
| Rang de liste | `.rang`, `.rang-lot` | **Tout le rang se clique** (`width: 100%`), jamais seulement le texte (retour du porteur, 24/09 : « je veux que tout le carré soit cliquable ») |
| Compte sans espace | `espaces/choix-espace.tsx` | « Que voulez-vous faire ? » : ouvrir son espace propriétaire en une étape (même RPC idempotente que l'inscription), inscrire son entreprise d'artisan, ou apprendre que l'agence invite |
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

### Le tour du site du 24/09 — 120 écrans, 469 corrections

Après les premiers retours du porteur sur la version en ligne, tout le site a été relu écran par écran, persona par persona : 120 écrans capturés à 1280 px et 390 px, 1 176 relevés bruts, 562 défauts uniques, 501 confirmés par deux vérificateurs indépendants (réel dans le code du jour ? voulu ?), 469 corrigés et recapturés. Par zone : public 34, locataire 45, artisan 36, console 92, accueil et parc 47, personnes 46, argent 60, suivi 56, réglages 40, composants partagés 13.

Ce que le tour a fixé comme règles, en plus des principes du § 1 :

- **Un seul bandeau par écran.** Le bandeau d'accueil d'un espace est la seule surface colorée pleine largeur ; toute page de second niveau porte l'en-tête standard (titre, mention, action, filet). Supprimés : les heros de l'espace artisan, du journal, de la console, le filet dégradé sous la barre haute (`.coquille-haut::after`), la photo du parcours de démarrage, le hero « P » de l'accueil propriétaire, la tête teintée de l'assistant.
- **Tout le carré se clique.** Un rang, une carte, une tuile qui mène quelque part est un lien entier (`.rang`, `.rang-lot`, `.agenda-rendezvous`, cartes d'article, tuiles KPI) ; le mot-flèche à droite reste un signe, pas la seule zone active.
- **Pas de clic pour rien.** Le plan du jour s'ouvre seul jusqu'à cinq actions (`SEUIL_PLAN_OUVERT`) ; chez le propriétaire, le livre et les statistiques sont au menu principal, Paramètres dans « Plus » ; « Menu » s'allume quand la page vit dessous ; le sélecteur d'organisation est dans le tiroir sur téléphone.
- **L'aide sans recouvrir.** Le rond flottant « Aide et retours » n'est plus dans l'espace agence (barre haute + tiroir « Menu ») ; ailleurs il se pose là où rien n'est dessous (au-dessus de la barre d'onglets artisan, dans la gouttière de la console, masqué sur le téléphone locataire dont le tiroir l'a).
- **44 px au doigt, partout.** `pointer-coarse:min-h-11` sur les tailles de `<Button>` ; `.btn-secondaire`, `a.lien-bandeau`, `summary.puce`, les liens de la barre haute rejoignent le filet tactile de `globals.css` ; `.lien-texte` pour un lien au milieu d'une phrase (taille du texte, sans hauteur tactile qui creuserait l'interligne).
- **Les mots du persona.** Le propriétaire direct lit « votre parc », « Mes lots », « Locataires & garants », jamais « votre agence » ni « mandat » ; un état a un seul nom (« Rendez-vous à fixer ») ; les codes internes ne s'affichent pas (« Bloquant / Majeur / Mineur » plutôt que N1-N3, « document_test » retiré du dépôt).
- **Les chiffres tiennent.** `eur()` pose une espace insécable avant « € » ; la valeur d'une `.ligne-info` ne se coupe jamais ; trois tuiles sur téléphone font 2 + 1 pleine largeur (`.tuiles`, `.grille-kpi`).

## 5. Ce qui reste ouvert

> [!info] Suite du 25/09
> Le tour d'écrans a été refait le 25/09 sur 134 écrans après la nuit de travail du porteur avec ChatGPT : 129 défauts uniques, ≈110 corrigés (dont le bandeau photo réapparu sur chaque en-tête, retiré). Relevé, corrections et restes dans [[Audit complet du 25 septembre 2026]].

> [!info] Nuit du 25 au 26/09 — retour à la respiration du 24/09
> Le porteur, devant la version en ligne du 25/09 : « le visuel est trop strict, pas assez respirant, le menu est déroulant, je veux le menu fixe », puis « je veux vraiment l'ancien visuel ». La référence redevient l'état approuvé du 24/09 (`fbde628`), le contenu du 25/09 est gardé. 136 écrans comparés (ancien / nouveau, bureau et téléphone), quatre périmètres corrigés :
> - **Jetons de respiration** (bloc `RESPIRATION` en fin de `globals.css`) : corps 15 px / interligne 1,6, filets plus clairs (`--filet`, `--filet-leger`), rythmes `--rythme-3/4/5` (18, 28, 48 px), cartes 26 × 28 px et rayon 18, rangs 16 × 18 px, tuiles 18 × 20 px, boutons 10 × 18 px, colonnes de la console et des espaces 36 × 44 px sur ordinateur, 28 px entre deux cartes empilées — **jamais dans une grille** (`:is(.grille-kpi, .tuiles, .grid, .flex) > .loc-carte + .loc-carte`). Le titre de carte reste au pas de 16 px (`--pas-sous-titre`), le `h2` de 21 px est celui de l'écran.
> - **Menus fixes** : plus aucun accordéon dans la console (rubriques = titres discrets `.admin-menu-titre`, 10,5 px gris) ni dans l'espace agence (« Plus » = titre de section `.coquille-groupe > p`, entrées toujours visibles ; caché sur le rail d'icônes, tiroir téléphone inchangé).
> - **Formulaires** : libellés, aides et erreurs de 12 à 14 px, champs fichier natifs remplacés par `ChampFichier` (français), un pas de plus entre les groupes d'un formulaire long ; `.ligne-info` à 13,5 px / 11 px et qui passe à la ligne sous 640 px.
> - **Console** : les boîtes ad hoc (`rounded-xl border`, `bg-white`, bleu/ambre Tailwind) deviennent `.loc-carte`, `.colonne-liste` + `.rang` et les jetons de la palette ; doctrine repliée sous un `summary` commun ; Territoire ne déborde plus à 390 px.
> - **Artisan et public** : cartes artisan au même pas que les autres ; tableau des prestataires (pages légales) empilé en fiches sur téléphone (`.tableau-fiches`).

> [!info] 26/09 — le plan de la console, dessiné par le porteur
> Sept entrées dans la colonne : Vue d'ensemble, Utilisateurs, Veille, Marketing, Développement, puis, sous un filet, Historique et conservation et Paramètres. Les pages d'une rubrique sont des **onglets** sous le bandeau (`.admin-onglets`, soulignement bleu sur l'onglet ouvert, défilement horizontal au téléphone). Le menu dit où l'on est, les onglets disent quoi regarder. Un seul tableau (`lib/rubriques-supervision.ts`) sert les deux ; les badges (décisions attendues, artisans à valider) s'affichent sur l'entrée ET sur l'onglet.

> [!warning] Points à trancher / à faire
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

### Après le tour du 24/09 — les décisions (prises le soir même, à la demande du porteur)

Le porteur a demandé de trancher « de manière logique » : à chaque fois, la promesse déjà faite à l'utilisateur ou la règle déjà écrite l'emporte.

- **Abonnement pendant l'essai** — *tenu* : la session Stripe reçoit `trial_end` (fin de l'essai, si elle est à plus de 48 h) ; la carte n'est débitée qu'à la fin de l'essai, et la page le redit avec la date. Sous 48 h, prélèvement immédiat et phrase adaptée.
- **Fin d'essai et bien offert** — *les conditions l'emportent* : `org_ecriture_ouverte` laisse l'écriture ouverte quand la quantité facturable est nulle (propriétaire d'un seul bien, agence sans lot sous mandat actif — personne ne doit rien). Migration `20260924200000_essai_fini_rien_a_payer`, appliquée ; tests SQL mis à jour.
- **Comptabilité de l'agent** — *la décision du 12/09 tient, sans impasse* : hors du menu principal, mais « Écritures & rapports » dans son groupe « Plus », puisque la validation des rapports de gestion n'existe que là et que son tableau de bord l'y envoie.
- **Barre basse à quatre entrées** — *inchangée* : la règle du § 3 ; « Menu » s'allume et porte les compteurs des entrées qu'il cache.
- **Titres d'onglet « — Gerimmo »** — *inchangés* dans l'espace agence (l'équipe d'une agence se sert de l'outil Gerimmo).
- **Migrations « nom de l'agent »** — *non appliquées* : les comptes d'agent n'ont pas de nom en base (`accounts` ne porte qu'un e-mail), la tuyauterie resterait vide. À traiter comme un manque de modèle (un nom d'affichage sur le compte ou l'adhésion).
- **Libellés** — *gardés* : « Sans rôle en cours » / « Sans bail en cours », carte « Mandats » masquée sur la fiche d'un locataire, « Fiche mandant » réduit à la flèche sur téléphone, « Conservé 5 ans », « Validé Gerimmo », compteur de créneaux au-dessus du bouton.
- **Restes** — *faits* : `mesure-autonomie` de la console (liste sous 640 px, grille, titre paramétrable, « Par activité » ouvert, libellés lisibles), impression de la quittance depuis « Mes documents » (`?imprimer=1`), « ex. 12 rue des Lilas », libellés du formulaire de bail (« Loyer hors charges », « Trimestre de l'indice de référence des loyers (IRL) », « Révision annuelle du loyer (IRL) »), dates des diagnostics affichées en français ; et le **compteur d'alertes** : l'accueil, le badge « Alertes » et la page Alertes lisent le même calcul (`lib/actions-du-jour.ts`), la page montrant aussi les rangs « À débloquer sur les baux ».

## Relations

Réunit et supplante pour les **valeurs** [[Charte visuelle v3 bleue]] et
[[Charte visuelle de l'espace agent]] (qui restent la mémoire des décisions) ·
contrainte [[Marque blanche]] · personas [[Agent immobilier]],
[[Administrateur d'agence]], [[Propriétaire bailleur]], [[Locataire]],
[[Artisan]], [[Super Admin]] · prolonge
[[État des lieux du design et des parcours]] (relevé du 11/09 : « chaque écran
l'a fait dans son coin ») · documents : [[Etat des lieux generation de documents]].
