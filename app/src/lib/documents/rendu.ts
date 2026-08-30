// Rendu HTML → PDF (sprint « Documents-0 »).
//
// Un seul navigateur Chromium, réutilisé entre les générations (démarrage
// ~1 s, rendu ~150 ms ensuite) :
//  - en local : le Chrome installé (GERIMMO_CHROME pour surcharger) ;
//  - sur Vercel : le Chromium serverless de @sparticuz/chromium.
// Le pied (Réf · Modèle · Empreinte · pagination · marque) est répété sur
// chaque page par le moteur d'impression — comme sur les épreuves.

import fs from "node:fs";
import type { Browser } from "puppeteer-core";
import type { DocumentAssemble } from "./gabarit";

const CHEMINS_CHROME_LOCAL = [
  process.env.GERIMMO_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((c): c is string => Boolean(c));

let navigateurEnCours: Promise<Browser> | null = null;

async function obtenirNavigateur(): Promise<Browser> {
  if (navigateurEnCours) {
    const b = await navigateurEnCours.catch(() => null);
    if (b?.connected) return b;
    navigateurEnCours = null;
  }
  navigateurEnCours = lancerNavigateur();
  return navigateurEnCours;
}

async function lancerNavigateur(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  // Environnement serverless (Vercel / AWS) : Chromium embarqué
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const chemin = CHEMINS_CHROME_LOCAL.find((c) => fs.existsSync(c));
  if (!chemin) {
    throw new Error(
      "Chrome introuvable pour le rendu PDF : installez Google Chrome ou renseignez GERIMMO_CHROME."
    );
  }
  return puppeteer.launch({
    executablePath: chemin,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
}

export async function rendrePdf(doc: DocumentAssemble): Promise<Uint8Array> {
  const navigateur = await obtenirNavigateur();
  const page = await navigateur.newPage();
  try {
    await page.setContent(doc.html, { waitUntil: "load" });
    // Les polices base64 sont décodées de façon asynchrone
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: doc.piedHtml,
      // Le haut de page vit dans le corps (44 pt) ; le bas est réservé au pied
      margin: { top: "0", bottom: "58px", left: "0", right: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

// En développement : copie de travail sur disque pour vérifier le rendu à
// l'œil sans passer par le Storage (GERIMMO_DEBUG_PDF_DIR=chemin).
export function copieDeTravail(nom: string, octets: Uint8Array): void {
  const dossier = process.env.GERIMMO_DEBUG_PDF_DIR;
  if (!dossier || process.env.NODE_ENV === "production") return;
  try {
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(`${dossier}/${nom}`, octets);
  } catch {
    // outil de confort uniquement
  }
}
