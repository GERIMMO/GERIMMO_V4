import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const m=vi.hoisted(()=>({lire:vi.fn(),rappeler:vi.fn(),retrouver:vi.fn(),garde:vi.fn()}));
vi.mock('@/lib/zoho-sign',()=>({lireDemandeZoho:m.lire,rappelerDemandeZoho:m.rappeler,retrouverBrouillonZoho:m.retrouver}));
vi.mock('@/lib/controle-effets',()=>({verifierAvantEffet:m.garde}));
import {relancerSignature,rapprocherSignatureInterrompue} from '@/lib/signature-suivi';
const config={prestataire:'zoho' as const,environnement:'sandbox' as const,clientId:'test',clientSecret:'test',refreshToken:'test'};
const email=['fictif','exemple.invalid'].join('@');
const actif={ZOHO_SIGN_RELANCES_ACTIVES:'true'};
function base(partiel:Record<string,unknown>={}) {
 const circuit={id:'circuit',created_by:'compte',organization_id:'org',prestataire:'zoho',environnement:'sandbox',etat:'en_cours',external_request_id:'req',signataires:[{externalId:'s1',email}],envoye_le:new Date(Date.now()-8*86400000).toISOString(),expire_le:new Date(Date.now()+20*86400000).toISOString(),...partiel};
 let reserve=false;const updates:unknown[]=[];const filtres:unknown[]=[];
 const rpc=vi.fn(async(n:string)=>{if(n==='reserver_relance_signature'){if(reserve)return {data:false};reserve=true;}return {data:true};});
 const from=vi.fn((table:string)=>{let mutation=false;const q={select:()=>q,eq:(...args:unknown[])=>{filtres.push(args);return q;},is:()=>q,in:()=>q,update:(v:unknown)=>{updates.push(v);mutation=true;return q;},insert:vi.fn(async()=>({error:null})),single:async()=>({data:mutation?(table==='signature_suivi_actions'?{cle:'j7'}:{id:'circuit'}):circuit}),then:(resolve:(v:unknown)=>void)=>Promise.resolve({error:null}).then(resolve)};return q;});
 return {db:{rpc,from} as unknown as SupabaseClient,rpc,updates,filtres,circuit};
}
beforeEach(()=>{vi.resetAllMocks();m.garde.mockResolvedValue(undefined);m.lire.mockResolvedValue({id:'req',external_id:'circuit',status:'ongoing',signers:[{id:'s1',email,status:'notified'}]});m.rappeler.mockResolvedValue(undefined);m.retrouver.mockResolvedValue({demandeId:'req',documentId:'doc',signataireIds:['s1']});});
describe('Rappels sans double invitation',()=>{
 it('reste fermé par défaut',async()=>{const b=base();expect(await relancerSignature(b.db,config,'circuit',{})).toBe(false);expect(b.rpc).not.toHaveBeenCalled();expect(m.rappeler).not.toHaveBeenCalled();});
 it('ne fait qu’un POST après réservation, même rejoué',async()=>{const b=base();expect(await relancerSignature(b.db,config,'circuit',actif)).toBe(true);expect(await relancerSignature(b.db,config,'circuit',actif)).toBe(false);expect(m.rappeler).toHaveBeenCalledTimes(1);expect(b.updates).toContainEqual(expect.objectContaining({etat:'confirme'}));expect(b.filtres).toContainEqual(['cle','j7']);});
 it('une réponse perdue ne provoque pas de nouvelle invitation',async()=>{m.rappeler.mockRejectedValueOnce(Error('réseau'));const b=base();await expect(relancerSignature(b.db,config,'circuit',actif)).rejects.toThrow('réseau');expect(await relancerSignature(b.db,config,'circuit',actif)).toBe(false);expect(m.rappeler).toHaveBeenCalledTimes(1);expect(b.updates).not.toContainEqual(expect.objectContaining({etat:'confirme'}));});
 it.each([1,2,3])('respecte l’arrêt au contrôle %s',async n=>{let appels=0;m.garde.mockImplementation(async()=>{if(++appels===n)throw Error('arrêt');});const b=base();await expect(relancerSignature(b.db,config,'circuit',actif)).rejects.toThrow('arrêt');expect(m.rappeler).not.toHaveBeenCalled();expect(b.updates.at(-1)).toEqual({verrou_jeton:null,verrou_jusqua:null});});
 it('un arrêt après OAuth conserve la réservation et interdit tout renvoi',async()=>{
  let controles=0;m.garde.mockImplementation(async()=>{if(++controles===4)throw Error('arrêt après OAuth');});
  m.rappeler.mockImplementationOnce(async(_c:unknown,_id:string,garde:()=>Promise<void>)=>{await garde();});
  const b=base();await expect(relancerSignature(b.db,config,'circuit',actif)).rejects.toThrow('arrêt après OAuth');
  expect(b.updates).not.toContainEqual(expect.objectContaining({etat:'confirme'}));
  expect(await relancerSignature(b.db,config,'circuit',actif)).toBe(false);expect(m.rappeler).toHaveBeenCalledTimes(1);
 });
 it.each(['done','expired','declined'])('ne rappelle pas une demande distante %s',async status=>{m.lire.mockResolvedValue({...await m.lire(),status});const b=base();expect(await relancerSignature(b.db,config,'circuit',actif)).toBe(false);expect(m.rappeler).not.toHaveBeenCalled();});
 it('refuse un destinataire modifié',async()=>{m.lire.mockResolvedValue({...await m.lire(),signers:[{id:'s1',email:['autre','exemple.invalid'].join('@'),status:'notified'}]});const b=base();await expect(relancerSignature(b.db,config,'circuit',actif)).rejects.toThrow('destinataires');expect(m.rappeler).not.toHaveBeenCalled();});
 it('refuse le mélange de connexions',async()=>{const b=base({environnement:'production'});await expect(relancerSignature(b.db,config,'circuit',actif)).rejects.toThrow('connexion');expect(m.lire).not.toHaveBeenCalled();});
 it('refuse un verrou occupé',async()=>{const b=base();b.rpc.mockResolvedValueOnce({data:false});await expect(relancerSignature(b.db,config,'circuit',actif)).rejects.toThrow('instant');expect(m.lire).not.toHaveBeenCalled();});
});
describe('Récupération du brouillon',()=>{
 it('rattache les identifiants et leur trace ensemble sans activer la demande',async()=>{const b=base({etat:'a_verifier',external_request_id:null});expect(await rapprocherSignatureInterrompue(b.db,config,'circuit')).toBe(true);expect(b.rpc).toHaveBeenCalledWith('rapprocher_brouillon_signature',expect.objectContaining({p_demande:'req',p_signataires:['s1']}));expect(m.rappeler).not.toHaveBeenCalled();});
 it('ne touche pas une demande déjà connue',async()=>{const b=base();expect(await rapprocherSignatureInterrompue(b.db,config,'circuit')).toBe(false);expect(m.retrouver).not.toHaveBeenCalled();});
 it('ne suppose rien quand la recherche échoue',async()=>{m.retrouver.mockRejectedValue(Error('ambigu'));const b=base({etat:'preparation',external_request_id:null});await expect(rapprocherSignatureInterrompue(b.db,config,'circuit')).rejects.toThrow('ambigu');expect(b.updates).toEqual([{verrou_jeton:null,verrou_jusqua:null}]);});
});
