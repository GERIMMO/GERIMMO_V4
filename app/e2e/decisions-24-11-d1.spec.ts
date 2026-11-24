import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D1.
//  Q18 : le menu du propriétaire reste court ; son tableau de bord mène à Statistiques et au Journal.
//  Q13 : chaque article du Journal porte la mention visible « Rédigé avec l’aide de l’IA » (espace et site public).
// L'article est celui du jeu d'essai (seed-parcours.mjs) ; rien n'est écrit en base.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const ARTICLE = "e2e-gerer-une-location";
const MENTION = "Rédigé avec l’aide de l’IA";

test.describe("propriétaire", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

  test("Q18 et Q13 : du tableau de bord aux statistiques, puis au journal, où l'article porte la mention", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}`);
    const liens = page.getByRole("navigation", { name: "Statistiques et journal" });
    await expect(liens.getByRole("link")).toHaveCount(2);
    await expect(liens.getByRole("link", { name: /^Statistiques/ })).toHaveAttribute("href", `/espace/${ORG}/statistiques`);
    await expect(liens.getByRole("link", { name: /^Journal/ })).toHaveAttribute("href", `/espace/${ORG}/journal`);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);

    await liens.getByRole("link", { name: /^Statistiques/ }).click();
    await expect(page).toHaveURL(`/espace/${ORG}/statistiques`);
    await expect(page.getByRole("heading", { level: 1, name: "Statistiques" })).toBeVisible();

    await page.goto(`/espace/${ORG}`);
    await page.getByRole("navigation", { name: "Statistiques et journal" }).getByRole("link", { name: /^Journal/ }).click();
    await expect(page).toHaveURL(`/espace/${ORG}/journal`);
    await expect(page.getByRole("heading", { level: 1, name: "Le journal Gerimmo" })).toBeVisible();

    await page.goto(`/espace/${ORG}/journal/${ARTICLE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("article").getByText(MENTION, { exact: true })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });
});

test("Q13 : sur le site public, l'article porte la même mention", async ({ page }) => {
  await page.goto(`/journal/${ARTICLE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main").getByText(MENTION, { exact: true })).toBeVisible();
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
});
