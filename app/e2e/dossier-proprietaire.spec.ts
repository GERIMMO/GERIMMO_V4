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
    await page.locator('a[data-lot-id]').filter({ hasText: 'Appartement T2' }).first().click();
    await expect(page).toHaveURL(/\/parc\/[0-9a-f-]+\/lots\/[0-9a-f-]+$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    for (const nom of ['Le logement', 'Le bâtiment', 'Locataires & garants', 'Le bail', 'Incidents', 'Propriétaires']) {
      await expect(page.getByRole('heading', { name: nom, exact: true })).toBeVisible();
    }
    const documents = page.locator('details#documents-lot');
    await expect(documents).not.toHaveAttribute('open', '');
    await documents.locator(':scope > summary').click();
    await expect(documents.getByRole('link', { name: 'Ouvrir la bibliothèque', exact: true })).toBeVisible();
    const rubrique = page.locator('details#pieces');
    const ouvrir = rubrique.locator(':scope > summary');
    await ouvrir.click();
    await expect(rubrique).toHaveAttribute('open', '');
    await ouvrir.click();
    await expect(rubrique).not.toHaveAttribute('open', '');
    // Le lien direct ouvre l'éditeur des pièces dans la fiche continue.
    await page.goto(page.url().split('#')[0] + '#pieces');
    await expect(rubrique).toHaveAttribute('open', '');
    expect(await debordementHorizontal(page)).toBe(0);
    await page.goto(page.url().split('#')[0]);
    await page.reload();
    await expect(documents).not.toHaveAttribute('open', '');
    await expect(page.getByRole('heading', { name: 'Le logement', exact: true })).toBeVisible();
    await page.screenshot({ path: `e2e/.results/dossier-${largeur}.png`, fullPage: true });
  });
}

test('propriétaire : un refus d’enregistrement reste visible sans perdre la saisie', async ({ page }) => {
  await page.goto(`/espace/${ORG}/parc`);
  const href = await page.locator('a[data-lot-id]').filter({ hasText: 'Appartement T2' }).first().getAttribute('href');
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
    const href = await page.locator('a[data-lot-id]').filter({ hasText: 'Appartement T2' }).first().getAttribute('href');
    await page.goto(href! + '?parcours=1&etape=bien');
    const navigation = page.getByRole('navigation', { name: 'Étapes de la création du lot' });
    await expect(navigation.getByRole('button')).toHaveCount(6);
    const bien = page.getByRole('region', { name: 'Étape Bâtiment', exact: true });
    await bien.locator('[name="nom"]').fill('Saisie non enregistrée');
    await navigation.getByRole('button', { name: /Étape 04 Équipements/ }).click();
    await expect(bien).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Étape Équipements', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: /Étape 01 Bâtiment/ }).click();
    await expect(bien.locator('[name="nom"]')).toHaveValue('Saisie non enregistrée');
    for (const nom of [/Étape 02 Le lot/, /Étape 03 Propriétaires/, /Étape 04 Équipements/, /Étape 05 Diagnostics/, /Étape 06 Récapitulatif/]) {
      await navigation.getByRole('button', { name: nom }).click();
      await expect(page.locator('.assistant-panneau:visible')).toHaveCount(1);
      expect(await debordementHorizontal(page)).toBe(0);
    }
    await navigation.getByRole('button', { name: /Étape 04 Équipements/ }).click();
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
  const href = await page.locator(`a[data-lot-id="${lotId}"]`).getAttribute('href');
  // L’ancien lien de création rejoint directement l'action de préparation du bail.
  await page.goto(href! + '?parcours=1&etape=locataires');
  await expect(page).toHaveURL(/#nouvelle-location$/);
  await page.getByRole('button', { name: 'Commencer un bail', exact: true }).click();
  await expect(page).toHaveURL(/\/baux\/[0-9a-f-]+#etape-bail-1$/);
  const navigation = page.getByRole('navigation', { name: 'Étapes du bail' });
  await expect(navigation.getByRole('button')).toHaveCount(7);
  const contrat = page.locator('#form-parcours-bail');
  await contrat.locator('[name="date_debut"]').fill('2026-12-01');
  await page.getByRole('button', { name: 'Enregistrer et continuer', exact: true }).click();
  await expect(page).toHaveURL(/#etape-bail-2$/);
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
  await navigation.getByRole('button', { name: /Étape 03 Le logement/ }).click();
  await expect(page.locator('#completer-lot')).toContainText(nomLot);
  await expect(page.locator('#completer-bien')).toContainText('12 rue des Lilas');
  await expect(page.locator('#completer-bien').getByRole('link')).toHaveAttribute('href', /[?&]etape=bien(?:&|$)/);
  await navigation.getByRole('button', { name: /Étape 04 Loyer/ }).click();
  const loyer = page.locator('#form-parcours-bail');
  for (const [champ, valeur] of Object.entries({ loyer_hc:'700', charges:'50', depot_garantie:'700', jour_echeance:'5' })) {
    await loyer.locator(`[name="${champ}"]`).fill(valeur);
  }
  await page.getByRole('button', { name:'Enregistrer et continuer', exact:true }).click();
  await expect(page).toHaveURL(/#etape-bail-5$/);
  await expect(page.getByRole('heading', { name: 'Assurance du propriétaire', exact: true })).toBeVisible();
  await page.reload();
  await navigation.getByRole('button', { name: /Étape 04 Loyer/ }).click();
  for (const [champ, valeur] of Object.entries({ loyer_hc:'700', charges:'50', depot_garantie:'700', jour_echeance:'5' })) {
    await expect(page.locator(`#form-parcours-bail [name="${champ}"]`)).toHaveValue(new RegExp(`^${valeur}(?:[.,]0+)?$`));
  }
  await navigation.getByRole('button', { name: /Étape 02 Personnes/ }).click();
  await expect(page.locator('.bail-personnes-locataires')).toContainText(nom);
  await navigation.getByRole('button', { name: /Étape 01 Le bail/ }).click();
  await expect(page.locator('[name="date_debut"]:visible')).toHaveValue('2026-12-01');
  await navigation.getByRole('button', { name: /Étape 06 Clauses/ }).click();
  await expect(page.locator('#form-parcours-bail [name="encadrement_loyer"]')).toBeVisible();
  await navigation.getByRole('button', { name: /Étape 07 Récapitulatif/ }).click();
  await expect(page.getByRole('heading', { name: 'Avant la signature', exact: true })).toBeVisible();
  await expect(page.locator('#informations-bail')).toContainText(nomLot);
  await expect(page.locator('#informations-bail')).toContainText(nom);
  await page.getByRole('link', { name: 'Modifier : Loyer et paiement', exact: true }).click();
  await expect(page).toHaveURL(/#etape-bail-4$/);
  await expect(page.locator('#form-parcours-bail [name="loyer_hc"]')).toHaveValue(/^700(?:[.,]0+)?$/);
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

// Audit #264 (FL-09) : la fiche d’un colocataire nomme sa chambre, celle d’un garant le locataire couvert,
// et la liste dit « bail en préparation » comme la fiche.
test('propriétaire : fiches et liste des personnes d’un bail de chambre en préparation', async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, 'Ce scénario exige une base API locale pour isoler ses données.');
  const url = new URL(cible!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
  const db = new Client({ connectionString: cible });
  await db.connect();
  const [lotId, chambreId, locataireId, garantId, bailId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const suffixe = lotId.slice(0, 8);
  try {
    const sources = (await db.query("select id from public.lots where organization_id=$1 and nom=$2", [ORG, 'Appartement T2 — 12 rue des Lilas'])).rows;
    expect(sources).toHaveLength(1);
    await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,
      to_jsonb(l)||jsonb_build_object('id',$1::text,'nom',$2::text,'etat','disponible','created_at',now(),'updated_at',now()))).*
      from public.lots l where l.id=$4 and l.organization_id=$3`, [lotId, `E2E chambres ${suffixe}`, ORG, sources[0].id]);
    await db.query(`insert into public.lot_chambres (id, organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
      values ($1,$2,$3,$4,12,30,'Chambre meublée','Cuisine')`, [chambreId, ORG, lotId, `Chambre bleue ${suffixe}`]);
    await db.query(`insert into public.persons (id, organization_id, nom, prenom, email) values
      ($1,$3,$4,'Inès',$5), ($2,$3,$6,'Marc',$7)`, [locataireId, garantId, ORG, `Coloc${suffixe}`, `coloc.${suffixe}@example.invalid`, `Garant${suffixe}`, `garant.${suffixe}@example.invalid`]);
    await db.query(`insert into public.baux (id, organization_id, lot_id, type, etat, chambre_id, locataire_principal, date_debut, loyer_hc, charges)
      values ($1,$2,$3,'colocation','brouillon',$4,$5,'2026-12-01',450,50)`, [bailId, ORG, lotId, chambreId, locataireId]);
    await db.query(`insert into public.bail_personnes (organization_id, bail_id, person_id, role, garant_de) values ($1,$2,$3,'garant',$4)`, [ORG, bailId, garantId, locataireId]);
    await page.goto(`/espace/${ORG}/personnes/${locataireId}`);
    await expect(page.locator('#rattachements')).toContainText(`E2E chambres ${suffixe} · Chambre bleue ${suffixe}`);
    await page.goto(`/espace/${ORG}/personnes/${garantId}`);
    await expect(page.locator('#rattachements')).toContainText(`Garant de Coloc${suffixe} Inès`);
    await page.goto(`/espace/${ORG}/personnes`);
    const ligne = (nom: string) => page.locator('li').filter({ hasText: nom }).first();
    await expect(ligne(`Coloc${suffixe}`)).toContainText('Locataire · bail en préparation');
    await expect(ligne(`Garant${suffixe}`)).toContainText('Garant · bail en préparation');
    await expect(ligne(`Coloc${suffixe}`)).not.toContainText('Sans bail en cours');
    // Un bail seulement en préparation n'est pas un bail en cours : les deux fiches restent dans ce filtre,
    // pas sous « Locataires » ni « Garants » (relecture de l’audit #264, FL-09).
    const filtre = (nom: string) => page.getByRole('group', { name: 'Filtrer par rôle' }).getByRole('button').filter({ hasText: nom });
    await filtre('Sans bail en cours').click();
    await expect(ligne(`Coloc${suffixe}`)).toBeVisible();
    await expect(ligne(`Garant${suffixe}`)).toBeVisible();
    await filtre('Locataires').click();
    await expect(page.locator('li').filter({ hasText: `Coloc${suffixe}` })).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBe(0);
  } finally {
    await db.query('delete from public.bail_personnes where bail_id=$1 and organization_id=$2', [bailId, ORG]);
    await db.query('delete from public.baux where id=$1 and organization_id=$2', [bailId, ORG]);
    await db.query('delete from public.lot_chambres where id=$1 and organization_id=$2', [chambreId, ORG]);
    await db.query('delete from public.lots where id=$1 and organization_id=$2', [lotId, ORG]);
    await db.query('delete from public.persons where id = any($1::uuid[]) and organization_id=$2', [[locataireId, garantId], ORG]);
    await db.end();
  }
});

// Audit #264 (FL-02, CB-02, CB-03) : un bail commencé se reprend depuis l’en-tête, la liste des biens et l’accueil ;
// un second geste de création reprend le brouillon vierge au lieu d’en créer un autre.
test('propriétaire : un bail commencé se reprend partout, sans brouillon vierge en double', async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, 'Ce scénario exige une base API locale pour isoler son lot.');
  const url = new URL(cible!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
  const db = new Client({ connectionString: cible });
  await db.connect();
  const lotId = randomUUID();
  try {
    const sources = (await db.query("select id from public.lots where organization_id=$1 and nom=$2", [ORG, 'Appartement T2 — 12 rue des Lilas'])).rows;
    expect(sources).toHaveLength(1);
    await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,
      to_jsonb(l)||jsonb_build_object('id',$1::text,'nom',$2::text,'etat','disponible','created_at',now(),'updated_at',now()))).*
      from public.lots l where l.id=$4 and l.organization_id=$3`, [lotId, `E2E reprise ${lotId}`, ORG, sources[0].id]);
    await db.query(`insert into public.detentions(id,lot_id,organization_id,person_id,quote_part,date_debut,date_fin)
      select gen_random_uuid(),$1,organization_id,person_id,quote_part,date_debut,date_fin from public.detentions
      where lot_id=$3 and organization_id=$2`, [lotId, ORG, sources[0].id]);
    const brouillons = async () => (await db.query("select count(*)::int as n from public.baux where lot_id=$1 and etat='brouillon'", [lotId])).rows[0].n;
    await page.goto(`/espace/${ORG}/parc`);
    const fiche = (await page.locator(`a[data-lot-id="${lotId}"]`).getAttribute('href'))!;
    await page.goto(fiche);
    await page.locator('#nouvelle-location').getByRole('button', { name: 'Commencer un bail', exact: true }).click();
    await expect(page).toHaveURL(/\/baux\/[0-9a-f-]+#etape-bail-1$/);
    const bailId = /\/baux\/([0-9a-f-]+)#/.exec(page.url())![1];
    // L’en-tête reprend ce brouillon : il ne propose plus d’en créer un autre.
    await page.goto(fiche);
    const entete = page.locator('#nouvelle-location');
    await expect(entete.getByRole('button')).toHaveCount(0);
    await expect(entete.getByRole('link', { name: 'Reprendre le bail', exact: true })).toHaveAttribute('href', new RegExp(`/baux/${bailId}$`));
    // Le geste secondaire reste offert, mais un brouillon encore vierge est repris, pas doublé.
    await page.locator('summary').filter({ hasText: 'Préparer un autre contrat' }).click();
    await page.locator('#nouveau-contrat').getByRole('button', { name: 'Commencer le bail', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/baux/${bailId}#etape-bail-1$`));
    expect(await brouillons()).toBe(1);
    // La liste des biens et l’accueil mènent au bail en préparation.
    await page.goto(`/espace/${ORG}/parc`);
    await expect(page.locator(`a[href$="/baux/${bailId}"]`).filter({ hasText: 'Reprendre le bail en préparation' })).toHaveCount(1);
    await page.goto(`/espace/${ORG}`);
    await expect(page.locator(`#taches-proprietaire a[href$="/baux/${bailId}"]`)).toHaveCount(1);
    expect(await debordementHorizontal(page)).toBe(0);
  } finally {
    // Périmètre exclusivement créé par CETTE tentative, jamais le lot du seed.
    await db.query('delete from public.baux where lot_id=$1 and organization_id=$2', [lotId, ORG]);
    await db.query('delete from public.detentions where lot_id=$1 and organization_id=$2', [lotId, ORG]);
    await db.query('delete from public.lots where id=$1 and organization_id=$2', [lotId, ORG]);
    await db.end();
  }
});
