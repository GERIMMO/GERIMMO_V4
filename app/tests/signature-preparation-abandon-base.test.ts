import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest';
const url=process.env.SUPABASE_DB_URL;
if(url&&(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)||!new URL(url).pathname.includes('ci_')))throw new Error('Base fictive locale obligatoire');
const migration=readFileSync('supabase/migrations/20261020011556_signature_preparation_abandon.sql','utf8');
const retour=readFileSync('supabase/retours-arriere/20261020011556_signature_preparation_abandon.retour.sql','utf8');
describe.skipIf(!url)('Abandon atomique d’une préparation de signature',()=>{
 let db:Client,org:string,owner:string,circuit:string;
 const id=async(sql:string,p:unknown[]=[])=>String((await db.query(sql,p)).rows[0].id);
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 afterEach(async()=>{await db.query('rollback');});
 beforeEach(async()=>{
  await db.query('begin');
  org=await id("insert into public.organizations(name,type,status) values('Abandon fictif','proprietaire_direct','active') returning id");
  owner=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@'||'exemple.invalid') returning id");
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[owner,org]);
  const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','Rue fictive','69001','Lyon',false) returning id",[org]);
  const lot=await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id",[org,bien]);
  const personne=await id("insert into public.persons(organization_id,nom,prenom) values($1,'Fictive','Personne') returning id",[org]);
  const bail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',public.aujourdhui_paris(),500,20) returning id",[org,lot,personne]);
  const doc=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Document fictif',$1::uuid::text||'/fictif.pdf','application/pdf',100,repeat('a',64)) returning id",[org]);
  circuit=await id("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,etat) values($1,$2,$3,$4,'zoho','production',repeat('b',64),repeat('a',64),'[{},{}]','preparation') returning id",[org,bail,doc,owner]);
  await db.query("insert into public.signature_consommations(circuit_id,mois_paris,demi_credits) values($1,date_trunc('month',public.aujourdhui_paris())::date,12)",[circuit]);
 });
 const appeler=async(actor=owner)=>(await db.query('select public.abandonner_preparation_signature($1,$2) ok',[circuit,actor])).rows[0].ok;
 const lecture=async()=>(await db.query("select etat,(select count(*)::int from public.signature_consommations where circuit_id=$1) quota from public.bail_signature_circuits where id=$1",[circuit])).rows[0];
 it('annule, libère le quota et journalise une seule fois malgré un rejeu',async()=>{expect(await appeler()).toBe(true);expect(await lecture()).toEqual({etat:'annule',quota:0});expect(await appeler()).toBe(true);expect((await db.query("select count(*)::int n from public.audit_log where action='signature_preparation_abandonnee' and details->>'circuit_id'=$1",[circuit])).rows[0].n).toBe(1);});
 it.each(['pret','en_cours','a_verifier','termine','annule','refuse','expire'])('ne libère jamais un circuit %s',async etat=>{await db.query('update public.bail_signature_circuits set etat=$2 where id=$1',[circuit,etat]);expect(await appeler()).toBe(false);expect(await lecture()).toEqual({etat,quota:1});});
 it.each(['external_request_id','external_document_id'])('conserve le quota si %s est déjà connu',async champ=>{await db.query(`update public.bail_signature_circuits set ${champ}='12345' where id=$1`,[circuit]);expect(await appeler()).toBe(false);expect((await lecture()).quota).toBe(1);});
 it('refuse un autre acteur même depuis le serveur',async()=>{await expect(appeler('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({code:'42501'});});
 it.each(['anon','authenticated'])('ne peut pas être appelée par %s',async role=>{await db.query('set local role '+role);await expect(appeler()).rejects.toMatchObject({code:'42501'});});
 it('le serveur dispose du seul droit applicatif et peut libérer',async()=>{await db.query('set local role service_role');expect(await appeler()).toBe(true);});
 it.each(['signature_consommations','bail_signature_circuits','audit_log'])('annule tous les changements si une écriture de %s échoue',async table=>{
  await db.query("create function pg_temp.refuser_abandon() returns trigger language plpgsql as $$ begin raise exception 'panne fictive'; end $$");
  await db.query(`create trigger refuser_abandon before ${table==='signature_consommations'?'delete':table==='audit_log'?'insert':'update'} on public.${table} for each row execute function pg_temp.refuser_abandon()`);
  await db.query('savepoint essai');await expect(appeler()).rejects.toThrow('panne fictive');await db.query('rollback to essai');expect(await lecture()).toEqual({etat:'preparation',quota:1});
 });
 it('le retour conserve les dossiers et le quota, le rejeu retrouve les droits et le code',async()=>{
  const f=async()=>(await db.query("select pg_get_functiondef('public.abandonner_preparation_signature(uuid,uuid)'::regprocedure) code,proacl::text droits from pg_proc where oid='public.abandonner_preparation_signature(uuid,uuid)'::regprocedure")).rows[0];
  const avant=await f();await db.query(migration);expect(await f()).toEqual(avant);await db.query(retour);expect(await lecture()).toEqual({etat:'preparation',quota:1});await db.query(migration);expect(await f()).toEqual(avant);
 });
});
