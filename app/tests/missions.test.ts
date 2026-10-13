import {describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {bilanMission,estMission} from '../src/lib/missions';
import {executerMission} from '../src/lib/execution-mission';
import {ArretSupervision} from '../src/lib/controle-effets';

vi.mock('../src/lib/point-du-matin',()=>({genererPointsDuMatin:vi.fn().mockResolvedValue({enregistres:7})}));
type Reponse={data?:unknown;error:unknown};
function client(reponses:Record<string,Reponse>={}){
 const rpc=vi.fn(async(nom:string):Promise<Reponse>=>reponses[nom]??{
  data:nom==='commencer_mission'?'identifiant':nom==='verifier_arret_supervision'?true:null,error:null,
 });
 return {rpc,db:{rpc} as unknown as SupabaseClient};
}
describe('Commande des missions',()=>{
 it('ne traite jamais un nom non prévu',()=>{expect(estMission('appels')).toBe(true);expect(estMission('__proto__')).toBe(false);expect(estMission('../admin')).toBe(false);});
 it('classe un échec partiel même avec une réponse HTTP réussie',()=>{expect(bilanMission({envoyees:3,echecs:1},200)).toMatchObject({ok:false,compte:3,bilan:{envoyees:3,echecs:1}});expect(bilanMission({erreur:'secret'},200).ok).toBe(false);expect(bilanMission({},503).ok).toBe(false);expect(bilanMission({erreurFacebook:'refus'},200).ok).toBe(false);expect(bilanMission({orchestration_erreur:true},200).ok).toBe(false);});
 it('ne déclenche rien si pause, concurrence ou accès impossible',async()=>{
  for(const reponse of [{data:null,error:null},{data:null,error:{message:'refus'}}]){
   const {db,rpc}=client({commencer_mission:reponse}),traiter=vi.fn();
   await executerMission(db,'appels',traiter);
   expect(rpc).toHaveBeenCalledWith('commencer_mission',{p_cle:'appels'});
   expect(traiter).not.toHaveBeenCalled();
  }
 });
 it('conserve le résultat sans transmettre de données privées au journal',async()=>{
  const {db,rpc}=client();
  const r=await executerMission(db,'appels',async()=>Response.json({envoyes:4,email:'prive',echecs:0}));
  expect(r.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('terminer_mission',{p_id:'identifiant',p_ok:true,p_compte:4,p_bilan:{envoyes:4,echecs:0}});
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('prive');
 });
 it('consigne une interruption et ne prétend pas réussir',async()=>{
  const {db,rpc}=client();
  const r=await executerMission(db,'appels',async()=>{throw new Error('prive')});
  expect(r.status).toBe(500);
  expect(rpc).toHaveBeenCalledWith('terminer_mission',{p_id:'identifiant',p_ok:false,p_compte:0,p_bilan:{erreur:true}});
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('prive');
 });
 it.each([
  ['arrêt',false,null,'arret'],
  ['contrôle indisponible',null,{message:'secret'},'indisponible'],
 ])('refuse de commencer en cas de %s',async(_label,data,error,raison)=>{
  const {db,rpc}=client({verifier_arret_supervision:{data,error}}),traiter=vi.fn();
  const r=await executerMission(db,'appels',traiter);
  expect(r.status).toBe(503);expect(await r.json()).toMatchObject({arret:raison});
  expect(rpc.mock.calls.some(([nom])=>nom==='commencer_mission')).toBe(false);
  expect(traiter).not.toHaveBeenCalled();
 });
 it('signale le bilan partiel après un effet sans annoncer son annulation',async()=>{
  const {db,rpc}=client();
  const r=await executerMission(db,'appels',async()=>{throw new ArretSupervision(undefined,'arret',{envoyes:1});});
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({arret:'arret',compte_inconnu:true,bilan_partiel:{envoyes:1}});
  expect(rpc).toHaveBeenCalledWith('interrompre_mission_supervision',{p_id:'identifiant',p_indisponible:false,p_bilan:{envoyes:1}});
  expect(rpc.mock.calls.some(([nom])=>nom==='terminer_mission')).toBe(false);
 });
 it('garde le bilan inconnu lorsqu’un contrôle cesse de répondre pendant le traitement',async()=>{
  const {db,rpc}=client();
  const r=await executerMission(db,'appels',async()=>{throw new ArretSupervision(undefined,'indisponible');});
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({arret:'indisponible',compte_inconnu:true,bilan_partiel:null});
  expect(rpc).toHaveBeenCalledWith('interrompre_mission_supervision',{p_id:'identifiant',p_indisponible:true,p_bilan:null});
  expect(rpc.mock.calls.some(([nom])=>nom==='terminer_mission')).toBe(false);
 });
});
