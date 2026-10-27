import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Fenêtres : un seul propriétaire du clavier et du verrou de défilement", () => {
  let navigateur: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  beforeAll(async () => {
    const paquet = await rolldown({
      input: resolve(racine, "tests/fixtures/navigateur/banc-fenetres-modales.tsx"), platform: "browser",
      resolve: { alias: { "@": resolve(racine, "src") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } }, logLevel: "silent",
    });
    try { script = (await paquet.generate({ format: "iife" })).output[0].code; } finally { await paquet.close(); }
    navigateur = await chromium.launch({ executablePath: chrome });
  }, 120000);
  afterAll(async () => { await navigateur?.close(); });
  beforeEach(async () => {
    contexte = await navigateur.newContext({ locale: "fr-FR" }); page = await contexte.newPage(); page.setDefaultTimeout(3000);
    erreurs = []; page.on("pageerror", erreur => erreurs.push(erreur.message));
    await page.route("http://localhost/**", route => route.fulfill(new URL(route.request().url()).pathname === "/banc.js"
      ? { contentType: "text/javascript; charset=utf-8", body: script }
      : { contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><head><title>Dossier fictif</title><style>[hidden]{display:none!important}</style></head><body style="overflow:clip"><div id="racine"></div><script src="/banc.js"></script></body></html>' }));
    await page.goto("http://localhost/banc");
  });
  afterEach(async () => { await contexte?.close(); expect(erreurs).toEqual([]); });

  for (const [bouton, titre] of [["Ouvrir la fenêtre", "Dossier"], ["Ouvrir le menu", "Menu du dossier"]]) {
    it(`${titre} : focus initial, boucle Tab sans contrôles cachés, retour au déclencheur`, async () => {
      const ouvrir = page.getByRole("button", { name: bouton, exact: true });
      await ouvrir.click();
      const dialogue = page.getByRole("dialog", { name: titre, exact: true });
      const fermer = dialogue.getByRole("button", { name: "Fermer", exact: true });
      await expect.poll(() => fermer.evaluate(element => element === document.activeElement)).toBe(true);
      await page.keyboard.press("Shift+Tab");
      expect(await dialogue.getByRole("button", { name: "Dernier contrôle", exact: true }).evaluate(element => element === document.activeElement)).toBe(true);
      await page.keyboard.press("Tab");
      expect(await fermer.evaluate(element => element === document.activeElement)).toBe(true);
      await page.locator("#arriere-plan").evaluate(element => element.focus());
      expect(await fermer.evaluate(element => element === document.activeElement)).toBe(true);
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      expect(await ouvrir.evaluate(element => element === document.activeElement)).toBe(true);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("clip");
    });

    it(`${titre} : Échap ferme uniquement la confirmation et conserve le verrou de la fenêtre inférieure`, async () => {
      await page.getByRole("button", { name: bouton, exact: true }).click();
      const secondaire = page.getByRole("button", { name: "Ouvrir la confirmation", exact: true });
      await secondaire.click();
      await page.getByRole("dialog", { name: "Confirmation", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(1);
      expect(await secondaire.evaluate(element => element === document.activeElement)).toBe(true);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      await page.keyboard.press("Escape");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("clip");
    });
  }
  it("un dialogue natif placé au-dessus conserve son focus et son Échap", async () => {
    await page.getByRole("button", { name: "Ouvrir la fenêtre", exact: true }).click();
    await page.getByRole("button", { name: "Ouvrir le dialogue natif", exact: true }).click();
    const native = page.getByRole("dialog", { name: "Fenêtre native", exact: true });
    expect(await native.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => native.isVisible()).toBe(false);
    expect(await page.getByRole("dialog", { name: "Dossier", exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  });
});
