import { test, expect } from "@playwright/test";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });
test("annuaire lisible, filtres cumulés et ouverture du bon compte", async ({ page }, info) => {
  await sansSyntheseAlertes(page);
  await page.goto("/admin/clients");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("list", { name: "Personnes trouvées" })).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`utilisateurs-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("searchbox", { name: "Nom, e-mail ou espace" }).fill("admin.alpha");
  await page.getByRole("combobox", { name: "Rôle", exact: true }).selectOption("admin_agence");
  await page.getByRole("combobox", { name: "Compte", exact: true }).selectOption("compte");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page).toHaveURL(/q=admin.alpha&role=admin_agence&acces=compte/);
  const comptes = page.getByRole("list", { name: "Personnes trouvées" }).getByRole("link");
  await expect(comptes).toHaveCount(1);
  await expect(comptes).toContainText("admin.alpha@example.com");
  await expect(comptes).toContainText("Compte créé");
  await expect(comptes).toHaveAttribute("href", /^\/admin\/comptes\/[0-9a-f-]{36}$/);
  const cible = await comptes.getAttribute("href");
  await comptes.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${cible}$`));
  await page.goto("/admin/clients?q=aucune-personne-exemple-introuvable&acces=sans");
  await expect(page.getByRole("heading", { name: "Aucun utilisateur trouvé" })).toBeVisible();
  await page.getByRole("link", { name: "Effacer les filtres", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clients$/);
  await expect(page.getByRole("list", { name: "Personnes trouvées" }).getByRole("link").first()).toBeVisible();
});
