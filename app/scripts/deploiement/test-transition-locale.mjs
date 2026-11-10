import {Client} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {commerciales,conditionner} from './conditionner-migration.mjs';
const url=new URL(process.env.SUPABASE_DB_URL??'');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/gerimmo_ci_vun')throw Error('Base locale de transition exclusivement');
const a=new Client({connectionString:url.href}),b=new Client({connectionString:url.href});await a.connect();await b.connect();
const q=(s,p=[])=>a.query(s,p);const sql=n=>readFileSync(new URL('../../supabase/migrations/'+n,import.meta.url),'utf8');
const ferme=readFileSync(new URL('./transition/fermer.sql',import.meta.url),'utf8'),ouvre=readFileSync(new URL('./transition/ouvrir.sql',import.meta.url),'utf8');
let assertions=0;const ok=v=>{assert.ok(v);assertions++;};
try{
 ok(!(await q("select to_regclass('public.courriels_durables') t")).rows[0].t);
 const avant=(await q("select md5(pg_get_functiondef('public.geste_facture_automatique(uuid,text,jsonb)'::regprocedure)) h")).rows[0].h;
 await q(ferme);
 // An old or new writer cannot create an event while old email transports drain.
 for(const c of [a,b]){await c.query('begin');await assert.rejects(c.query("insert into factures_fourniture default values"),/Maintenance ciblée/);assertions++;await c.query('rollback');}
 // Financial data remain writable under the targeted maintenance, unlike the pilot SQL.
 await q('begin');await q("insert into organizations(name,status,type) values('Fictif abonnement en maintenance','active','proprietaire_direct')");assertions++;await q('rollback');
 const corps=commerciales.map(m=>conditionner(sql(m.fichier),m.fichier)).join('\n');
 await q('begin');await q(corps);await assert.rejects(q('select 1/0'));await q('rollback');
 ok(!(await q("select to_regclass('public.courriels_durables') t")).rows[0].t);
 ok((await q("select md5(pg_get_functiondef('public.geste_facture_automatique(uuid,text,jsonb)'::regprocedure)) h")).rows[0].h===avant);
 await q('begin');await q(corps);for(const m of commerciales)await q('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[m.fichier.split('_')[0],m.fichier,[sql(m.fichier)]]);await q('commit');
 ok(!(await q("select to_regclass('public.securite_instance_pilote') t")).rows[0].t);
 ok((await q("select count(*)::int n from pg_trigger where tgname='notification_transactionnelle'")).rows[0].n===8);
 await q('begin');await q('set local role authenticated');await assert.rejects(q('select * from courriels_durables'));assertions++;await q('rollback');
 // The old worker must NOT be described as a rollback target after fencing.
 await q('begin');await assert.rejects(q("select geste_facture_automatique(gen_random_uuid(),'controle','{}')"),/Réservation expirée ou absente/);assertions++;await q('rollback');
 await q(ouvre);
 await q('begin');await q("insert into organizations(name,status,type) values('Fictif commercial après migration','active','proprietaire_direct')");assertions++;await q('rollback');
 // Correction forward closes only mutations, keeps durable evidence, then resumes.
 const id='e'.repeat(64);await q("insert into courriels_durables(id,empreinte,etat) values($1,'fictif','inconnu')",[id]);
 await q(ferme);ok((await q('select etat from courriels_durables where id=$1',[id])).rows[0].etat==='inconnu');await q(ouvre);
 ok((await q('select etat from courriels_durables where id=$1',[id])).rows[0].etat==='inconnu');
 writeFileSync(new URL('../../output/livraison-v1/transition.json',import.meta.url),JSON.stringify({assertions,migrations:commerciales.map(x=>x.fichier),rollbackTransaction:true,retourAncienWorker:false,correctionEnAvant:true,limite:'SQL réel local ; retrait des anciens déploiements et drainage réseau hébergé à vérifier humainement'},null,2));
 console.log('Transition locale validée : '+assertions+' contrôles');
}finally{await q('rollback').catch(()=>{});await a.end();await b.end();}
