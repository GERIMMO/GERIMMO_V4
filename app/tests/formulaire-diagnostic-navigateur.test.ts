/**
 * X07 (PROP-11) dans un VRAI navigateur : la proposition « Utiliser cette pièce pour ce lot » du dépôt d'un diagnostic.
 *
 * `diagnostic-piece-existante-ecran.test.ts` ne voit que le HTML du serveur. Or deux choses ne se jouent qu'au navigateur
 * (constat de relecture du 15/10/2026) :
 *  - la touche Entrée dans un champ du formulaire clique le PREMIER bouton d'envoi du formulaire (le « bouton par défaut »).
 *    Quand « Utiliser cette pièce » précédait « Déposer » dans le DOM, Entrée dans « Diagnostiqueur » ou dans une date
 *    rattachait la pièce proposée sans que personne l'ait demandé ;
 *  - la proposition concerne le fichier que l'utilisateur vient de déposer : dès qu'il choisit un autre fichier ou un autre
 *    type, elle ne vaut plus et ne doit plus rester à l'écran.
 *
 * Ce fichier monte le vrai formulaire dans Chromium (`fixtures/navigateur/banc-diagnostic-piece.tsx`, assemblé par rolldown,
 * sous <StrictMode>) avec une action simulée, puis rejoue les gestes : choisir un fichier, déposer, appuyer sur Entrée,
 * cliquer la proposition, changer de fichier.
 *
 * Ne s'exécute que si un Chromium est disponible : GERIMMO_CHROME ou PLAYWRIGHT_CHROMIUM (le binaire), sinon celui de
 * Playwright (`npx playwright install chromium`), sinon `$PLAYWRIGHT_BROWSERS_PATH/chromium`. Ni base de données ni serveur.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EtatParc } from "@/app/actions/parc";
import type { EnvoiRecu } from "./fixtures/navigateur/banc-diagnostic-piece";

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

/** Assemble le banc (formulaire réel + action simulée) en un script de navigateur. */
async function assembler(): Promise<string> {
  const paquet = await rolldown({
    input: resolve(RACINE, "tests/fixtures/navigateur/banc-diagnostic-piece.tsx"),
    platform: "browser",
    // Les actions serveur de `parc` n'existent pas dans le navigateur : le formulaire les importe, le banc les remplace.
    plugins: [{ name: "actions-parc-neutres", resolveId: (id) => (
      id === "@/app/actions/parc" ? resolve(RACINE, "tests/fixtures/navigateur/actions-parc-neutre.ts")
        : id.endsWith("depot-direct-client") ? "\0transfert-isole" : null),
      load: id => id === "\0transfert-isole" ? "export async function preparerDepotsDirects() {} export class ErreurDepotDirect extends Error {}" : null }],
    resolve: {
      alias: {
        "@": resolve(RACINE, "src"),
        "next/navigation": resolve(RACINE, "tests/fixtures/navigateur/next-navigation-neutre.ts"),
      },
    },
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

const PIECE = "00000000-0000-4000-8000-00000000d0c1";
const AUTRE_PIECE = "00000000-0000-4000-8000-00000000d0c2";
const REFUS = "Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « DPE — 13/10/2026 ». Rattachez cette pièce existante plutôt que de la déposer en double.";
const PROPOSITION: EtatParc = { erreur: REFUS, pieceExistante: { id: PIECE, titre: "DPE — 13/10/2026" } };
const AUTRE_PROPOSITION: EtatParc = { erreur: REFUS, pieceExistante: { id: AUTRE_PIECE, titre: "DPE — 14/10/2026" } };
const SUCCES: EtatParc = { succes: "Diagnostic enregistré." };
const PDF = (nom: string) => ({ name: nom, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 ${nom}`) });

describe.skipIf(!CHROMIUM)("Dépôt d'un diagnostic et proposition de la pièce existante — dans un vrai navigateur", () => {
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
    await page.route("http://localhost/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/banc.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="fr"><body><div id="racine"></div><script src="/banc.js"></script></body></html>' });
    });
    await page.goto("http://localhost/banc");
    await page.getByLabel("Rapport du diagnostiqueur", { exact: true }).waitFor();
    // La date du jour et l'expiration sont posées après l'hydratation ; le bouton d'envoi s'active à ce moment.
    await expect.poll(() => page.getByLabel("Réalisé le", { exact: true }).inputValue()).not.toBe("");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Déposer" && !b.disabled));
  });
  afterEach(async () => {
    await contexte?.close();
    expect(erreursPage).toEqual([]);
  });

  // ───────── gestes ─────────

  const reponses = (...r: EtatParc[]) => page.evaluate((r) => { window.__bancDiagnostic.reponses.push(...r); }, r);
  const envois = (): Promise<EnvoiRecu[]> => page.evaluate(() => window.__bancDiagnostic.envois);
  const deposer = () => page.getByRole("button", { name: "Déposer", exact: true });
  const utiliser = () => page.getByRole("button", { name: "Utiliser cette pièce pour ce lot", exact: true });
  /** Laisse React finir de poser l'état et d'exécuter les effets qui suivent une réponse. */
  const laisserAfficher = () => page.evaluate(() => new Promise<void>((fini) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fini, 30)))));
  /** Attend que l'action ait reçu `n` envois et que l'écran soit revenu au repos. */
  async function attendre(n: number) {
    await page.waitForFunction((n) => window.__bancDiagnostic.envois.length === n, n);
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => b.disabled));
    await laisserAfficher();
  }
  /** Remplit ce que le rapport exige (fichier, classe du DPE ; les dates sont déjà posées). */
  async function remplir(nom = "dpe-immeuble.pdf") {
    await page.getByLabel("Rapport du diagnostiqueur", { exact: true }).setInputFiles(PDF(nom));
    await page.getByLabel("Classe énergétique (DPE)", { exact: true }).selectOption("C");
  }
  /** Premier dépôt, refusé : le serveur propose la pièce déjà rangée. */
  async function deposerEtRecevoirLaProposition(reponse: EtatParc = PROPOSITION) {
    await remplir();
    await reponses(reponse);
    const deja = (await envois()).length;
    await deposer().click();
    await attendre(deja + 1);
    await utiliser().waitFor({ state: "visible", timeout: 3000 });
  }

  // ───────── la touche Entrée ─────────

  it("Entrée dans « Diagnostiqueur » envoie « Déposer » : la pièce proposée n'est PAS rattachée", async () => {
    await deposerEtRecevoirLaProposition();
    await reponses(SUCCES);
    await page.getByLabel("Diagnostiqueur", { exact: true }).fill("Cabinet Martin");
    await page.getByLabel("Diagnostiqueur", { exact: true }).press("Enter");
    await attendre(2);
    const recus = await envois();
    expect(recus[1].pieceExistante).toBeNull();
    expect(recus[1].diagnostiqueur).toBe("Cabinet Martin");
    // C'est un dépôt ordinaire : le fichier part avec.
    expect(recus[1].fichier).toBe("dpe-immeuble.pdf");
  });

  it("Entrée dans une date envoie aussi « Déposer », sans rattacher la pièce proposée", async () => {
    await deposerEtRecevoirLaProposition();
    await reponses(SUCCES);
    await page.getByLabel("Réalisé le", { exact: true }).press("Enter");
    await attendre(2);
    expect((await envois())[1].pieceExistante).toBeNull();
  });

  it("le clic sur « Utiliser cette pièce pour ce lot » rattache la pièce, avec ce qui est déjà saisi", async () => {
    await deposerEtRecevoirLaProposition();
    await reponses(SUCCES);
    await page.getByLabel("Diagnostiqueur", { exact: true }).fill("Cabinet Martin");
    await utiliser().click();
    await attendre(2);
    const recus = await envois();
    expect(recus[1].pieceExistante).toBe(PIECE);
    expect(recus[1].diagnostiqueur).toBe("Cabinet Martin");
  });

  // ───────── la proposition ne survit pas à un autre fichier ou un autre type ─────────

  it("choisir un AUTRE fichier retire la proposition (et le refus qui allait avec)", async () => {
    await deposerEtRecevoirLaProposition();
    await page.getByLabel("Rapport du diagnostiqueur", { exact: true }).setInputFiles(PDF("un-autre-rapport.pdf"));
    await utiliser().waitFor({ state: "detached", timeout: 2000 });
    expect(await page.getByText("Ce rapport est déjà dans votre dossier").count()).toBe(0);
    expect(await page.getByText("Rattachez cette pièce existante").count()).toBe(0);
  });

  it("choisir un autre fichier puis appuyer sur Entrée dépose le NOUVEAU fichier, sans pièce rattachée", async () => {
    await deposerEtRecevoirLaProposition();
    await page.getByLabel("Rapport du diagnostiqueur", { exact: true }).setInputFiles(PDF("un-autre-rapport.pdf"));
    await utiliser().waitFor({ state: "detached", timeout: 2000 });
    await reponses(SUCCES);
    await page.getByLabel("Diagnostiqueur", { exact: true }).press("Enter");
    await attendre(2);
    const recus = await envois();
    expect(recus[1].pieceExistante).toBeNull();
    expect(recus[1].fichier).toBe("un-autre-rapport.pdf");
  });

  it("changer le TYPE de diagnostic retire la proposition", async () => {
    await deposerEtRecevoirLaProposition();
    await page.getByLabel("Type de diagnostic", { exact: true }).selectOption("plomb");
    await utiliser().waitFor({ state: "detached", timeout: 2000 });
  });

  it("corriger une date ou le diagnostiqueur laisse la proposition : le rapport, lui, n'a pas changé", async () => {
    await deposerEtRecevoirLaProposition();
    await page.getByLabel("Diagnostiqueur", { exact: true }).fill("Cabinet Martin");
    await page.getByLabel("Réalisé le", { exact: true }).fill("2026-10-01");
    await laisserAfficher();
    expect(await utiliser().isVisible()).toBe(true);
  });

  it("une nouvelle proposition (autre dépôt refusé) s'affiche de nouveau après avoir été retirée", async () => {
    await deposerEtRecevoirLaProposition();
    await page.getByLabel("Rapport du diagnostiqueur", { exact: true }).setInputFiles(PDF("un-autre-rapport.pdf"));
    await utiliser().waitFor({ state: "detached", timeout: 2000 });
    await reponses(AUTRE_PROPOSITION);
    await deposer().click();
    await attendre(2);
    await utiliser().waitFor({ state: "visible", timeout: 3000 });
    await reponses(SUCCES);
    await utiliser().click();
    await attendre(3);
    expect((await envois())[2].pieceExistante).toBe(AUTRE_PIECE);
  });
});
