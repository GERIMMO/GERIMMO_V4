import {expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const envoi=vi.hoisted(()=>vi.fn(async()=>({id:'fictif'})));
vi.mock('@/lib/email',()=>({envoyerEmail:envoi}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>null}));
import {notifierMissionAcceptee} from '../src/lib/notifications';
it('deux missions au texte identique restent distinctes, une reprise garde la même identité',async()=>{
 const db={rpc:async(n:string)=>({data:n==='org_membres_gerants'?[{account_id:'owner',role:'proprietaire_direct',email:'owner@example.invalid'}]:true}),from:(table:string)=>{
  let identifiant='';const chaine={select:()=>chaine,eq:(k:string,v:string)=>{if(k==='id')identifiant=v;return chaine;},maybeSingle:async()=>({data:table==='incident_interventions'?{id:identifiant,incident_id:'incident'}:{id:'incident',responsable_account_id:'owner'}})};return chaine;
 }} as unknown as SupabaseClient;
 await notifierMissionAcceptee(db,'org','mission-a');await notifierMissionAcceptee(db,'org','mission-b');await notifierMissionAcceptee(db,'org','mission-a');
 const appels=envoi.mock.calls as unknown as [{cleIdempotence:string}][];
 expect(appels).toHaveLength(3);expect(appels[0][0].cleIdempotence).not.toBe(appels[1][0].cleIdempotence);expect(appels[0][0].cleIdempotence).toBe(appels[2][0].cleIdempotence);
});
