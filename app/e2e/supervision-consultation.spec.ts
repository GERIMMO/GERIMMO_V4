import { expect, test } from "@playwright/test";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
for (const persona of ["superadmin", "proprietaire"]) {
  test.describe(`consultation ${persona}`, () => {
    test.use({ storageState: path.join(__dirname, ".auth", `${persona}.json`) });
    test("les commandes proposées correspondent au rôle connecté", async ({ page }) => {
      if (persona === "proprietaire") await sansSyntheseAlertes(page);
      const supervision = persona === "superadmin";
      await page.goto(`/espace/${ORG}/alertes?traiter=00000000-0000-4000-8000-000000000000`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(supervision ? "Alertes du client" : "À faire");
      const creation = page.locator("#creer-alerte");
      if (supervision) {
        await expect(creation).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^(Traiter|Confier|Créer l’alerte)/ })).toHaveCount(0);
        await expect(page.getByRole("dialog")).toHaveCount(0);
      } else await expect(creation).toBeVisible();
      await page.goto(`/espace/${ORG}/artisans`);
      if (supervision) {
        await expect(page.locator("#nouvel-artisan")).toHaveCount(0);
        await expect(page.getByRole("link", { name: /Enregistrer un artisan/ })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Inviter un artisan", exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByRole("heading", { name: "Mon carnet d’artisans", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Inviter un artisan", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: /Enregistrer un artisan/ })).toHaveCount(0);
      }
      // Lecture uniquement : aucun envoi d’alerte, d’invitation ni changement du carnet.
    });
  });
}
