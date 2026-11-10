import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const banc=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>({rpc:banc.rpc})}));
import { envoyerEmail } from '@/lib/email';
import type { ContexteCourriel } from '@/lib/finalisation-courriels';
const reseau=vi.fn();
beforeEach(()=>{banc.rpc.mockReset();banc.rpc.mockResolvedValue({data:{etat:'en_attente'},error:null});vi.stubGlobal('fetch',reseau);reseau.mockClear();vi.stubEnv('RESEND_API_KEY','cle-fictive');vi.stubEnv('GERIMMO_MODE','commercial');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('V1 : vrais contrôles des circuits suspendus, aucun transport simulé à la place du garde',()=>{
 const cas: {nom:string;contexte?:ContexteCourriel}[]=[
  {nom:'relais quotidien'},{nom:'relais urgence'},{nom:'relance collective'},
  {nom:'rappel mission',contexte:{type:'notification',id:'mission-test',evenement:'mission_non_acceptee',role:'artisan'}},
  {nom:'rappel relevé',contexte:{type:'notification',id:'releve-test',evenement:'releve_attendu',role:'locataire'}},
  {nom:'courrier contractuel non qualifié'},
 ];
 for(const c of cas)it(`${c.nom} : suspension tracée par destinataire, y compris en mode commercial`,async()=>{
  const message={to:'destinataire@example.invalid',subject:c.nom,html:'Fictif',circuit:c.nom,cleIdempotence:`test-${c.nom}`,contexteMetier:c.contexte};
  const rs=await Promise.all([envoyerEmail(message),envoyerEmail(message)]);
  expect(rs.every(r=>r.interventionRequise&&!r.id)).toBe(true);
  expect(reseau).not.toHaveBeenCalled();
  expect(banc.rpc.mock.calls.every(([nom])=>nom==='suspendre_courriel_pilote')).toBe(true);
  const ids=banc.rpc.mock.calls.map(([,p])=>p.p_id);expect(new Set(ids).size).toBe(1);
  await envoyerEmail({...message,to:'autre@example.invalid'});
  expect(banc.rpc.mock.calls.at(-1)![1].p_id).not.toBe(ids[0]);
 });
 it('journal indisponible : échec explicite, aucune fausse réussite ni émission',async()=>{
  banc.rpc.mockResolvedValue({error:{message:'interruption'}});
  expect(await envoyerEmail({to:'a@example.invalid',subject:'Test',html:'Test'})).toMatchObject({interventionRequise:true,erreur:expect.stringContaining('journal indisponible')});
  expect(reseau).not.toHaveBeenCalled();
 });
 it('une incertitude conservée reste incertaine, sans renvoi',async()=>{
  banc.rpc.mockResolvedValue({data:{etat:'inconnu'},error:null});
  expect(await envoyerEmail({to:'a@example.invalid',subject:'Test',html:'Test'})).toMatchObject({incertain:true,interventionRequise:true});expect(reseau).not.toHaveBeenCalled();
 });
});
