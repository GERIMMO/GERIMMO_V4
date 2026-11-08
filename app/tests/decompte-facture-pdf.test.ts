import {describe,it,expect} from 'vitest';
import {documentPartFacture} from '@/lib/decompte-facture';
import type {RepartitionFourniture} from '@/lib/proposition-repartition';
describe('PDF informatif de facture',()=>{
 it('isole les parts du bail et ne présente pas de clôture ni demande de règlement',()=>{
  const r={id:'test',motif:'Clé enregistrée',source:{},lignes:[{bail_id:'A',recuperable:true,montant_cents:6000},{bail_id:'B',recuperable:true,montant_cents:4871},{bail_id:'A',recuperable:false,montant_cents:1234}]} as unknown as RepartitionFourniture;
  const pdf=documentPartFacture(r,'A',{bailleur:'SCI fictive',locataire:'Locataire A',logement:'Lot A',adresse:'Adresse fictive',reference:'TEST-1',fournisseur:'Eau test',debut:'2026-10-01',fin:'2026-10-30'});
  expect(pdf.manquants).toEqual([]);expect(pdf.html).toContain('60,00');expect(pdf.html).not.toContain('48,71');expect(pdf.html).not.toContain('12,34');
  expect(pdf.html).toContain('Aucun paiement supplémentaire');expect(pdf.html).toContain('L’exercice reste ouvert');
 });
});
