import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Liens directs vers les étapes de saisie", () => {
  let navigateur: Browser, contexte: BrowserContext, page: Page, script: string;
  const erreurs: string[] = [];
  beforeAll(async () => {
    const paquet = await rolldown({ input: resolve(racine, "tests/fixtures/navigateur/banc-etapes-saisie.tsx"), platform: "browser",
      plugins: [{ name: "styles-neutres", resolveId(id) { if (id.endsWith(".module.css")) return "\0css"; }, load(id) { if (id === "\0css") return 'export default new Proxy({},{get:(_,cle)=>cle})'; } }],
      resolve: { alias: { "@": resolve(racine, "src") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } }, logLevel: "silent" });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    navigateur = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await navigateur?.close(); });
  beforeEach(async () => {
    erreurs.length = 0;
    contexte = await navigateur.newContext({ locale: "fr-FR" });
    page = await contexte.newPage(); page.setDefaultTimeout(3000);
    page.on("pageerror", erreur => erreurs.push(erreur.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? { contentType: "text/javascript; charset=utf-8", body: script }
      : { contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Profil fictif</title></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>' }));
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });
  it.each(["envois", "relances"])("ouvre directement les préférences depuis le tableau de bord (%s)", async ancre => {
    await page.goto(`http://localhost/profil#${ancre}`);
    await page.getByRole("heading", { name: "Préférences", exact: true }).waitFor();
    expect(await page.getByLabel("Relances automatiques").isVisible()).toBe(true);
    expect(await page.getByLabel("Nom", { exact: true }).isVisible()).toBe(false);
    expect(new URL(page.url()).hash).toBe(`#${ancre}`);
  });
  it("conserve les saisies en changeant d’ancre et retrouve une ancre déjà présente", async () => {
    await page.goto("http://localhost/profil#relances");
    await page.getByRole("heading", { name: "Préférences", exact: true }).waitFor();
    await page.getByRole("button", { name: /Étape 01 Identité/ }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Nom conservé");
    await page.getByRole("link", { name: "Régler les envois" }).click();
    await page.getByRole("heading", { name: "Préférences", exact: true }).waitFor();
    await page.getByRole("link", { name: "Voir les coordonnées" }).click();
    await page.getByRole("heading", { name: "Identité", exact: true }).waitFor();
    expect(await page.getByLabel("Nom", { exact: true }).inputValue()).toBe("Nom conservé");
  });
  it("respecte les autres ancres, les liens externes au formulaire et le retour navigateur", async () => {
    await page.goto("http://localhost/profil#paiement");
    await page.getByRole("heading", { name: "Paiement", exact: true }).waitFor();
    await page.getByRole("link", { name: "Régler les envois" }).click();
    await page.getByRole("heading", { name: "Préférences", exact: true }).waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Paiement", exact: true }).waitFor();
    await page.getByRole("link", { name: "Voir la signature" }).click();
    expect(await page.getByRole("heading", { name: "Paiement", exact: true }).isVisible()).toBe(true);
    expect(new URL(page.url()).hash).toBe("#hors-formulaire");
  });
  it("rouvre un champ obligatoire masqué avant d’enregistrer les préférences", async () => {
    await page.goto("http://localhost/profil");
    await page.getByLabel("Nom", { exact: true }).fill("");
    await page.getByRole("link", { name: "Régler les envois" }).click();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.getByRole("heading", { name: "Identité", exact: true }).waitFor();
    expect(await page.getByRole("alert").isVisible()).toBe(true);
    expect(await page.getByLabel("Nom", { exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
  });
});
