import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)('Signature : les droits de supervision ne valent pas rôle signataire',()=>{
 let db:Client,sa:string,admin:string,agent:string,org:string,chemin:string;
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 beforeEach(async()=>{
  await db.query('begin');
  const users=(await db.query("insert into auth.users(id,email) select gen_random_uuid(),gen_random_uuid()||'@test.local' from generate_series(1,3) returning id")).rows;
  [sa,admin,agent]=users.map(x=>x.id);
  org=(await db.query("insert into public.organizations(name,status) values('Recette signature','active') returning id")).rows[0].id;
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin'),($2,$4,'admin_agence'),($3,$4,'agent')",[sa,admin,agent,org]);
  chemin=org+'/signature-recette.png';
  await db.query('update public.organizations set signature_path=$1 where id=$2',[chemin,org]);
  await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[chemin]);
 });
 afterEach(async()=>{await db.query('rollback');});
 async function agir(id:string|null,role='authenticated'){
  await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role,aal:'aal2'})]);
  await db.query('set local role '+role);
 }
 it('le super administrateur garde la lecture de l’organisation mais ne peut utiliser ni télécharger son image de signature',async()=>{
  await agir(sa);
  expect((await db.query('select id from public.organizations where id=$1',[org])).rows).toHaveLength(1);
  expect((await db.query('select public.peut_utiliser_signature_organisation($1) as ok',[org])).rows[0].ok).toBe(false);
  expect((await db.query("select name from storage.objects where bucket_id='documents' and name=$1",[chemin])).rows).toHaveLength(0);
 });
 it.each([
  "select public.definir_signature_organisation($1,$2)",
  "update public.organizations set signature_path=$2 where id=$1",
 ])('le super administrateur ne remplace pas une signature, même par appel direct (%s)',async sql=>{
  await agir(sa);await expect(db.query(sql,[org,org+'/signature-interdite.png'])).rejects.toThrow(/hors accès de supervision/);
 });
 it('le super administrateur ne contourne pas le contrôle en créant une organisation avec une signature',async()=>{
  await agir(sa);await expect(db.query("insert into public.organizations(name,signature_path) values('Interdit',$1)",[chemin])).rejects.toThrow(/hors accès de supervision/);
 });
 it('une suppression directe du fichier de signature est refusée à la supervision',async()=>{
  await agir(sa);expect((await db.query("delete from storage.objects where bucket_id='documents' and name=$1 returning id",[chemin])).rows).toHaveLength(0);
 });
 it('le responsable réel peut remplacer la signature et l’ancienne image rejoint la purge',async()=>{
  await agir(admin);await db.query('select public.definir_signature_organisation($1,$2)',[org,org+'/signature-remplacee.png']);
  expect((await db.query('select signature_path from public.organizations where id=$1',[org])).rows[0].signature_path).toBe(org+'/signature-remplacee.png');
  await db.query('reset role');expect((await db.query('select id from public.purge_fichiers where storage_path=$1',[chemin])).rows).toHaveLength(1);
 });
 it('un agent métier utilise la signature mais ne peut pas la remplacer',async()=>{
  await agir(agent);
  expect((await db.query('select public.peut_utiliser_signature_organisation($1) as ok',[org])).rows[0].ok).toBe(true);
  expect((await db.query("select name from storage.objects where bucket_id='documents' and name=$1",[chemin])).rows).toHaveLength(1);
  await expect(db.query('select public.definir_signature_organisation($1,null)',[org])).rejects.toThrow(/réservée/);
 });
 it('un rôle métier réellement détenu reste valable pour un compte également super administrateur',async()=>{
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence')",[sa,org]);
  await agir(sa);expect((await db.query('select public.peut_utiliser_signature_organisation($1) as ok',[org])).rows[0].ok).toBe(true);
 });
 it('les traitements serveur autorisés conservent l’émission automatique',async()=>{
  await agir(null,'service_role');expect((await db.query('select public.peut_utiliser_signature_organisation($1) as ok',[org])).rows[0].ok).toBe(true);
 });
});
