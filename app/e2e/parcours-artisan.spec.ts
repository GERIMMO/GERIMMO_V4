import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal } from "./aides";

// Parcours artisan au téléphone. C'est le persona qui travaille DEBOUT, dans
// une cage d'escalier, avec une main : ses écrans se jugent à 390 px et au
// nombre de gestes, pas à ce qu'ils contiennent.
//
// Le jeu de données vient de e2e/local/seed-parcours.mjs, qui rejoue la chaîne
// réelle jusqu'aux créneaux proposés : mission acceptée, trois dates en
// attente du locataire.
test.use({ storageState: path.join(__dirname, ".auth", "artisan.json") });

const PAGES = [
  ["/artisan", "Aujourd'hui"],
  ["/artisan/agenda", "agenda"],
  ["/artisan/devis", "devis"],
  ["/artisan/attestations", "attestations"],
  ["/artisan/entreprise", "entreprise"],
  ["/artisan/note", "note"],
  ["/artisan/facturation", "facturation"],
  ["/artisan/clients", "clients externes"],
] as const;

test("le portail s'ouvre sans organisation dans l'adresse", async ({ page }) => {
  // Ce n'est pas une commodité d'URL : aucune RPC du portail n'accepte
  // d'organisation en paramètre, donc on ne peut pas demander les données
  // d'une agence où l'on n'a rien à faire.
  await page.goto("/espaces");
  await page.waitForLoadState("networkidle");
  const url = page.url();
  expect(url).toMatch(/\/artisan(\/|$)|\/espaces$/);
  if (url.endsWith("/espaces")) {
    await page.getByRole("link", { name: /artisan/i }).first().click();
    await page.waitForURL(/\/artisan/);
  }
  expect(page.url()).not.toMatch(/\/agence\//);
});

for (const [chemin, attendu] of PAGES) {
  test(`${chemin} s'affiche, tient dans 390 px et ne tombe pas`, async ({ page }) => {
    const reponse = await page.goto(chemin);
    await page.waitForLoadState("networkidle");
    expect(reponse?.status()).toBeLessThan(400);

    // Un titre : sans lui, l'écran n'a pas de nom pour un lecteur d'écran.
    await page.waitForSelector("h1", { timeout: 15_000 });
    const h1 = await page.locator("h1").count();
    expect(h1).toBeGreaterThanOrEqual(1);

    // Ni la page de panne, ni un renvoi vers l'inscription : la fiche existe.
    expect(page.url()).not.toContain("/artisan/panne");
    expect(page.url()).not.toContain("/artisan/inscription");
    await expect(page.locator("body")).not.toContainText("Application error");

    // Le contenu parle bien de l'écran demandé.
    await expect(page.locator("body")).toContainText(new RegExp(attendu, "i"));

    // Rien ne déborde : on ne fait pas défiler un téléphone latéralement.
    expect(await debordementHorizontal(page)).toBe(0);
  });
}

test("l'agenda montre la mission acceptée, avec l'adresse du chantier", async ({ page }) => {
  await page.goto("/artisan/agenda");
  await page.waitForLoadState("networkidle");
  // La mission du seed porte sur « E2E Résidence des Tests », 75012 Paris.
  await expect(page.locator("body")).toContainText(/75012|Paris/);
  // Le numéro d'incident identifie le dossier sans ouvrir la fiche.
  await expect(page.locator("body")).toContainText(/INC-\d{4}-\d{4}/);
});

test("chaque cible tactile de l'accueil fait au moins 44 px", async ({ page }) => {
  // On travaille avec une main, parfois gantée : une cible sous 44 px se rate.
  await page.goto("/artisan");
  await page.waitForLoadState("networkidle");
  const trop = await page.evaluate(() => {
    const cibles = Array.from(
      document.querySelectorAll("a[href], button:not([disabled]), input[type=checkbox]")
    );
    return cibles
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false; // hors écran
        return r.height < 44;
      })
      .map((e) => `${e.tagName.toLowerCase()} « ${(e.textContent ?? "").trim().slice(0, 40)} »`);
  });
  expect(trop).toEqual([]);
});

test("le registre privé se télécharge seulement au clic, depuis la facturation et les clients", async ({ page }) => {
  const demandesExport: URL[] = [];
  const telechargements: string[] = [];
  page.on("download", (fichier) => telechargements.push(fichier.url()));
  page.on("request", (requete) => {
    const url = new URL(requete.url());
    if (url.pathname === "/api/artisan-prive/export") demandesExport.push(url);
  });

  for (const chemin of ["/artisan/facturation", "/artisan/clients"]) {
    demandesExport.length = 0;
    telechargements.length = 0;
    await page.goto(chemin);
    const lien = page.getByRole("link", { name: /Exporter mon registre/ });
    await expect(lien).toBeVisible();
    await lien.hover();
    await page.waitForLoadState("networkidle");
    // Une route de téléchargement ne doit pas devenir un préchargement RSC.
    expect(demandesExport).toHaveLength(0);
    expect(telechargements).toHaveLength(0);

    const telechargementAttendu = page.waitForEvent("download");
    await lien.click();
    const telechargement = await telechargementAttendu;
    expect(telechargement.suggestedFilename()).toBe("activite-artisan-privee.json");
    const flux = await telechargement.createReadStream();
    const contenu: Buffer[] = [];
    for await (const morceau of flux) contenu.push(Buffer.from(morceau));
    const registre = JSON.parse(Buffer.concat(contenu).toString("utf8"));
    expect(registre.nature).toContain("Registre privé déclaratif");
    for (const collection of ["clients", "chantiers", "factures", "reglements", "evenements"]) {
      expect(Array.isArray(registre[collection])).toBe(true);
    }
    // Chromium remet un lien `download` à son gestionnaire natif : il n'émet
    // pas nécessairement un événement page.request pour ce transfert.
    expect(telechargements).toHaveLength(1);
    expect(new URL(telechargement.url()).pathname).toBe("/api/artisan-prive/export");
    expect(new URL(telechargement.url()).search).toBe("");
    expect(demandesExport.every((url) => url.search === "")).toBe(true);
    expect(new URL(page.url()).pathname).toBe(chemin);
  }
});

test("un client externe et son devis brouillon restent enregistrés après rechargement", async ({ page }, info) => {
  const nom = `Client fictif E2E ${Date.now().toString(36)}`;
  await page.goto("/artisan/clients");
  await page.getByLabel("Nom ou raison sociale", { exact: true }).fill(nom);
  await page.getByLabel("Adresse", { exact: true }).fill("Adresse fictive de recette, 75012 Paris");
  await page.getByRole("button", { name: "Créer le client", exact: true }).click();
  await page.waitForURL(/\/artisan\/clients\/[a-f\d-]+$/);
  await expect(page.getByRole("heading", { name: nom, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(nom);
  await page.getByRole("link", { name: "Créer un chantier et son devis", exact: true }).click();
  await page.getByLabel("Titre du chantier", { exact: true }).fill("Réparation fictive E2E");
  await page.getByLabel("Demande du client", { exact: true }).fill("Remplacer un joint pour le scénario de recette.");
  await page.getByRole("button", { name: "Créer le chantier et préparer le devis", exact: true }).click();
  await page.waitForURL(/\/artisan\/chantiers\/[a-f\d-]+$/);
  await page.getByLabel("Libellé", { exact: true }).fill("Remplacement fictif du joint");
  await page.getByLabel("Prix unitaire HT (€)", { exact: true }).fill("85");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Devis — version 1 · Brouillon" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Devis — version 1 · Brouillon" })).toBeVisible();
  await expect(page.getByText("Total TTC 102,00 €", { exact: true })).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({ path: info.outputPath("devis-externe-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({ path: info.outputPath("devis-externe-bureau.png"), fullPage: true });
});

// Audit du 27/09 (bloquant) : « Artisan ? Inscrire mon entreprise » ramenait
// le visiteur sur /connexion — aucun écran ne créait de compte artisan.
test.describe("visiteur sans compte", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("« Inscrire mon entreprise » ouvre la création de compte, sans détour par /connexion", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByRole("link", { name: /Inscrire mon entreprise/i }).click();
    await page.waitForURL(/\/artisan\/inscription/);
    expect(page.url()).not.toContain("/connexion");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Inscrire mon entreprise/i);
    await expect(page.getByRole("button", { name: /Créer mon compte/i })).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
  });
});
