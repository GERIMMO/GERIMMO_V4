import { test, expect } from '@playwright/test';
import { jourAttestation } from '../src/lib/dates-attestation';

test.use({ storageState: 'e2e/.auth/artisan.json' });
test('attestation : date future refusée et fichier effacé clairement après un rejet', async ({ page }) => {
  await page.goto('/artisan/attestations');
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
  await expect(formulaire.getByText('Aucun fichier choisi', { exact: true })).toBeVisible();
  expect(await fichier.evaluate((el: HTMLInputElement) => el.files?.length)).toBe(0);
});
