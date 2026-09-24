---
type: synthesis
tags: [charte, visuel, ux, design-system, vitrine, marque-blanche]
status: stable
created: 2026-09-17
updated: 2026-09-24
sources: ["[[2026-08-08-maquette-prototype-cliquable]]", "[[2026-09-04-maquette-v3-prototype]]"]
---

# Charte visuelle v3 — bleue

**En une phrase :** le 17/09/2026, le porteur du projet juge le site « vieux et
figé » — l'identité (encre, laiton, crème, serif) **et** la mise en page sans
mouvement — et décide une refonte : blanc et gris perle, **une seule couleur de
marque, le bleu**, une sans-serif moderne, des angles arrondis, des transitions
discrètes. Cette page fixe les valeurs ; elle supplante la charte v2 pour les
couleurs et les polices, pas pour les principes d'usage.

> [!info] Statut
> Depuis le 24/09, les valeurs de référence (jetons, mouvement, cibles) sont
> tenues dans [[Design system Gerimmo]], qui réunit cette page, la charte v1 et
> la structure de la maquette v2. Cette page reste la mémoire des décisions.
>
> Implémentée dans le code le 17/09 (PR #58) et **validée par le porteur du
> projet le 18/09** sur la prévisualisation Vercel, puis fusionnée dans `main`.
> C'est désormais la charte de référence ; les réglages fins se font à l'usage.

## La décision et ses références

- **Ce qui dérangeait** (porteur du projet, 17/09) : un rendu daté et statique.
  Les deux à la fois : la palette encre/laiton/crème avec titres à empattements,
  et des écrans « posés » sans respiration ni mouvement.
- **Direction retenue** : la sobriété des outils de gestion récents — neutres
  blancs et gris perle, une couleur d'accent unique, typographie géométrique,
  cartes douces, micro-animations. Références discutées : Qonto (base) et
  Pennylane (discipline des tableaux et des listes). Choix de la couleur :
  **bleu** (« Go, bleu »).
- **Périmètre** : vitrine, journal, portes d'entrée (connexion, inscription,
  mot de passe), chrome des espaces agence / propriétaire / locataire. Les
  écrans applicatifs héritent par les jetons ; les **documents PDF ne bougent
  pas** (leur gabarit a sa propre charte, voir
  [[Etat des lieux generation de documents]]).

## Palette (jetons CSS, `app/src/app/globals.css`)

| Rôle | Jeton | Valeur |
|---|---|---|
| Marque | `--marque` | `#2457f5` |
| Marque, appuyée (survol, texte sur clair) | `--marque-sombre` | `#1a44cf` |
| Marque, lavis (fonds actifs, pastilles) | `--marque-clair` | `#e9efff` |
| Marine des titres (ex-encre) | `--encre` | `#0f2352` |
| Corps de texte | `--corps` | `#151b2b` |
| Texte secondaire / libellés | `--texte-secondaire` / `--libelle` | `#5b6478` / `#6b7386` |
| Fond de page (ex-crème) | `--creme` | `#f6f7fb` |
| Surfaces (cartes, barres) | `--ivoire`, `--carte` | `#ffffff` |
| Filets | `--filet` / `--filet-leger` / `--or-filet` | `#e3e7ef` / `#eef1f6` / `#cfdbff` |
| Succès / attention / critique | `--success` / `--warning` / `--destructive` | `#0f7a55` / `#b26d12` / `#d13c3c` |

**Compatibilité** : les anciens noms (`--or`, `--or-clair`, `--or-texte`,
`--sur-or`, `--ardoise`, `--bleu`, `--encre-profond`…) sont **conservés et
remappés** sur les jetons bleus. Les quelque 330 usages dans les composants
n'ont pas eu à changer, et la [[Marque blanche]] (couleurs par variables)
reste intacte : une agence qui redéfinit sa couleur principale redéfinit
`--marque`.

## Typographie

- **Manrope** (500 à 800) pour la marque, les titres et les chiffres clés ;
  titres en 700, sous-titres en 600, interlettrage resserré (−0,015 em).
  Mot-marque GERIMMO en 800, interlettrage 0,2 em.
- **Figtree** (400 à 700) pour tout le reste : corps, libellés, pastilles,
  tableaux.
- **Les libellés en capitales** (champs, en-têtes de tableau, eyebrows) passent
  de la mono à la sans-serif : 11 px, 600, interlettrage 0,08 em.
- Disparaissent : Cormorant Garamond, Instrument Sans, IBM Plex Mono.

## Formes et mouvement

- **Rayons** : boutons 10 px, cartes 14–16 px, bandeaux 16–24 px, anneau de
  focus 6 px (jeton `--radius` = 0,625 rem).
- **Ombres** teintées de bleu, jamais grises (`--ombre-portee`,
  `--ombre-flottante`).
- **Mouvement** : apparition en fondu-glissé du contenu principal (0,32 s),
  squelettes en vague, cartes et rangées qui se soulèvent au survol, boutons
  qui foncent. Tout est désactivé sous `prefers-reduced-motion`.

## Chrome des écrans

- **Vitrine** : bandeau blanc collé en haut (flou de fond), héros blanc à
  lueurs bleues, sections en alternance blanc / gris perle, cartes à survol,
  tarif Propriétaire direct mis en avant par un liseré bleu, bandeau
  « agences » en dégradé bleu → marine. Le **contenu** (fonctionnalités, tarifs,
  FAQ) est inchangé ; seul ajout de fond : la facture d'honoraires figure
  parmi les livrables agence.
- **Journal** : même bandeau blanc, héros blanc ; plus d'aplat marine.
- **Portes d'entrée** : panneau gauche en dégradé bleu, promesse en Manrope
  extra-gras.
- **Espaces** (agence, propriétaire, locataire) : barre latérale **blanche**
  de 240 px avec filet à droite, marque en marine, entrée active en lavis bleu
  sur texte bleu foncé, bandeau du jour en dégradé bleu.
- **Console d'administration, portail artisan, « Mes espaces », pages légales
  et assistance** : ces cinq écrans portaient chacun leur propre bandeau
  marine. Ils partagent désormais **un seul bandeau blanc** (`.bandeau-appli`,
  collé en haut, filet en bas), avec les liens en pastille au survol
  (`.lien-bandeau`). Plus aucun aplat sombre dans le produit : c'est la marque
  qui dit où l'on est.
- **Les états actifs** convergent sur le bleu : onglets de la console,
  onglet du dossier de bail, ronds d'étape, boutons du portail artisan.

## Défauts corrigés par la seconde passe (18/09)

Le remappage des jetons a produit trois textes devenus illisibles, invisibles
au typage comme au build — ils se voient à l'œil, sur un écran :

| Où | Ce qui se passait | Correction |
|---|---|---|
| Pastilles d'initiales (« Mes espaces », portail artisan, fiche personne, parcours de démarrage) | Laiton sur marine en v2, donc **bleu sur marine** après remappage : contraste ~1,9:1 | Jeton `.pastille-marque` : lavis bleu, texte bleu foncé |
| Sélecteur d'organisation du propriétaire | Écrit en crème pour la barre latérale marine, devenu **blanc sur blanc** | Filet et texte marine |
| Erreur du formulaire de devis agences | Posée en laiton sur le bandeau, devenue **bleue sur bleu** | Pastille blanche, texte rouge, `role="alert"` |

Leçon : un remappage de jetons ne casse rien mécaniquement, il déplace les
contrastes. Toute page qui écrivait clair sur un fond sombre est à revoir
quand ce fond s'éclaircit.

## Deuxième relevé, au doigt sur iPad (19/09/2026)

Retour de l'humain sur trois écrans de l'espace agence — portefeuille, fiche de
lot, loyers d'un bail : « trop monochrome, trop fade, pas joli et compliqué à
comprendre ». Le diagnostic a séparé ce qui relevait du goût de ce qui relevait
du **défaut mesurable** — il y en avait cinq.

| Défaut | Cause | Correction |
|---|---|---|
| « QUITTANCEMENT » tronqué, « 939,76 € » sur trois lignes | `sm:grid-cols-3` compte les colonnes sur la largeur de la **fenêtre** ; dans le volet droit d'une vue scindée, chaque tuile tombait à 170 px | `.grille-kpi` en `auto-fit`/`minmax` — la grille compte sur **sa** place ; le chiffre se dimensionne en `cqi` |
| Un sur-titre en capitales qui déborde de sa tuile | Capitales + interlettrage = **mot insécable** que le flex ne peut pas rétrécir | `overflow-wrap: anywhere` sur `.kpi .eyebrow` |
| Titre de carte sur trois lignes pendant que la mention de droite est coupée | `.entete-carte` ne passait pas à la ligne hors mobile, et rien ne protégeait le titre | Retour à la ligne à toute largeur ; le titre prend la place, la mention garde la sienne |
| « Lot unique » flottant dans une boîte blanche ajustée au mot | `.portail-ecrans .entete-page` est un sélecteur **descendant** : il transformait en carte un titre imbriqué dans une rangée flex | `EnteteFiche` n'emprunte plus la classe d'une barre de titre de page |
| Sept rangées identiques sur la fiche d'un lot, dont une seule appelle un geste | `BadgeStatut` est « sans pastille ni fond » (charte v2) : « 1 MANQUANT » se perdait | Puce de statut v3 + liseré ambre sur la rangée |

Sur le fond — le « monochrome » — la décision est que **la couleur dit l'état,
elle ne décore pas**. Une tuile de chiffre porte le ton de la puce du même
statut (vert « loué », ambre « en préparation », bleu pour l'argent, rouge pour
un solde dû), de sorte qu'une couleur vue sur une tuile se retrouve dans la
liste au-dessous. L'échéancier d'un bail, qui alignait huit éléments de même
poids par ligne, devient une colonne : période et détail à gauche, montant
aligné, statut toujours au même endroit, documents en grappe discrète à droite,
liseré de statut à l'extrême gauche — l'impayé se voit sans se lire.

Leçon : les grilles qui se règlent sur la **fenêtre** mentent dès qu'un écran a
deux colonnes. À l'intérieur d'un volet, d'une carte ou d'une modale, la mesure
utile est celle du conteneur.

## Troisième défaut de la charte v3 : le bandeau qui avalait les modales (19/09)

Capture du porteur du projet, console d'administration : la synthèse d'alertes
s'ouvre **coupée en deux** — on lit « DONT 6 CRITIQUES » et la moitié du titre,
rien d'autre.

La cause n'est pas la modale, c'est **son ancêtre**. `position: fixed` ne se
règle sur la fenêtre que si aucun ancêtre ne forme un **bloc conteneur** ; or
`backdrop-filter`, `transform`, `filter`, `perspective` et `will-change` en
forment un. La charte v3 a posé `backdrop-filter: blur(8px)` sur
`.bandeau-appli` (le bandeau blanc collant qui a remplacé les cinq bandeaux
marine), et la synthèse d'alertes est écrite **dans** ce bandeau — console,
espaces agence, « Mes espaces ». Son `inset-0` se résolvait donc sur les
soixante pixels du bandeau.

**Corrigé le 19/09 par un portail** : la modale se monte dans `<body>`, d'où
qu'elle soit écrite. Retirer le `backdrop-filter` n'aurait réparé que ce
bandeau-ci, jusqu'au prochain ancêtre animé ; le portail règle la classe
entière. L'épreuve navigateur `arrivee-alertes` mesure désormais le **voile** :
il doit couvrir toute la hauteur de la fenêtre.

Leçon, jumelle de la précédente : un effet visuel posé sur un conteneur change
le référentiel de tout ce qu'il contient. `backdrop-filter` n'est pas qu'un
flou — c'est un nouveau repère pour les positions fixes de toute sa
descendance.

## Ce qui reste ouvert

> [!warning] Points à trancher
> - **Réglages fins** (intensité des lueurs, densité des listes, taille des
>   titres) : la direction est validée, le détail se règle écran par écran, à
>   l'usage.
> - **Symbole du logo** : toujours le tracé provisoire de la maquette d'août
>   (toit et clé) ; les fichiers officiels n'ont jamais été transmis.
> - Les noms de classes historiques (`.btn-or`, `.kpi.or`) désignent
>   désormais du bleu ; renommer un jour, ou vivre avec.

## Relations

Supplante [[Charte visuelle de l'espace agent]] (valeurs) et la charte v2 de
[[2026-08-08-maquette-prototype-cliquable]] pour les couleurs et polices ·
contrainte [[Marque blanche]] respectée · les écarts assumés de
[[Coherence maquette-application|Cohérence maquette ↔ application]] restent
valables pour la structure des écrans, plus pour leur habillage · documents :
[[Etat des lieux generation de documents]].
