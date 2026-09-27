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
    await page.getByLabel("Référence interne").fill(nom);
    await page.getByLabel("Adresse", { exact: true }).fill("1 rue de la République");
    await page.getByLabel("Code postal").fill("69003");
    await page.getByLabel("Ville *", { exact: true }).fill("Lyon");
    await page.getByLabel(/Année de construction/).fill("1998");
    await page.getByLabel(/Parties communes/).fill("Hall et local vélos");
    await page.getByLabel(/\(TIC\)/).fill("Fibre et TNT");
    await page.getByLabel(/Surface.*m²/).fill("42");
    await page.getByLabel("Nombre de pièces").fill("2");
    await page.getByRole("button", { name: /Créer le bien/ }).click();
    await expect(page).toHaveURL(/\/parc\/[0-9a-f-]+$/);
    await page.getByRole("link", { name: "Vérifier les artisans disponibles pour ce bien" }).click();
    await page.getByLabel("Métier recherché", { exact: true }).selectOption("plomberie");
    await page.getByRole("button", { name: "Vérifier pour ce bien" }).click();
    await expect(page.getByText("Complétez l’adresse du bien et confirmez sa commune pour vérifier la disponibilité du réseau.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Signaler mon intérêt" })).toHaveCount(0);
    await page.getByLabel("Commune exacte du bien").selectOption("69123");
    await page.getByRole("button", { name: "Confirmer la commune", exact: true }).click();
    await expect(page.getByText("Le réseau d’artisans Gerimmo n’est pas encore disponible pour ce métier dans cette zone.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Signaler mon intérêt" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aucune demande d’intervention" })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Votre intérêt est enregistré pour ce bien et ce métier/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Signaler mon intérêt" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Demander un devis/ })).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBe(0);
    await page.getByLabel("Métier recherché", { exact: true }).selectOption("electricite");
    await page.getByRole("button", { name: "Vérifier pour ce bien" }).click();
    await expect(page.getByRole("button", { name: "Signaler mon intérêt" })).toBeVisible();
    await page.getByRole("link", { name: "Ouvrir la fiche du bien" }).click();
    await expect(page.getByRole("heading", { name: nom, exact: true })).toBeVisible();
  });
});

test.describe("Administration des ouvertures", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });
  test("une sélection groupée ne vaut pas activation, et une zone sans artisan refuse l’ouverture", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto("/admin/couverture?departement=91&metier=electricite");
    await expect(page.getByRole("heading", { name: "Réseau d’artisans", exact: true })).toBeVisible();
    await page.getByLabel("Rechercher une commune").fill("Massy");
    await page.getByRole("checkbox", { name: "Sélectionner Massy", exact: true }).check();
    const ouvrir = page.getByRole("button", { name: "Ouvrir les communes sélectionnées" });
    await expect(ouvrir).toBeDisabled();
    await page.getByRole("checkbox", { name: /Je valide l’ouverture commerciale/ }).check();
    await ouvrir.click();
    await expect(page.getByRole("alert").filter({ hasText: "aucun artisan validé" })).toBeVisible();
    await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: "Massy", exact: true }) })).toContainText("Fermée par défaut");
    await page.getByRole("button", { name: "Tout désélectionner" }).click();
    await expect(ouvrir).toBeDisabled();
    await page.getByRole("button", { name: "Sélectionner toutes les communes affichées (1)" }).click();
    await expect(ouvrir).toBeDisabled();
    await page.getByRole("link", { name: "Massy", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Artisans rattachés à Massy" })).toBeVisible();
    await expect(page.getByText("Aucun artisan rattaché pour ce métier. L’ouverture n’est pas possible.")).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
  });
});
