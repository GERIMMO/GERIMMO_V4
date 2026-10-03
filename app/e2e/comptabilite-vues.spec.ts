import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, entrerDansEspace, sansSyntheseAlertes } from "./aides";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test("comptabilité mobile : journal, saisie, clôture, rapports et retour", async ({ page }) => {
  await sansSyntheseAlertes(page);
  const orgId = await entrerDansEspace(page, "agence");
  await page.goto(`/agence/${orgId}/comptabilite`);
  const navigation = page.getByRole("navigation", { name: "Comptabilité", exact: true });
  await expect(navigation.getByRole("link", { name: "Journal", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Saisir une écriture", { exact: true })).toHaveCount(0);
  expect(await debordementHorizontal(page)).toBe(0);

  await navigation.getByRole("link", { name: "Ajouter une écriture", exact: true }).click();
  await expect(page.getByText("Saisir une écriture", { exact: true })).toBeVisible();
  await expect(page.getByText("Clôturer un mois", { exact: true })).toHaveCount(0);
  expect(await debordementHorizontal(page)).toBe(0);

  await navigation.getByRole("link", { name: "Clôture", exact: true }).click();
  await expect(page.getByText("Clôturer un mois", { exact: true })).toBeVisible();
  await expect(page.getByText(/Fige les écritures.*irréversible/)).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);

  await navigation.getByRole("link", { name: "Rapports", exact: true }).click();
  await expect(page.getByText("Rapports de gestion", { exact: true })).toBeVisible();
  await expect(page.getByText("Saisir une écriture", { exact: true })).toHaveCount(0);
  expect(await debordementHorizontal(page)).toBe(0);

  await page.goBack();
  await expect(page.getByText("Clôturer un mois", { exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Journal", exact: true }).click();
  await expect(navigation.getByRole("link", { name: "Journal", exact: true })).toHaveAttribute("aria-current", "page");
});
