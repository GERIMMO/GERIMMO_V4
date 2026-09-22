import {describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resumerMesures,lienDossier,type StatAutomatisation} from '../src/lib/pilotage';
import {orchestrerDossiers} from '../src/lib/orchestrateur';
const ligne=(a:number,h:number,m=0):StatAutomatisation=>({organization_id:'org',actions_automatiques:a,interventions_humaines:h,messages_envoyes:m,clics_evites:0,dossiers_sans_appel:0});
describe('Mesures honnêtes et accès au bon dossier',()=>{
 it('distingue absence de lecture, absence d’activité et résultat réel',()=>{
  expect(resumerMesures(null)).toBeNull();expect(resumerMesures([])?.taux).toBeNull();
  expect(resumerMesures([ligne(90,10,5),ligne(0,100,3)])).toEqual({automatiques:90,humaines:110,messages:8,taux:45});
 });
 it('ouvre le bon incident et refuse un lien hors de son organisation',()=>{
  const incident={organization_id:'org',dossier_type:'incident',dossier_id:'inc'};
  expect(lienDossier(incident)).toBe('/agence/org/incidents?sel=inc');
  expect(lienDossier({...incident,lien_action:'https://malveillant.invalid'})).toBe('/agence/org/incidents?sel=inc');
  expect(lienDossier({...incident,dossier_type:'document',lien_action:'/agence/org/documents?sel=doc'})).toBe('/agence/org/documents?sel=doc');
 });
});
describe('Suivi des dossiers sans fausse réussite',()=>{
 it('consigne une actualisation réussie, même sans dossier modifié',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:0,error:null}).mockResolvedValue({error:null});
  expect(await orchestrerDossiers({rpc} as unknown as SupabaseClient)).toEqual({dossiers:0,erreur:null});
  expect(rpc).toHaveBeenLastCalledWith('log_tech',expect.objectContaining({evenement:'tache_orchestrateur',details:expect.objectContaining({dossiers:0,erreur:null,rapports_prepares:0,preparation_erreur:null})}));
 });
 it('rend lisible le refus et conserve une trace d’échec',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:0,error:null}).mockResolvedValueOnce({data:null,error:{message:'private database detail'}}).mockResolvedValue({error:null});
  const result=await orchestrerDossiers({rpc} as unknown as SupabaseClient);expect(result.erreur).toMatch(/pas pu/);expect(result.erreur).not.toContain('private');
 });
 it('actualise le suivi même si la préparation des rapports est refusée',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{message:'refus'}}).mockResolvedValueOnce({data:2,error:null}).mockResolvedValue({error:null});
  expect(await orchestrerDossiers({rpc} as unknown as SupabaseClient)).toEqual({dossiers:2,erreur:null});
  expect(rpc).toHaveBeenLastCalledWith('log_tech',expect.objectContaining({details:expect.objectContaining({preparation_erreur:expect.any(String)})}));
 });
 it('ne coupe pas le service en cas de réseau interrompu',async()=>{
  const rpc=vi.fn().mockRejectedValueOnce(new Error('connexion')).mockResolvedValue({error:null});
  expect((await orchestrerDossiers({rpc} as unknown as SupabaseClient)).erreur).toMatch(/interrompue/);
 });
});
