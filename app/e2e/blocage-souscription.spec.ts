import { test, expect } from "@playwright/test";
import { sansSyntheseAlertes } from "./aides";

test.use({ storageState: "e2e/.auth/superadmin.json" });
test.beforeEach(async ({ page }) => {
  // La synthèse d’arrivée a son propre parcours ; ici, on teste les paramètres derrière.
  await sansSyntheseAlertes(page);
});

test("le superadmin lève puis réactive le blocage, avec persistance et historique", async ({ page }) => {
  await page.goto("/admin/parametres");
  const regle = page.getByRole("region", { name: "Blocage des abonnements" });
  await expect(regle).toBeVisible();
  // Tolère la décision laissée par un essai précédent ; termine toujours avec la règle active.
  if (await regle.getByRole("button", { name: "Réactiver le blocage", exact: true }).count()) {
    await regle.getByRole("button", { name: "Réactiver le blocage", exact: true }).click();
  }
  await expect(regle.getByText("Règle active", { exact: true })).toBeVisible();
  try {
    await regle.getByRole("button", { name: "Lever le blocage", exact: true }).click();
    await expect(regle.getByRole("status")).toContainText("Blocage levé");
    await expect(regle.getByText("Règle levée", { exact: true })).toBeVisible();
    await page.reload();
    await expect(regle.getByRole("button", { name: "Réactiver le blocage", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "e2e/.results/blocage-leve-mobile.png", animations: "disabled" });
    await regle.getByRole("link", { name: "Historique des changements" }).click();
    await expect(page.getByText("Blocage des abonnements pour identité incomplète : levé.", { exact: true }).first()).toBeVisible();
  } finally {
    await page.goto("/admin/parametres");
    await expect(regle).toBeVisible();
    const reactiver = regle.getByRole("button", { name: "Réactiver le blocage", exact: true });
    if (await reactiver.count()) await reactiver.click();
    await expect(regle.getByText("Règle active", { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(regle.getByRole("button", { name: "Lever le blocage", exact: true })).toBeVisible();
});
