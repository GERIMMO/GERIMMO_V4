import { test, expect } from "@playwright/test";
import { sansSyntheseAlertes } from "./aides";

test.use({ storageState: "e2e/.auth/superadmin.json" });
test.beforeEach(async ({ page }) => {
  // La synthèse d’arrivée a son propre parcours ; ici, on teste les réglages derrière.
  await sansSyntheseAlertes(page);
});

test("le superadmin consulte les limites et simule la conservation sans supprimer", async ({ page }) => {
  await page.goto("/admin/sante#budget-signatures");
  await page.getByText("Documents disponibles et limites", { exact: true }).click();
  await expect(page.getByText("Connexion Zoho à configurer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Les mandats d’agence et les personnes morales/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/admin/donnees#conservation-contacts");
  // Depuis le 24/10 (plan de conformité, lot 2) : toutes les catégories du catalogue, une ligne chacune.
  const bilan = page.getByRole("region", { name: "Durées de conservation et nettoyages" });
  await bilan.getByRole("button", { name: "Afficher le bilan sans supprimer" }).click();
  await expect(bilan.getByRole("status")).toContainText("Aucune suppression.");
  await expect(bilan.getByRole("status")).toContainText("Nettoyage désactivé");
  await expect(bilan.getByRole("listitem").filter({ hasText: "Preuves de signature électronique" })).toHaveCount(1);
  expect(await bilan.getByRole("listitem").count()).toBeGreaterThan(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await bilan.screenshot({ path: "e2e/.results/conservation-bilan-mobile.png", animations: "disabled" });
});
