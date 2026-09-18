---
type: synthesis
tags: [charte, visuel, ux, design-system, vitrine, marque-blanche]
status: stable
created: 2026-09-17
updated: 2026-09-18
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
- **Admin et artisan** gardent leur bandeau marine (le nouveau marine), sans
  autre changement : hors périmètre de cette première passe.

## Ce qui reste ouvert

> [!warning] Points à trancher
> - **Réglages fins** (intensité des lueurs, densité des listes, taille des
>   titres) : la direction est validée, le détail se règle écran par écran, à
>   l'usage.
> - **Symbole du logo** : toujours le tracé provisoire de la maquette d'août
>   (toit et clé) ; les fichiers officiels n'ont jamais été transmis.
> - **Admin et artisan** : passer aussi leurs bandeaux au blanc, ou assumer
>   un marine « back-office » ?
> - Les noms de classes historiques (`.btn-or`, `.kpi.or`) désignent
>   désormais du bleu ; renommer un jour, ou vivre avec.

## Relations

Supplante [[Charte visuelle de l'espace agent]] (valeurs) et la charte v2 de
[[2026-08-08-maquette-prototype-cliquable]] pour les couleurs et polices ·
contrainte [[Marque blanche]] respectée · les écarts assumés de
[[Coherence maquette-application|Cohérence maquette ↔ application]] restent
valables pour la structure des écrans, plus pour leur habillage · documents :
[[Etat des lieux generation de documents]].
