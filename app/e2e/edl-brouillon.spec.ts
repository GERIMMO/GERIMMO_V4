import { expect, test } from "@playwright/test";
import path from "node:path";

// Cœur du module 19 (mobile) : la grille d'EDL garde la saisie sur l'appareil
// (RM-19.1.1), l'affiche via l'indicateur permanent (RM-19.1.6), survit à un
// rechargement, prévient avant fermeture (RM-19.1.7) et repart seule au
// retour du réseau (RM-19.1.2). Données : l'EDL d'entrée du bail E2E
// (seed-parcours), en brouillon, grille générée.
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

async function ouvrirGrille(page: import("@playwright/test").Page) {
  await page.goto("/espaces");
  await page.locator('a[href*="/agence/"]').first().click();
  await page.waitForURL(/\/agence\/([0-9a-f-]+)/);
  const orgId = page.url().match(/agence\/([0-9a-f-]+)/)![1];
  // Le bail E2E est le plus récent : sa fiche liste l'EDL d'entrée
  await page.goto(`/agence/${orgId}/parc`);
  await page.getByRole("link", { name: /E2E Résidence des Tests/ }).first().click();
  await page.getByRole("link", { name: /bail/i }).first().click();
  await page.waitForURL(/\/baux\//);
  await page.getByRole("link", { name: /état des lieux|EDL/i }).first().click();
  await page.waitForURL(/\/edl\//);
  await expect(page.getByRole("status")).toBeVisible();
}

test("saisie → brouillon local → rechargement → la saisie est toujours là", async ({ page }) => {
  await ouvrirGrille(page);
  const premierSelect = page.locator('select[name^="etat_"]').first();
  await premierSelect.selectOption("bon");
  const commentaire = page.locator('input[name^="commentaire_"]').first();
  await commentaire.fill("Testé hors ligne — rayure d'angle");
  // L'indicateur permanent passe en « à synchroniser »
  await expect(page.getByRole("status")).toContainText(/à synchroniser/);
  // Le brouillon part en localStorage (débobinage 400 ms)
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator('select[name^="etat_"]').first()).toHaveValue("bon");
  await expect(page.locator('input[name^="commentaire_"]').first()).toHaveValue(
    "Testé hors ligne — rayure d'angle"
  );
  await expect(page.getByRole("status")).toContainText(/à synchroniser/);
});

test("hors ligne : l'indicateur l'annonce ; au retour du réseau la grille se synchronise seule", async ({ page, context }) => {
  await ouvrirGrille(page);
  const deuxieme = page.locator('select[name^="etat_"]').nth(1);
  await context.setOffline(true);
  await deuxieme.selectOption("usage");
  await page.waitForTimeout(700);
  // Tenter d'enregistrer hors ligne : l'app ne casse pas, elle l'annonce
  await page.getByRole("button", { name: "Enregistrer la grille" }).click();
  await expect(page.getByRole("status")).toContainText(/Hors ligne/);

  await context.setOffline(false);
  // L'événement online déclenche la synchronisation silencieuse
  await expect(page.getByRole("status")).toContainText(/Synchronisé/, { timeout: 20_000 });

  // La base a bien la valeur : un rechargement la montre sans brouillon
  await page.reload();
  await expect(page.locator('select[name^="etat_"]').nth(1)).toHaveValue("usage");
  await expect(page.getByRole("status")).toContainText(/Synchronisé/);
});
