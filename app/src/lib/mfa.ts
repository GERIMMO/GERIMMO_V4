import { destinationSure } from './destination-sure';

export function doitVerifierSecondFacteur(roles: string[], niveau: string | null | undefined) {
  return roles.includes('super_admin') && niveau !== 'aal2';
}

/**
 * La supervision est ouverte : adhésion `super_admin` active ET second facteur validé (AAL2).
 * C'est, terme pour terme, `public.is_super_admin()` (migration 20260914160000) : le proxy s'en sert
 * pour garder `/admin/*` avant tout rendu (audit du 13/10, PRF-04, D44). L'équivalence avec la
 * fonction SQL est tenue par `tests/proxy-garde-admin-base.test.ts`.
 */
export function estSuperviseurActif(roles: string[], niveau: string | null | undefined) {
  return roles.includes('super_admin') && niveau === 'aal2';
}

export function destinationApresMfa(suite: string | null | undefined) {
  const destination = destinationSure(suite);
  return destination.startsWith('/securite') || destination.startsWith('/connexion') ? '/espaces' : destination;
}

export function codeTotpValide(code: string) {
  return /^\d{6}$/.test(code);
}
