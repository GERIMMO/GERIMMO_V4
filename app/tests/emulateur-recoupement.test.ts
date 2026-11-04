import {beforeAll,describe,expect,it} from 'vitest';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
const origine=process.env.NEXT_PUBLIC_SUPABASE_URL;
const local=origine&&['127.0.0.1','localhost'].includes(new URL(origine).hostname);
describe.skipIf(!local)('filtre de recoupement du banc local',()=>{
 let db:SupabaseClient;
 beforeAll(async()=>{db=createClient(origine!,'cle-locale',{auth:{persistSession:false}});const r=await db.auth.signInWithPassword({email:'proprietaire@example.com',password:'Gerimmo-Demo-2026'});expect(r.error).toBeNull()});
 it('retrouve les communes qui possèdent le code postal demandé',async()=>{const r=await db.from('reseau_communes').select('code,codes_postaux').overlaps('codes_postaux',['69003']);expect(r.error).toBeNull();expect(r.data!.length).toBeGreaterThan(0);expect(r.data!.every(c=>c.codes_postaux.includes('69003'))).toBe(true)});
 it('rend une liste vide pour un code absent',async()=>{const r=await db.from('reseau_communes').select('code').overlaps('codes_postaux',['99999']);expect(r.error).toBeNull();expect(r.data).toEqual([])});
});
