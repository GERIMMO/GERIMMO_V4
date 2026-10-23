/**
 * « Plus tard » sur l'encart « Nos conditions générales évoluent » (R19), dans un VRAI navigateur — relecture adverse du
 * 24/10/2026, domaine « acceptation », défaut 6.
 *
 * « Plus tard » doit masquer l'encart jusqu'à la prochaine connexion. Gardé dans le stockage de session de l'ONGLET, il
 * revenait dans chaque nouvel onglet de la même connexion. Le choix est désormais gardé sur l'appareil (stockage local,
 * aucun témoin), lié à la version et à l'heure de la connexion : un nouvel onglet ne le montre plus, un onglet déjà
 * ouvert le masque aussitôt, et une nouvelle connexion le fait revenir.
 *
 * Le HTML du serveur du vrai composant est hydraté dans Chromium (`fixtures/navigateur/banc-nouvelle-version-conditions.tsx`,
 * assemblé par rolldown, sous <StrictMode>). Ne s'exécute que si un Chromium est disponible (même recherche que
 * premier-mot-de-passe-navigateur.test.ts). Ni base de données ni serveur.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BancConditions, ProprietesEncart } from "./fixtures/navigateur/banc-nouvelle-version-conditions";

vi.mock("@/app/actions/acceptation-conditions", () => ({ accepterNouvelleVersionConditions: vi.fn(), accepterConditionsArtisans: vi.fn() }));

import { EcranNouvelleVersionConditions } from "@/components/ecran-nouvelle-version-conditions";
import { valeurReport } from "@/lib/conditions-acceptation";

const RACINE = resolve(__dirname, "..");

function trouverChromium(): string | undefined {
  const candidats = [process.env.GERIMMO_CHROME, process.env.PLAYWRIGHT_CHROMIUM];
  try {
    candidats.push(chromium.executablePath());
  } catch {
    // pas de Chromium de Playwright : on essaie la suite
  }
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) candidats.push(resolve(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium"));
  return candidats.find((c): c is string => Boolean(c && existsSync(c)));
}
const CHROMIUM = trouverChromium();

const REMPLACEMENTS: Record<string, string> = {
  "@/app/actions/acceptation-conditions": resolve(RACINE, "tests/fixtures/navigateur/actions-acceptation-neutre.ts"),
  "next/link": resolve(RACINE, "tests/fixtures/navigateur/next-link-neutre.tsx"),
};

async function assembler(): Promise<string> {
  const paquet = await rolldown({
    input: resolve(RACINE, "tests/fixtures/navigateur/banc-nouvelle-version-conditions.tsx"),
    platform: "browser",
    plugins: [{ name: "serveur-hors-banc", resolveId: (id) => REMPLACEMENTS[id] ?? null }],
    resolve: { alias: { "@": resolve(RACINE, "src") } },
    transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": JSON.stringify("development") } },
    logLevel: "silent",
  });
  try {
    const { output } = await paquet.generate({ format: "iife" });
    return output[0].code;
  } finally {
    await paquet.close();
  }
}

const CONNEXION = "2026-11-20T08:00:00Z";
const proprietes = (derniereConnexion: string): ProprietesEncart => ({
  orgId: "11111111-1111-4111-8111-111111111111",
  version: "2026-11-15",
  dateVersion: "15 novembre 2026",
  paragraphes: ["Une nouvelle version des conditions générales d’utilisation et de vente s’applique à compter du 15 novembre 2026."],
  report: valeurReport("2026-11-15", derniereConnexion),
});

function htmlDuServeur(p: ProprietesEncart): string {
  const encart = renderToString(createElement(StrictMode, null, createElement(EcranNouvelleVersionConditions, p)));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><div id="racine">${encart}</div><script src="/banc.js"></script></body></html>`;
}

describe.skipIf(!CHROMIUM)("« Plus tard » vaut pour la connexion, pas pour l'onglet — dans un vrai navigateur", () => {
  let navigateur: Browser;
  let script: string;
  let contexte: BrowserContext;
  const pages: Page[] = [];
  const erreursPage: string[] = [];

  beforeAll(async () => {
    script = await assembler();
    navigateur = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 120_000);
  afterAll(async () => {
    await navigateur?.close();
  });
  afterEach(async () => {
    for (const page of pages.splice(0)) {
      if (!page.isClosed()) expect(await page.evaluate(() => window.__bancConditions?.erreurs ?? []).catch(() => [])).toEqual([]);
    }
    await contexte?.close();
    expect(erreursPage.splice(0)).toEqual([]);
  });

  async function nouveauContexte() {
    contexte = await navigateur.newContext({ locale: "fr-FR" });
  }
  /** Un onglet de plus dans le même navigateur, sur la page telle que le serveur l'envoie ; attend l'hydratation. */
  async function onglet(p: ProprietesEncart): Promise<Page> {
    const page = await contexte.newPage();
    pages.push(page);
    page.on("pageerror", (e) => erreursPage.push(e.message));
    const html = htmlDuServeur(p);
    await page.route("http://localhost/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/banc.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    });
    const banc: BancConditions = { proprietes: p, erreurs: [], pret: false };
    await page.addInitScript((b) => { window.__bancConditions = b; }, banc);
    await page.goto("http://localhost/espace");
    await page.waitForFunction(() => window.__bancConditions.pret);
    return page;
  }
  const encart = (page: Page) => page.getByRole("heading", { name: "Nos conditions générales évoluent" });

  it("« Plus tard » dans un onglet : un nouvel onglet de la même connexion ne montre plus l'encart", async () => {
    await nouveauContexte();
    const premier = await onglet(proprietes(CONNEXION));
    await expect(encart(premier).isVisible()).resolves.toBe(true);
    await premier.getByRole("button", { name: "Plus tard" }).click();
    await expect(encart(premier).count()).resolves.toBe(0);

    const second = await onglet(proprietes(CONNEXION));
    await expect(encart(second).count()).resolves.toBe(0);
  });

  it("un onglet déjà ouvert masque l'encart dès que « Plus tard » est choisi dans un autre", async () => {
    await nouveauContexte();
    const ouvert = await onglet(proprietes(CONNEXION));
    const autre = await onglet(proprietes(CONNEXION));
    await expect(encart(ouvert).isVisible()).resolves.toBe(true);
    await autre.getByRole("button", { name: "Plus tard" }).click();
    await ouvert.waitForFunction(() => !document.getElementById("titre-nouvelle-version"), undefined, { timeout: 5_000 });
    await expect(encart(ouvert).count()).resolves.toBe(0);
  });

  it("une nouvelle connexion fait revenir l'encart", async () => {
    await nouveauContexte();
    const avant = await onglet(proprietes(CONNEXION));
    await avant.getByRole("button", { name: "Plus tard" }).click();
    const apres = await onglet(proprietes("2026-11-21T09:30:00Z"));
    await expect(encart(apres).isVisible()).resolves.toBe(true);
  });
});
