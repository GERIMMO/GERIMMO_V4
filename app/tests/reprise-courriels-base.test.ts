import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientSurPg } from './fixtures/supabase-sur-pg';
import { conserverCourriel,reprendreCourriels,identiteCourriel,chiffrerCourriel,dechiffrerCourriel } from '../src/lib/reprise-courriels';
import { envoyerCourrielDurable } from '../src/lib/courriels-durables';
const url=process.env.SUPABASE_DB_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/gerimmo_ci_priorites1')throw new Error('Base fictive isolée obligatoire');
const db=new Client({connectionString:url});const service=clientSurPg(db,{transactionnel:false}) as unknown as SupabaseClient;
beforeAll(async()=>{await db.connect();vi.stubEnv('COURRIELS_CHIFFREMENT_CLE','ab'.repeat(32));});
afterAll(async()=>{await db.end();vi.unstubAllEnvs();});
// Transport contact : sa garde de destination est testée dans transfert-contact.test.ts.
const message=()=>({canal:'contact' as const,to:'locataire@example.invalid',subject:'Document fictif',html:'<p>Document disponible</p>',cleIdempotence:randomUUID()});
it('chiffre le contenu et lie son authenticité au message',()=>{
 const p=message(),id=identiteCourriel(p).id,c=chiffrerCourriel(id,p);
 expect(c).not.toContain(p.to);expect(dechiffrerCourriel(id,c)).toEqual(p);expect(()=>dechiffrerCourriel('autre',c)).toThrow();
});
it('reprend un message conservé avant une interruption, puis purge le contenu accepté',async()=>{
 const p=message();await conserverCourriel(service,p);let envois=0;
 const transport=async()=>{envois++;return {id:randomUUID()};};
 await reprendreCourriels(service,transport,async()=>{});await reprendreCourriels(service,transport,async()=>{});
 expect(envois).toBe(1);const m=(await db.query('select * from courriels_durables where id=$1',[identiteCourriel(p).id])).rows[0];
 expect(m.etat).toBe('accepte');expect(m.charge_chiffree).toBeNull();
});
it('reprend un refus temporaire sans action utilisateur',async()=>{
 const p=message();await conserverCourriel(service,p);let n=0;
 const send=async()=>{n++;return n===1?{erreur:'429',recuperable:true}:{id:randomUUID()};};
 await reprendreCourriels(service,send,async()=>{});
 await db.query('update courriels_durables set reprendre_apres=now() where id=$1',[identiteCourriel(p).id]);
 await reprendreCourriels(service,send,async()=>{});expect(n).toBe(2);
});
it('ne réémet pas un message incertain, même conservé pour reprise',async()=>{
 const p=message();await conserverCourriel(service,p);let n=0;
 await reprendreCourriels(service,async()=>{n++;return {erreur:'réponse perdue',incertain:true};},async()=>{});
 await reprendreCourriels(service,async()=>{n++;return {id:randomUUID()};},async()=>{});expect(n).toBe(1);
});
it('expire un message avant émission et respecte l’arrêt de supervision',async()=>{
 const p=message();await conserverCourriel(service,p);let n=0;
 await expect(reprendreCourriels(service,async()=>{n++;return {id:randomUUID()};},async()=>{throw new Error('arrêt');})).rejects.toThrow('arrêt');
 await db.query("update courriels_durables set expire_le=now()-interval '1 minute' where id=$1",[identiteCourriel(p).id]);
 await reprendreCourriels(service,async()=>{n++;return {id:randomUUID()};},async()=>{});expect(n).toBe(0);
 expect((await db.query('select etat from courriels_durables where id=$1',[identiteCourriel(p).id])).rows[0].etat).toBe('echec');
});
it('la reprise automatique et l’appel initial partagent la même réservation',async()=>{
 const p=message();await conserverCourriel(service,p);const k=identiteCourriel(p);let n=0;
 const send=async()=>{n++;return {id:randomUUID()};};
 await Promise.all([reprendreCourriels(service,send,async()=>{}),envoyerCourrielDurable(service,{cle:k.key,contenu:k.contenu,destinataire:p.to,organisation:null},send)]);
 expect(n).toBe(1);
});
it('refuse l’accès utilisateur aux charges chiffrées et à la reprise',async()=>{
 await db.query('set role authenticated');
 try {await expect(db.query('select charge_chiffree from courriels_durables')).rejects.toThrow(/permission/);await expect(db.query('select * from courriels_a_reprendre()')).rejects.toThrow(/permission/);}
 finally {await db.query('reset role');}
});
it('conserve un arrêt avant transport comme reprise sûre, pas comme résultat inconnu',async()=>{
 const {ArretSupervision}=await import('../src/lib/controle-effets');const p=message(),k=identiteCourriel(p);
 await expect(envoyerCourrielDurable(service,{cle:k.key,contenu:k.contenu,destinataire:p.to,organisation:null},async()=>{throw new ArretSupervision();})).rejects.toThrow(ArretSupervision);
 expect((await db.query('select etat from courriels_durables where id=$1',[k.id])).rows[0].etat).toBe('en_attente');
});
