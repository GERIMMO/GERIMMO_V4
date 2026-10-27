import { CSS_POLICES } from "@/lib/documents/polices";

// Sur un écran de téléphone, les marges d'une feuille A4 (56 pt) et le titre
// espacé à 23 pt ne tiennent pas : on les resserre À L'ÉCRAN seulement —
// l'impression garde la mise en page du modèle.
export const CSS_ECRAN = `<style>@media screen and (max-width: 640px){
  body{padding:20px 16px 0;font-size:10pt}
  h1{font-size:15pt;letter-spacing:.16em}
  .sous-titre{font-size:9pt;letter-spacing:.12em}
  .entete{flex-direction:column;align-items:flex-start;gap:8px}
  .cartouche-ref{text-align:left}
  .cartouches{grid-template-columns:1fr}
  .sig-emetteur{margin-left:0}
}</style>`;

/** Le document conforme tel que l'écran l'affiche (page /quittance/[id] et
 * aperçu en fenêtre de « Mes documents ») : sans les polices incorporées du
 * PDF, avec la feuille d'écran. */
export function htmlQuittancePourEcran(html: string): string {
  return html.replace(CSS_POLICES, "").replace("</head>", `${CSS_ECRAN}</head>`);
}
