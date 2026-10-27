import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Parc propriétaire : trouver le bon dossier sans fenêtre intermédiaire", () => {
  let navigateur: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  const css = readFileSync(resolve(racine, "src/app/agence/[orgId]/parc/liste-lots.module.css"), "utf8");
  beforeAll(async () => {
    const paquet = await rolldown({ input: resolve(racine, "tests/fixtures/navigateur/banc-parc-proprietaire.tsx"), platform: "browser",
      plugins: [{ name: "liens-sans-serveur", resolveId(id) {
        if (id === "next/link") return "\0lien";
        if (id.endsWith(".module.css")) return "\0css";
      }, load(id) {
        if (id === "\0lien") return 'import {createElement} from "react"; export default function Link(props){return createElement("a",props)}';
        if (id === "\0css") return 'export default new Proxy({},{get:(_,cle)=>cle})';
      } }], resolve: { alias: { "@": resolve(racine, "src") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } }, logLevel: "silent" });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    navigateur = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await navigateur?.close(); });
  beforeEach(async () => {
    contexte = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 390, height: 844 } });
    page = await contexte.newPage(); page.setDefaultTimeout(3000);
    erreurs = []; page.on("pageerror", erreur => erreurs.push(erreur.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? { contentType: "text/javascript; charset=utf-8", body: script }
      : { contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="fr"><head><title>Parc fictif</title><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui;color:#172d43;--trait:#dce3e9;--texte-secondaire:#536272;--encre:#172d43;--surface:white;--marque:#1c3b57;--or-filet:#e8dcc3;--or-clair:#fcf8f0}main{max-width:1200px;margin:auto;padding:16px}a{color:inherit;text-decoration:none}h1,h2,p,ul,dl,dd{margin:0}ul{padding:0;list-style:none}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${css}</style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>` }));
    await page.goto("http://localhost/espace/fictif/parc");
    await page.getByRole("heading", { name: "Biens & locations" }).waitFor();
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });
  for (const largeur of [390, 1440]) it(`filtre le bon bien et garde un lien direct à ${largeur}px`, async () => {
    await page.setViewportSize({ width: largeur, height: 900 });
    expect(await page.locator("a[data-lot-id]").count()).toBe(3);
    const coloc = page.locator('a[data-lot-id="coloc"]');
    expect(await coloc.getAttribute("href")).toBe("/espace/fictif/parc/residence/lots/coloc");
    expect(await page.getByRole("dialog").count()).toBe(0);
    await page.getByLabel("Choisir un bien", { exact: true }).selectOption("atelier");
    expect(await page.locator("a[data-lot-id]").count()).toBe(1);
    expect(await page.getByRole("status").textContent()).toBe("1 lot sur 3");
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await page.getByRole("button", { name: "En location", exact: true }).click();
    expect(await page.locator("a[data-lot-id]").count()).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
  it("distingue les chambres louées d'un bail sur le logement entier", async () => {
    expect(await page.locator('a[data-lot-id="coloc"]').textContent()).toContain("2 chambres louées · 1 sans bail");
    expect(await page.locator('a[data-lot-id="entier"]').textContent()).not.toContain("sans bail");
    await page.getByRole("button", { name: "Sans location", exact: true }).click();
    expect(await page.locator("a[data-lot-id]").count()).toBe(1);
    expect(await page.locator("a[data-lot-id]").getAttribute("data-lot-id")).toBe("studio");
  });
  it("recherche sans accents et permet de sortir d'une sélection vide", async () => {
    const recherche = page.getByLabel("Rechercher un bien, un lot ou un locataire", { exact: true });
    await recherche.fill("residence");
    expect(await page.locator("a[data-lot-id]").count()).toBe(2);
    await recherche.fill("introuvable");
    await page.getByRole("heading", { name: "Aucun lot dans cette sélection" }).waitFor();
    await page.getByRole("button", { name: "Afficher tous les lots" }).click();
    expect(await recherche.inputValue()).toBe("");
    expect(await page.getByRole("region", { name: "Immeuble à organiser", exact: true }).count()).toBe(1);
    expect(await page.locator("a[data-lot-id]").count()).toBe(3);
  });
  it("ne transforme pas une lecture manquante en logement disponible", async () => {
    await page.goto("http://localhost/espace/fictif/parc?illisible");
    expect(await page.getByRole("button", { name: "Sans location", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByRole("button", { name: "En location", exact: true }).isDisabled()).toBe(true);
    expect(await page.getByText("Locations indisponibles", { exact: true }).count()).toBe(3);
    expect(await page.getByText("Sans location en cours", { exact: true }).count()).toBe(0);
  });
});
