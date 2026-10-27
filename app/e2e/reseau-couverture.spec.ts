import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

const ORG = "c14c3187-1258-4e58-8822-368c6007e3fa";
test.describe("Couverture du réseau depuis le bien", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });
  test("un bien à Lyon reste gérable, puis intérêt sans intervention ni doublon", async ({ page }) => {
    const nom = `E2E Réseau Lyon ${Date.now()}`;
    await sansSyntheseAlertes(page);
    await page.goto(`/agence/${ORG}/parc/nouveau`);
    await page.getByLabel("Nom du bien", { exact: true }).fill(nom);
    await page.getByLabel("Adresse", { exact: true }).fill("1 rue de la République");
    await page.getByLabel("Code postal").fill("69003");
    await page.getByLabel("Ville").fill("Lyon");
    await page.getByLabel(/Année de construction/).fill("1998");
    await page.getByLabel(/Parties communes/).fill("Hall et local vélos");
    await page.getByLabel(/Accès internet, téléphone, TV/).fill("Fibre et TNT");
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByLabel(/Surface.*m²/).fill("42");
    await page.getByLabel("Nombre de pièces").fill("2");
    await page.getByRole("button", { name: "Créer le lot et continuer", exact: true }).click();
    await expect(page).toHaveURL(/\/parc\/[0-9a-f-]+\/lots\/[0-9a-f-]+\?parcours=1&etape=lot$/);
    await page.getByRole("link", { name: "Retour au logement", exact: false }).click();
    await page.getByRole("link", { name: "Trouver un artisan", exact: true }).click();
    await page.getByLabel("Métier recherché", { exact: true }).selectOption("plomberie");
    await page.getByRole("button", { name: "Rechercher des artisans", exact: true }).click();
    // Audit 29/09 : la commune évidente est proposée et confirmée dès la
    // création du bien. Si le code postal reste ambigu, on la confirme ici.
    const commune = page.getByLabel("Commune exacte du bien");
    if (await commune.isVisible().catch(() => false)) {
      await commune.selectOption("69123");
      await page.getByRole("button", { name: "Confirmer la commune", exact: true }).click();
    }
    // Décision du 23/10/2026 : plus de commune « fermée » ; aucun artisan n'a déclaré Lyon 3e pour la plomberie.
    await expect(page.getByText(/^Aucun artisan du réseau n’est actuellement disponible pour ce métier et ces travaux dans cette zone\./)).toBeVisible();
    await page.getByRole("button", { name: "Signaler mon intérêt" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aucune demande d’intervention" })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Votre intérêt est enregistré pour ce bien et ce métier/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Signaler mon intérêt" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Demander un devis/ })).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBe(0);
    await page.getByLabel("Métier recherché", { exact: true }).selectOption("electricite");
    await page.getByRole("button", { name: "Rechercher des artisans", exact: true }).click();
    await expect(page.getByRole("button", { name: "Signaler mon intérêt" })).toBeVisible();
    await page.getByRole("link", { name: "Ouvrir la fiche du bien" }).click();
    await expect(page.getByRole("heading", { name: nom, exact: true })).toBeVisible();
  });
});

// Décision du 23/10/2026 (20261023180000) : chaque artisan choisit sa zone et ses métiers ; la supervision constate la
// couverture et n'ouvre ni ne rattache plus rien.
test.describe("Couverture du réseau, côté supervision", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });
  test("la couverture se lit commune par commune, sans aucune décision d’ouverture ni de rattachement", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto("/admin/couverture?departement=91&metier=electricite");
    await expect(page.getByRole("heading", { name: "Réseau d’artisans", exact: true })).toBeVisible();
    await expect(page.getByText(/Aucune ouverture n’est à décider/)).toBeVisible();
    await page.getByLabel("Rechercher une commune").fill("Massy");
    await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: "Massy", exact: true }) })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ouvrir les communes|Fermer les communes|Enregistrer le rattachement/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Massy", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Artisans qui interviennent à Massy · Électricité" })).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
  });
});
