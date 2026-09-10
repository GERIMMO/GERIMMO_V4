import { expect, test, type Locator } from "@playwright/test";
import path from "node:path";
import { entrerDansEspace } from "./aides";

/**
 * L'ARRIVÉE, telle qu'un vrai utilisateur la vit — modale comprise.
 *
 * Tout le reste de la suite appelle `sansSyntheseAlertes()` en beforeEach pour
 * écarter la synthèse d'alertes et tester l'écran derrière. C'est utile, et
 * c'est aussi ce qui a rendu le harnais AVEUGLE au premier écran réel : la
 * synthèse s'ouvre d'elle-même à chaque connexion, et sur un téléphone elle
 * était plus large que la fenêtre — ses deux boutons « Fermer » tombaient hors
 * champ, clipés par `body{overflow-x:hidden}`. L'utilisateur arrivait donc dans
 * une modale qu'il ne pouvait pas fermer (constat de rendu du 2026-09-11).
 *
 * Ce fichier NE neutralise PAS la synthèse : c'est tout son intérêt.
 */
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

// Vrai si la synthèse finit par s'ouvrir, faux si ce compte n'a rien à traiter.
async function attendreSynthese(modale: Locator): Promise<boolean> {
  try {
    await modale.waitFor({ state: "visible", timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

test("la synthèse d'alertes qui s'ouvre à l'arrivée tient dans l'écran et se ferme au doigt", async ({
  page,
}) => {
  await entrerDansEspace(page, "agence");

  const modale = page.locator('[role="dialog"]');
  // La synthèse s'ouvre APRÈS l'hydratation (setTimeout d'un tick) : la sonder
  // tout de suite la manque et le test se croirait passé. On l'ATTEND.
  const ouverte = await attendreSynthese(modale);
  test.skip(!ouverte, "aucune alerte confiée à ce compte : pas de synthèse à l'arrivée");

  // 1. Elle tient dans la fenêtre, entièrement.
  const fenetre = page.viewportSize()!.width;
  const boite = (await modale.boundingBox())!;
  expect(boite.x, "la modale commence dans l'écran").toBeGreaterThanOrEqual(0);
  expect(
    boite.x + boite.width,
    `la modale déborde : elle finit à ${Math.round(boite.x + boite.width)} px pour une fenêtre de ${fenetre} px`
  ).toBeLessThanOrEqual(fenetre + 1);

  // 2. Le geste de sortie est ATTEIGNABLE — c'est le vrai test, pas la mesure.
  const fermer = page.getByRole("button", { name: /fermer/i }).first();
  await expect(fermer).toBeVisible();
  await fermer.click({ timeout: 5000 });
  await expect(modale).toBeHidden();
});

test("une fois écartée, la synthèse ne revient pas à chaque écran", async ({ page }) => {
  await entrerDansEspace(page, "agence");
  const modale = page.locator('[role="dialog"]');
  if (await attendreSynthese(modale)) {
    await page.getByRole("button", { name: /fermer/i }).first().click();
    await expect(modale).toBeHidden();
  }
  // La synthèse est un point du matin, pas une porte à repousser sans cesse :
  // le drapeau de session doit tenir d'un écran à l'autre.
  await page.getByRole("link", { name: /parc|portefeuille/i }).first().click();
  await page.waitForLoadState("networkidle");
  await expect(modale).toBeHidden();
});
