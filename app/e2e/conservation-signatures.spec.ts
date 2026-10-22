import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/superadmin.json" });

test("le superadmin consulte les limites et simule la conservation sans supprimer", async ({ page }) => {
  await page.goto("/admin/sante");
  await page.getByText("Documents disponibles et limites", { exact: true }).click();
  await expect(page.getByText("Connexion Zoho à configurer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Les mandats d’agence et les personnes morales/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/admin/donnees");
  const bilan = page.getByRole("region", { name: "Invitations et contacts anciens" });
  await bilan.getByRole("button", { name: "Afficher le bilan sans supprimer" }).click();
  await expect(bilan.getByRole("status")).toContainText("Aucune suppression.");
  await expect(bilan.getByRole("status")).toContainText("Nettoyage désactivé");
  await expect(bilan.getByRole("listitem")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await bilan.screenshot({ path: "e2e/.results/conservation-bilan-mobile.png", animations: "disabled" });
});
