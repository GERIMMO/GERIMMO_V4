import {describe,it,expect} from 'vitest';
import {expliquerRefusIA,messageEtudeIA,ErreurIA} from '../src/lib/erreur-ia';
describe('Diagnostic IA sans réponse brute',()=>{
 it('explique le plafond et ne divulgue pas le message du fournisseur',async()=>{
  const erreur=await expliquerRefusIA(new Response(JSON.stringify({error:{code:'insufficient_quota',message:'secret-test-invisible'}}),{status:429}));
  expect(erreur.message).toContain('plafond');expect(erreur.message).not.toContain('secret-test');
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
