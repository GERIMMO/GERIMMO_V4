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
  for (const largeur of [390, 1440]) it(`sélectionne le bien dans la même page à ${largeur}px`, async () => {
    await page.setViewportSize({ width: largeur, height: 900 });
    const liens = page.getByRole("navigation", { name: "Vos biens" }).getByRole("link");
    expect(await liens.count()).toBe(3);
    expect(await page.getByRole("button", { name: "En location", exact: true }).count()).toBe(0);
    await page.getByLabel("Choisir un bien", { exact: true }).selectOption("atelier");
    expect(await liens.count()).toBe(1);
    expect(await page.getByRole("status").textContent()).toBe("1 lot sur 3");
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await liens.filter({ hasText: "Résidence des Lilas" }).click();
    await page.getByRole("heading", { name: "Fiche : Résidence des Lilas", exact: true }).waitFor();
    expect(new URL(page.url()).pathname).toBe("/espace/fictif/parc");
    expect(await page.getByRole("dialog").count()).toBe(0);
    const liste = page.getByRole("navigation", { name: "Vos biens" });
    if (largeur === 390) {
      expect(await liste.isVisible()).toBe(false);
      await page.getByRole("link", { name: "Retour à la liste", exact: true }).click();
      await liste.waitFor();
    } else {
      const dimensions = await page.evaluate(() => ({ gauche: document.querySelector('.listeBiens')!.getBoundingClientRect().width, droite: document.querySelector('.panneauBien')!.getBoundingClientRect().width }));
      expect(dimensions.droite / dimensions.gauche).toBeCloseTo(2, 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
  it("recherche sans accents et permet de sortir d'une sélection vide", async () => {
    const recherche = page.getByLabel("Rechercher un bien, un lot ou un locataire", { exact: true });
    await recherche.fill("residence");
    expect(await page.getByRole("navigation", { name: "Vos biens" }).getByRole("link").count()).toBe(1);
    await recherche.fill("introuvable");
    await page.getByText("Aucun bien dans cette sélection.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Afficher tous les biens" }).click();
    expect(await recherche.inputValue()).toBe("");
    expect(await page.getByRole("navigation", { name: "Vos biens" }).getByRole("link").count()).toBe(3);
  });
  it("ne remplace pas un montant indisponible par zéro", async () => {
    await page.goto("http://localhost/espace/fictif/parc?illisible");
    await page.getByText("Montants indisponibles", { exact: true }).waitFor();
    expect(await page.getByText("Aucun loyer attendu ce mois-ci", { exact: true }).count()).toBe(0);
  });
});
