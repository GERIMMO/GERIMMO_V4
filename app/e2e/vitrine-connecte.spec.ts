import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * Audit final du 27/10/2026 (PUB-10) : connecté, l'en-tête, le menu mobile et le pied de la vitrine proposent
 * « Mon espace » au lieu de « Se connecter » et « Créer mon compte ».
 */
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

test("une personne connectée lit « Mon espace » sur les tarifs, et y retourne", async ({ page }) => {
  await page.goto("/tarifs");
  const entete = page.locator("header.bandeau-public");
  await expect(entete.getByRole("link", { name: /Mon espace/ })).toBeVisible();
  await expect(entete.getByText("Se connecter")).toHaveCount(0);
  await expect(entete.getByText("Créer mon compte")).toHaveCount(0);
  const pied = page.locator("footer nav[aria-label='Votre espace']");
  await expect(pied.getByRole("link", { name: "Mon espace" })).toBeVisible();
  await expect(pied.getByText("Se connecter")).toHaveCount(0);
  await page.locator("summary[aria-label='Menu du site']").click();
  await expect(page.locator("nav[aria-label='Navigation mobile']").getByRole("link", { name: "Mon espace" })).toBeVisible();
  await entete.getByRole("link", { name: /Mon espace/ }).click();
  await page.waitForURL(/\/(espace|espaces|agence)(\/|$)/);
});
