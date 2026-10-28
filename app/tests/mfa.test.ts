import { describe, expect, it } from 'vitest';
import { codeTotpValide, destinationApresMfa, doitVerifierSecondFacteur } from '@/lib/mfa';
import { totp, encoderBase32 } from '../e2e/local/mfa-local.mjs';
describe('Protection MFA et retour vers la page demandée', () => {
  it('demande un second facteur à la supervision, y compris dans un compte multirôle', () => {
    expect(doitVerifierSecondFacteur(['agent','super_admin'],'aal1')).toBe(true);
    expect(doitVerifierSecondFacteur(['super_admin'],null)).toBe(true);
    expect(doitVerifierSecondFacteur(['super_admin'],'aal2')).toBe(false);
    expect(doitVerifierSecondFacteur(['admin_agence'],'aal1')).toBe(false);
  });
  // Audit final du 27/10 (PUB-01) : un second facteur activé depuis « Mon compte » (nextLevel aal2) est exigé de tout
  // rôle ; sans facteur (nextLevel aal1 ou inconnu), rien ne change ; une session déjà en aal2 passe.
  it('exige le second facteur activé par un propriétaire, un locataire ou un artisan', () => {
    expect(doitVerifierSecondFacteur(['proprietaire_direct'],'aal1','aal2')).toBe(true);
    expect(doitVerifierSecondFacteur(['locataire'],null,'aal2')).toBe(true);
    expect(doitVerifierSecondFacteur(['artisan'],'aal2','aal2')).toBe(false);
    expect(doitVerifierSecondFacteur(['proprietaire_direct'],'aal1','aal1')).toBe(false);
    expect(doitVerifierSecondFacteur(['admin_agence'],'aal1',null)).toBe(false);
    expect(doitVerifierSecondFacteur(['super_admin'],'aal1','aal1')).toBe(true);
  });
  it.each(['12345','1234567','12 456','abcdef','１２３４５６'])('refuse un code mal formé : %s', code => expect(codeTotpValide(code)).toBe(false));
  it('conserve les zéros initiaux', () => expect(codeTotpValide('001234')).toBe(true));
  it('conserve destination et filtres internes, sans boucle de connexion', () => {
    expect(destinationApresMfa('/admin/artisans?statut=en_attente')).toBe('/admin/artisans?statut=en_attente');
    expect(destinationApresMfa('/securite?suite=/admin')).toBe('/espaces');
    expect(destinationApresMfa('/connexion')).toBe('/espaces');
    expect(destinationApresMfa('//exemple.test')).toBe('/espaces');
  });
  // Vecteurs publiés RFC 6238, annexe B, SHA1 à huit chiffres.
  it.each([[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037']])('le banc TOTP respecte le vecteur RFC à %s secondes', (secondes, attendu) => {
    expect(totp(encoderBase32(Buffer.from('12345678901234567890')),Number(secondes)*1000,8)).toBe(attendu);
  });
});
