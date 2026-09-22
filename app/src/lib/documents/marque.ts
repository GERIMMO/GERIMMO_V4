import { couleurLisible, couleurValide, domaineValide, echapperMarque, enteteMarqueHtml, nomMarque, type MarqueOrganisation } from "../marque-organisation";
import { domaineDuSite } from "../site";
import type { DocumentAssemble } from "./gabarit";

/** Only validated inline images enter the PDF; an agency logo cannot make Chromium fetch a remote URL. */
export function appliquerMarqueDocument(document: DocumentAssemble, marque: MarqueOrganisation | null): DocumentAssemble {
  if (!marque) return document;
  const accent = couleurLisible(couleurValide(marque.couleur_primaire) ? marque.couleur_primaire : "#2457f5");
  const encre = couleurLisible(couleurValide(marque.couleur_secondaire) ? marque.couleur_secondaire : "#0f2352");
  const css = `<style>:root{--encre:${encre};--sur-encre:#fff;--laiton:${accent};--laiton-filet:${accent};--creme:#f6f7fb}</style>`;
  const nom = echapperMarque(nomMarque(marque));
  return {
    ...document,
    html: document.html.replace("</head>", `${css}</head>`).replace("<body>", `<body>${enteteMarqueHtml(marque)}`),
    piedHtml: document.piedHtml.replace("G E R I M M O", nom).replace(echapperMarque(domaineDuSite()), marque.domaine_personnalise_verifie_le && marque.domaine_personnalise && domaineValide(marque.domaine_personnalise) ? echapperMarque(marque.domaine_personnalise) : echapperMarque(domaineDuSite())),
  };
}
