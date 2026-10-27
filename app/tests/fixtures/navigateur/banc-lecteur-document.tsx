import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LecteurDocument } from "../../../src/components/lecteur-document";

declare global {
  interface Window {
    __lecteurRequetes: { url: string; credentials?: RequestCredentials; cache?: RequestCache; redirect?: RequestRedirect; annule: boolean }[];
    __lecteurRendus: { page: number; largeur: number; hauteur: number }[];
    __lecteurDocumentsCharges: number;
    __lecteurDocumentsDetruits: number;
    __lecteurFluxAnnules: number;
    __lecteurTerminerAncien?: () => void;
  }
}

/** Deux pages sans données privées, utilisables aussi par le vrai moteur PDF.js. */
function pdfDeuxPages() {
  const textes = ["BT /F1 24 Tf 40 700 Td (Document fictif - page 1) Tj ET", "BT /F1 24 Tf 40 700 Td (Document fictif - page 2) Tj ET"];
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    ...[6, 7].map(contenu => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents ${contenu} 0 R >>`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...textes.map(texte => `<< /Length ${texte.length} >>\nstream\n${texte}\nendstream`),
  ];
  let pdf = "%PDF-1.4\n";
  const positions = [0];
  for (const [index, objet] of objets.entries()) {
    positions.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objet}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  pdf += positions.slice(1).map(position => `${String(position).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const scenario = new URLSearchParams(location.search).get("scenario") || "image";
const pdf = pdfDeuxPages();
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBe0AAAAASUVORK5CYII="), c => c.charCodeAt(0));
let echecs = scenario === "erreur" ? 1 : 0;
window.__lecteurRequetes = [];
window.__lecteurRendus = [];
window.__lecteurDocumentsCharges = 0;
window.__lecteurDocumentsDetruits = 0;
window.__lecteurFluxAnnules = 0;

const fetchInitial = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.pathname.startsWith("/pdfjs/")) return fetchInitial(input, init);
  const requete = { url: url.href, credentials: init?.credentials, cache: init?.cache, redirect: init?.redirect, annule: false };
  window.__lecteurRequetes.push(requete);
  init?.signal?.addEventListener("abort", () => { requete.annule = true; }, { once: true });
  const estPdf = scenario.startsWith("pdf");
  const mime = estPdf ? "application/pdf" : "image/png";
  const octets = estPdf ? pdf : png;

  if (url.origin === location.origin && url.pathname.startsWith("/fichier/")) {
    if (url.searchParams.get("mode") === "telechargement") return new Response(octets, { headers: { "Content-Type": mime, "Content-Disposition": "attachment; filename=document-fictif.pdf" } });
    return Response.json({ url: `https://stockage.example.test/signe/${url.pathname.split("/").at(-1)}?token=jeton-fictif`, mime, nom: url.pathname.endsWith("document-suivant") ? "Document suivant" : "Document fictif" });
  }
  if (url.origin !== "https://stockage.example.test") throw new Error(`Requête inattendue dans le banc : ${url.origin}${url.pathname}`);
  if (echecs-- > 0) return new Response("Lien expiré", { status: 403 });
  if (scenario === "changement" && url.pathname.endsWith("/document")) {
    return new Promise<Response>((resolve, reject) => {
      window.__lecteurTerminerAncien = () => resolve(new Response(png, { headers: { "Content-Type": "image/png" } }));
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Chargement annulé", "AbortError")), { once: true });
    });
  }
  if (scenario === "taille-annoncee") return new Response(png, { headers: { "Content-Length": String(51 * 1024 * 1024), "Content-Type": mime } });
  if (scenario === "taille-flux") {
    let blocs = 0;
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) { if (blocs++ < 100) controller.enqueue(new Uint8Array(1024 * 1024)); else controller.close(); },
      cancel() { window.__lecteurFluxAnnules++; },
    }), { headers: { "Content-Type": mime } });
  }
  return new Response(octets, { headers: { "Content-Type": mime } });
};

function Banc() {
  const [fichier, changerFichier] = useState("document");
  const [visible, afficher] = useState(true);
  return <main style={{ width: "100%", maxWidth: 960, margin: "auto" }}>
    <button onClick={() => changerFichier("document-suivant")}>Changer de document dans le banc</button>
    <button onClick={() => afficher(false)}>Fermer le lecteur dans le banc</button>
    {visible && <LecteurDocument fichier={`/fichier/${fichier}`} titre={fichier === "document" ? "Document fictif" : "Document suivant"} mime={scenario.startsWith("pdf") ? "application/pdf" : "image/png"} />}
  </main>;
}

createRoot(document.getElementById("racine")!).render(<Banc />);
