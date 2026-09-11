import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal } from "./aides";

// Parcours artisan au téléphone. C'est le persona qui travaille DEBOUT, dans
// une cage d'escalier, avec une main : ses écrans se jugent à 390 px et au
// nombre de gestes, pas à ce qu'ils contiennent.
//
// Le jeu de données vient de e2e/local/seed-parcours.mjs, qui rejoue la chaîne
// réelle jusqu'aux créneaux proposés : mission acceptée, trois dates en
// attente du locataire.
test.use({ storageState: path.join(__dirname, ".auth", "artisan.json") });

const PAGES = [
  ["/artisan", "Aujourd'hui"],
  ["/artisan/agenda", "agenda"],
  ["/artisan/devis", "devis"],
  ["/artisan/attestations", "attestations"],
  ["/artisan/entreprise", "entreprise"],
  ["/artisan/note", "note"],
  ["/artisan/facturation", "facturation"],
] as const;

test("le portail s'ouvre sans organisation dans l'adresse", async ({ page }) => {
  // Ce n'est pas une commodité d'URL : aucune RPC du portail n'accepte
  // d'organisation en paramètre, donc on ne peut pas demander les données
  // d'une agence où l'on n'a rien à faire.
  await page.goto("/espaces");
  await page.waitForLoadState("networkidle");
  const url = page.url();
  expect(url).toMatch(/\/artisan(\/|$)|\/espaces$/);
  if (url.endsWith("/espaces")) {
    await page.getByRole("link", { name: /artisan/i }).first().click();
    await page.waitForURL(/\/artisan/);
  }
  expect(page.url()).not.toMatch(/\/agence\//);
});

for (const [chemin, attendu] of PAGES) {
  test(`${chemin} s'affiche, tient dans 390 px et ne tombe pas`, async ({ page }) => {
    const reponse = await page.goto(chemin);
    await page.waitForLoadState("networkidle");
    expect(reponse?.status()).toBeLessThan(400);

    // Un titre : sans lui, l'écran n'a pas de nom pour un lecteur d'écran.
    await page.waitForSelector("h1", { timeout: 15_000 });
    const h1 = await page.locator("h1").count();
    expect(h1).toBeGreaterThanOrEqual(1);

    // Ni la page de panne, ni un renvoi vers l'inscription : la fiche existe.
    expect(page.url()).not.toContain("/artisan/panne");
    expect(page.url()).not.toContain("/artisan/inscription");
    await expect(page.locator("body")).not.toContainText("Application error");

    // Le contenu parle bien de l'écran demandé.
    await expect(page.locator("body")).toContainText(new RegExp(attendu, "i"));

    // Rien ne déborde : on ne fait pas défiler un téléphone latéralement.
    expect(await debordementHorizontal(page)).toBe(0);
  });
}

test("l'agenda montre la mission acceptée, avec l'adresse du chantier", async ({ page }) => {
  await page.goto("/artisan/agenda");
  await page.waitForLoadState("networkidle");
  // La mission du seed porte sur « E2E Résidence des Tests », 75012 Paris.
  await expect(page.locator("body")).toContainText(/75012|Paris/);
  // Le numéro d'incident identifie le dossier sans ouvrir la fiche.
  await expect(page.locator("body")).toContainText(/INC-\d{4}-\d{4}/);
});

test("chaque cible tactile de l'accueil fait au moins 44 px", async ({ page }) => {
  // On travaille avec une main, parfois gantée : une cible sous 44 px se rate.
  await page.goto("/artisan");
  await page.waitForLoadState("networkidle");
  const trop = await page.evaluate(() => {
    const cibles = Array.from(
      document.querySelectorAll("a[href], button:not([disabled]), input[type=checkbox]")
    );
    return cibles
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false; // hors écran
        return r.height < 44;
      })
      .map((e) => `${e.tagName.toLowerCase()} « ${(e.textContent ?? "").trim().slice(0, 40)} »`);
  });
  expect(trop).toEqual([]);
});
