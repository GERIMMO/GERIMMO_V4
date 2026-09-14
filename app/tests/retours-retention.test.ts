import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({path:'.env.local'});
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)("Conservation du support : contenu limité à six mois",()=>{
 let db:Client;let auteur:string;let sa:string;let ancien:string;let recent:string;let idee:string;
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});afterAll(async()=>{await db?.end();});
 beforeEach(async()=>{
  await db.query('begin');
  const {rows}=await db.query(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
   select gen_random_uuid(),'authenticated','authenticated','purge-retour-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now() from generate_series(1,2) returning id`);[auteur,sa]=rows.map(r=>r.id);
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin')",[sa]);
  const {rows:retours}=await db.query(`insert into public.retours_utilisateurs(id,auteur_id,cle_envoi,nature,titre,description,groupe_id,cree_le)
   select id,$1,gen_random_uuid(),nature,'Signalement de recette','Description privée à effacer seulement à échéance',id,date_creation from
   (values(gen_random_uuid(),'bug',now()-interval '7 months'),(gen_random_uuid(),'bug',now()-interval '5 months'),(gen_random_uuid(),'idee',now()-interval '7 months')) x(id,nature,date_creation) returning id`,[auteur]);[ancien,recent,idee]=retours.map(r=>r.id);
  await db.query("insert into public.retours_historique(retour_id,acteur_id,evenement,message) values($1,$2,'creation','Un contexte privé')",[ancien,auteur]);
 });afterEach(async()=>{await db.query('rollback');});
 async function agir(id:string){await db.query('reset role');await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)",[id]);await db.query('set local role authenticated');}
 it('efface le bug ancien et son texte de suivi, conserve le récent et les idées',async()=>{
  await agir(sa);expect((await db.query('select public.purger_signalements_support() n')).rows[0].n).toBe(1);
  expect((await db.query('select id from public.retours_utilisateurs where id=any($1::uuid[])',[[ancien,recent,idee]])).rows.map(r=>r.id).sort()).toEqual([recent,idee].sort());
  expect((await db.query('select * from public.retours_historique where retour_id=$1',[ancien])).rows).toHaveLength(0);
  expect((await db.query('select public.purger_signalements_support() n')).rows[0].n).toBe(0);
 });
 it('interdit le lancement utilisateur et anonyme',async()=>{
  await agir(auteur);await db.query('savepoint refus');await expect(db.query('select public.purger_signalements_support()')).rejects.toThrow(/réservée/);await db.query('rollback to savepoint refus');
  expect((await db.query("select has_function_privilege('anon','public.purger_signalements_support()','EXECUTE') ok")).rows[0].ok).toBe(false);
 });
 it('raccorde la purge au nettoyage existant et respecte une règle désactivée',async()=>{
  await agir(sa);await db.query("update public.retention_rules set actif=false where data_type='support:bug'");expect((await db.query('select public.purger_signalements_support() n')).rows[0].n).toBe(0);
  const {rows:[r]}=await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) f");expect(r.f).toContain("'signalements_support',public.purger_signalements_support()");
 });
});
