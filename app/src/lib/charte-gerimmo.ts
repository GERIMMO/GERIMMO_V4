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
  logo: "/logo/gerimmo-officiel.png",
  logoTransparent: "/logo/gerimmo-officiel-transparent.png",
  logoTransparentLargeur: 1410,
  logoTransparentHauteur: 1115,
  logoLargeur: 2016,
  logoHauteur: 1594,
  // Icônes d'onglet et d'écran d'accueil : le même logo réduit, aux mêmes proportions (audit #264, TRV-04 : le
  // logo de 285 Ko servait d'icône à chaque premier chargement). Écart moyen < 1/255 aux tailles affichées.
  icone: "/logo/gerimmo-icone-96.png",
  iconeTaille: "96x76",
  iconeEcran: "/logo/gerimmo-icone-228.png",
  iconeEcranTaille: "228x180",
} as const;
