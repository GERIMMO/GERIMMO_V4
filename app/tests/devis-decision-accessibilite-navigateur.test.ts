/**
 * D18 (devis révisable), relecture du 15/10/2026 : l'accessibilité des deux formulaires motivés sur un devis reçu,
 * « Refuser » et « Demander une révision », dans un VRAI navigateur.
 *
 * Constats reproduits : le bouton qui ouvre le formulaire disparaît au clic et rien ne pose le focus dans la zone de
 * texte ; « Annuler » laisse le focus retomber sur la page ; le bouton porte `aria-expanded="false"` en permanence ;
 * l'erreur et le succès s'affichent sans annonce (ni `role="alert"` ni `role="status"`) ; le texte d'aide n'est pas relié
 * à la zone de texte, et rien ne la marque invalide en cas d'erreur. Après l'envoi réussi, le formulaire est remplacé
 * par le message : le focus retombait sur la page.
 *
 * Banc : `fixtures/navigateur/banc-decision-devis.tsx` (composants réels sous <StrictMode>, actions simulées), assemblé
 * par rolldown. Ne s'exécute que si un Chromium est disponible (voir `formulaire-diagnostic-navigateur.test.ts`).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EtatIncidentAction } from "@/app/actions/incidents";

const RACINE = resolve(__dirname, "..");
const BANC = resolve(RACINE, "tests/fixtures/navigateur");

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
  "@/app/actions/incidents": resolve(BANC, "actions-incidents-neutre.ts"),
  "@/app/actions/reseau": resolve(BANC, "actions-reseau-neutre.ts"),
  "next/link": resolve(BANC, "next-link-neutre.tsx"),
};

async function assembler(): Promise<string> {
  const paquet = await rolldown({
    input: resolve(BANC, "banc-decision-devis.tsx"),
    platform: "browser",
    plugins: [{ name: "actions-serveur-neutres", resolveId: (id) => REMPLACEMENTS[id] ?? null }],
    resolve: {
      alias: {
        "@": resolve(RACINE, "src"),
        "next/navigation": resolve(BANC, "next-navigation-neutre.ts"),
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

const MOTIF = "Le montant dépasse le budget prévu pour cette réparation.";

/** Les deux formulaires, avec ce qui les distingue à l'écran. */
const CAS = [
  { banc: "refus", ouvrir: "Refuser le devis de Plomberie Durand", confirmer: "Confirmer le refus du devis de Plomberie Durand", succes: "Devis refusé. L’artisan est prévenu." },
  { banc: "revision", ouvrir: "Demander une révision du devis de Plomberie Martin", confirmer: "Confirmer la demande de révision du devis de Plomberie Martin", succes: "Révision demandée. L’artisan est prévenu." },
] as const;

describe.skipIf(!CHROMIUM)("Refuser / demander une révision d'un devis : focus et annonces, dans un vrai navigateur", () => {
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
    await page.waitForSelector('[data-banc="revision"] button');
  });
  afterEach(async () => {
    await contexte?.close();
    expect(erreursPage).toEqual([]);
  });

  const section = (banc: string) => page.locator(`[data-banc="${banc}"]`);
  const zone = (banc: string) => section(banc).locator('textarea[name="motif"]');
  const reponses = (...r: EtatIncidentAction[]) => page.evaluate((r) => { window.__bancDecision.reponses.push(...r); }, r);
  /** Ce que porte l'élément qui a le focus : sa balise, son nom, son texte, et s'il est dans la section donnée. */
  const focus = (banc: string) =>
    page.evaluate((banc) => {
      const a = document.activeElement as HTMLElement | null;
      return {
        balise: a?.tagName.toLowerCase() ?? null,
        nom: a?.getAttribute("name") ?? null,
        texte: (a?.textContent ?? "").replace(/\s+/g, " ").trim(),
        dansLaSection: Boolean(a && document.querySelector(`[data-banc="${banc}"]`)?.contains(a)),
      };
    }, banc);
  /** Les textes des éléments que désigne `aria-describedby` de la zone de texte. */
  const descriptions = (banc: string) =>
    zone(banc).evaluate((z) => (z.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? `(#${id} introuvable)`));

  for (const c of CAS) {
    describe(`« ${c.banc === "refus" ? "Refuser" : "Demander une révision"} »`, () => {
      it("le bouton d'ouverture ne prétend pas un état « replié » figé ; à l'ouverture, le focus est dans la zone de texte", async () => {
        const bouton = page.getByRole("button", { name: c.ouvrir, exact: true });
        expect(await bouton.getAttribute("aria-expanded")).not.toBe("false");
        await bouton.click();
        await zone(c.banc).waitFor();
        expect(await focus(c.banc)).toMatchObject({ balise: "textarea", nom: "motif", dansLaSection: true });
      });

      it("le texte d'aide est relié à la zone de texte", async () => {
        await page.getByRole("button", { name: c.ouvrir, exact: true }).click();
        const textes = await descriptions(c.banc);
        expect(textes.some((t) => t.includes("Dix caractères au moins"))).toBe(true);
      });

      it("« Annuler » rend le focus au bouton qui avait ouvert le formulaire", async () => {
        await page.getByRole("button", { name: c.ouvrir, exact: true }).click();
        await zone(c.banc).waitFor();
        await section(c.banc).getByRole("button", { name: "Annuler", exact: true }).click();
        await page.getByRole("button", { name: c.ouvrir, exact: true }).waitFor();
        const f = await focus(c.banc);
        expect(f.balise).toBe("button");
        expect(f.dansLaSection).toBe(true);
        expect(f.texte).toContain(c.banc === "refus" ? "Refuser" : "Demander une révision");
      });

      it("une erreur est annoncée (role=alert), reliée à la zone de texte, qui est marquée invalide", async () => {
        const erreur = "Ce devis a déjà été retenu : la mission est confiée à l'artisan.";
        await reponses({ erreur, valeurs: { motif: MOTIF } });
        await page.getByRole("button", { name: c.ouvrir, exact: true }).click();
        await zone(c.banc).fill(MOTIF);
        await page.getByRole("button", { name: c.confirmer, exact: true }).click();
        const alerte = section(c.banc).getByRole("alert");
        await alerte.waitFor({ timeout: 5000 });
        expect(await alerte.textContent()).toContain(erreur);
        expect(await zone(c.banc).getAttribute("aria-invalid")).toBe("true");
        expect((await descriptions(c.banc)).some((t) => t.includes(erreur))).toBe(true);
      });

      it("le succès est annoncé (role=status) et reçoit le focus : il ne retombe pas sur la page", async () => {
        await reponses({ succes: c.succes });
        await page.getByRole("button", { name: c.ouvrir, exact: true }).click();
        await zone(c.banc).fill(MOTIF);
        await page.getByRole("button", { name: c.confirmer, exact: true }).click();
        const statut = section(c.banc).getByRole("status");
        await statut.waitFor({ timeout: 5000 });
        expect(await statut.textContent()).toContain(c.succes);
        await page.waitForFunction((banc) => document.querySelector(`[data-banc="${banc}"]`)?.contains(document.activeElement) ?? false, c.banc, { timeout: 2000 }).catch(() => undefined);
        const f = await focus(c.banc);
        expect(f.dansLaSection).toBe(true);
        expect(f.texte).toContain(c.succes);
      });
    });
  }
});
