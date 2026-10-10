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
    const reperes = page.getByRole('navigation', { name: 'Rubriques du logement' });
    await expect(reperes).toBeVisible();
    await page.getByRole('region', { name: 'Le logement', exact: true }).getByRole('link', { name: 'Gérer', exact: true }).click();
    const rubrique = page.locator('#pieces');
    await expect(rubrique.getByRole('button', { name: /Pièces \(état des lieux\)/ })).toHaveAttribute('aria-expanded', 'true');
    await rubrique.getByRole('button', { name: /Pièces \(état des lieux\)/ }).click();
    await reperes.getByRole('button', { name: 'Vue d’ensemble', exact: true }).click();
    await page.getByRole('region', { name: 'Le logement', exact: true }).getByRole('link', { name: 'Gérer', exact: true }).click();
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
    const href = await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).getAttribute('href');
    await page.goto(href! + '?parcours=1&etape=bien');
    const navigation = page.getByRole('navigation', { name: 'Étapes de la création du lot' });
    await expect(navigation.getByRole('button')).toHaveCount(6);
    const bien = page.getByRole('region', { name: 'Étape Bâtiment', exact: true });
    await bien.locator('[name="nom"]').fill('Saisie non enregistrée');
    await navigation.getByRole('button', { name: /Étape 4 : Équipements/ }).click();
    await expect(bien).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Étape Équipements', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: /Étape 1 : Bâtiment/ }).click();
    await expect(bien.locator('[name="nom"]')).toHaveValue('Saisie non enregistrée');
    for (const nom of [/Étape 2 : Le lot/, /Étape 3 : Propriétaires/, /Étape 4 : Équipements/, /Étape 5 : Diagnostics/, /Étape 6 : Récapitulatif/]) {
      await navigation.getByRole('button', { name: nom }).click();
      await expect(page.locator('.assistant-panneau:visible')).toHaveCount(1);
      expect(await debordementHorizontal(page)).toBe(0);
    }
    await navigation.getByRole('button', { name: /Étape 4 : Équipements/ }).click();
    await page.screenshot({ path: `e2e/.results/parcours-${largeur}.png`, fullPage: true });
  });
}

test('propriétaire : le bail reprend le lot et permet de créer puis retrouver le locataire', async ({ page }) => {
  await page.goto(`/agence/${ORG}/parc`);
  await page.getByRole('button', { name: /Appartement T2/ }).first().click();
  const href = await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).getAttribute('href');
  // L’ancien lien de création de locataire rejoint désormais les baux du lot.
  await page.goto(href! + '?parcours=1&etape=locataires');
  await expect(page).toHaveURL(/#baux$/);
  await page.getByRole('button', { name: 'Commencer le bail', exact: true }).click();
  await expect(page).toHaveURL(/\/baux\/[0-9a-f-]+#etape-bail-1$/);
  const navigation = page.getByRole('navigation', { name: 'Étapes du bail' });
  await expect(navigation.getByRole('button')).toHaveCount(7);
  const contrat = page.locator('#form-parcours-bail');
  await contrat.locator('[name="date_debut"]').fill('2026-12-01');
  await contrat.getByRole('button', { name: 'Enregistrer cette étape', exact: true }).click();
  await expect(contrat.getByRole('status')).toBeVisible();
  await navigation.getByRole('button', { name: /Étape 2 : Personnes/ }).click();
  const personnes = page.getByRole('region', { name: 'Personnes', exact: true });
  await expect(personnes.locator('.bail-personnes-proprietaires')).toContainText('Moreau');
  await personnes.getByRole('button', { name: /Choisir un locataire|Changer de locataire/ }).click();
  await personnes.getByRole('button', { name: 'Créer une personne', exact: true }).click();
  const nom = `Guide${Date.now()}`;
  const formulaire = personnes.locator('form.bail-personne-formulaire');
  for (const [champ, valeur] of Object.entries({ nom, prenom:'Camille', email:`${nom.toLowerCase()}@example.invalid`, date_naissance:'1990-01-01', commune_naissance:'Lyon', address_line1:'1 rue des Essais', postal_code:'69003', city:'Lyon' })) {
    await formulaire.locator(`[name="${champ}"]`).fill(valeur);
  }
  await formulaire.getByRole('button', { name:'Créer cette personne', exact:true }).click();
  await personnes.getByRole('button', { name:'Utiliser ce locataire', exact:true }).click();
  await expect(personnes.locator('.bail-personnes-locataires')).toContainText(nom);
  await navigation.getByRole('button', { name: /Étape 4 : Loyer/ }).click();
  const loyer = page.locator('#form-parcours-bail');
  for (const [champ, valeur] of Object.entries({ loyer_hc:'700', charges:'50', depot_garantie:'700', jour_echeance:'5' })) {
    await loyer.locator(`[name="${champ}"]`).fill(valeur);
  }
  await loyer.getByRole('button', { name:'Enregistrer cette étape', exact:true }).click();
  await expect(loyer.getByRole('status')).toBeVisible();
  await page.reload();
  await expect(page.locator('#form-parcours-bail [name="loyer_hc"]')).toHaveValue('700');
  await navigation.getByRole('button', { name: /Étape 2 : Personnes/ }).click();
  await expect(page.locator('.bail-personnes-locataires')).toContainText(nom);
  await navigation.getByRole('button', { name: /Étape 1 : Le bail/ }).click();
  await expect(page.locator('[name="date_debut"]:visible')).toHaveValue('2026-12-01');
  expect(await debordementHorizontal(page)).toBe(0);
});
