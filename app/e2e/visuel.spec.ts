import { expect, test } from "@playwright/test";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

/**
 * LE GARDE-FOU VISUEL (refonte v4, 19/09).
 *
 * La suite mesurait le débordement et l'accessibilité, jamais l'apparence :
 * une refonte pouvait passer 1 400 tests et être cassée à l'œil — le projet
 * l'a vécu trois fois (contrastes déplacés par le remappage v3, grilles
 * réglées sur la fenêtre, modales avalées par le bandeau). Ici, chaque écran
 * refait est photographié à trois largeurs et comparé à sa référence.
 *
 * Régénérer les références après un changement VOULU :
 *   npx playwright test --config e2e/playwright.config.ts visuel --update-snapshots
 * Les références sont propres à cette machine (polices, rendu) : elles se
 * comparent sur le banc, pas d'une machine à l'autre.
 */
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

const LARGEURS = [
  { nom: "bureau", largeur: 1280, hauteur: 900 },
  { nom: "tablette", largeur: 900, hauteur: 1000 },
  { nom: "telephone", largeur: 390, hauteur: 844 },
] as const;

for (const l of LARGEURS) {
  test(`tableau de bord agence — ${l.nom} (${l.largeur} px)`, async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.setViewportSize({ width: l.largeur, height: l.hauteur });
    await page.goto("/espaces");
    await page.waitForURL(/\/agence\//);
    await page.waitForLoadState("networkidle");
    // La date du jour et le fil d'activité changent d'un jour à l'autre : on
    // les masque, la comparaison porte sur la structure et le style.
    await expect(page).toHaveScreenshot(`tableau-de-bord-${l.nom}.png`, {
      fullPage: true,
      animations: "disabled",
      mask: [page.locator("time"), page.locator(".entete-page p").first()],
      maxDiffPixelRatio: 0.01,
    });
  });
}
