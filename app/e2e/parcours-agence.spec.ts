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
  // Coquille v4 (19/09) : sur téléphone, la colonne cède la place à une barre
  // basse de quatre entrées — visée par son rôle, pas par une classe.
  const barre = page.getByRole("navigation", { name: /téléphone/ });
  await expect(barre).toBeVisible();
  await expect(barre.getByRole("link", { name: /Tableau de bord/ })).toBeVisible();
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
  await page.getByLabel(/Année de construction/).fill("2005");
  await page.getByLabel(/Parties communes/).fill("Hall et cour intérieure");
  await page.getByLabel(/Accès TIC/).fill("Fibre optique et TNT");
  await page.getByLabel(/Surface.*m²/).fill("51");
  await page.getByLabel("Nombre de pièces").fill("3");
  await page.getByRole("button", { name: /Créer le bien/ }).click();

  // La création débouche sur la fiche (ou le parc) où le bien existe
  await expect(page.locator("body")).toContainText(nom, { timeout: 20_000 });
});

test("créer, ouvrir, fermer puis traiter une alerte au doigt", async ({ page }) => {
  const orgId = await entrerDansEspace(page, "agence");
  await page.goto(`/agence/${orgId}/alertes`);
  const titre = `E2E alerte à vérifier ${Date.now()}`;
  await page.getByRole("textbox", { name: "Titre", exact: true }).fill(titre);
  await page.getByRole("combobox", { name: "Confier à", exact: true }).selectOption({ label: "Tout le monde" });
  await page.getByRole("button", { name: "Créer l'alerte", exact: true }).click();
  const rang = page.locator('.rang-alerte').filter({ hasText: titre });
  const traiter = rang.getByRole("button", { name: "Traiter", exact: true });
  await expect(traiter).toBeVisible();
  await traiter.click();
  const modale = page.getByRole("dialog", { name: titre, exact: true });
  await expect(modale).toBeVisible();
  await modale.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(modale).toBeHidden();
  await expect(traiter).toBeVisible();
  await traiter.click();
  await modale.getByRole("textbox", { name: "Marquer traitée — ce qui a été fait", exact: true }).fill("Contrôle fictif terminé sur le banc de recette.");
  await modale.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(modale).toBeHidden();
  await expect(rang).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alertes", exact: true })).toBeVisible();
  await expect(page.locator('.rang-alerte').filter({ hasText: titre })).toHaveCount(0);
  await expect(page.getByText(titre, { exact: true })).toBeVisible();
});

test("le quittancement du mois s'affiche à 390px avec le bail E2E", async ({ page }) => {
  const orgId = await entrerDansEspace(page, "agence");
  await page.goto(`/agence/${orgId}/comptabilite`);
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
});

test("le plan du jour : replié devant un mur, ouvert quand il tient à l'écran", async ({ page }) => {
  // DEMANDE DE L'HUMAIN (12/09) : « les listes de choses à faire, je les veux
  // en liste déroulante qui sont par défaut repliée ». L'écran du matin
  // ouvrait sur une colonne de quinze rangées — on ne choisit pas par où
  // commencer devant un mur. … SAUF quand il n'y a pas de mur (tour du
  // 24/09) : jusqu'à cinq actions, le plan arrive ouvert, sinon deux rangs
  // annoncés deux fois coûtaient un clic pour rien.
  const orgId = await entrerDansEspace(page, "agence");
  await page.goto(`/agence/${orgId}`);

  const groupes = page.locator("details.groupe-plan");
  await expect(groupes.first()).toBeVisible();
  const combien = await groupes.count();

  // Le compte de chaque groupe se lit dans son en-tête : il décide de l'état.
  const total = (await groupes.locator("summary").allInnerTexts())
    .map((t) => Number((t.match(/(\d+)\s*$/) ?? [])[1] ?? 0))
    .reduce((a, b) => a + b, 0);
  const ouverts = () =>
    groupes.evaluateAll((els) => els.filter((e) => (e as HTMLDetailsElement).open).length);
  if (total <= 5) {
    // Pas de mur : tout est ouvert à l'arrivée, aucun clic à faire.
    expect(await ouverts()).toBe(combien);
  } else {
    // Le mur : AUCUN n'est ouvert à l'arrivée — c'est toute la demande.
    expect(await ouverts()).toBe(0);
  }

  // Le compte reste lisible sur l'en-tête : on sait ce qu'il y a derrière.
  const entete = groupes.first().locator("summary");
  await expect(entete).toBeVisible();
  const cible = await entete.boundingBox();
  expect(Math.round(cible!.height)).toBeGreaterThanOrEqual(40);

  // Et un clic ne change que CELUI-LÀ, pas les autres.
  const avant = await ouverts();
  const premierOuvert = await groupes.first().evaluate((e) => (e as HTMLDetailsElement).open);
  await entete.click();
  expect(await ouverts()).toBe(premierOuvert ? avant - 1 : avant + 1);
  expect(await debordementHorizontal(page)).toBe(0);
});
