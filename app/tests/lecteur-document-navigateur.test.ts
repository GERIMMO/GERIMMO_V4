/** Le lecteur reste dans le dossier ; réseau, droits et données sont entièrement fictifs. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {} from "./fixtures/navigateur/banc-lecteur-document";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
const pdfSimule = `
export const GlobalWorkerOptions = {};
export class TextLayer { render(){return Promise.resolve();} cancel(){} }
export function getDocument() {
  window.__lecteurDocumentsCharges++;
  const document = {
    numPages: 2,
    async getPage(numero) {
      return {
        getViewport({scale}) { return {width:612*scale,height:792*scale,scale}; },
        async getTextContent(){return {items:[],styles:{}};},
        render({canvas,canvasContext,viewport}) {
          const support=canvas||canvasContext.canvas;
          const contexte=canvasContext||support.getContext('2d');
          contexte.fillStyle='white';contexte.fillRect(0,0,support.width,support.height);
          contexte.fillStyle='black';contexte.font='24px sans-serif';contexte.fillText('Page '+numero,20,40);
          window.__lecteurRendus.push({page:numero,largeur:viewport.width,hauteur:viewport.height});
          return {promise:Promise.resolve(),cancel(){}};
        },
        cleanup(){}
      };
    },
    cleanup(){},
    async destroy(){window.__lecteurDocumentsDetruits++;}
  };
  return {promise:Promise.resolve(document),async destroy(){window.__lecteurDocumentsDetruits++;}};
}`;

async function assembler(moteurReel = false) {
  const paquet = await rolldown({
    input: resolve(racine, "tests/fixtures/navigateur/banc-lecteur-document.tsx"),
    platform: "browser",
    plugins: [{
      name: "lecteur-isole",
      resolveId(id) {
        if (!moteurReel && id === "pdfjs-dist") return "\0pdf-simule";
        if (id.endsWith(".module.css")) return "\0css";
      },
      load(id) {
        if (id === "\0pdf-simule") return pdfSimule;
        if (id === "\0css") return "export default new Proxy({}, {get:(_,nom)=>nom})";
      },
    }],
    resolve: { alias: { "@": resolve(racine, "src") } },
    transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } },
    logLevel: "silent",
  });
  try { return (await paquet.generate({ format: "iife", codeSplitting: false })).output[0].code; }
  finally { await paquet.close(); }
}

describe.skipIf(!chrome)("Lecteur intégré : consultation, reprise et isolation", () => {
  let browser: Browser, contexte: BrowserContext, page: Page;
  let script: string, scriptReel: string, styles: string;
  let erreurs: string[];
  beforeAll(async () => {
    [script, scriptReel, styles] = await Promise.all([
      assembler(), assembler(true), readFile(resolve(racine, "src/components/lecteur-document.module.css"), "utf8"),
    ]);
    styles = styles.replace(/:global\(([^)]+)\)/g, "$1");
    browser = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await browser?.close(); });
  beforeEach(async () => {
    contexte = await browser.newContext({ locale: "fr-FR", viewport: { width: 1000, height: 900 }, acceptDownloads: true });
    page = await contexte.newPage(); page.setDefaultTimeout(5000); erreurs = [];
    page.on("pageerror", e => erreurs.push(e.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://localhost") throw new Error(`Accès réseau interdit dans le banc : ${url.origin}`);
      if (url.pathname.startsWith("/pdfjs/")) {
        const repertoire = resolve(racine, "public/pdfjs");
        const fichier = resolve(racine, "public", `.${url.pathname}`);
        if (!fichier.startsWith(repertoire + sep)) throw new Error("Ressource PDF hors du banc");
        const type = extname(fichier) === ".mjs" ? "text/javascript" : extname(fichier) === ".wasm" ? "application/wasm" : "application/octet-stream";
        await route.fulfill({ contentType: type, body: await readFile(fichier) });
      } else if (url.pathname === "/banc.js") {
        await route.fulfill({ contentType: "text/javascript; charset=utf-8", body: url.searchParams.has("reel") ? scriptReel : script });
      } else {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${styles}</style></head><body><div id="racine"></div><script src="/banc.js${url.searchParams.has("reel") ? "?reel=1" : ""}"></script></body></html>` });
      }
    });
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });

  async function ouvrir(scenario: string, reel = false) {
    await page.goto(`http://localhost/banc?scenario=${scenario}${reel ? "&reel=1" : ""}`);
  }
  async function attendreImage() {
    await page.waitForFunction(() => [...document.querySelectorAll("img")].some(image => image.complete && image.naturalWidth > 0));
  }

  it("affiche une image sans quitter le dossier ni exposer le lien signé", async () => {
    await ouvrir("image"); await attendreImage();
    expect(page.url()).toBe("http://localhost/banc?scenario=image");
    expect(await page.locator("body").innerText()).not.toContain("jeton-fictif");
    expect(await page.locator('a[href*="jeton-fictif"]').count()).toBe(0);
    const requetes = await page.evaluate(() => window.__lecteurRequetes);
    expect(requetes.find(r => new URL(r.url).searchParams.get("apercu") === "integre")).toBeDefined();
    expect(requetes.find(r => new URL(r.url).origin === "https://stockage.example.test")).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error" });
  });

  it("parcourt les pages PDF et change le zoom sans recharger le document", async () => {
    await ouvrir("pdf");
    await page.waitForFunction(() => window.__lecteurRendus.length > 0);
    expect(await page.getByRole("button", { name: "Page précédente", exact: true }).isDisabled()).toBe(true);
    await page.getByRole("button", { name: "Page suivante", exact: true }).click();
    await page.waitForFunction(() => window.__lecteurRendus.at(-1)?.page === 2);
    expect(await page.getByRole("button", { name: "Page suivante", exact: true }).isDisabled()).toBe(true);
    const largeur = await page.evaluate(() => window.__lecteurRendus.at(-1)!.largeur);
    await page.getByRole("button", { name: "Zoom avant", exact: true }).click();
    await page.waitForFunction(valeur => (window.__lecteurRendus.at(-1)?.largeur || 0) > valeur, largeur);
    await page.getByRole("button", { name: "Zoom arrière", exact: true }).click();
    await page.waitForFunction(valeur => window.__lecteurRendus.at(-1)?.largeur === valeur, largeur);
    await page.getByRole("button", { name: "Page précédente", exact: true }).click();
    await page.waitForFunction(() => window.__lecteurRendus.at(-1)?.page === 1);
    expect(await page.evaluate(() => window.__lecteurDocumentsCharges)).toBe(1);
    expect(await page.getByRole("alert").count()).toBe(0);
  });

  it("agrandit le lecteur puis revient au dossier avec Échap, sans recharger le PDF", async () => {
    await ouvrir("pdf");
    await page.waitForFunction(() => window.__lecteurRendus.length > 0);
    await page.getByRole("button", { name: "Agrandir", exact: true }).click();
    await page.getByRole("dialog", { name: "Aperçu : Document fictif", exact: true }).waitFor();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await page.getByRole("region", { name: "Aperçu : Document fictif", exact: true }).waitFor();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await page.evaluate(() => window.__lecteurDocumentsCharges)).toBe(1);
  });

  it("renouvelle l'accès après une erreur et permet de reprendre la consultation", async () => {
    await ouvrir("erreur");
    await page.getByRole("button", { name: "Réessayer", exact: true }).click();
    await attendreImage();
    expect(await page.evaluate(() => window.__lecteurRequetes.filter(r => new URL(r.url).searchParams.get("apercu") === "integre").length)).toBe(2);
    expect(await page.getByRole("button", { name: "Réessayer", exact: true }).count()).toBe(0);
  });

  it.each(["taille-annoncee", "taille-flux"])("refuse un document de plus de 50 Mo : %s", async scenario => {
    await ouvrir(scenario);
    await page.getByRole("button", { name: "Réessayer", exact: true }).waitFor();
    expect(await page.locator("body").innerText()).toMatch(/50\s*Mo/);
    expect(await page.locator("canvas, img").count()).toBe(0);
    if (scenario === "taille-flux") expect(await page.evaluate(() => window.__lecteurFluxAnnules)).toBe(1);
  });

  it("annule le fichier précédent et ignore sa réponse tardive après changement", async () => {
    await ouvrir("changement");
    await page.waitForFunction(() => Boolean(window.__lecteurTerminerAncien));
    await page.getByRole("button", { name: "Changer de document dans le banc", exact: true }).click();
    await attendreImage();
    expect(await page.evaluate(() => window.__lecteurRequetes.some(r => r.url.includes("/signe/document?") && r.annule))).toBe(true);
    await page.evaluate(() => window.__lecteurTerminerAncien?.());
    expect(await page.getByRole("img").getAttribute("alt")).toContain("Document suivant");
    expect(await page.getByRole("button", { name: "Réessayer", exact: true }).count()).toBe(0);
  });

  it("libère le document PDF quand le lecteur est fermé", async () => {
    await ouvrir("pdf");
    await page.waitForFunction(() => window.__lecteurRendus.length > 0);
    await page.getByRole("button", { name: "Fermer le lecteur dans le banc", exact: true }).click();
    await page.waitForFunction(() => window.__lecteurDocumentsDetruits > 0);
    expect(await page.locator("canvas").count()).toBe(0);
  });

  it("redemande l'autorisation de téléchargement à la route du dossier", async () => {
    await ouvrir("image"); await attendreImage();
    const transfert = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger", exact: true }).click();
    const telechargement = await transfert;
    expect(await telechargement.failure()).toBeNull();
    expect(await page.evaluate(() => window.__lecteurRequetes.filter(r => new URL(r.url).searchParams.get("mode") === "telechargement").map(r => new URL(r.url).pathname))).toEqual(["/fichier/document"]);
    expect(page.url()).toBe("http://localhost/banc?scenario=image");
  });

  it("rend réellement deux pages PDF.js sur mobile avec les assets locaux", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ouvrir("pdf", true);
    await page.getByText("Document fictif - page 1", { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[role="document"] canvas');
      if (!canvas || canvas.width < 100) return false;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && pixels[i] < 100) return true;
      return false;
    });
    const premierePage = await page.getByRole("document", { name: "Page 1 sur 2", exact: true }).locator("canvas").evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
    await page.getByRole("button", { name: "Page suivante", exact: true }).click();
    await page.getByText("Document fictif - page 2", { exact: true }).waitFor();
    await page.waitForFunction(premiere => {
      const canvas = document.querySelector<HTMLCanvasElement>('[role="document"] canvas');
      if (!canvas || canvas.toDataURL() === premiere) return false;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && pixels[i] < 100) return true;
      return false;
    }, premierePage);
    expect(await page.getByRole("button", { name: "Page suivante", exact: true }).isDisabled()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator("iframe").count()).toBe(0);
  }, 30000);
});
