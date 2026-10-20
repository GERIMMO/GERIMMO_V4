import { randomUUID } from "node:crypto";

/** PDF complet et distinct à chaque essai, sans donnée personnelle ni engagement. */
export function pdfFictif(octetsDeRemplissage = 0): Buffer {
  const flux = `BT /F1 12 Tf 30 700 Td (ESSAI FICTIF SANS ENGAGEMENT ${randomUUID()}) Tj ET\n%${"x".repeat(octetsDeRemplissage)}\n`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}endstream`,
  ];
  let contenu = "%PDF-1.7\n";
  const positions: number[] = [];
  objets.forEach((objet, i) => {
    positions.push(Buffer.byteLength(contenu));
    contenu += `${i + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = Buffer.byteLength(contenu);
  contenu += `xref\n0 6\n0000000000 65535 f \n${positions.map(p => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(contenu);
}
