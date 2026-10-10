import { expect, it } from 'vitest';
import { actualiserControleGeneration } from '@/lib/documents/controle-generation';
it('retire les champs corrigés et le vieux message de refus', () => {
  expect(actualiserControleGeneration({manquants:['DPE'],erreur:'1 champ manquant'}, {manquants:[]})).toEqual({manquants:[],erreur:undefined});
});
it('affiche la liste courante après un enregistrement partiel', () => {
  const res=actualiserControleGeneration({manquants:['DPE','loyer'],erreur:'2 manquants'}, {manquants:['loyer']});
  expect(res?.manquants).toEqual(['loyer']); expect(res?.erreur).not.toContain('2');
});
it('préserve une erreur de génération sans rapport avec la complétude', () => {
  expect(actualiserControleGeneration({erreur:'Stockage indisponible'}, {manquants:[]})).toEqual({erreur:'Stockage indisponible'});
});
it('préserve le lien vers un PDF généré', () => {
  expect(actualiserControleGeneration({documentId:'pdf',manquants:[]}, {manquants:[]})).toEqual({documentId:'pdf',manquants:[]});
});
