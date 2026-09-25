import {describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {bilanMission,estMission} from '../src/lib/missions';
import {executerMission} from '../src/lib/execution-mission';
describe('Commande des missions',()=>{
 it('ne traite jamais un nom non prévu',()=>{expect(estMission('appels')).toBe(true);expect(estMission('__proto__')).toBe(false);expect(estMission('../admin')).toBe(false);});
 it('classe un échec partiel même avec une réponse HTTP réussie',()=>{expect(bilanMission({envoyees:3,echecs:1},200)).toMatchObject({ok:false,compte:3,bilan:{envoyees:3,echecs:1}});expect(bilanMission({erreur:'secret'},200).ok).toBe(false);expect(bilanMission({},503).ok).toBe(false);expect(bilanMission({erreurFacebook:'refus'},200).ok).toBe(false);expect(bilanMission({orchestration_erreur:true},200).ok).toBe(false);});
 it('ne déclenche rien si pause, concurrence ou accès impossible',async()=>{for(const reponse of [{data:null,error:null},{data:null,error:{message:'refus'}}]){const rpc=vi.fn().mockResolvedValue(reponse),traiter=vi.fn();await executerMission({rpc} as unknown as SupabaseClient,'appels',traiter);expect(traiter).not.toHaveBeenCalled();}});
 it('conserve le résultat sans transmettre de données privées au journal',async()=>{const rpc=vi.fn().mockResolvedValueOnce({data:'identifiant',error:null}).mockResolvedValue({error:null});const r=await executerMission({rpc} as unknown as SupabaseClient,'appels',async()=>Response.json({envoyes:4,email:'prive',echecs:0}));expect(r.status).toBe(200);expect(rpc).toHaveBeenNthCalledWith(2,'terminer_mission',{p_id:'identifiant',p_ok:true,p_compte:4,p_bilan:{envoyes:4,echecs:0}});expect(JSON.stringify(rpc.mock.calls)).not.toContain('prive');});
 it('consigne une interruption et ne prétend pas réussir',async()=>{const rpc=vi.fn().mockResolvedValueOnce({data:'identifiant',error:null}).mockResolvedValue({error:null});const r=await executerMission({rpc} as unknown as SupabaseClient,'appels',async()=>{throw new Error('prive')});expect(r.status).toBe(500);expect(rpc).toHaveBeenNthCalledWith(2,'terminer_mission',{p_id:'identifiant',p_ok:false,p_compte:0,p_bilan:{erreur:true}});});
});
