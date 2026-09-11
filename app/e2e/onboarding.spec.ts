import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// L'arrivée d'un client, des deux côtés du guichet : le super admin qui ouvre
// l'organisation, et le gérant qui découvre son espace vide et doit savoir par
// où commencer.

test.describe("côté console", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

  test("« Ouvrir une organisation » s'atteint depuis la supervision", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const lien = page.getByRole("link", { name: "Ouvrir une organisation" });
    await expect(lien).toBeVisible();
    await lien.click();
    await page.waitForURL(/\/admin\/organisations\/nouvelle/);
  });

  test("le formulaire porte ce qu'il faut, et tient dans 390 px", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto("/admin/organisations/nouvelle");
    await page.waitForSelector("h1");

    // Les trois décisions du geste : qui, quel type, et comment ça démarre.
    await expect(page.getByLabel("Nom de l'organisation")).toBeVisible();
    await expect(page.getByLabel("Adresse du premier responsable")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Agence de gestion/ })).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Propriétaire en gestion directe/ })
    ).toBeVisible();

    // L'essai est le cas courant : sa durée est visible d'emblée.
    await expect(page.getByLabel("Durée de l'essai, en jours")).toBeVisible();
    // Contrat signé : la durée n'a plus de sens, elle disparaît.
    await page.getByRole("checkbox", { name: /Contrat déjà signé/ }).check();
    await expect(page.getByLabel("Durée de l'essai, en jours")).toHaveCount(0);

    expect(await debordementHorizontal(page)).toBe(0);
  });
});

test.describe("côté client", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  test("le chemin du démarrage s'affiche tant qu'une étape manque", async ({ page }) => {
    // L'agence de démonstration n'a pas d'adresse : l'étape « identité » reste
    // à faire, donc le bloc doit être là, avec le geste suivant et lui seul.
    await sansSyntheseAlertes(page);
    await page.goto("/espaces");
    await page.waitForURL(/\/agence\//);
    await page.waitForLoadState("networkidle");

    const bloc = page.getByRole("region", { name: /Mettre votre premier lot en location/ });
    await expect(bloc).toBeVisible();
    await expect(bloc.getByText("Votre identité")).toBeVisible();
    // Un seul bouton d'action : l'étape suivante, pas les cinq.
    await expect(bloc.getByRole("link")).toHaveCount(1);
    await expect(bloc.getByRole("link", { name: "Compléter le profil" })).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
  });
});
