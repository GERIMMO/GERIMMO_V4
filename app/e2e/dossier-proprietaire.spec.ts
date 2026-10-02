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

test('propriétaire : un refus d’enregistrement reste visible sans perdre la saisie', async ({ page }) => {
  await page.goto(`/agence/${ORG}/parc`);
  await page.getByRole('button', { name: /Appartement T2/ }).first().click();
  const href = await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).getAttribute('href');
  await page.goto(href! + '?parcours=1&etape=bien');
  const formulaire = page.locator('form.saisie-bien');
  await formulaire.locator('[name="nom"]').fill('   ');
  await formulaire.locator('[name="annee_construction"]').fill('1990');
  await formulaire.locator('[name="parties_communes"]').fill('Néant — essai de refus');
  await formulaire.locator('[name="acces_tic"]').fill('Fibre — saisie à conserver');
  // Les espaces passent le contrôle HTML required, mais le serveur les refuse
  // avant toute écriture. Aucune donnée du bien n’est changée par cet essai.
  for (let tentative = 0; tentative < 2; tentative++) {
    await formulaire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    const erreur = formulaire.getByRole('alert');
    await expect(erreur).toHaveText('La référence du bien est obligatoire.');
    await expect(erreur).toBeFocused();
    await expect(erreur).toBeInViewport();
    await expect(formulaire.locator('[name="parties_communes"]')).toHaveValue('Néant — essai de refus');
    await expect(formulaire.locator('[name="acces_tic"]')).toHaveValue('Fibre — saisie à conserver');
  }
});

for (const largeur of [390, 1440]) {
  test(`propriétaire : parcours guidé et saisies conservées à ${largeur}px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 1000 });
    await page.goto(`/agence/${ORG}/parc`);
    await page.getByRole('button', { name: /Appartement T2/ }).first().click();
    await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).click();
    await page.getByRole('link', { name: 'Préparer cette location étape par étape' }).click();
    const navigation = page.getByRole('navigation', { name: 'Étapes de la location' });
    await expect(navigation.getByRole('button')).toHaveCount(7);
    const bien = page.getByRole('region', { name: 'Étape Bien', exact: true });
    await bien.locator('[name="nom"]').fill('Saisie non enregistrée');
    await navigation.getByRole('button', { name: /3 Logement/ }).click();
    await expect(bien).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Étape Logement', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: /1 Bien/ }).click();
    await expect(bien.locator('[name="nom"]')).toHaveValue('Saisie non enregistrée');
    for (const nom of [/2 Lot/, /3 Logement/, /4 Diagnostics/, /5 Locataires/, /6 Bail/, /7 Finalisation/]) {
      await navigation.getByRole('button', { name: nom }).click();
      await expect(page.locator('.assistant-panneau:visible')).toHaveCount(1);
      expect(await debordementHorizontal(page)).toBe(0);
    }
    await navigation.getByRole('button', { name: /3 Logement/ }).click();
    await page.screenshot({ path: `e2e/.results/parcours-${largeur}.png`, fullPage: true });
  });
}

test('propriétaire : créer le locataire puis le bail sans quitter le guide', async ({ page }) => {
  await page.goto(`/agence/${ORG}/parc`);
  await page.getByRole('button', { name: /Appartement T2/ }).first().click();
  const href = await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).getAttribute('href');
  await page.goto(href! + '?parcours=1&etape=locataires');
  const nom = `Guide${Date.now()}`;
  const region = page.getByRole('region', { name: 'Étape Locataires', exact: true });
  await region.getByRole('button', { name: /Locataire.*Occupe/ }).click();
  for (const [champ, valeur] of Object.entries({ nom, prenom:'Camille', email:'guide-local@example.invalid', date_naissance:'1990-01-01', commune_naissance:'Lyon', address_line1:'1 rue des Essais', postal_code:'69003', city:'Lyon' })) {
    await region.locator(`[name="${champ}"]`).fill(valeur);
  }
  await region.getByRole('button', { name:'Créer la fiche', exact:true }).click();
  await expect(region.getByText('Fiche créée. Vous pouvez sélectionner cette personne à l’étape Bail.', { exact:true })).toBeVisible();
  await page.getByRole('navigation', { name:'Étapes de la location' }).getByRole('button', { name:/6 Bail/ }).click();
  const bail = page.getByRole('region', { name:'Étape Bail', exact:true });
  await bail.locator('[name="locataire_principal"]').selectOption({ label:`${nom} Camille` });
  for (const [champ, valeur] of Object.entries({ date_debut:'2026-12-01', loyer_hc:'700', charges:'50', depot_garantie:'700' })) {
    await bail.locator(`[name="${champ}"]`).fill(valeur);
  }
  await bail.getByRole('button', { name:'Créer le bail', exact:true }).click();
  await expect(page).toHaveURL(/etape=finalisation/);
  await expect(page.getByRole('region', { name:'Étape Finalisation', exact:true })).toBeVisible();
  await expect(page.getByRole('link', { name:/Vérifier le bail et les documents/ }).first()).toBeVisible();
});
