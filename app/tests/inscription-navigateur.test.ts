/**
 * /inscription dans un VRAI navigateur (relecture adverse du 23/10/2026, même défaut que PRO-4) : après un refus, la liste
 * « Vous louez en tant que » garde la qualité choisie, avec et sans script.
 *
 * Avec le script, le refus est une MISE À JOUR suivie de la remise à zéro du formulaire par React (`form.reset()` après
 * chaque action) : un champ de saisie reçoit sa nouvelle valeur par défaut avant la remise à zéro, une liste déroulante non
 * (React ne réapplique pas `defaultValue` à un <select> déjà monté). La liste reprenait donc « Personne physique », et un
 * second envoi (code de parrainage corrigé, par exemple) enregistrait en silence une autre qualité que celle choisie, alors
 * que la durée du bail nu en dépend.
 *
 * Ce fichier hydrate le HTML du serveur du vrai formulaire dans Chromium (`fixtures/navigateur/banc-inscription.tsx`,
 * assemblé par rolldown, sous <StrictMode>), câblé à la vraie action ; seule la fabrique de liens est simulée
 * (`fixtures/navigateur/lien-mot-de-passe-neutre.ts`) et refuse chaque inscription. Les adresses sont fictives
 * (`example.invalid`).
 *
 * Ne s'exécute que si un Chromium est disponible : GERIMMO_CHROME ou PLAYWRIGHT_CHROMIUM (le binaire), sinon celui de
 * Playwright (`npx playwright install chromium`), sinon `$PLAYWRIGHT_BROWSERS_PATH/chromium`. Ni base de données ni serveur.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { EtatInscription } from "@/app/actions/auth";
import type { ResultatInscription } from "@/lib/lien-mot-de-passe";
import type { BancInscription, EnvoiInscription } from "./fixtures/navigateur/banc-inscription";

const mocks = vi.hoisted(() => ({ etat: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/lien-mot-de-passe", () => ({ envoyerLienMotDePasse: vi.fn(), inscrireEtEnvoyerConfirmation: vi.fn() }));
// Le HTML du serveur : `useActionState` y rend l'état que le serveur a sous la main (aucun, ou celui d'un envoi sans script).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: () => [mocks.etat, () => {}, false] };
});

import { inscrireProprietaire } from "@/app/actions/auth";
import { FormulaireInscription } from "@/app/inscription/formulaire-inscription";

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

/** Les modules propres au serveur, remplacés dans le navigateur ; tout le reste (formulaire, action, règles) est le vrai code. */
const REMPLACEMENTS: Record<string, string> = {
  "@/lib/supabase/server": resolve(RACINE, "tests/fixtures/navigateur/supabase-serveur-neutre.ts"),
  "@/lib/lien-mot-de-passe": resolve(RACINE, "tests/fixtures/navigateur/lien-mot-de-passe-neutre.ts"),
  "next/navigation": resolve(RACINE, "tests/fixtures/navigateur/next-serveur-neutre.ts"),
  "next/headers": resolve(RACINE, "tests/fixtures/navigateur/next-serveur-neutre.ts"),
  "next/link": resolve(RACINE, "tests/fixtures/navigateur/next-link-neutre.tsx"),
};

/** Assemble le banc (formulaire et action réels, fabrique de liens simulée) en un script de navigateur. */
async function assembler(): Promise<string> {
  const paquet = await rolldown({
    input: resolve(RACINE, "tests/fixtures/navigateur/banc-inscription.tsx"),
    platform: "browser",
    plugins: [{ name: "serveur-hors-banc", resolveId: (id) => REMPLACEMENTS[id] ?? null }],
    resolve: { alias: { "@": resolve(RACINE, "src") } },
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

const DUREE_ESSAI = "2 mois";
const CODE_MAL_FORME = "Le code de parrainage n'a pas la bonne forme : huit lettres ou chiffres, comme 3FA2B9C0.";
const TROP_DE_DEMANDES = "Trop de demandes de lien pour cette adresse ou depuis ce réseau. Réessayez dans une heure.";
const LIMITE: ResultatInscription = { erreur: TROP_DE_DEMANDES, limite: true };
const ADRESSE = ["camille-martin", "example.invalid"].join("@");

/** Le HTML que le serveur rend pour la page, avec l'état d'action qu'il a sous la main. */
function htmlDuServeur(etat: EtatInscription): string {
  mocks.etat = etat;
  const formulaire = renderToString(createElement(StrictMode, null, createElement(FormulaireInscription, { dureeEssai: DUREE_ESSAI })));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><div id="racine">${formulaire}</div><script src="/banc.js"></script></body></html>`;
}

describe.skipIf(!CHROMIUM)("/inscription : « Vous louez en tant que » garde le choix après un refus — dans un vrai navigateur", () => {
  let navigateur: Browser;
  let script: string;
  let contexte: BrowserContext | undefined;
  let page: Page;
  let erreursPage: string[] = [];

  beforeAll(async () => {
    script = await assembler();
    navigateur = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 120_000);
  afterAll(async () => {
    await navigateur?.close();
  });

  /** Ouvre la page telle que le serveur l'envoie ; avec le script, attend la fin de l'hydratation. */
  async function ouvrir(html: string, { script: avecScript = true, refus = [] as ResultatInscription[] } = {}) {
    contexte = await navigateur.newContext({ locale: "fr-FR", javaScriptEnabled: avecScript });
    page = await contexte.newPage();
    erreursPage = [];
    page.on("pageerror", (e) => erreursPage.push(e.message));
    await page.route("http://localhost/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/banc.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    });
    if (avecScript) {
      const banc: BancInscription = { dureeEssai: DUREE_ESSAI, envois: [], inscriptions: [], refus, erreurs: [], pret: false };
      await page.addInitScript((b) => { window.__bancInscription = b; }, banc);
    }
    await page.goto("http://localhost/inscription");
    if (avecScript) await page.waitForFunction(() => window.__bancInscription.pret);
  }

  afterEach(async () => {
    if (page && !page.isClosed()) {
      const rattrapees = await page.evaluate(() => window.__bancInscription?.erreurs ?? []).catch(() => []);
      expect(rattrapees).toEqual([]);
    }
    await contexte?.close();
    contexte = undefined;
    expect(erreursPage).toEqual([]);
  });

  // ───────── gestes ─────────

  const qualite = () => page.locator('select[name="qualite"]');
  const champ = (nom: string) => page.locator(`input[name="${nom}"]`);
  const envois = (): Promise<EnvoiInscription[]> => page.evaluate(() => window.__bancInscription.envois);
  const qualitesEnregistrees = (): Promise<unknown[]> =>
    page.evaluate(() => window.__bancInscription.inscriptions.map((i) => i.metadonnees.qualite));

  /**
   * Envoie le formulaire et attend la réponse de l'action : l'alerte reçoit le focus à chaque refus (AlerteFormulaire),
   * le bouton, cliqué, l'avait ; puis laisse React finir de remettre le formulaire à zéro et d'exécuter les effets.
   */
  async function envoyer() {
    const deja = (await envois()).length;
    await page.getByRole("button", { name: "Ouvrir mon espace" }).click();
    await page.waitForFunction((n) => window.__bancInscription.envois.length === n, deja + 1);
    await page.waitForFunction(() => {
      const bouton = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      return Boolean(bouton && !bouton.disabled && document.activeElement?.getAttribute("role") === "alert");
    });
    await page.evaluate(() => new Promise<void>((fini) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fini, 30)))));
  }

  const ecran = async () => ({
    qualite: await qualite().inputValue(),
    nom: await champ("nom").inputValue(),
    email: await champ("email").inputValue(),
    code: await champ("code_parrainage").inputValue(),
    alerte: (await page.getByRole("alert").textContent())?.trim(),
  });

  // ───────── avec le script ─────────

  it("code de parrainage mal formé : la qualité choisie reste affichée, et l'envoi corrigé enregistre bien celle-là", async () => {
    await ouvrir(htmlDuServeur({}), { refus: [LIMITE] });
    expect(await qualite().inputValue()).toBe("Personne physique");

    await champ("nom").fill("Martin");
    await champ("email").fill(ADRESSE);
    await qualite().selectOption("SCI");
    await champ("code_parrainage").fill("ABC");
    await envoyer();
    expect((await envois())[0]).toMatchObject({ qualite: "SCI", nom: "Martin", code_parrainage: "ABC" });
    expect(await ecran()).toEqual({ qualite: "SCI", nom: "Martin", email: ADRESSE, code: "ABC", alerte: CODE_MAL_FORME });
    expect(await qualitesEnregistrees()).toEqual([]);

    // La personne corrige le code, sans retoucher à la liste : c'est la qualité choisie qui part et serait enregistrée.
    await champ("code_parrainage").fill("3FA2B9C0");
    await envoyer();
    expect((await envois())[1]).toMatchObject({ qualite: "SCI", nom: "Martin", code_parrainage: "3FA2B9C0" });
    expect(await qualitesEnregistrees()).toEqual(["SCI"]);
    expect(await ecran()).toEqual({ qualite: "SCI", nom: "Martin", email: ADRESSE, code: "3FA2B9C0", alerte: TROP_DE_DEMANDES });
  });

  it("refus de la fabrique de liens (trop de demandes) : la liste garde aussi le choix, et le nouvel essai le porte", async () => {
    await ouvrir(htmlDuServeur({}), { refus: [LIMITE, LIMITE] });
    await champ("nom").fill("Martin");
    await champ("email").fill(ADRESSE);
    await qualite().selectOption("SCI familiale");
    await envoyer();
    expect(await ecran()).toMatchObject({ qualite: "SCI familiale", alerte: TROP_DE_DEMANDES });

    await envoyer();
    expect((await envois()).map((e) => e.qualite)).toEqual(["SCI familiale", "SCI familiale"]);
    expect(await qualitesEnregistrees()).toEqual(["SCI familiale", "SCI familiale"]);
    expect(await qualite().inputValue()).toBe("SCI familiale");
  });

  it("refus successifs avec d'autres choix, jusqu'au retour à « Personne physique » : la liste suit toujours le dernier envoi", async () => {
    await ouvrir(htmlDuServeur({}));
    await champ("nom").fill("Martin");
    await champ("email").fill(ADRESSE);

    // Chaque code est mal formé : l'action refuse sans rien appeler.
    await qualite().selectOption("SCI");
    await champ("code_parrainage").fill("ABC");
    await envoyer();
    expect(await qualite().inputValue()).toBe("SCI");

    await qualite().selectOption("Personne morale");
    await champ("code_parrainage").fill("XYZ");
    await envoyer();
    expect(await qualite().inputValue()).toBe("Personne morale");

    // Retour à la valeur d'origine : la liste ne doit pas rester sur le choix du refus précédent.
    await qualite().selectOption("Personne physique");
    await envoyer();
    expect(await qualite().inputValue()).toBe("Personne physique");

    // Un refus qui ne change rien à la liste la laisse telle quelle.
    await envoyer();
    expect(await qualite().inputValue()).toBe("Personne physique");

    expect((await envois()).map((e) => e.qualite)).toEqual(["SCI", "Personne morale", "Personne physique", "Personne physique"]);
    expect(await qualitesEnregistrees()).toEqual([]);
    expect((await ecran()).alerte).toBe(CODE_MAL_FORME);
  });

  // ───────── sans le script ─────────

  it("sans script : la page rendue par le serveur après l'envoi natif affiche la qualité refusée, et la renverrait telle quelle", async () => {
    // Le vrai refus de l'action (code mal formé : aucun appel à la fabrique), tel que le serveur le rend à la page.
    const envoiNatif = new FormData();
    const saisie = { nom: "Martin", email: ADRESSE, qualite: "SCI", code_parrainage: "ABC", prenom: "", telephone: "", adresse: "", code_postal: "", ville: "" };
    for (const [cle, valeur] of Object.entries(saisie)) envoiNatif.set(cle, valeur);
    const refus = await inscrireProprietaire({}, envoiNatif);
    expect(refus).toMatchObject({ erreur: CODE_MAL_FORME, valeurs: { qualite: "SCI", nom: "Martin" } });

    await ouvrir(htmlDuServeur(refus), { script: false });
    expect(await qualite().inputValue()).toBe("SCI");
    expect(await champ("nom").inputValue()).toBe("Martin");
    expect(await champ("code_parrainage").inputValue()).toBe("ABC");
    const prochainEnvoi = await page.locator("form").evaluate((f: HTMLFormElement) => new FormData(f).get("qualite"));
    expect(prochainEnvoi).toBe("SCI");
  });
});
