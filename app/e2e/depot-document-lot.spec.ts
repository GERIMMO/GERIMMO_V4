import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';
import { pdfFictif } from './pdf-fictif';

// AUDIT #264, DOC-05 — « Déposer un document » depuis « Autres documents »
// d'un lot perdait le lot : le document déposé n'apparaissait jamais sur la
// fiche. Le dépôt garde désormais le lot (affiché, décochable), le rattache
// après vérification côté serveur, se referme et revient au lot.
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
  test(`propriétaire : un document déposé depuis la fiche du lot y apparaît à ${largeur}px`, async ({ page }, info) => {
    test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''), 'API fictive locale requise');
    await page.setViewportSize({ width: largeur, height: 900 });
    await page.goto(`/espace/${ORG}/parc`);
    await page.locator('a[data-lot-id]').filter({ hasText: 'Appartement T2' }).first().click();
    await expect(page).toHaveURL(/\/parc\/[0-9a-f-]+\/lots\/[0-9a-f-]+$/);
    const adresseLot = new URL(page.url()).pathname;
    await page.locator('details#documents-lot > summary').click();
    const autres = page.getByRole('region', { name: 'Autres documents', exact: true });
    await autres.getByRole('link', { name: 'Déposer un document', exact: true }).click();

    await expect(page).toHaveURL(/\/documents\?sel=depot&lot=[0-9a-f-]{36}$/);
    await expect(page.getByRole('link', { name: '← Retour au lot', exact: true })).toHaveAttribute('href', `${adresseLot}#documents-lot`);
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Déposer le document', exact: true }) });
    const rattacher = form.getByRole('checkbox', { name: /^Rattacher au lot « .+ »/ });
    await expect(rattacher).toBeChecked();
    const titre = `ESSAI dépôt depuis le lot ${largeur} ${randomUUID().slice(0, 8)}`;
    await form.locator('input[type=file]').setInputFiles({ name: 'essai-depot-lot.pdf', mimeType: 'application/pdf', buffer: pdfFictif() });
    await form.getByLabel('Type de document', { exact: true }).selectOption({ label: 'Autre' });
    await form.locator('summary').filter({ hasText: 'Renommer ou lier à une personne' }).click();
    await form.getByLabel('Nom du document', { exact: true }).fill(titre);
    await form.getByRole('button', { name: 'Déposer le document', exact: true }).click();

    // Le dépôt se referme sur le lot, section Documents ouverte, et le dit.
    await expect(page).toHaveURL(new RegExp(`${adresseLot}#documents-lot$`));
    await expect(page.getByRole('status').filter({ hasText: 'Document déposé et rattaché à « ' })).toBeVisible();
    await expect(page.locator('details#documents-lot')).toHaveAttribute('open', '');
    await expect(autres.getByRole('button', { name: titre, exact: true })).toBeVisible();
    await expect(autres.getByText(/ce lot · déposé le/).first()).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath(`depot-depuis-lot-${largeur}.png`), fullPage: true });
  });
}

test('propriétaire : le lot d’un autre espace n’est pas proposé au dépôt', async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, 'Ce scénario lit un lot d’une autre organisation dans la base API locale.');
  const url = new URL(cible!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error('Base API locale de recette requise');
  const db = new Client({ connectionString: cible });
  await db.connect();
  const { rows: [lot] } = await db.query("select id from public.lots where organization_id <> $1 and etat <> 'archive' limit 1", [ORG]).finally(() => db.end());
  // Lot d'un autre espace dans l'adresse : aucune case de rattachement.
  await page.goto(`/espace/${ORG}/documents?sel=depot&lot=${lot.id}`);
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Déposer le document', exact: true }) });
  await expect(form).toBeVisible();
  await expect(form.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '← Retour aux documents', exact: true })).toBeVisible();
});
