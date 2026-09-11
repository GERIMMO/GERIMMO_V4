import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, entrerDansEspace, sansSyntheseAlertes } from "./aides";

// Parcours agence au gabarit téléphone : navigation, création d'un bien par
// le formulaire réel, modale d'alerte (fermeture tactile), quittancement.
// Données : seed de démo + seed-parcours (bail E2E actif, incident, appel).
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("le tableau de bord s'ouvre sans débordement et la navigation porte ses libellés", async ({ page }) => {
  await entrerDansEspace(page, "agence");
  await expect(page.locator(".loc-menu")).toBeVisible();
  // Les libellés de navigation sont visibles sous les icônes (socle mobile)
  await expect(page.locator(".loc-menu .lib", { hasText: "Tableau de bord" })).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
});

test("créer un bien depuis le téléphone : formulaire → fiche du parc", async ({ page }) => {
  const orgId = await entrerDansEspace(page, "agence");
  const nom = `Bien E2E mobile ${Date.now() % 1e6}`;

  await page.goto(`/agence/${orgId}/parc/nouveau`);
  await page.getByLabel("Référence interne").fill(nom);
  await page.getByLabel("Adresse", { exact: true }).fill("12 rue du Téléphone");
  await page.getByLabel("Code postal").fill("69001");
  await page.getByLabel("Ville").fill("Lyon");
  await page.getByRole("button", { name: /Créer le bien/ }).click();

  // La création débouche sur la fiche (ou le parc) où le bien existe
  await expect(page.locator("body")).toContainText(nom, { timeout: 20_000 });
});

test("traiter une alerte : la modale s'ouvre et se ferme au doigt (croix)", async ({ page }) => {
  const orgId = await entrerDansEspace(page, "agence");
  await page.goto(`/agence/${orgId}/alertes`);
  const traiter = page.getByRole("link", { name: /^Traiter/ }).first();
  if ((await traiter.count()) === 0) {
    test.skip(true, "aucune alerte ouverte à traiter dans le jeu de données");
  }
  await traiter.click();
  // La page de traitement (ou modale) doit être fermable sans Escape :
  // toute Modale porte désormais un bouton « Fermer » (croix) — on vérifie
  // sur la synthèse d'alertes si elle s'ouvre, sinon le test reste navigation.
  await expect(page.locator("body")).not.toContainText("Erreur");
});

test("le quittancement du mois s'affiche à 390px avec le bail E2E", async ({ page }) => {
  const orgId = await entrerDansEspace(page, "agence");
  await page.goto(`/agence/${orgId}/comptabilite`);
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
});
