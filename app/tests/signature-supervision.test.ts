import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signatureOrganisation } from '@/lib/documents/modeles/communs';
import { enregistrerSignature, retirerSignature } from '@/app/actions/signature';
const m=vi.hoisted(()=>({acces:vi.fn(),revalider:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>({verifierGerant:m.acces}));
vi.mock('next/cache',()=>({revalidatePath:m.revalider}));
beforeEach(()=>vi.clearAllMocks());
function client(autorise:boolean,erreur=false){
 const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:vi.fn(async()=>({data:{signature_path:'org/signature.png'},error:null}))};
 const download=vi.fn(async()=>({data:new Blob([new Uint8Array([1,2,3])]),error:null}));
 const c={rpc:vi.fn(async(...args:unknown[])=>{void args;return {data:autorise,error:erreur?{message:'panne'}:null};}),from:vi.fn(()=>q),storage:{from:vi.fn(()=>({download}))}};
 m.acces.mockResolvedValue({supabase:c,user:{id:'compte'},role:'admin_agence'});return{c,download};
}
describe('Apposition de signature et actions de profil',()=>{
 it('ne charge aucune image avec le rôle virtuel de supervision',async()=>{
  const {c,download}=client(false);expect(await signatureOrganisation(c as unknown as SupabaseClient,'org')).toBeNull();expect(c.from).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
 });
 it('un échec du contrôle des droits fait échouer explicitement la génération',async()=>{
  const {c,download}=client(false,true);await expect(signatureOrganisation(c as unknown as SupabaseClient,'org')).rejects.toThrow(/vérifier le droit/);expect(download).not.toHaveBeenCalled();
 });
 it('charge la signature pour un émetteur autorisé',async()=>{
  const {c,download}=client(true);expect(await signatureOrganisation(c as unknown as SupabaseClient,'org')).toBe('data:image/png;base64,AQID');expect(download).toHaveBeenCalledWith('org/signature.png');
 });
 it.each([false,true])('refuse le dépôt et le retrait avant stockage ou écriture si le contrôle est refusé ou échoue (%s)',async erreur=>{
  const {c}=client(false,erreur);expect(await enregistrerSignature('org',{},new FormData())).toHaveProperty('erreur');expect(await retirerSignature('org')).toHaveProperty('erreur');expect(c.storage.from).not.toHaveBeenCalled();expect(c.rpc.mock.calls.every(args=>args[0]==='has_org_role')).toBe(true);expect(m.revalider).not.toHaveBeenCalled();
 });
 it('laisse le responsable retirer sa signature',async()=>{
  const {c}=client(true);expect(await retirerSignature('org')).toHaveProperty('succes');expect(c.rpc).toHaveBeenLastCalledWith('definir_signature_organisation',{p_org:'org',p_path:null});
 });
});
