import { test, expect } from '@playwright/test';
import { jourAttestation } from '../src/lib/dates-attestation';

test.use({ storageState: 'e2e/.auth/artisan.json' });
test('attestation : date future refusée et fichier conservé après un rejet', async ({ page }) => {
  await page.goto('/artisan/attestations');
  await page.getByRole('link', { name: 'Déposer : Assurance décennale', exact: true }).click();
  const formulaire = page.locator('form').filter({ has: page.getByRole('button', { name: "Déposer l'attestation", exact: true }) });
  const emission = formulaire.locator('[name="emise_le"]');
  const demain = jourAttestation(new Date(Date.now() + 86400000));
  await expect(emission).toHaveAttribute('max', jourAttestation());
  await emission.fill(demain);
  expect(await emission.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true);
  await emission.fill(jourAttestation());
  await formulaire.locator('[name="expire_le"]').fill(demain);
  const fichier = formulaire.locator('input[type="file"]');
  await fichier.setInputFiles({ name: 'document-invalide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Ceci est un texte, pas un PDF.') });
  await expect(formulaire.getByText('document-invalide.pdf', { exact: true })).toBeVisible();
  await formulaire.getByRole('button', { name: "Déposer l'attestation", exact: true }).click();
  await expect(formulaire.getByRole('alert')).toBeVisible();
  await expect(formulaire.getByText('document-invalide.pdf', { exact: true })).toBeVisible();
  expect(await fichier.evaluate((el: HTMLInputElement) => el.files?.length)).toBe(1);
});

// G-40 (recette du 11/11/2026) : une attestation déjà expirée était acceptée et remplaçait la version encore valable.
test('attestation : fin de validité passée refusée par le formulaire ET par le serveur, la pièce en place reste', async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  const pieces = async () => {
    if (!cible) return null;
    const { Client } = await import('pg');
    const db = new Client({ connectionString: cible }); await db.connect();
    try {
      // Pièces de l'artisan de démonstration (artisan.alpha) : aucune ne doit être ajoutée ni retirée par un dépôt refusé.
      return (await db.query("select count(*)::int as total, count(*) filter (where ap.retiree_le is null)::int as en_place from public.artisan_pieces ap join public.artisans a on a.id = ap.artisan_id join auth.users u on u.id = a.account_id where u.email = 'artisan.alpha@example.com'")).rows[0];
    } catch { return null; } finally { await db.end(); }
  };
  const avant = await pieces();
  await page.goto('/artisan/attestations');
  await page.getByRole('link', { name: 'Déposer : Assurance décennale', exact: true }).click();
  const formulaire = page.locator('form').filter({ has: page.getByRole('button', { name: "Déposer l'attestation", exact: true }) });
  const fin = formulaire.locator('[name="expire_le"]');
  const hier = jourAttestation(new Date(Date.now() - 86400000));
  // Formulaire : le champ refuse une date antérieure à aujourd'hui.
  await expect(fin).toHaveAttribute('min', jourAttestation());
  await fin.fill(hier);
  expect(await fin.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
  // Serveur : même sans le contrôle du navigateur, le dépôt est refusé avec un message clair.
  await fin.evaluate((el: HTMLInputElement) => el.removeAttribute('min'));
  await formulaire.locator('input[type="file"]').setInputFiles({ name: 'decennale-expiree.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await formulaire.getByRole('button', { name: "Déposer l'attestation", exact: true }).click();
  await expect(formulaire.getByRole('alert')).toContainText('n’est plus valable depuis le');
  await expect(formulaire.getByRole('alert')).toContainText('la précédente reste en place');
  if (avant) expect(await pieces()).toEqual(avant);
});
