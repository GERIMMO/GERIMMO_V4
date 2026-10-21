import { describe, expect, it } from 'vitest';
import { estApercuSuperadminSansMfa } from '../e2e/local/apercu-superadmin.mjs';

const local = {
  NODE_ENV: 'development', SUPALOCAL_APERCU_SUPERADMIN_SANS_MFA: '1',
  SUPALOCAL_DB: 'postgres://postgres@127.0.0.1:55438/gerimmo_ci_comptes_fixes_api',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3102', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54325',
};
const email = 'superadmin@example.com';
describe('Compte fictif de l’aperçu local', () => {
  it('ouvre seulement le compte demandé sur le banc local activé', () => {
    expect(estApercuSuperadminSansMfa(local, email)).toBe(true);
  });
  it.each([
    { NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { SUPALOCAL_APERCU_SUPERADMIN_SANS_MFA: '' },
    { SUPALOCAL_DB: 'postgres://postgres@db.example.com/gerimmo_ci_demo' },
    { SUPALOCAL_DB: 'postgres://postgres@localhost/gerimmo_production' },
    { NEXT_PUBLIC_SITE_URL: 'https://www.gerimmo.app' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
    { SUPALOCAL_DB: '' },
  ])('refuse la configuration hors aperçu : %j', changement => {
    expect(estApercuSuperadminSansMfa({ ...local, ...changement }, email)).toBe(false);
  });
  it('ne donne cette exception à aucun autre compte', () => {
    expect(estApercuSuperadminSansMfa(local, 'admin@gerimmo.app')).toBe(false);
    expect(estApercuSuperadminSansMfa(local, 'proprietaire@example.com')).toBe(false);
  });
});
