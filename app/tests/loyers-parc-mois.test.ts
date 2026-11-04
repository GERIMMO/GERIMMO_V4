import { describe, expect, it } from 'vitest';
import { resumerLoyersParcMois } from '../src/lib/loyers-parc-mois';
describe('Loyers du mois dans le parc', () => {
 it('distingue le règlement partiel du montant attendu charges comprises', () => {
  expect(resumerLoyersParcMois([{montant_du:'850.50',montant_couvert:'200'},{montant_du:650,montant_couvert:650}])).toEqual({attendu:1500.5,encaisse:850});
 });
 it('ne compte pas un trop-perçu au-delà de son échéance', () => expect(resumerLoyersParcMois([{montant_du:750,montant_couvert:900}])).toEqual({attendu:750,encaisse:750}));
 it('garde un total exact au centime', () => expect(resumerLoyersParcMois([{montant_du:.1,montant_couvert:.1},{montant_du:.2,montant_couvert:.2}])).toEqual({attendu:.3,encaisse:.3}));
 it('reconnaît le mois sans échéance', () => expect(resumerLoyersParcMois([])).toEqual({attendu:0,encaisse:0}));
 it.each(['', 'invalide', -1, Infinity])('refuse un montant illisible : %s', montant => expect(resumerLoyersParcMois([{montant_du:montant,montant_couvert:0}])).toBeNull());
});
