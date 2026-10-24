import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, chromium.executablePath()].find(p => p && existsSync(p));
describe.skipIf(!chrome)("File de direction dans le navigateur", () => {
  let browser: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  const css = readFileSync(resolve(racine, "src/app/admin/brief/file-decisions.module.css"), "utf8");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bureau de direction — aperçu local</title><style>
    :root{--encre:#1b3049;--texte-secondaire:#536576;--marque:#174c8a;--filet:#dce3eb}*{box-sizing:border-box}body{margin:0;background:#f4f6f9;font:15px system-ui;color:var(--encre)}main{max-width:1000px;margin:auto;padding:32px 18px}h1{font:36px Georgia}section{background:#f6f8fb;border:1px solid #dce3eb;border-radius:12px;padding:22px}h2{font:26px Georgia}a{color:inherit;text-decoration:none}ul{list-style:none;margin:0;padding:0}button,input,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:default}p{line-height:1.6}summary{cursor:pointer}.btn-or,.btn-secondaire{padding:10px 14px;border:1px solid #bbc7d3;border-radius:7px}.btn-or{background:#243c55;color:white}.mt-2{margin-top:8px}.mt-4{margin-top:16px}.flex{display:flex}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}.err{color:#a83128}${css}
    </style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>`;
  beforeAll(async () => {
    const paquet = await rolldown({
      input: resolve(racine, "tests/fixtures/navigateur/banc-file-decisions.tsx"), platform: "browser",
      plugins: [{ name: "isoler-actions-et-styles", resolveId(id, importer) {
        if (id === "./actions" && importer?.endsWith("decision-matin.tsx")) return "\0actions-neutres";
        if (id.endsWith(".module.css")) return "\0styles";
        if (id === "next/link") return resolve(racine, "tests/fixtures/navigateur/next-link-neutre.tsx");
        return null;
      }, load(id) {
        if (id === "\0actions-neutres") return 'export async function deciderDecisionDuMatin(...args){ window.__decisions = [...(window.__decisions || []),args]; return {erreur:"Le dossier a changé : relisez-le avant de décider."}; }';
        if (id === "\0styles") return 'export default new Proxy({}, {get:(_, key)=>key});';
        return null;
      } }],
      resolve: { alias: { "@": resolve(racine, "src") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } }, logLevel: "silent",
    });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    if (process.env.GERIMMO_APERCU_DECISIONS) {
      const sortie = resolve(racine, "tmp/bureau-preview"); mkdirSync(sortie, { recursive: true });
      writeFileSync(resolve(sortie, "index.html"), html); writeFileSync(resolve(sortie, "banc.js"), script);
    }
    browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  }, 120_000);
  beforeEach(async () => {
    contexte = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
    page = await contexte.newPage(); erreurs = []; page.on("pageerror", e => erreurs.push(e.message));
    await page.route("http://localhost/**", r => r.fulfill({ contentType: r.request().url().endsWith("/banc.js") ? "text/javascript" : "text/html", body: r.request().url().endsWith("/banc.js") ? script : html }));
  });
  afterEach(async () => { await contexte.close(); expect(erreurs).toEqual([]); });
  afterAll(async () => { await browser?.close(); });
  const ouvrir = async (query = "") => { await page.goto(`http://localhost/${query}`); await page.getByRole("heading", { name: "Demandes à examiner" }).waitFor(); };

  it("résume 34 demandes en trois catégories et deux problèmes, sans bouton de publication", async () => {
    await ouvrir();
    expect(await page.getByRole("navigation", { name: "Demandes par catégorie" }).getByRole("link").count()).toBe(3);
    expect(await page.getByRole("link", { name: "Envoi au responsable", exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: "Valider", exact: true }).count()).toBe(0);
    expect(await page.getByText("Actualité 1 — Révision du loyer", { exact: true }).count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1100);
  });
  it("ouvre la catégorie demandée et permet de retrouver le dernier article sans décision implicite", async () => {
    await ouvrir("?vue=decisions&categorie=contenus");
    const liste = page.getByRole("list", { name: "Demandes à examiner" });
    expect(await liste.locator(":scope > li").count()).toBe(6);
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    expect(await page.getByRole("status").textContent()).toContain("7–12 sur 31");
    await page.getByLabel("Rechercher une demande").fill("actualite 30");
    expect(await page.getByRole("status").textContent()).toContain("1–1 sur 1");
    await page.getByText("Actualité 30 — Révision du loyer", { exact: true }).click();
    expect(await page.getByRole("button", { name: "Valider", exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __decisions?: unknown[] }).__decisions ?? [])).toEqual([]);
  });
  it("conserve l'attestation artisan et annonce une erreur de décision sans retirer la demande", async () => {
    await ouvrir("?vue=decisions&categorie=accords");
    await page.getByText("Vérifier les justificatifs de l’artisan", { exact: true }).click();
    expect(await page.getByRole("button", { name: "Valider", exact: true }).isEnabled()).toBe(false);
    await page.getByLabel("J’ai relu les justificatifs.").check();
    await page.getByRole("button", { name: "Valider", exact: true }).click();
    await page.getByRole("alert").waitFor();
    expect(await page.getByRole("alert").textContent()).toContain("Le dossier a changé");
    expect(await page.getByText("Vérifier les justificatifs de l’artisan", { exact: true }).isVisible()).toBe(true);
  });
  it("affiche un résultat vide honnête, garde l'erreur de lecture et réinitialise la page lors du filtre", async () => {
    await ouvrir("?vue=decisions&indisponible=1");
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByRole("button", { name: "Problèmes à examiner 2", exact: true }).click();
    expect(await page.getByRole("status").textContent()).toContain("1–2 sur 2");
    expect(await page.getByRole("status").textContent()).toContain("Liste partielle");
    await page.getByLabel("Rechercher une demande").fill("introuvable");
    expect(await page.getByRole("status").textContent()).toContain("Aucune demande ne correspond");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
});
