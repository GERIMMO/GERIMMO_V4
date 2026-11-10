import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,beforeEach,it,expect,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientSurPg } from './fixtures/supabase-sur-pg';
import { identiteCourriel } from '../src/lib/reprise-courriels';
import { envoyerCourrielDurable } from '../src/lib/courriels-durables';
import { circuitAdmisPilote,piloteLimite,suspendreCourrielPilote } from '../src/lib/perimetre-pilote';
const holder=vi.hoisted(()=>({service:null as unknown}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>holder.service}));
import { envoyerEmail } from '../src/lib/email';
const url=process.env.SUPABASE_DB_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||!['/gerimmo_ci_priorites1','/gerimmo_ci_sql','/gerimmo_ci_vun'].includes(new URL(url).pathname))throw new Error('Base fictive isolée obligatoire');
const db=new Client({connectionString:url});const service=clientSurPg(db,{transactionnel:false}) as unknown as SupabaseClient;
const fetchFictif=vi.fn(async()=>{throw new Error('Aucun réseau autorisé');});
beforeAll(async()=>{await db.connect();holder.service=service;});
beforeEach(()=>{vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');vi.stubEnv('RESEND_API_KEY','fictive');vi.stubGlobal('fetch',fetchFictif);fetchFictif.mockClear();});
afterAll(async()=>{await db.end();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const message=()=>({to:'pilote@example.invalid',subject:'Fictif',html:'<p>Sans émission</p>',cleIdempotence:randomUUID()});
it('pilote fermé par défaut et aucune activation par un contexte inconnu',()=>{
 vi.stubEnv('GERIMMO_PILOTE_LIMITE','');expect(piloteLimite()).toBe(true);
 expect(circuitAdmisPilote(message())).toBe(false);
 expect(circuitAdmisPilote({...message(),contexteMetier:{type:'quittance',id:'x',montant:1,est_quittance:true}})).toBe(false);
 expect(circuitAdmisPilote({...message(),contexteMetier:{type:'quittance',id:'x',montant:1,est_quittance:true,automatique:true}})).toBe(true);
 expect(circuitAdmisPilote({...message(),contexteMetier:{type:'bail_signe',id:'x',document:'x',acteur:'x'}})).toBe(true);
});
for(const circuit of ['lib/courriers-contrat-envoi','lib/missions-planifiees/relances','app/actions/reception-loyer','lib/notifications','lib/relances-paiement','lib/rapports-mensuels','lib/avis-abonnement','lib/lien-mot-de-passe'])it(`suspend ${circuit} sans statut envoyé`,async()=>{
 const p=message();const r=await envoyerEmail({...p,circuit});expect(r.erreur).toMatch(/suspendu/);expect(r.interventionRequise).toBe(true);expect(r.id).toBeUndefined();expect(fetchFictif).not.toHaveBeenCalled();
 const m=(await db.query('select * from courriels_durables where id=$1',[identiteCourriel(p).id])).rows[0];
 expect(m.etat).toBe('en_attente');expect(m.tentatives).toBe(0);expect(m.reprise_autonome).toBe(false);expect(m.circuit).toBe(circuit);
});
it('deux connexions et plusieurs tentatives conservent une intention et une trace de suspension',async()=>{
 const p=message();const autre=new Client({connectionString:url});await autre.connect();
 try{const s2=clientSurPg(autre,{transactionnel:false}) as unknown as SupabaseClient;
 await Promise.all([suspendreCourrielPilote(service,p),suspendreCourrielPilote(s2,p)]);await suspendreCourrielPilote(service,p);
 const r=(await db.query("select count(*)::int n from courriels_evenements where courrier_id=$1 and etat='pilote_intervention_requise'",[identiteCourriel(p).id])).rows[0];expect(r.n).toBe(1);expect(fetchFictif).not.toHaveBeenCalled();
 }finally{await autre.end();}
});
it('préserve une acceptation ancienne, sans la transformer en succès métier ni renvoyer',async()=>{
 const p=message(),k=identiteCourriel(p),provider=randomUUID();
 await envoyerCourrielDurable(service,{cle:k.key,contenu:k.contenu,destinataire:p.to,organisation:null},async()=>({id:provider}));
 const r=await envoyerEmail(p);expect(r.erreur).toBeTruthy();expect(r.id).toBeUndefined();
 const m=(await db.query('select * from courriels_durables where id=$1',[k.id])).rows[0];expect(m.etat).toBe('accepte');expect(m.fournisseur_id).toBe(provider);expect(fetchFictif).not.toHaveBeenCalled();
});
it('préserve un résultat inconnu après réponse perdue et après plusieurs heures',async()=>{
 const p=message(),k=identiteCourriel(p);
 await envoyerCourrielDurable(service,{cle:k.key,contenu:k.contenu,destinataire:p.to,organisation:null},async()=>({incertain:true,erreur:'réponse perdue'}));
 await db.query("update courriels_durables set reprendre_apres=now()-interval '25 hours' where id=$1",[k.id]);
 const r=await envoyerEmail(p);expect(r.incertain).toBe(true);expect(fetchFictif).not.toHaveBeenCalled();
 expect((await db.query('select etat from courriels_durables where id=$1',[k.id])).rows[0].etat).toBe('inconnu');
});
it('conserve séparément les intentions des colocataires et garants',async()=>{
 const p=message();await Promise.all(['locataire','colocataire','garant'].map(n=>envoyerEmail({...p,to:`${n}@example.invalid`})));expect(fetchFictif).not.toHaveBeenCalled();
 for(const n of ['locataire','colocataire','garant'])expect((await db.query('select etat from courriels_durables where id=$1',[identiteCourriel({...p,to:`${n}@example.invalid`}).id])).rows[0].etat).toBe('en_attente');
});
it('refuse la suspension privilégiée au rôle utilisateur',async()=>{
 await db.query('set role authenticated');try{await expect(db.query("select suspendre_courriel_pilote(repeat('a',64),null,repeat('b',64),'test')")).rejects.toThrow(/permission/);}finally{await db.query('reset role');}
});
it('refuse aussi un appel direct au transport non admis',async()=>{
 const {envoyerEmailTransport}=await import('../src/lib/email');
 const r=await envoyerEmailTransport(message());expect(r.interventionRequise).toBe(true);expect(fetchFictif).not.toHaveBeenCalled();
});
it('suspend les anciennes charges avant leur réservation et préserve leur contenu',async()=>{
 const {conserverCourriel,reprendreCourriels}=await import('../src/lib/reprise-courriels');vi.stubEnv('COURRIELS_CHIFFREMENT_CLE','ab'.repeat(32));
 const p=message();await conserverCourriel(service,p);const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();
 const m=(await db.query('select * from courriels_durables where id=$1',[identiteCourriel(p).id])).rows[0];expect(m.tentatives).toBe(0);expect(m.charge_chiffree).toBeTruthy();expect(m.reprise_autonome).toBe(false);
});
it('ne touche pas aux factures Stripe avant une notification contractuelle exclue',async()=>{
 const {notifierResiliationImpaye}=await import('../src/lib/courriers-contrat-envoi');
 const list=vi.fn(),annuler=vi.fn();const journal=vi.fn(async()=>({error:null}));
 const s={from:()=>({insert:journal})} as unknown as SupabaseClient;
 const r=await notifierResiliationImpaye(s,{invoices:{list,voidInvoice:annuler}} as never,{orgId:randomUUID(),subscription:'sub_fictive',resilieLe:new Date(),destinataire:'fictif@example.invalid',organisation:'SCI fictive',enDefautDepuis:null});
 expect(r.envoye).toBe(false);expect(r.motif).toMatch(/suspendu/);expect(list).not.toHaveBeenCalled();expect(annuler).not.toHaveBeenCalled();expect(journal).toHaveBeenCalledOnce();
});
