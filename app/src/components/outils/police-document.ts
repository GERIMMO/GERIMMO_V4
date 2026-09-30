import localFont from "next/font/local";

// La police des documents (30/09) : Caladea, celle des PDF produits par
// l'application (lib/documents/polices.ts). La lettre de révision et la
// quittance des outils gratuits la reprennent à l'écran comme sur papier.
// Fichiers dans le dépôt (app/polices/, licence OFL) : aucun réseau au build.
export const policeDocument = localFont({
  src: [
    { path: "../../app/polices/caladea-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../app/polices/caladea-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
