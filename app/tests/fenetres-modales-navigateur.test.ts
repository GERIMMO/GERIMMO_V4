import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MESSAGE_FERMER_FENETRE } from "../src/lib/protection-saisie";

const racine = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM, chromium.executablePath()].find((p): p is string => Boolean(p && existsSync(p)));
describe.skipIf(!chrome)("Fenêtres : un seul propriétaire du clavier et du verrou de défilement", () => {
  let navigateur: Browser, contexte: BrowserContext, page: Page, script: string;
  let erreurs: string[];
  beforeAll(async () => {
    const paquet = await rolldown({
      input: resolve(racine, "tests/fixtures/navigateur/banc-fenetres-modales.tsx"), platform: "browser",
      // La recherche importe son action serveur et `next/link` : le banc les remplace.
      plugins: [{ name: "recherche-neutre", resolveId: id => id === "@/app/actions/recherche-espace" ? resolve(racine, "tests/fixtures/navigateur/actions-recherche-neutre.ts") : null }],
      resolve: { alias: { "@": resolve(racine, "src"), "next/link": resolve(racine, "tests/fixtures/navigateur/next-link-neutre.tsx") } },
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
      : { contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><head><title>Dossier fictif</title><style>[hidden]{display:none!important} .tiroir-voile,body>div:has(>[data-ui=modale]){position:fixed;inset:0;display:flex;align-items:center;justify-content:center} [data-ui=modale],.tiroir{width:420px;padding:16px;background:#fff}</style></head><body style="overflow:clip"><div id="racine"></div><script src="/banc.js"></script></body></html>' }));
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
  // Audit #264, TRV-01 : une sélection de texte glissée d'un champ jusqu'au voile envoyait son « click » au voile.
  for (const [bouton, titre] of [["Ouvrir la fenêtre", "Dossier"], ["Ouvrir le menu", "Menu du dossier"]]) {
    it(`${titre} : seul un geste commencé et fini sur le voile ferme`, async () => {
      await page.getByRole("button", { name: bouton, exact: true }).click();
      const dialogue = page.getByRole("dialog", { name: titre, exact: true });
      const champ = dialogue.getByRole("textbox", { name: "Note du dossier", exact: true });
      await champ.fill("Fuite sous l’évier, passage le matin");
      const boite = (await champ.boundingBox())!;
      // Sélection glissée du champ jusqu'au voile
      await page.mouse.move(boite.x + boite.width - 4, boite.y + boite.height / 2);
      await page.mouse.down();
      await page.mouse.move(5, 5, { steps: 8 });
      await page.mouse.up();
      expect(await dialogue.isVisible()).toBe(true);
      // Appui sur le voile, relâché dans la fenêtre
      await page.mouse.move(5, 5);
      await page.mouse.down();
      await page.mouse.move(boite.x + 10, boite.y + boite.height / 2, { steps: 8 });
      await page.mouse.up();
      expect(await dialogue.isVisible()).toBe(true);
      expect(await champ.inputValue()).toBe("Fuite sous l’évier, passage le matin");
      // Témoin : un clic franc sur le voile ferme toujours
      await page.mouse.click(5, 5);
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    });

    it(`${titre} : un formulaire modifié n'est pas abandonné sur un clic du voile sans confirmation`, async () => {
      // Les formulaires ne sont suivis que dans les espaces connectés (lib/protection-saisie, eligible).
      await page.goto("http://localhost/agence/banc");
      await page.getByRole("button", { name: bouton, exact: true }).click();
      const dialogue = page.getByRole("dialog", { name: titre, exact: true });
      const commentaire = dialogue.getByRole("textbox", { name: "Commentaire", exact: true });
      await commentaire.fill("Locataire absent jusqu’au 3");
      const messages: string[] = [];
      page.once("dialog", boite => { messages.push(boite.message()); void boite.dismiss(); });
      await page.mouse.click(5, 5);
      await expect.poll(() => messages).toEqual([MESSAGE_FERMER_FENETRE]);
      expect(await dialogue.isVisible()).toBe(true);
      expect(await commentaire.inputValue()).toBe("Locataire absent jusqu’au 3");
      page.once("dialog", boite => { messages.push(boite.message()); void boite.accept(); });
      await page.mouse.click(5, 5);
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      expect(messages).toHaveLength(2);
    });
  }

  it("recherche : ⌘/Ctrl K ouvre malgré une fenêtre gardée montée et refermée (TRV-V01)", async () => {
    expect(await page.locator('[role="dialog"]').count()).toBe(1);
    const recherche = page.getByRole("dialog", { name: "Retrouvez le bon dossier", exact: true });
    await page.keyboard.press("Control+k");
    await expect.poll(() => recherche.isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => recherche.count()).toBe(0);
    // Une fenêtre réellement ouverte garde, elle, la priorité sur le raccourci.
    await page.getByRole("button", { name: "Ouvrir la fenêtre", exact: true }).click();
    await page.keyboard.press("Control+k");
    expect(await recherche.count()).toBe(0);
    await page.keyboard.press("Escape");
    await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
    await page.keyboard.press("Control+k");
    await expect.poll(() => recherche.isVisible()).toBe(true);
  });

  it("recherche : le focus revient au bouton, et une sélection glissée hors de la fenêtre ne la ferme pas (TRV-02, TRV-01)", async () => {
    const ouvrir = page.getByRole("button", { name: /^Rechercher/ });
    const recherche = page.getByRole("dialog", { name: "Retrouvez le bon dossier", exact: true });
    await ouvrir.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => recherche.isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => recherche.count()).toBe(0);
    expect(await ouvrir.evaluate(element => element === document.activeElement)).toBe(true);
    await ouvrir.click();
    const champ = recherche.getByRole("textbox");
    await champ.fill("Dupont");
    const boite = (await champ.boundingBox())!;
    await page.mouse.move(boite.x + boite.width - 4, boite.y + boite.height / 2);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 8 });
    await page.mouse.up();
    expect(await recherche.isVisible()).toBe(true);
    await recherche.getByRole("button", { name: "Fermer la recherche", exact: true }).click();
    await expect.poll(() => recherche.count()).toBe(0);
    expect(await ouvrir.evaluate(element => element === document.activeElement)).toBe(true);
  });

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
