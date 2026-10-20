import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const m=vi.hoisted(()=>({controle:vi.fn()}));
vi.mock('@/lib/controle-effets',()=>({verifierAvantEffet:m.controle}));
import {purgerDepotsTemporaires} from '@/lib/depot-direct-purge';
const lignes=[{id:'a',chemin:'compte/a'},{id:'b',chemin:'compte/b'}];
function banc(){
 const lecture={select:vi.fn().mockReturnThis(),lt:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockResolvedValue({data:lignes,error:null}),then:(resolve:(v:unknown)=>void)=>Promise.resolve({count:0,error:null}).then(resolve)};
 const effacer={in:vi.fn().mockReturnThis(),select:vi.fn().mockResolvedValue({data:lignes,error:null})};
 const suppression=vi.fn(()=>effacer);
 const retirer=vi.fn().mockResolvedValue({data:lignes.map(l=>({name:l.chemin})),error:null});
 const lister=vi.fn().mockResolvedValue({data:[],error:null});
 const db={from:()=>({...lecture,delete:suppression}),storage:{from:()=>({remove:retirer,list:lister})}} as unknown as SupabaseClient;
 return {db,lecture,effacer,suppression,retirer,lister};
}
beforeEach(()=>{vi.resetAllMocks();m.controle.mockResolvedValue(undefined);});
describe('Purge des dépôts temporaires',()=>{
 it('attend trois heures après expiration de la réservation et conserve les métadonnées si le stockage échoue',async()=>{
  const b=banc();b.retirer.mockResolvedValue({data:null,error:{message:'indisponible'}});
  const debut=Date.now();expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:0,echecs_transferts:2});
  const seuil=Date.parse(b.lecture.lt.mock.calls[0][1]);expect(seuil).toBeGreaterThanOrEqual(debut-3*3600000);expect(seuil).toBeLessThanOrEqual(Date.now()-3*3600000);
  expect(b.suppression).not.toHaveBeenCalled();
 });
 it('ne solde qu’un retrait confirmé ou une absence confirmée',async()=>{
  const b=banc();b.retirer.mockResolvedValue({data:[{name:'compte/a'}],error:null});
  b.lister.mockResolvedValue({data:[{name:'b'}],error:null});b.effacer.select.mockResolvedValue({data:[{id:'a'}],error:null});
  expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:1,echecs_transferts:1});
  expect(b.effacer.in).toHaveBeenCalledWith('id',['a']);
 });
 it('une liste inaccessible ne constitue pas une preuve d’absence',async()=>{
  const b=banc();b.retirer.mockResolvedValue({data:[],error:null});b.lister.mockResolvedValue({data:null,error:{message:'panne'}});
  expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:0,echecs_transferts:2});expect(b.suppression).not.toHaveBeenCalled();
 });
 it('solde une réservation sans objet après vérification',async()=>{
  const b=banc();b.retirer.mockResolvedValue({data:[],error:null});
  expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:2,echecs_transferts:0});expect(b.lister).toHaveBeenCalledTimes(2);
 });
 it('respecte un arrêt demandé entre le stockage et les métadonnées',async()=>{
  const b=banc();m.controle.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('arrêt'));
  await expect(purgerDepotsTemporaires(b.db)).rejects.toThrow('arrêt');expect(b.suppression).not.toHaveBeenCalled();
 });
 it('signale l’échec de suppression des métadonnées pour un passage ultérieur',async()=>{
  const b=banc();b.effacer.select.mockResolvedValue({data:null,error:{message:'panne'}});
  expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:0,echecs_transferts:2});
 });
});

function fileVolume(nombre:number){
 let file=Array.from({length:nombre},(_,i)=>({id:String(i),chemin:`compte/${i}`}));
 const retraits=vi.fn(async(paths:string[])=>({data:paths.map(name=>({name})),error:null}));
 const db={from:()=>{
  let compte=false,ids:string[]=[];const q={
   select:vi.fn((_champs:string,options?:{head?:boolean})=>{compte=Boolean(options?.head);return q;}),
   lt:()=>q,order:()=>q,limit:async(n:number)=>({data:file.slice(0,n),error:null}),
   delete:()=>({in:(_nom:string,selection:string[])=>{ids=selection;return {select:async()=>{const data=file.filter(l=>ids.includes(l.id));file=file.filter(l=>!ids.includes(l.id));return {data,error:null};}};}}),
   then:(resolve:(v:unknown)=>void)=>Promise.resolve({count:compte?file.length:null,error:null}).then(resolve),
  };return q;
 },storage:{from:()=>({remove:retraits,list:async()=>({data:[],error:null})})}} as unknown as SupabaseClient;
 return {db,retraits};
}
it.each([51,501])('retire tous les %i dépôts en plusieurs lots si nécessaire',async n=>{
 const b=fileVolume(n);expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:n,transferts_en_attente:0,echecs_transferts:0});
 expect(b.retraits).toHaveBeenCalledTimes(Math.ceil(n/500));
});
it('borne à dix lots et rend le reliquat visible au passage suivant',async()=>{
 const b=fileVolume(5001);expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:5000,transferts_en_attente:1,transferts_bloques:1});
 expect(b.retraits).toHaveBeenCalledTimes(10);
 expect(await purgerDepotsTemporaires(b.db)).toMatchObject({transferts_purges:1,transferts_en_attente:0});
});
