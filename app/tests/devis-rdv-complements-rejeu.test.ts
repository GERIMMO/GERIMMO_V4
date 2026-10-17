import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
const fichiers=['20261016110000_devis_pdf_versions_alerte','20261016110100_rdv_relance_accuse_agenda','20261016190000_relance_report_reprise_sans_envoi'];
const migrations=fichiers.map(f=>readFileSync(new URL(`../supabase/migrations/${f}.sql`,import.meta.url),'utf8'));
const retours=fichiers.map(f=>readFileSync(new URL(`../supabase/retours-arriere/${f}.retour.sql`,import.meta.url),'utf8'));
const signatures=['public.deposer_devis(uuid,bigint,text,date,text,text,bigint,text)','public.envoyer_mon_devis_prepare(uuid,integer)','public.lire_devis_pdf_version(uuid,integer)','public.mes_demandes_rdv_artisan()','public.accuser_annulation_rdv(uuid)','public.reports_rdv_a_relancer(integer)','public.reserver_relance_report_rdv(uuid)','public.noter_relance_report_rdv(uuid,boolean)','public.liberer_relance_report_rdv(uuid,uuid)'];
describe.skipIf(!url)('D18/D22 compléments — rejeu, retour et droits',()=>{
 let db:Client;
 const empreinte=async()=> (await db.query("select md5(string_agg(pg_get_functiondef(s::regprocedure)||coalesce((select proacl::text from pg_proc where oid=s::regprocedure),''),'|' order by s)) e from unnest($1::text[]) s",[signatures])).rows[0].e;
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();await db.query('begin');});
 beforeEach(async()=>{await db.query('savepoint cas');});afterEach(async()=>{await db.query('rollback to savepoint cas');});
 afterAll(async()=>{await db?.query('rollback');await db?.end();});
 it('rejouer deux fois conserve fonctions et droits',async()=>{const avant=await empreinte();for(let n=0;n<2;n++)for(const m of migrations)await db.query(m);expect(await empreinte()).toBe(avant);});
 it('retour inverse puis réapplication restitue les fonctions et droits',async()=>{const avant=await empreinte();for(const r of [...retours].reverse())await db.query(r);for(const m of migrations)await db.query(m);expect(await empreinte()).toBe(avant);});
 it('aucune nouvelle RPC pour anon ; seuls les services peuvent lire les adresses ou réserver',async()=>{for(const sig of signatures.slice(2)){expect((await db.query("select has_function_privilege('anon',$1,'execute') ok",[sig])).rows[0].ok).toBe(false);}for(const sig of signatures.slice(5)){expect((await db.query("select has_function_privilege('authenticated',$1,'execute') ok",[sig])).rows[0].ok).toBe(false);}});
});
