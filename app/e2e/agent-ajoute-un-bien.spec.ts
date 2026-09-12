import { expect, test } from "@playwright/test";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

// L'AGENT TROUVE OÙ AJOUTER UN BIEN (constat de l'humain, 12/09).
//
// « Je me suis connecté en tant qu'agent, je ne trouve pas où ajouter un lot ou
// un bien. » Il n'y avait nulle part : le bouton était masqué parce que la base
// refusait la création — un bien tout neuf n'étant sous aucun mandat, la
// RELECTURE qui suit l'insertion échouait.
//
// Ce test regarde ce que l'humain regardait : l'écran, et le bouton dessus.

test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

const ORG = "c14c3187-1258-4e58-8822-368c6007e3fa";

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("l'agent voit « Ajouter un bien » sur son portefeuille", async ({ page }) => {
  await page.goto(`/agence/${ORG}/parc`);
  await expect(page.getByRole("heading", { name: "Mon portefeuille" })).toBeVisible();
  const ajouter = page.getByRole("link", { name: /Ajouter un bien/ });
  await expect(ajouter).toBeVisible();
  await ajouter.click();
  await expect(page).toHaveURL(new RegExp(`/agence/${ORG}/parc/nouveau`));
});

test("le formulaire lui répond — et le bien qu'il crée reste visible", async ({ page }) => {
  const nom = `Bien agent ${Date.now()}`;
  await page.goto(`/agence/${ORG}/parc/nouveau`);
  await page.getByLabel("Référence interne").fill(nom);
  await page.getByLabel("Adresse", { exact: true }).fill("9 rue de l’Essai");
  await page.getByLabel("Code postal").fill("75011");
  await page.getByLabel("Ville").fill("Paris");
  await page.getByRole("button", { name: /Créer le bien/ }).click();

  // LA MOITIÉ QUI ÉCHOUAIT : relire ce qu'on vient d'écrire. Avant le 12/09,
  // l'agent recevait « new row violates row-level security policy ».
  await expect(page.locator("body")).toContainText(nom, { timeout: 20_000 });
  await page.goto(`/agence/${ORG}/parc`);
  await expect(page.locator("body")).toContainText(nom);
});
