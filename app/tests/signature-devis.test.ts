import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {personne} from './fixtures/contexte-document';
import {assemblerSignatureDevis} from '@/lib/signature-devis';
const selection={code:'devis_artisan' as const,cibleId:'11111111-1111-4111-8111-111111111111'};
const rpc=vi.fn();const db={rpc} as unknown as SupabaseClient;
const offre=()=>({id:selection.cibleId,incident_id:'incident',lot_id:'lot',artisan_nom:'Entreprise fictive <test>',version:3,montant_ttc_cents:123456,valide_jusqu_au:'2026-11-01',depose_le:'2026-10-18T12:00:00Z',expire_le:'2026-11-01T22:59:59Z',proprietaires:[{...personne({id:'proprietaire',prenom:'Client',nom:'Fictif',email:'client@example.test',telephone:'+33600000001'}),quote_part:100}],document:{id:'doc',titre:'Offre originale',storage_path:'org/offre.pdf',empreinte:'a'.repeat(64)}});
beforeEach(()=>{rpc.mockReset().mockResolvedValue({data:offre(),error:null});});
describe('Acceptation de devis',()=>{
 it('fait signer le client, conserve la version et annexe le devis sans inventer une signature artisan',async()=>{
  const r=await assemblerSignatureDevis(db,'org',selection);
  expect(rpc).toHaveBeenCalledWith('lire_signature_devis',{p_org:'org',p_devis:selection.cibleId});
  expect(r.signataires.map(s=>s.personId)).toEqual(['proprietaire']);expect(r.manquants).toEqual([]);
  expect(r.bailId).toBeNull();expect(r.incidentId).toBe('incident');expect(r.annexes).toEqual([offre().document]);
  expect(r.document.html).toContain('Version 3');expect(r.document.html).toContain('Entreprise fictive &lt;test&gt;');expect(r.document.html).toContain('aucun paiement automatique');
 });
 it('conserve tous les propriétaires en indivision',async()=>{
  const d=offre();d.proprietaires.push({...d.proprietaires[0],id:'second',prenom:'Autre'});rpc.mockResolvedValue({data:d,error:null});
  const r=await assemblerSignatureDevis(db,'org',selection);expect(r.signataires).toHaveLength(2);
 });
 it('signale des coordonnées incomplètes avant tout envoi',async()=>{
  const d=offre();d.proprietaires[0].telephone=null;rpc.mockResolvedValue({data:d,error:null});
  const r=await assemblerSignatureDevis(db,'org',selection);expect(r.manquants.join()).toMatch(/SMS|téléphone/);
 });
 it('ne fabrique pas une offre lorsque le contrôle d’accès refuse la lecture',async()=>{
  rpc.mockResolvedValue({data:null,error:{message:'Accès refusé'}});await expect(assemblerSignatureDevis(db,'org',selection)).rejects.toThrow('Accès refusé');
 });
 it('invalide la relecture quand le prix ou la version de l’offre change',async()=>{
  const a=await assemblerSignatureDevis(db,'org',selection);const d=offre();d.version++;d.montant_ttc_cents++;rpc.mockResolvedValue({data:d,error:null});
  const b=await assemblerSignatureDevis(db,'org',selection);expect(a.empreinte).not.toBe(b.empreinte);
 });
});
