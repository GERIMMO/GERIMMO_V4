import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

/**
 * LA FICHE DE DÉBOGAGE D'UN COMPTE (25/09).
 *
 * Le porteur : « je veux être le super admin, que toutes les actions soient
 * enregistrées, je veux juste pouvoir déboguer au besoin. » Depuis la fiche
 * d'une organisation, chaque compte rattaché ouvre sa fiche : état de
 * connexion, rôles avec l'entrée dans l'espace (sous l'identité de la
 * supervision, journalisée), journal d'audit et journal technique.
 */
test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("depuis une organisation, la fiche d'un compte dit son état, ses rôles et ses journaux", async ({ page }) => {
  await page.goto("/admin/clients");
  await page.getByRole("link", { name: /Agence Alpha/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/organisations\//);
  const lien = page.getByRole("link", { name: "Fiche du compte →" }).first();
  await expect(lien).toBeVisible();
  await lien.click();
  await expect(page).toHaveURL(/\/admin\/comptes\/[0-9a-f-]{36}$/);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("@");
  await expect(page.getByRole("heading", { name: "État du compte" })).toBeVisible();
  await expect(page.getByText("Dernière connexion")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rôles et espaces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Journal d’audit de ce compte" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Journal technique" })).toBeVisible();
  // L'entrée dans l'espace se fait avec l'identité de la supervision, jamais celle du compte.
  await expect(page.getByText("avec votre identité")).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);

  const entrer = page.getByRole("link", { name: /Entrer dans son espace|Ouvrir son dossier locataire/ }).first();
  await expect(entrer).toBeVisible();
  await entrer.click();
  await expect(page).toHaveURL(/\/agence\//);
});

test("la recherche de la console trouve un compte par son adresse", async ({ page }) => {
  await page.goto("/admin/brief");
  // Au téléphone (une seule barre, 25/09), la recherche vit dans le menu.
  const menu = page.getByRole("button", { name: "Menu supervision" });
  if (await menu.isVisible()) {
    // Sur la construction de production, un clic parti avant l'hydratation ne
    // bascule rien : on clique jusqu'à ce que le menu soit réellement ouvert.
    await expect(async () => {
      await menu.click();
      await expect(page.locator("#menu-supervision")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
  }
  // Deux boutons portent ce nom (barre haute masquée au téléphone, entrée du menu) : le visible.
  await page.locator("button:visible", { hasText: /Rechercher/ }).first().click();
  await page.getByLabel("Nom, ville, email ou SIRET").fill("admin.alpha");
  const resultat = page.locator("[data-resultat]").filter({ hasText: "Compte" }).first();
  await expect(resultat).toBeVisible();
  await resultat.click();
  await expect(page).toHaveURL(/\/admin\/comptes\/[0-9a-f-]{36}$/);
});
