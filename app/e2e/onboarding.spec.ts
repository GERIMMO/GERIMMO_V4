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

test.describe("reprendre un parc", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  test("le gabarit se télécharge et se relit", async ({ request }) => {
    // Le gabarit et le lecteur vivent dans le même fichier ; cette requête
    // vérifie qu'il sort bien de l'application, en CSV, avec ses en-têtes.
    const r = await request.get("/agence/" + (await orgIdDeLaSession(request)) + "/parc/import/modele");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/csv");
    const texte = await r.text();
    expect(texte).toContain("Nom du bien");
    expect(texte).toContain("Résidence des Tilleuls");
  });

  test("le contrôle lit le fichier déposé et rend le verdict ligne par ligne", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto("/espaces");
    await page.waitForURL(/\/agence\//);
    const orgId = page.url().match(/\/agence\/([0-9a-f-]+)/)![1];

    await page.goto(`/agence/${orgId}/parc/import`);
    await page.waitForSelector("h1");
    await expect(page.getByRole("link", { name: "Télécharger le gabarit" })).toBeVisible();

    // Une ligne juste, une ligne fausse : le contrôle doit trancher les deux.
    const csv =
      "Nom du bien;Type;Adresse;Code postal;Ville;Nom du lot;Nom du propriétaire\n" +
      "E2E Import;appartement;3 rue du Test;75011;Paris;Z1;Durand\n" +
      "E2E Import;chalet;3 rue du Test;75011;Paris;Z2;Durand\n";
    await page.setInputFiles('input[type="file"]', {
      name: "parc.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    await page.getByRole("button", { name: "Contrôler le fichier" }).click();

    // Le verdict s'affiche, ligne par ligne, sans rien écrire.
    await expect(page.getByRole("cell", { name: "prête" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "à corriger" })).toBeVisible();
    await expect(page.getByText(/Type de bien inconnu/)).toBeVisible();
    // Et l'import ne devient possible qu'après ce contrôle.
    await expect(page.getByRole("button", { name: /^Importer/ })).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
  });
});

/** L'organisation de la session courante, lue comme l'application le fait. */
async function orgIdDeLaSession(request: import("@playwright/test").APIRequestContext) {
  const r = await request.get("/espaces");
  const m = r.url().match(/\/agence\/([0-9a-f-]+)/);
  if (m) return m[1];
  const corps = await r.text();
  return corps.match(/\/agence\/([0-9a-f-]+)/)![1];
}
