import { expect, test } from "@playwright/test";
import { debordementHorizontal } from "./aides";

test.use({ storageState: { cookies: [], origins: [] } });

test("le visiteur compare les formules et le vrai total annuel sans souscrire", async ({ page }) => {
  await page.goto("/#tarifs");
  const calculateur = page.getByRole("region", { name: "Estimer mon abonnement" });
  await expect(calculateur).toBeVisible();
  await calculateur.getByRole("spinbutton", { name: "Biens activement gérés" }).fill("25");
  await expect(calculateur.getByText(/34,99.*TTC \/ mois/)).toBeVisible();
  await calculateur.getByRole("combobox", { name: "Paiement", exact: true }).selectOption("annuel");
  await expect(calculateur.getByText(/349,90.*TTC prélevés par an/)).toBeVisible();
  await calculateur.getByRole("spinbutton").fill("3");
  await expect(calculateur.getByText(/Bailleur · formule la moins chère/)).toBeVisible();
  await expect(calculateur.getByText(/99,90.*TTC prélevés par an/)).toBeVisible();
  await calculateur.getByRole("combobox", { name: "Je gère", exact: true }).selectOption("agence");
  await calculateur.getByRole("spinbutton", { name: "Lots sous mandat actif" }).fill("300");
  await expect(calculateur.getByText(/444,00.*HT \/ mois/)).toBeVisible();
  await expect(calculateur.getByRole("combobox", { name: "Paiement", exact: true })).toHaveCount(0);
  await expect(calculateur).toContainText("Taxes et total à payer à confirmer");
  await calculateur.getByRole("spinbutton").fill("0");
  await expect(calculateur.getByText(/39,00.*HT \/ mois/)).toBeVisible();
  await expect(calculateur).toContainText("Cette estimation ne souscrit aucune offre");
  expect(await debordementHorizontal(page)).toBe(0);
});

test("l’inscription conserve la recommandation sans promettre une promotion automatique", async ({ page }) => {
  await page.goto("/inscription?parrain=ABCD1234");
  await expect(page.getByLabel("Code de parrainage (facultatif)")).toHaveValue("ABCD1234");
  await expect(page.locator("main")).toContainText("aucune remise ni prolongation supplémentaire n’est appliquée automatiquement");
  await expect(page.locator("main")).toContainText("14 jours sans carte");
  await expect(page.getByRole("link", { name: "Voir les tarifs" })).toHaveAttribute("href", "/#tarifs");
  expect(await debordementHorizontal(page)).toBe(0);
});
