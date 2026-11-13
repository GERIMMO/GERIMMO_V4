import { test, expect } from "@playwright/test";
import { debordementHorizontal } from "./aides";

test.use({ storageState: { cookies: [], origins: [] } });

for (const chemin of ["/", "/tarifs"]) {
  test(`vitrine ${chemin} : les tarifs changent sans ambiguïté entre mois et année`, async ({ page }) => {
    await page.goto(chemin);
    const simulateur = page.getByRole("region", { name: "Simuler mon abonnement" });
    const prix = simulateur.locator(".offre-prix");
    const biens = simulateur.getByRole("slider");
    await expect(prix).toHaveText(/5,99\s*€ par mois/);
    await biens.press("Home");
    for (let n = 1; n < 8; n++) await biens.press("ArrowRight");
    await expect(prix).toHaveText(/19,90\s*€ par mois/);
    await simulateur.getByRole("button", { name: "Annuel" }).click();
    await expect(simulateur.getByRole("button", { name: "Annuel" })).toHaveAttribute("aria-pressed", "true");
    await expect(prix).toHaveText(/199,00\s*€ en une fois par an/);
    await biens.press("End");
    await expect(prix).toHaveText(/991,00\s*€ en une fois par an/);
    await simulateur.getByRole("button", { name: "Mensuel" }).click();
    await expect(prix).toHaveText(/99,10\s*€ par mois/);
    await expect(simulateur.getByRole("link", { name: "Commencer mon essai gratuit" })).toHaveAttribute("href", "/inscription");
    expect(await debordementHorizontal(page)).toBe(0);
  });
}

test("vitrine mobile : navigation, fermeture du menu et questions fréquentes", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator(".public-menu-mobile");
  await menu.locator("summary").click();
  await expect(menu.getByRole("link", { name: "Outils gratuits" })).toBeVisible();
  await menu.getByRole("link", { name: "La solution" }).click();
  await expect(page).toHaveURL(/#fonctionnalites$/);
  await expect(menu).not.toHaveAttribute("open");
  await menu.locator("summary").click();
  await menu.locator("summary").press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  const question = page.locator(".public-faq details").filter({ hasText: "Gerimmo lit-il mes comptes bancaires ?" });
  await question.locator("summary").click();
  await expect(question.locator("p")).toBeVisible();
  await menu.locator("summary").click();
  await menu.getByRole("link", { name: "Tarifs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "L’abonnement Gerimmo pour votre espace propriétaire.", exact: true })).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
});
