import { test, expect } from '@playwright/test';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';

const ORG = '3c1d1e95-3570-400b-8012-44530be145b1';
test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto('/connexion');
  await page.locator('#email').fill('proprietaire@gerimmo-demo.fr');
  await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE ?? 'Gerimmo-Demo-2026');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(/\/(espaces|agence)\//);
});
for (const largeur of [390, 1440]) {
  test(`propriétaire : repères et rubriques accessibles à ${largeur}px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 1000 });
    await page.goto(`/agence/${ORG}/parc`);
    await page.getByRole('button', { name: /Appartement T2/ }).first().click();
    await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Préparation du dossier' })).toBeVisible();
    const reperes = page.getByRole('navigation', { name: 'Rubriques du dossier' });
    await reperes.getByRole('link', { name: /Pièces et équipements/ }).click();
    const rubrique = page.locator('#pieces');
    await expect(rubrique.getByRole('button', { name: /Pièces \(état des lieux\)/ })).toHaveAttribute('aria-expanded', 'true');
    await rubrique.getByRole('button', { name: /Pièces \(état des lieux\)/ }).click();
    await reperes.getByRole('link', { name: /Pièces et équipements/ }).click();
    await expect(rubrique.getByRole('button', { name: /Pièces \(état des lieux\)/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await debordementHorizontal(page)).toBe(0);
    await page.goto(page.url().split('#')[0]);
    await page.screenshot({ path: `e2e/.results/dossier-${largeur}.png`, fullPage: true });
  });
}
