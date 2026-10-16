import { afterEach, describe,expect,it,vi } from 'vitest';
import { passerAlerteRelais } from '@/lib/relais-alerte-envoi';
import { envoyerUrgencesRelais, passerUrgencesRelais } from '@/lib/relais-urgences-envoi';
import { attendreRelais, DelaiRelaisDepasse } from '@/lib/delai-relais';
import { lireAdressesRelais } from '@/lib/relais-alerte';
const adresses=lireAdressesRelais('test@example.invalid');
const maintenant=new Date('2026-10-16T03:05:00Z');
afterEach(()=>{vi.useRealTimers();});
describe('T12 — la base consomme aussi le budget du relais',()=>{
 it('une prise lente dépasse l’échéance : aucun e-mail lancé après elle',async()=>{
  let t=0;const envoyer=vi.fn();const db={rpc:async()=>{t+=12_000;return{data:{pris:true,envoi:'e1',urgences:[{nature:'signalement_manuel',posee_le:'2026-10-16T03:00:00Z'}]},error:null};}};
  const r=await envoyerUrgencesRelais({db,adresses,envoyer,echeance:10_000,horloge:()=>t});
  expect(envoyer).not.toHaveBeenCalled();expect(r.arret).toBe('delai');
 });
 it('le délai d’envoi est recalculé après la prise, sans dépassement',async()=>{
  let t=0;const envoyer=vi.fn(async(p:{delaiMaxMs?:number})=>{t+=p.delaiMaxMs??0;return{id:'e'};});
  const db={rpc:async(n:string)=>{if(n==='prendre_urgences_relais'){t+=4_000;return{data:{pris:true,envoi:'e1',urgences:[{nature:'signalement_manuel',posee_le:'2026-10-16T03:00:00Z'}]},error:null};}return{data:{statut:'envoye'},error:null};}};
  await envoyerUrgencesRelais({db,adresses,envoyer:envoyer as never,echeance:10_000,horloge:()=>t});
  expect(envoyer.mock.calls[0][0].delaiMaxMs).toBeLessThanOrEqual(6_000);expect(t).toBeLessThanOrEqual(10_000);
 });
 it('une réservation quotidienne muette rend une erreur avant la coupure',async()=>{
  vi.useFakeTimers();const db={rpc:()=>new Promise<never>(()=>{}),from:vi.fn()} as never;
  const p=passerAlerteRelais({db,adresses,maintenant,dureeMaxMs:60_000});
  await vi.advanceTimersByTimeAsync(59_000);
  const r=await Promise.race([p,Promise.resolve('toujours_en_attente')]);
  expect(r).not.toBe('toujours_en_attente');expect(r).toMatchObject({status:503});
 });
 it('le passage fréquent ne reste pas suspendu sur traiter_vacances',async()=>{
  vi.useFakeTimers();const db={rpc:()=>new Promise<never>(()=>{})};
  const p=passerUrgencesRelais({db,adresses,echeance:Date.now()+55_000} as Parameters<typeof passerUrgencesRelais>[0]);
  await vi.advanceTimersByTimeAsync(59_000);
  expect(await Promise.race([p,Promise.resolve('toujours_en_attente')])).not.toBe('toujours_en_attente');
 });
 it('annule le transport PostgREST muet et ne relance pas la réservation',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;
  const operation=vi.fn(()=>({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise<never>(()=>{});},then:vi.fn()}));
  const p=attendreRelais(operation as never,Date.now()+500);
  const resultat=p.catch(e=>e);
  await vi.advanceTimersByTimeAsync(500);
  expect(await resultat).toBeInstanceOf(DelaiRelaisDepasse);
  expect(signal?.aborted).toBe(true);expect(operation).toHaveBeenCalledTimes(1);
 });
 it('échéance passée : aucune nouvelle opération n’est engagée',async()=>{
  const operation=vi.fn();
  await expect(attendreRelais(operation,10,()=>11)).rejects.toBeInstanceOf(DelaiRelaisDepasse);
  expect(operation).not.toHaveBeenCalled();
 });

});
