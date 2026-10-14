/**
 * D05 et D04 (2) dans un VRAI navigateur : le cycle de vie de la clé d'envoi et la demande de confirmation.
 *
 * `cle-envoi-formulaires.test.ts` ne voit que le HTML du serveur (le champ caché est vide) et la règle pure `cleLiberee` :
 * il ne peut pas voir ce qui se joue après l'affichage. Or toute la protection tient là : une clé tirée dans le
 * navigateur, qui reste la même après une réponse perdue, un refus ou une demande de confirmation, et ne change qu'après
 * un succès confirmé par le serveur. Ce fichier monte les vrais composants dans Chromium (`fixtures/navigateur/banc-cle-envoi.tsx`,
 * assemblé par rolldown, sous <StrictMode>) avec une action simulée qui lève une exception ou rend l'état préparé, puis
 * rejoue les gestes : saisir, cliquer, cliquer encore, confirmer, corriger, retaper.
 *
 * Chaque assertion a été éprouvée par une mutation du composant (clé renouvelée à chaque réponse, jamais renouvelée,
 * jamais tirée, demande qui ne se referme pas, focus qui ne revient pas…) : voir les noms des essais.
 *
 * Ne s'exécute que si un Chromium est disponible : GERIMMO_CHROME ou PLAYWRIGHT_CHROMIUM (le binaire), sinon celui de
 * Playwright (`npx playwright install chromium`), sinon `$PLAYWRIGHT_BROWSERS_PATH/chromium`. Ni base de données ni serveur.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ConfirmationEncaissement } from "@/lib/garde-encaissement";
import type { EnvoiRecu, ReponseBanc } from "./fixtures/navigateur/banc-cle-envoi";

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

/** Assemble le banc (composants réels + action simulée) en un script de navigateur. */
async function assembler(): Promise<string> {
  const paquet = await rolldown({
    input: resolve(RACINE, "tests/fixtures/navigateur/banc-cle-envoi.tsx"),
    platform: "browser",
    resolve: {
      alias: {
        "@": resolve(RACINE, "src"),
        "next/navigation": resolve(RACINE, "tests/fixtures/navigateur/next-navigation-neutre.ts"),
      },
    },
    // Développement : <StrictMode> rejoue les effets deux fois, comme `next dev`.
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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUCCES: ReponseBanc = { succes: "Encaissement enregistré." };
const DEJA: ReponseBanc = { succes: "Cet encaissement est déjà enregistré : il n'a pas été enregistré une seconde fois.", dejaEnregistre: true };
const CONFIRMATION: ConfirmationEncaissement = {
  montant: 84000,
  resteDu: 840,
  terme: 840,
  seuil: 3360,
  message: "Rien n'est encore enregistré. 84 000,00 € dépasse le double de ce qui est attendu.",
};
const DEMANDE: ReponseBanc = { confirmation: CONFIRMATION, valeurs: { montant: "84000" } };

describe.skipIf(!CHROMIUM)("Clé d'envoi et confirmation d'un encaissement — dans un vrai navigateur", () => {
  let navigateur: Browser;
  let script: string;
  let contexte: BrowserContext;
  let page: Page;
  let erreursPage: string[];

  beforeAll(async () => {
    script = await assembler();
    navigateur = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 120_000);
  afterAll(async () => {
    await navigateur?.close();
  });

  beforeEach(async () => {
    contexte = await navigateur.newContext({ locale: "fr-FR" });
    page = await contexte.newPage();
    erreursPage = [];
    page.on("pageerror", (e) => erreursPage.push(e.message));
    // localhost est un contexte sécurisé, comme la production en https : `crypto.randomUUID` y existe.
    await page.route("http://localhost/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/banc.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><body><div id="racine"></div><script src="/banc.js"></script></body></html>' });
    });
    await page.goto("http://localhost/banc");
    await page.waitForSelector("#enc-montant");
  });
  afterEach(async () => {
    await contexte?.close();
    // Aucune exception du navigateur ne doit passer inaperçue (la « réponse perdue » du banc est attrapée par le crochet).
    expect(erreursPage).toEqual([]);
  });

  // ───────── gestes ─────────

  const reponses = (...r: ReponseBanc[]) => page.evaluate((r) => { window.__banc.reponses.push(...r); }, r);
  const envois = (): Promise<EnvoiRecu[]> => page.evaluate(() => window.__banc.envois);
  const encaisser = () => page.getByRole("button", { name: "Encaisser", exact: true });
  /** Laisse React finir de poser l'état et d'exécuter les effets qui suivent une réponse. */
  const laisserAfficher = () => page.evaluate(() => new Promise<void>((fini) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fini, 30)))));
  /** La clé du champ caché, une fois tirée par le navigateur (attente bornée). */
  async function cle(): Promise<string> {
    await page.waitForFunction(() => (document.querySelector<HTMLInputElement>('input[name="cle_envoi"]')?.value ?? "") !== "", undefined, { timeout: 3000 }).catch(() => undefined);
    return page.inputValue('input[name="cle_envoi"]');
  }
  /** Saisit le montant et envoie ; rend la main quand l'action a répondu et que l'écran est à jour. */
  async function envoyer(montant: string | null, clic: "Encaisser" | "Oui" = "Encaisser") {
    const deja = (await envois()).length;
    if (montant !== null) await page.fill("#enc-montant", montant);
    if (clic === "Encaisser") await encaisser().click();
    else await page.getByRole("button", { name: /^Oui, encaisser/ }).click();
    await page.waitForFunction((n) => window.__banc.envois.length === n + 1, deja);
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => b.disabled));
    await laisserAfficher();
  }
  const demande = () => page.getByRole("alert");
  /** La demande de confirmation est à l'écran. */
  const demandeOuverte = () => demande().waitFor({ state: "visible", timeout: 3000 });
  /** La demande de confirmation a disparu de l'écran (attente bornée : une demande qui reste échoue ici). */
  const demandeRefermee = () => demande().waitFor({ state: "detached", timeout: 2000 });

  // ───────── D05 : le cycle de vie de la clé ─────────

  it("la clé est tirée dans le navigateur après l'affichage : un UUID v4, présent dans le champ caché", async () => {
    expect(await cle()).toMatch(UUID_V4);
  });

  it("réponse perdue : l'écran le dit, la clé ne change pas et le second clic envoie la MÊME clé", async () => {
    const avant = await cle();
    await reponses("perdue", SUCCES);
    await envoyer("840");
    await expect(page.locator("[data-erreur]").innerText()).resolves.toMatch(/n’a pas pu être reçue/);
    expect(await cle()).toBe(avant);
    await envoyer("840");
    const recus = await envois();
    expect(recus.map((e) => e.cle)).toEqual([avant, avant]);
    expect(recus.map((e) => e.montant)).toEqual(["840", "840"]);
  });

  it("refus du serveur (montant invalide) : la clé ne change pas, la saisie corrigée part avec la même clé", async () => {
    const avant = await cle();
    await reponses({ erreur: "Le montant doit être un nombre.", valeurs: { montant: "abc" } }, SUCCES);
    await envoyer("abc");
    expect(await cle()).toBe(avant);
    await envoyer("840");
    expect((await envois()).map((e) => e.cle)).toEqual([avant, avant]);
  });

  it("succès confirmé par le serveur : la clé est renouvelée, l'encaissement suivant part avec une AUTRE clé", async () => {
    const premiere = await cle();
    await reponses(SUCCES, SUCCES);
    await envoyer("840");
    await expect(page.locator("[data-succes]").innerText()).resolves.toMatch(/enregistré/);
    const apres = await cle();
    expect(apres).toMatch(UUID_V4);
    expect(apres).not.toBe(premiere);
    await envoyer("840");
    const recus = await envois();
    expect(recus[0].cle).toBe(premiere);
    expect(recus[1].cle).toBe(apres);
  });

  it("« déjà enregistré » (le serveur a reconnu la clé) libère aussi la clé : le versement suivant est un autre envoi", async () => {
    const premiere = await cle();
    await reponses(DEJA, SUCCES);
    await envoyer("840");
    await expect(page.locator("[data-succes]").innerText()).resolves.toMatch(/déjà enregistré/);
    const apres = await cle();
    expect(apres).not.toBe(premiere);
    await envoyer("840");
    expect((await envois())[1].cle).toBe(apres);
  });

  it("envoi en cours : le bouton se désactive, un second clic n'envoie rien de plus", async () => {
    await page.evaluate(() => { window.__banc.porte = new Promise<void>((liberer) => { window.__banc.liberer = liberer; }); });
    await reponses(SUCCES);
    await page.fill("#enc-montant", "840");
    await encaisser().click();
    await page.waitForFunction(() => window.__banc.envois.length === 1);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.disabled));
    await encaisser().click({ force: true, timeout: 1000 }).catch(() => undefined);
    await laisserAfficher();
    expect(await envois()).toHaveLength(1);
    await page.evaluate(() => window.__banc.liberer?.());
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => b.disabled));
    expect(await envois()).toHaveLength(1);
  });

  // ───────── D04 (2) : la demande de confirmation ─────────

  it("montant très supérieur au dû : la demande s'affiche avec le montant, la saisie reste, la clé ne change pas", async () => {
    const avant = await cle();
    await reponses(DEMANDE);
    await envoyer("84000");
    await demandeOuverte();
    await expect(demande().innerText()).resolves.toMatch(/Vérifiez ce montant avant de l.enregistrer/);
    await expect(demande().innerText()).resolves.toMatch(/Rien n.est encore enregistré/);
    await expect(page.getByRole("button", { name: /^Oui, encaisser 84\s000,00\s€$/ }).count()).resolves.toBe(1);
    expect(await page.inputValue("#enc-montant")).toBe("84000");
    expect(await cle()).toBe(avant);
    expect((await envois())[0].confirmation).toBeNull();
  });

  it("« Oui, encaisser » renvoie le montant confirmé (84000.00), le montant saisi et la MÊME clé ; la demande disparaît au succès", async () => {
    const avant = await cle();
    await reponses(DEMANDE, SUCCES);
    await envoyer("84000");
    await envoyer(null, "Oui");
    const recus = await envois();
    expect(recus).toEqual([
      { cle: avant, montant: "84000", confirmation: null },
      { cle: avant, montant: "84000", confirmation: "84000.00" },
    ]);
    await demandeRefermee();
    expect(await cle()).not.toBe(avant);
  });

  it("« Corriger le montant » referme la demande et remet le focus dans le champ Montant", async () => {
    await reponses(DEMANDE);
    await envoyer("84000");
    await page.getByRole("button", { name: "Corriger le montant" }).click();
    await demandeRefermee();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("enc-montant");
  });

  it("retaper le montant referme la demande : le bouton n'annonce jamais une somme qui n'est plus celle du champ", async () => {
    await reponses(DEMANDE);
    await envoyer("84000");
    await demandeOuverte();
    await page.locator("#enc-montant").pressSequentially("5");
    await demandeRefermee();
  });

  it("après correction, un nouvel envoi qui dépasse encore le seuil rouvre une demande, avec le nouveau montant", async () => {
    await reponses(DEMANDE, { confirmation: { ...CONFIRMATION, montant: 9000, message: "Rien n'est encore enregistré. 9 000,00 € dépasse le double de ce qui est attendu." }, valeurs: { montant: "9000" } });
    await envoyer("84000");
    await page.getByRole("button", { name: "Corriger le montant" }).click();
    await envoyer("9000");
    await demandeOuverte();
    await expect(page.getByRole("button", { name: /^Oui, encaisser 9\s000,00\s€$/ }).count()).resolves.toBe(1);
    expect(await page.inputValue("#enc-montant")).toBe("9000");
  });

  it("confirmation dont la réponse est perdue : revenir sur « Encaisser » rejoue la même clé, sans le drapeau de confirmation", async () => {
    const avant = await cle();
    await reponses(DEMANDE, "perdue", DEJA);
    await envoyer("84000");
    await envoyer(null, "Oui");
    await envoyer(null);
    const recus = await envois();
    expect(recus.map((e) => e.cle)).toEqual([avant, avant, avant]);
    expect(recus.map((e) => e.confirmation)).toEqual([null, "84000.00", null]);
  });
});
