import { expect, test } from "@playwright/test";
import path from "node:path";
import { entrerDansEspace, sansSyntheseAlertes } from "./aides";

// UN CHEMIN QU'ON PROPOSE DOIT MENER QUELQUE PART.
//
// Relevé au balayage des boutons du 12/09 : « Reprendre un parc » s'affichait
// pour TOUT LE MONDE sur l'écran du parc, alors que la page d'import refuse
// l'agent (`notFound`) — un import engage tout le parc, il appartient au
// responsable. Un agent voyait donc le lien, cliquait, et tombait sur « page
// introuvable ». La règle était juste ; c'est le lien qui mentait.
//
// Ce test tient les deux bouts ENSEMBLE : la garde de la page et l'affichage
// du lien. Les séparer, c'est laisser l'un dériver de l'autre.

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test.describe("Côté agent", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

  test("« Reprendre un parc » ne lui est pas proposé — la page le refuserait", async ({ page }) => {
    const orgId = await entrerDansEspace(page, "agence");
    await page.goto(`/agence/${orgId}/parc`);
    await expect(page.getByRole("link", { name: /Reprendre/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Reprenez-le depuis un tableur/ })).toHaveCount(0);
  });

  test("et la page d'import reste fermée s'il y va à la main", async ({ page }) => {
    const orgId = await entrerDansEspace(page, "agence");
    await page.goto(`/agence/${orgId}/parc/import`);
    // La garde du serveur est la vraie : masquer le lien ne protège rien.
    await expect(page.locator("body")).not.toContainText("Reprendre mon parc");
  });
});

test.describe("Côté admin d'agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  test("le responsable, lui, garde le lien ET la page", async ({ page }) => {
    const orgId = await entrerDansEspace(page, "agence");
    await page.goto(`/agence/${orgId}/parc`);
    const lien = page.getByRole("link", { name: /Reprendre un parc/ });
    await expect(lien).toBeVisible();

    await lien.click();
    await expect(page).toHaveURL(/\/parc\/import$/);
    await expect(page.getByRole("heading", { name: "Reprendre mon parc" })).toBeVisible();
  });
});
