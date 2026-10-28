/** Identité officielle. Les mêmes couleurs sont déclarées dans prestige.css.
 * Les écrans de secours restent autonomes quand le layout ne peut pas charger. */
export const CHARTE_GERIMMO = {
  nuit: "#14304f",
  or: "#b7975a",
  creme: "#f7f8fa",
  ivoire: "#ffffff",
  encre: "#16243a",
  corps: "#16243a",
  texteSecondaire: "#626f82",
  filet: "#dce2e9",
  marque: "#14304f",
  // Les courriels HTML écrivent leurs couleurs en dur (pas de feuille de style) : ils les prennent ICI, pas dans une
  // charte antérieure (audit final, PUB-19 : #0f2352, #151b2b, #4a5163 et le bleu #2457f5 survivaient dans huit gabarits).
  courriel: { titre: "#14304f", texte: "#16243a", secondaire: "#626f82", bouton: "#14304f", surBouton: "#ffffff" },
  logo: "/logo/gerimmo-officiel.png",
  logoTransparent: "/logo/gerimmo-officiel-transparent.png",
  logoTransparentLargeur: 1410,
  logoTransparentHauteur: 1115,
  logoLargeur: 2016,
  logoHauteur: 1594,
  // L'image des aperçus de partage (Open Graph, Twitter) : 1200 × 630, le format que Facebook, LinkedIn, WhatsApp et
  // iMessage attendent (audit final, PUB-18 : le logo brut 2016 × 1594 de 292 Ko y était recadré). Générée depuis le
  // logo transparent sur fond nuit (sharp), 17 Ko.
  imagePartage: "/marketing/partage-1200x630.jpg",
  imagePartageLargeur: 1200,
  imagePartageHauteur: 630,
  // Icônes d'onglet et d'écran d'accueil : le même logo réduit, aux mêmes proportions (audit #264, TRV-04 : le
  // logo de 285 Ko servait d'icône à chaque premier chargement). Écart moyen < 1/255 aux tailles affichées.
  icone: "/logo/gerimmo-icone-96.png",
  iconeTaille: "96x76",
  iconeEcran: "/logo/gerimmo-icone-228.png",
  iconeEcranTaille: "228x180",
} as const;
