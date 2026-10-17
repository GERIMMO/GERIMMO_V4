import { describe, expect, it, vi } from 'vitest';
import { envoyerRelancesInvitations } from '@/lib/relances-invitations';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('@/lib/lien-mot-de-passe',()=>({envoyerRappelInvitationLocataire:vi.fn(),LIMITE_INVITATIONS_PAR_ORGANISATION:30}));
const maintenant=new Date('2026-10-16T10:00:00Z');
const dues=[1,2].map(n=>({invitation_id:`inv-${n}`,organization_id:'org',email:`delivered+relance-${n}@resend.dev`,rang:1,expire_le:'2026-11-01T12:00:00Z'}));
function contexte(ralentir?:()=>void){
 const rpc=vi.fn(async(n:string)=>{
  if(n==='invitations_locataires_relances_dues')return {data:dues,error:null};
  if(n==='reserver_relance_invitation_locataire')ralentir?.();
  return {data:true,error:null};
 });
 return {rpc,db:{rpc} as unknown as SupabaseClient};
}
describe('relances : échéance absolue de la mission',()=>{
 it('une passe tardive ne gagne pas soixante secondes supplémentaires',async()=>{
  let temps=150_000;const c=contexte();const expedier=vi.fn(async(p)=>{expect(p.echeanceMs).toBe(160_000);temps=160_001;return {envoye:true as const};});
  const r=await envoyerRelancesInvitations(c.db,{maintenant,echeanceMs:160_000,horloge:()=>temps,expedier});
  expect(r).toMatchObject({envoyees:1,restantes:1});expect(expedier).toHaveBeenCalledTimes(1);
 });
 it('une réservation lente est rendue sans fabriquer de lien ni envoyer',async()=>{
  let temps=150_000;const c=contexte(()=>{temps=160_001;});const expedier=vi.fn();
  const r=await envoyerRelancesInvitations(c.db,{maintenant,echeanceMs:160_000,horloge:()=>temps,expedier});
  expect(r).toMatchObject({envoyees:0,restantes:2});expect(expedier).not.toHaveBeenCalled();
  expect(c.rpc).toHaveBeenCalledWith('noter_relance_invitation_locataire',{p_invitation:'inv-1',p_rang:1,p_resultat:'reportee'});
 });
 it('une mission déjà échue ne lit ni ne réserve de relance',async()=>{
  const c=contexte();await envoyerRelancesInvitations(c.db,{maintenant,echeanceMs:50,horloge:()=>51});expect(c.rpc).not.toHaveBeenCalled();
 });
 it('une garde lente arrête avant la réservation et avant de consommer le compteur des liens',async()=>{
  let temps=0;const c=contexte();const expedier=vi.fn();
  const r=await envoyerRelancesInvitations(c.db,{maintenant,echeanceMs:100,horloge:()=>temps,avantEffet:async()=>{temps=101;},expedier});
  expect(r).toMatchObject({envoyees:0,restantes:2});
  expect(c.rpc).not.toHaveBeenCalledWith('reserver_relance_invitation_locataire',expect.anything());
  expect(c.rpc).not.toHaveBeenCalledWith('autoriser_lien_mot_de_passe_cle',expect.anything());
  expect(expedier).not.toHaveBeenCalled();
 });
});
