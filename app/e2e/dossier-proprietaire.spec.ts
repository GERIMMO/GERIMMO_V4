import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';

const ORG = '3c1d1e95-3570-400b-8012-44530be145b1';
test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto('/connexion');
  await page.locator('#email').fill('proprietaire@example.com');
  await page.locator('#mot-de-passe').fill(process.env.E2E_MOT_DE_PASSE ?? 'Gerimmo-Demo-2026');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(/\/(espaces|espace|agence)\//);
});
for (const largeur of [390, 1440]) {
  test(`propriétaire : repères et rubriques accessibles à ${largeur}px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 1000 });
    await page.goto(`/espace/${ORG}/parc`);
    await page.getByRole('button', { name: /Appartement T2/ }).first().click();
    await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Résumé', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Caractéristiques du logement' })).toBeHidden();
    await page.getByRole('tab', { name: 'Contrats', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Contrats de location', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Documents du logement', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Logement', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Caractéristiques du logement' })).toBeVisible();
    const rubrique = page.locator('#pieces');
    const ouvrir = rubrique.getByRole('button', { name: /Pièces \(état des lieux\)/ });
    await ouvrir.click();
    await expect(ouvrir).toHaveAttribute('aria-expanded', 'true');
    await ouvrir.click();
    await expect(ouvrir).toHaveAttribute('aria-expanded', 'false');
    // Un lien direct ouvre encore la bonne rubrique, sans onglet intermédiaire.
    await page.goto(page.url().split('#')[0] + '#pieces');
    await expect(ouvrir).toHaveAttribute('aria-expanded', 'true');
    expect(await debordementHorizontal(page)).toBe(0);
    await page.goto(page.url().split('#')[0]);
    await expect(page.getByRole('tab', { name: 'Résumé', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: `e2e/.results/dossier-${largeur}.png`, fullPage: true });
  });
}

test('propriétaire : un refus d’enregistrement reste visible sans perdre la saisie', async ({ page }) => {
  await page.goto(`/espace/${ORG}/parc`);
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
    await page.goto(`/espace/${ORG}/parc`);
    await page.getByRole('button', { name: /Appartement T2/ }).first().click();
    const href = await page.getByRole('link', { name: 'Ouvrir la fiche complète', exact: true }).getAttribute('href');
    await page.goto(href! + '?parcours=1&etape=bien');
    const navigation = page.getByRole('navigation', { name: 'Étapes de la création du lot' });
    await expect(navigation.getByRole('button')).toHaveCount(6);
    const bien = page.getByRole('region', { name: 'Étape Bâtiment', exact: true });
    await bien.locator('[name="nom"]').fill('Saisie non enregistrée');
    await navigation.getByRole('button', { name: /Étape 04 : Équipements/ }).click();
    await expect(bien).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Étape Équipements', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: /Étape 01 : Bâtiment/ }).click();
    await expect(bien.locator('[name="nom"]')).toHaveValue('Saisie non enregistrée');
    for (const nom of [/Étape 02 : Le lot/, /Étape 03 : Propriétaires/, /Étape 04 : Équipements/, /Étape 05 : Diagnostics/, /Étape 06 : Récapitulatif/]) {
      await navigation.getByRole('button', { name: nom }).click();
      await expect(page.locator('.assistant-panneau:visible')).toHaveCount(1);
      expect(await debordementHorizontal(page)).toBe(0);
    }
    await navigation.getByRole('button', { name: /Étape 04 : Équipements/ }).click();
    await page.screenshot({ path: `e2e/.results/parcours-${largeur}.png`, fullPage: true });
  });
}

test('propriétaire : le bail reprend le lot et permet de créer puis retrouver le locataire', async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, 'Ce scénario exige une base API locale pour isoler son lot.');
  const url = new URL(cible!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
  const db = new Client({ connectionString: cible });
  await db.connect();
  // Chaque projet, reprise et exécution a son lot : le brouillon créé par le
  // bureau ne remplace plus le bouton attendu par le scénario mobile.
  const lotId = randomUUID();
  const nomLot = `E2E bail ${lotId}`;
  let nomLocataire: string | undefined;
  try {
    // Les identifiants du seed sont générés à chaque base neuve : retrouver
    // la fixture par son organisation et son nom, puis vérifier sa présence.
    const sources = (await db.query("select id from public.lots where organization_id=$1 and nom=$2", [ORG, 'Appartement T2 — 12 rue des Lilas'])).rows;
    expect(sources).toHaveLength(1);
    const sourceId = sources[0].id;
    const copie = await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,
      to_jsonb(l)||jsonb_build_object('id',$1::text,'nom',$2::text,'etat','disponible','created_at',now(),'updated_at',now()))).*
      from public.lots l where l.id=$4 and l.organization_id=$3 returning id`, [lotId, nomLot, ORG, sourceId]);
    expect(copie.rows).toEqual([{ id: lotId }]);
    await db.query(`insert into public.detentions(id,lot_id,organization_id,person_id,quote_part,date_debut,date_fin)
      select gen_random_uuid(),$1,organization_id,person_id,quote_part,date_debut,date_fin from public.detentions
      where lot_id=$3 and organization_id=$2`, [lotId, ORG, sourceId]);
  await page.goto(`/espace/${ORG}/parc`);
  await page.getByRole('button', { name: new RegExp(nomLot) }).first().click();
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
  await navigation.getByRole('button', { name: /Étape 02 : Personnes/ }).click();
  const personnes = page.getByRole('region', { name: 'Personnes', exact: true });
  await expect(personnes.locator('.bail-personnes-proprietaires')).toContainText('Moreau');
  await personnes.getByRole('button', { name: /Choisir un locataire|Changer de locataire/ }).click();
  await personnes.getByRole('button', { name: 'Créer une personne', exact: true }).click();
  const nom = `Guide${randomUUID()}`;
  nomLocataire = nom;
  const formulaire = personnes.locator('form.bail-personne-formulaire');
  for (const [champ, valeur] of Object.entries({ nom, prenom:'Camille', email:`${nom.toLowerCase()}@example.invalid`, date_naissance:'1990-01-01', commune_naissance:'Lyon', address_line1:'1 rue des Essais', postal_code:'69003', city:'Lyon' })) {
    await formulaire.locator(`[name="${champ}"]`).fill(valeur);
  }
  await formulaire.getByRole('button', { name:'Créer cette personne', exact:true }).click();
  await personnes.getByRole('button', { name:'Utiliser ce locataire', exact:true }).click();
  await expect(personnes.locator('.bail-personnes-locataires')).toContainText(nom);
  await navigation.getByRole('button', { name: /Étape 04 : Loyer/ }).click();
  const loyer = page.locator('#form-parcours-bail');
  for (const [champ, valeur] of Object.entries({ loyer_hc:'700', charges:'50', depot_garantie:'700', jour_echeance:'5' })) {
    await loyer.locator(`[name="${champ}"]`).fill(valeur);
  }
  await loyer.getByRole('button', { name:'Enregistrer cette étape', exact:true }).click();
  await expect(loyer.getByRole('status')).toBeVisible();
  await page.reload();
  await expect(page.locator('#form-parcours-bail [name="loyer_hc"]')).toHaveValue(/^700(?:[.,]0+)?$/);
  await navigation.getByRole('button', { name: /Étape 02 : Personnes/ }).click();
  await expect(page.locator('.bail-personnes-locataires')).toContainText(nom);
  await navigation.getByRole('button', { name: /Étape 01 : Le bail/ }).click();
  await expect(page.locator('[name="date_debut"]:visible')).toHaveValue('2026-12-01');
  expect(await debordementHorizontal(page)).toBe(0);
  } finally {
    // Périmètre exclusivement créé par CETTE tentative, jamais le lot du seed.
    await db.query('delete from public.baux where lot_id=$1 and organization_id=$2', [lotId, ORG]);
    await db.query('delete from public.detentions where lot_id=$1 and organization_id=$2', [lotId, ORG]);
    await db.query('delete from public.lots where id=$1 and organization_id=$2', [lotId, ORG]);
    if (nomLocataire) await db.query('delete from public.persons where organization_id=$1 and nom=$2', [ORG, nomLocataire]);
    await db.end();
  }
});
