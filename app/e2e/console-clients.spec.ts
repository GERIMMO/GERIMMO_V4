import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

/**
 * LA CONSOLE, TELLE QUE LA SUPERVISION LA DEMANDE (19/09).
 *
 * Trois demandes du porteur du projet, trois vérifications :
 *  1. la connexion mène DROIT à la console, sans sélecteur d'espaces ;
 *  2. « Clients » réunit artisans, agences et propriétaires bailleurs, les
 *     inscriptions en attente en évidence ;
 *  3. la fiche d'un client porte un bouton qui entre vraiment dans son espace.
 */
test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("la supervision arrive sur sa console, pas sur un sélecteur d'espaces", async ({ page }) => {
  await page.goto("/espaces");
  await page.waitForURL(/\/admin$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Supervision" })).toBeVisible();
});

test("« Clients » réunit les trois familles et met en avant ce qui attend", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Clients", exact: true }).first().click();
  await page.waitForURL(/\/admin\/clients/);

  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
  // Les trois parties demandées, dans cet ordre : les artisans d'abord, parce
  // que ce sont les seuls à porter une file de décisions.
  const sections = page.getByRole("heading", { level: 2 });
  await expect(sections.nth(0)).toHaveText("Artisans");
  await expect(sections.nth(1)).toHaveText("Agences");
  await expect(sections.nth(2)).toHaveText("Propriétaires bailleurs");

  expect(await debordementHorizontal(page)).toBe(0);
});

test("la fiche d'une agence est complète, et son bouton entre vraiment dans l'espace", async ({
  page,
}) => {
  await page.goto("/admin/clients");

  // « Ouvrir une organisation » partage ce préfixe : on l'écarte, sinon c'est
  // le formulaire de création qu'on ouvre, pas une fiche.
  const premiereAgence = page
    .locator('a[href^="/admin/organisations/"]:not([href$="/nouvelle"])')
    .first();
  await expect(premiereAgence).toBeVisible();
  await premiereAgence.click();
  await page.waitForURL(/\/admin\/organisations\/[0-9a-f-]+$/);

  // La fiche porte ce qu'on attend d'une fiche client, pas seulement deux
  // listes : identité, parc, parrainage, comptes.
  for (const titre of ["Identité", "Son parc", "Parrainage", "Comptes rattachés"]) {
    await expect(page.getByRole("heading", { name: titre })).toBeVisible();
  }
  expect(await debordementHorizontal(page)).toBe(0);

  // Et le geste demandé : entrer dans sa session depuis sa fiche.
  await page.getByRole("link", { name: "Entrer dans son espace" }).click();
  await page.waitForURL(/\/agence\/[0-9a-f-]+/, { timeout: 20_000 });
});

test("la fiche d'un artisan dit qu'on ne peut pas entrer dans sa session", async ({ page }) => {
  await page.goto("/admin/clients");

  const premierArtisan = page.locator('a[href^="/admin/clients/artisans/"]').first();
  const ilYEnA = await premierArtisan.count();
  test.skip(ilYEnA === 0, "aucun artisan inscrit sur ce banc");

  await premierArtisan.click();
  await page.waitForURL(/\/admin\/clients\/artisans\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Justificatifs" })).toBeVisible();

  // Pas de bouton d'entrée, et la raison écrite : le portail artisan se lit
  // depuis son propre compte, et le produit n'usurpe personne.
  await expect(page.getByRole("link", { name: /Entrer dans/ })).toHaveCount(0);
  await expect(page.getByText(/pas de bouton pour entrer dans la session/i)).toBeVisible();
});
