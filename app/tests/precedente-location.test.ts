import { expect, it } from 'vitest';
import { contexte } from './fixtures/contexte-document';
import { encadrementLocation } from '@/lib/documents/modeles/mentions-location';
import { Fusion } from '@/lib/documents/gabarit';
function rendre(situation: string | null, revise: boolean | null = null, date: string | null = null) {
  const ctx = contexte();
  Object.assign(ctx.bail, { encadrement_loyer: false, precedente_location: situation, precedent_loyer_revise: revise, dernier_loyer: null, dernier_loyer_versement: null, dernier_loyer_revision: date });
  const f = new Fusion();
  const html = encadrementLocation(ctx, f);
  return {html, f};
}
it.each(['premiere', 'ancienne'])('ne réclame pas un ancien loyer pour %s', situation => {
  const { html } = rendre(situation);
  expect(html).not.toContain('dernier loyer si départ');
  expect(html).not.toContain('date du dernier versement si applicable');
  expect(html).not.toContain('date de dernière révision si applicable');
});
it('demande une confirmation si la situation est inconnue', () => {
  expect(rendre(null).html).toContain('situation de la précédente location à confirmer');
});
it('demande le montant et le versement pour une location récente', () => {
  const { html } = rendre('recente', false);
  expect(html).toContain('dernier loyer si départ depuis moins de 18 mois');
  expect(html).toContain('date du dernier versement si applicable');
  expect(html).toContain('Ce loyer n’a pas été révisé');
  expect(html).not.toContain('date de dernière révision si applicable');
});
it('exige la date uniquement si une révision est déclarée', () => {
  expect(rendre('recente', true).html).toContain('date de dernière révision si applicable');
  expect(rendre('recente', true, '2025-01-01').html).not.toContain('date de dernière révision si applicable');
});
it('ne transforme pas une réponse inconnue en absence de révision', () => {
  expect(rendre('recente').html).toContain('révision du précédent loyer à confirmer');
});
