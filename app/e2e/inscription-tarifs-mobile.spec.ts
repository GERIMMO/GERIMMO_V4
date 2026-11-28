import { expect, test } from "@playwright/test";
import { euros, montantAbonnementUnique } from "../src/lib/tarifs";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

for (const chemin of ["/", "/tarifs"]) {
  test(`le premier écran de ${chemin} invite à s’inscrire`, async ({ page }) => {
    await page.goto(chemin);
    const inscription = page.locator('main header a[href="/inscription"]');
    await expect(inscription).toHaveAttribute("href", "/inscription");
    await expect(inscription).toBeInViewport({ ratio: 1 });
  });
}

test("le bouton d’inscription est entièrement visible sans défilement", async ({ page }) => {
  await page.goto("/inscription");
  await expect(page.getByRole("button", { name: "Ouvrir mon espace", exact: true }))
    .toBeInViewport({ ratio: 1 });
});

test("les exemples de premier prélèvement affichent le tarif du code", async ({ page }) => {
  await page.goto("/tarifs");
  await expect(page.locator("main")).toContainText("28 janvier 2027");
  const exemples = page.getByRole("table", { name: "Exemples de premier prélèvement" });
  for (const biens of [1, 2, 8]) {
    const ligne = exemples.getByRole("row").filter({ has: page.getByRole("rowheader", { name: String(biens), exact: true }) });
    await expect(ligne).toContainText(euros(montantAbonnementUnique(biens, "mensuel")));
    await expect(ligne).toContainText(euros(montantAbonnementUnique(biens, "annuel")));
  }
});

test("la saisie exacte affiche six quantités aux deux tarifs du code", async ({ page }) => {
  await page.goto("/tarifs");
  const simulateur = page.getByRole("region", { name: "Simuler mon abonnement" });
  const nombre = simulateur.getByRole("spinbutton", { name: "Nombre exact de biens" });
  const prix = simulateur.locator(".offre-prix");
  for (const biens of [1, 2, 7, 8, 20, 21]) {
    await nombre.fill(String(biens));
    await expect(simulateur.getByRole("slider")).toHaveValue(String(biens));
    for (const periode of ["mensuel", "annuel"] as const) {
      await simulateur.getByRole("button", { name: periode }).click();
      await expect(prix).toContainText(euros(montantAbonnementUnique(biens, periode)));
    }
  }
  await expect(page.locator("main")).not.toContainText(/\b(Solo|Investisseur|Patrimoine)\b|offre de lancement/i);
});
