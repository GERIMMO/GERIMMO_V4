import { afterEach, expect, it, vi } from 'vitest';
import { circuitAdmisPilote } from '../src/lib/perimetre-pilote';
import type { ChargeCourriel } from '../src/lib/reprise-courriels';

afterEach(() => vi.unstubAllEnvs());
const jour = '2026-11-16';
const uuid = 'b43f9f32-46f7-4b10-8013-b3fddd5771af';
function alerte(categorie: string, id: string): ChargeCourriel {
  return { to: 'chef@example.test', subject: 'Alerte', html: '<p>Alerte</p>', contexteMetier: { type: 'alerte_direction', categorie, id } } as ChargeCourriel;
}
it('admet les seuls circuits de direction documentés et les adresses de relais configurées', () => {
  vi.stubEnv('GERIMMO_RELAIS_EMAILS', 'Chef@example.test');
  for (const p of [alerte('quotidienne', jour), alerte('urgence', uuid), alerte('contrat', 'a'.repeat(64))]) {
    expect(circuitAdmisPilote(p)).toBe(true);
    expect(circuitAdmisPilote({ ...p, to: 'autre@example.test' })).toBe(false);
    expect(circuitAdmisPilote({ ...p, organisationId: uuid })).toBe(false);
    expect(circuitAdmisPilote({ ...p, piecesJointes: [{ nom: 'piece.pdf', contenuBase64: 'AA==' }] })).toBe(false);
  }
  expect(circuitAdmisPilote(alerte('inconnue', uuid))).toBe(false);
  expect(circuitAdmisPilote(alerte('quotidienne', uuid))).toBe(false);
});
it('réserve le report aux intentions transactionnelles et aux rôles concernés', () => {
 const p:ChargeCourriel={to:'artisan@example.test',subject:'Report',html:'Avis',organisationId:uuid,contexteMetier:{type:'notification',id:uuid,source:uuid,evenement:'rdv_report_demande',role:'artisan'}};
 expect(circuitAdmisPilote(p)).toBe(true);
 expect(circuitAdmisPilote({...p,contexteMetier:{...p.contexteMetier!,source:undefined}})).toBe(false);
 expect(circuitAdmisPilote({...p,contexteMetier:{type:'notification',id:uuid,source:uuid,evenement:'rdv_report_demande',role:'locataire'}})).toBe(false);
});
