import { destinationSure } from './destination-sure';

export function doitVerifierSecondFacteur(roles: string[], niveau: string | null | undefined) {
  return roles.includes('super_admin') && niveau !== 'aal2';
}

export function destinationApresMfa(suite: string | null | undefined) {
  const destination = destinationSure(suite);
  return destination.startsWith('/securite') || destination.startsWith('/connexion') ? '/espaces' : destination;
}

export function codeTotpValide(code: string) {
  return /^\d{6}$/.test(code);
}
