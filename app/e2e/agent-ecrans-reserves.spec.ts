import { expect, test } from "@playwright/test";
import path from "node:path";
import { entrerDansEspace, sansSyntheseAlertes } from "./aides";

/**
 * Audit final du 27/10/2026 (DRT-06) : un agent qui ouvre Administration, Mandats & versements ou Mon abonnement par
 * leur adresse recevait la 404 publique (« Pas encore de compte ? Découvrir Gerimmo… »), hors de la coquille de
 * l'espace. Il revient à son tableau de bord, qui lui dit que l'écran est réservé à l'administrateur.
 */
test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

test("un agent est ramené à son tableau de bord depuis les écrans de l'administrateur", async ({ page }) => {
  await sansSyntheseAlertes(page);
  const org = await entrerDansEspace(page, "agence");
  for (const ecran of ["administration", "mandats", "abonnement"]) {
    await page.goto(`/agence/${org}/${ecran}`);
    await expect(page).toHaveURL(new RegExp(`/agence/${org}\\?acces=administrateur$`));
    await expect(page.getByRole("status").filter({ hasText: "réservé à l’administrateur de l’agence" })).toBeVisible();
    await expect(page.getByText("Pas encore de compte")).toHaveCount(0);
    await expect(page.getByRole("navigation").first()).toBeVisible();
  }
});
