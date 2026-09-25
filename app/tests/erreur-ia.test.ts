import {describe,it,expect} from 'vitest';
import {expliquerRefusIA,messageEtudeIA,ErreurIA} from '../src/lib/erreur-ia';
describe('Diagnostic IA sans réponse brute',()=>{
 it('explique le plafond et ne divulgue pas le message du fournisseur',async()=>{
  const erreur=await expliquerRefusIA(new Response(JSON.stringify({error:{code:'insufficient_quota',message:'secret-test-invisible'}}),{status:429}));
  expect(erreur.message).toContain('plafond');expect(erreur.message).not.toContain('secret-test');
 });
 it.each([
  ['credit_balance_exhausted', 'plus de crédit'],
  ['organization_spend_limit_exceeded', 'plafond de dépenses'],
  ['project_spend_limit_exceeded', 'plafond de dépenses'],
  ['organization_usage_limit_exceeded', 'plafond d’utilisation'],
 ])('explique le blocage %s sans conseiller des relances inutiles',async(code,attendu)=>{
  const e=await expliquerRefusIA(new Response(JSON.stringify({error:{code,type:'insufficient_quota',message:'secret-test-invisible'}}),{status:429}));
  expect(e.message).toContain(attendu);expect(e.message).not.toContain('trop de demandes');expect(e.message).not.toContain('secret-test');
 });
 it('reconnaît aussi le type de quota sans code connu',async()=>{
  const e=await expliquerRefusIA(new Response(JSON.stringify({error:{type:'insufficient_quota'}}),{status:429}));
  expect(e.message).toContain('facturation');
 });
 it('réserve le message de ralentissement aux autres erreurs 429',async()=>{
  const e=await expliquerRefusIA(new Response(JSON.stringify({error:{type:'rate_limit_error',code:'slow_down'}}),{status:429}));
  expect(e.message).toContain('trop de demandes');
 });
 it('distingue accès et indisponibilité',async()=>{
  expect((await expliquerRefusIA(new Response('{}',{status:403}))).message).toContain('autorisation');
  expect((await expliquerRefusIA(new Response('bad gateway',{status:502}))).message).toContain('indisponible');
 });
 it('ne conserve que les messages construits par Gerimmo',()=>{
  expect(messageEtudeIA(new Error('secret-test-invisible'))).not.toContain('secret-test');
  expect(messageEtudeIA(new ErreurIA('Connexion à vérifier.'))).toBe('Connexion à vérifier.');
 });
});
