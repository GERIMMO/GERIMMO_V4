import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, entrerDansEspace, sansSyntheseAlertes } from "./aides";

async function capturer(page: Page, ecran: string, dossier: string) {
  for (const largeur of [390, 768, 1440]) {
    await page.setViewportSize({ width: largeur, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: path.join(dossier, `${ecran}-${largeur}.jpg`), fullPage: true, scale: "css", quality: 78 });
  }
}

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test.describe("Direction", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

  test("les quatre repères d’un traitement conduisent au contrôle dans Santé", async ({ page }, info) => {
    await page.goto("/admin/brief");
    await page.getByText("Suivi des traitements", { exact: true }).click();
    const ligne = page.getByRole("link", { name: /contrôler.*quittance/i });
    const traitement = ligne.locator("..");
    for (const repere of ["Dernier passage", "Dernier succès", "Preuve de livraison", "Échéance suivante"]) {
      await expect(traitement.getByText(repere, { exact: true })).toBeVisible();
    }
    await capturer(page, "aujourdhui", info.outputPath("."));
    await ligne.click();
    await expect(page).toHaveURL(/\/admin\/sante#tache-quittances$/);
    await expect(page.locator("#tache-quittances").getByRole("link", { name: "Vérifier le suivi des courriels" })).toBeVisible();
    await capturer(page, "sante", info.outputPath("."));
  });

  test("les priorités commerciales tiennent sous 2 500 px à 390 px", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/territoire");
    for (const titre of ["Demandes à rappeler", "Échéance la plus proche", "Suivi"]) {
      await expect(page.getByRole("heading", { name: titre, exact: true })).toBeVisible();
    }
    const sommaire = page.getByText("Études territoriales", { exact: true });
    await expect(sommaire.locator("..")).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(2500);
    expect(await debordementHorizontal(page)).toBe(0);
    await capturer(page, "developpement-commercial", info.outputPath("."));
    await sommaire.click();
    await expect(page.getByRole("heading", { name: "Départements à comparer" })).toBeVisible();
    await page.getByRole("link", { name: "Voir les prospects" }).click();
    await expect(page.getByRole("heading", { name: "Prospects et prochaines actions" })).toBeVisible();
  });
});

test.describe("Agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  test("les quittances et les relances sont présentées à côté de leurs gestes", async ({ page }, info) => {
    await entrerDansEspace(page, "agence");
    const canaux = page.getByRole("region", { name: "Canaux d’envoi des loyers" });
    await expect(canaux.getByRole("heading", { name: "Quittances" })).toBeVisible();
    await expect(canaux.getByRole("heading", { name: "Relances d’impayé" })).toBeVisible();
    await expect(page.getByText(/Vos relances de loyer se préparent en PDF/)).toHaveCount(0);
    await capturer(page, "accueil-agence", info.outputPath("."));
    await canaux.getByRole("link", { name: "Régler l’envoi des quittances" }).click();
    await expect(page).toHaveURL(/\/profil#quittances$/);
    await expect(page.locator("#pr-envoi-auto")).toBeVisible();
  });
});
