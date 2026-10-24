import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {} from "./fixtures/navigateur/banc-navigation-bail";
const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Navigation du bail : entrer dans une étape sans l’envoyer", () => {
  let browser: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  beforeAll(async () => {
    const paquet = await rolldown({
      input: resolve(racine, "tests/fixtures/navigateur/banc-navigation-bail.tsx"), platform: "browser",
      plugins: [{ name: "serveur-isole", resolveId(id) {
        if (id.endsWith("verifier-dossier")) return "\0verification";
        if (id.endsWith(".module.css")) return "\0css";
      }, load(id) {
        if (id === "\0verification") return 'export async function verifierDossierBail(){return {manquants:[]}}';
        if (id === "\0css") return 'export default {}';
      } }],
      resolve: { alias: { "@": resolve(racine, "src"), "next/link": resolve(racine, "tests/fixtures/navigateur/next-link-neutre.tsx") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development"), "process.env": "{}" } }, logLevel: "silent",
    });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    browser = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await browser?.close(); });
  beforeEach(async () => {
    contexte = await browser.newContext({ locale: "fr-FR" }); page = await contexte.newPage(); page.setDefaultTimeout(3000); erreurs = []; page.on("pageerror", error => erreurs.push(error.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? { contentType: "text/javascript; charset=utf-8", body: script }
      : { contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><body><div id="racine"></div><script src="/banc.js"></script></body></html>' }));
    await page.goto("http://localhost/banc#etape-bail-3");
    await page.getByRole("heading", { name: "Le logement", exact: true }).waitFor();
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });
  it.each(["clic", "clavier"])("Suivant (%s) ouvre le loyer sans erreur prématurée ; le bouton d’enregistrement le valide", async geste => {
    const suivant = page.getByRole("button", { name: "Suivant", exact: true });
    if (geste === "clavier") await suivant.press("Enter"); else await suivant.click();
    await page.getByLabel("Loyer d’essai").waitFor();
    expect(await page.evaluate(() => window.__navigationBail)).toEqual({ invalides: 0, envois: 0 });
    await page.getByRole("button", { name: "Enregistrer et continuer", exact: true }).click();
    expect(await page.evaluate(() => window.__navigationBail)).toEqual({ invalides: 1, envois: 0 });
    await page.getByLabel("Loyer d’essai").fill("750");
    await page.getByRole("button", { name: "Enregistrer et continuer", exact: true }).click();
    expect(await page.evaluate(() => window.__navigationBail)).toEqual({ invalides: 1, envois: 1 });
  });
});
