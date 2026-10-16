import { type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, contextePersona, debordementHorizontal } from './outils';
import { avecBaseRecette, preparerDossierIncident } from './fixtures-metier';

// D18/D22 : vrais gestes navigateur sur les seuls dossiers du passage autonome.
// Les comptes, les documents et les journaux sont retirés par la purge du chantier.
// Aucune trace ou session dans les artefacts ; captures seulement sur opt-in local fictif.
test.use({ persona: 'artisan', trace: 'off', screenshot: 'off' });
const PARCOURS = { tag: '@parcours-metier' };
async function autrePersona(browser: Browser, persona: 'admin' | 'locataire') {
  const context = await contextePersona(browser, persona);
  return { context, page: await context.newPage() };
}
async function etape(page: Page, n: number) {
  const select = page.getByLabel('Aller à une étape', { exact: true });
  if (await select.isVisible()) await select.selectOption(String(n - 1));
  else await page.getByRole('button', { name: new RegExp(`^Étape ${n} :`) }).click();
}
const empreinte = (octets: Buffer) => createHash('sha256').update(octets).digest('hex');

async function capturerEcranFictif(page: Page, nom: string) {
  const dossier = process.env.RECETTE_CAPTURES_METIER;
  if (!dossier) return;
  // Opt-in du passage local de revue visuelle ; jamais de trace ni d'état Auth.
  if (!['localhost', '127.0.0.1'].includes(new URL(page.url()).hostname)) throw new Error('Captures métier réservées au banc local fictif.');
  await mkdir(dossier, { recursive: true });
  const taille = page.viewportSize();
  try {
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: resolve(dossier, `${nom}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  } finally { if (taille) await page.setViewportSize(taille); }
}

async function validerVersion(page: Page, sollicitation: string, montant: string, version: number) {
  await page.goto(`/artisan/devis/${sollicitation}`);
  await expect(page.getByRole('textbox', { name: 'Votre diagnostic', exact: true })).toBeVisible();
  if (version > 1) await page.locator('[name="note_revision"]').fill('Prix du joint revu et main-d’œuvre détaillée pour cette nouvelle version.');
  await page.getByRole('textbox', { name: 'Votre diagnostic', exact: true }).fill('Joint du robinet usé, remplacement nécessaire — dossier fictif de recette.');
  await page.getByLabel('Ligne 1 : prestation', { exact: true }).fill('Remplacement du joint et contrôle de la fuite');
  await page.getByLabel('Ligne 1 : quantité', { exact: true }).fill('1');
  await page.getByLabel('Ligne 1 : prix unitaire HT', { exact: true }).fill(montant);
  await page.getByLabel('Ligne 1 : TVA', { exact: true }).selectOption('1000');
  await etape(page, 2);
  await page.getByLabel('Délai avant intervention', { exact: true }).fill('Sous cinq jours');
  await page.getByLabel('Durée estimée', { exact: true }).fill('Une heure');
  await etape(page, 3);
  await page.locator('[name="validation_artisan"]').check();
  const validation = page.waitForResponse(r => new URL(r.url()).pathname === `/api/devis/${sollicitation}/pdf` && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Valider et générer le PDF', exact: true }).click();
  const reponse = await validation;
  expect(reponse.status(), 'Validation du PDF réel').toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'PDF validé et enregistré. Passez' })).toBeVisible();
  // Lire l'objet enregistré par la route utilisée par « Ouvrir mon devis PDF » :
  // le contrôle porte ainsi sur le document persistant, puis sur ses archives.
  const preparation = await page.request.get(`/api/devis/${sollicitation}/pdf?preparation=1`);
  expect(preparation.status(), 'Lecture du PDF validé et enregistré').toBe(200);
  expect(preparation.headers()['content-type']).toContain('application/pdf');
  const pdf = await preparation.body();
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
  await etape(page, 4);
  return pdf;
}

test('D18 : demande de révision, version 2 et PDF des deux versions conservés', PARCOURS, async ({ page, browser }) => {
  test.skip(process.env.RECETTE_AUTONOME !== '1', 'Chantier autonome avec purge requis.');
  test.setTimeout(240_000);
  const dossier = await avecBaseRecette(async base => {
    const d = await preparerDossierIncident(base, 'd18');
    await base.db.query("insert into public.artisan_profils_documents(artisan_id,adresse,mentions) values($1,'2 rue de la Recette, 69001 Lyon','Entreprise fictive de recette') on conflict(artisan_id) do update set adresse=excluded.adresse,mentions=excluded.mentions", [base.artisanId]);
    await base.db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [base.gerantId]);
    await base.db.query('set local role authenticated');
    const consultation = (await base.db.query("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',false,30) id", [d.orgId, d.incidentId])).rows[0].id;
    const sollicitation = (await base.db.query('select public.solliciter_artisan($1,$2,$3) id', [d.orgId, consultation, d.artisanId])).rows[0].id as string;
    await base.db.query('reset role');
    // Un brouillon déterministe évite tout appel de proposition IA. Le navigateur saisit et valide les deux versions.
    const validite = (await base.db.query("select to_char(public.aujourdhui_paris()+30,'YYYY-MM-DD') jour")).rows[0].jour;
    await base.db.query('insert into public.artisan_devis_preparations(sollicitation_id,artisan_id,saisie,revision) values($1,$2,$3,1)', [sollicitation, d.artisanId, { diagnostic: 'Diagnostic fictif', delai: '', duree: '', contraintes: '', observations: '', valideJusquAu: validite, lignes: [{ code: '', libelle: 'Joint fictif', quantite: 1, prix_unitaire_ht_cents: 5000, tva_bps: 1000 }] }]);
    return { ...d, sollicitation };
  });
  const gerant = await autrePersona(browser, 'admin');
  try {
    const pdf1 = await validerVersion(page, dossier.sollicitation, '100,00', 1);
    // Le client ne doit pas voir la préparation avant l'envoi explicite.
    expect((await gerant.page.request.get(`/api/devis/${dossier.sollicitation}/pdf?version=1`)).status()).toBe(403);
    await page.getByRole('button', { name: 'Envoyer le devis par e-mail', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/artisan/devis/${dossier.sollicitation}\\?envoye=1&email=`));
    const v1 = await avecBaseRecette(async ({ db }) => (await db.query('select id,version,statut from public.incident_devis where sollicitation_id=$1', [dossier.sollicitation])).rows);
    expect(v1).toHaveLength(1); expect(v1[0]).toMatchObject({ version: 1, statut: 'depose' });
    const archive1 = await gerant.page.request.get(`/api/devis/${dossier.sollicitation}/pdf?version=1`);
    expect(archive1.status()).toBe(200); expect(empreinte(await archive1.body())).toBe(empreinte(pdf1));

    await gerant.page.goto(`/agence/${dossier.orgId}/incidents?sel=${dossier.incidentId}`);
    await gerant.page.getByRole('button', { name: /^Demander une révision/ }).click();
    await gerant.page.getByRole('textbox', { name: /Ce que vous demandez/ }).fill('Merci de revoir le prix du joint et de détailler la main-d’œuvre.');
    await gerant.page.getByRole('button', { name: /^Confirmer la demande de révision/ }).click();
    await expect.poll(() => avecBaseRecette(async ({ db }) => (await db.query('select statut from public.incident_sollicitations where id=$1', [dossier.sollicitation])).rows[0].statut)).toBe('revision_demandee');

    const pdf2 = await validerVersion(page, dossier.sollicitation, '80,00', 2);
    // Une nouvelle préparation ne remplace jamais les octets de la version déjà envoyée.
    const pendantRevision = await gerant.page.request.get(`/api/devis/${dossier.sollicitation}/pdf?version=1`);
    expect(pendantRevision.status()).toBe(200); expect(empreinte(await pendantRevision.body())).toBe(empreinte(pdf1));
    expect((await gerant.page.request.get(`/api/devis/${dossier.sollicitation}/pdf?version=2`)).status()).toBe(403);
    await page.getByRole('button', { name: 'Envoyer la version 2', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/artisan/devis/${dossier.sollicitation}\\?envoye=1&email=`));
    await expect(page.locator('[data-version-devis="1"]')).toContainText('Révision demandée par le client');
    await expect(page.locator('[data-version-devis="2"]')).toContainText('Prix du joint revu');
    const versions = await avecBaseRecette(async ({ db }) => (await db.query('select version,statut,montant_ttc_cents from public.incident_devis where sollicitation_id=$1 order by version', [dossier.sollicitation])).rows);
    expect(versions.map(v => [v.version, v.statut, String(v.montant_ttc_cents)])).toEqual([[1, 'revise', '11000'], [2, 'depose', '8800']]);
    for (const [version, pdf] of [[1, pdf1], [2, pdf2]] as const) {
      const archive = await gerant.page.request.get(`/api/devis/${dossier.sollicitation}/pdf?version=${version}`);
      expect(archive.status()).toBe(200); expect(empreinte(await archive.body())).toBe(empreinte(pdf));
    }
    expect(empreinte(pdf1)).not.toBe(empreinte(pdf2));
    await capturerEcranFictif(page, 'devis-revision-historique');
  } finally { await gerant.context.close(); }
});

test('D22 : report accepté, annulation immédiate et accusé artisan non bloquant', PARCOURS, async ({ page, browser }) => {
  test.skip(process.env.RECETTE_AUTONOME !== '1', 'Chantier autonome avec purge requis.');
  test.setTimeout(180_000);
  const dossier = await avecBaseRecette(async base => {
    const d = await preparerDossierIncident(base, 'd22');
    const mission = (await base.db.query("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id", [d.orgId, d.incidentId, d.artisanId])).rows[0].id as string;
    const creneau = (await base.db.query("insert into public.intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin) values($1,$2,'artisan',1,((public.aujourdhui_paris()+5)+time '08:00') at time zone 'Europe/Paris',((public.aujourdhui_paris()+5)+time '12:00') at time zone 'Europe/Paris') returning id", [d.orgId, mission])).rows[0].id;
    await base.db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal1')::text,true)", [base.locataireCompteId]);
    await base.db.query('set local role authenticated');
    await base.db.query('select public.choisir_creneau($1,$2)', [d.orgId, creneau]);
    await base.db.query('reset role');
    const dates = (await base.db.query("select to_char(public.aujourdhui_paris()+n,'YYYY-MM-DD') jour from generate_series(8,10) n")).rows.map(r => r.jour as string);
    const initial = (await base.db.query('select debut_prevu from public.incident_interventions where id=$1', [mission])).rows[0].debut_prevu.toISOString() as string;
    return { ...d, mission, dates, initial };
  });
  const locataire = await autrePersona(browser, 'locataire');
  const demande = locataire.page.locator(`#demande-${dossier.incidentId}`);
  const etatMission = () => avecBaseRecette(async ({ db }) => (await db.query('select statut,debut_prevu from public.incident_interventions where id=$1', [dossier.mission])).rows[0]);
  try {
    await locataire.page.goto(`/locataire/${dossier.orgId}/demandes#demande-${dossier.incidentId}`);
    await demande.getByRole('button', { name: 'Je ne peux plus être là', exact: true }).click();
    await demande.getByRole('button', { name: 'Demander un report', exact: true }).click();
    await demande.locator('select[name="motif"]').selectOption('travail');
    for (let i = 0; i < 3; i++) await demande.locator(`[name="date-${i}"]`).fill(dossier.dates[i]);
    await demande.getByRole('button', { name: "Envoyer à l'artisan", exact: true }).click();
    await expect.poll(() => avecBaseRecette(async ({ db }) => (await db.query("select count(*)::int n from public.intervention_demandes_rdv where intervention_id=$1 and type='report' and statut='en_attente'", [dossier.mission])).rows[0].n)).toBe(1);
    expect((await etatMission()).debut_prevu.toISOString()).toBe(dossier.initial);
    await page.goto('/artisan/agenda');
    await expect(page.getByText('Report demandé · rendez-vous maintenu', { exact: true })).toBeVisible();
    await page.goto(`/artisan/missions/${dossier.mission}`);
    await expect(page.getByText('Le locataire demande un report', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Je retiens cette date', exact: true }).first().click();
    await expect.poll(() => avecBaseRecette(async ({ db }) => (await db.query("select statut from public.intervention_demandes_rdv where intervention_id=$1 and type='report'", [dossier.mission])).rows[0].statut)).toBe('acceptee');
    const apresReport = await etatMission(); expect(apresReport.statut).toBe('planifiee'); expect(apresReport.debut_prevu.toISOString()).not.toBe(dossier.initial);

    await locataire.page.reload();
    await demande.getByRole('button', { name: 'Je ne peux plus être là', exact: true }).click();
    await demande.getByRole('button', { name: 'Annuler le rendez-vous', exact: true }).click();
    await demande.locator('select[name="motif"]').selectOption('empechement');
    await expect(demande.getByRole('button', { name: 'Annuler le rendez-vous', exact: true })).toBeDisabled();
    await demande.locator('[name="confirmation"]').check();
    await demande.getByRole('button', { name: 'Annuler le rendez-vous', exact: true }).click();
    await expect.poll(() => etatMission()).toMatchObject({ statut: 'acceptee', debut_prevu: null });
    await page.goto('/artisan/agenda');
    await expect(page.getByText('Rendez-vous annulé par le locataire', { exact: true })).toBeVisible();
    await capturerEcranFictif(page, 'agenda-rendez-vous-annule');
    await page.goto(`/artisan/missions/${dossier.mission}`);
    await expect(page.getByRole('button', { name: 'J’en prends acte', exact: true })).toBeVisible();
    // L'accusé ne conditionne pas l'accès à la proposition de nouveaux rendez-vous.
    await page.getByRole('link', { name: 'Proposer des créneaux', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/artisan/missions/${dossier.mission}/creneaux$`));
    await page.goto(`/artisan/missions/${dossier.mission}`);
    await page.getByRole('button', { name: 'J’en prends acte', exact: true }).click();
    await expect.poll(() => avecBaseRecette(async ({ db }) => (await db.query("select annulation_vue_le is not null vue from public.intervention_demandes_rdv where intervention_id=$1 and type='annulation'", [dossier.mission])).rows[0].vue)).toBe(true);
    await page.reload();
    await expect(page.getByText(/Vous avez pris acte/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'J’en prends acte', exact: true })).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
  } finally { await locataire.context.close(); }
});
