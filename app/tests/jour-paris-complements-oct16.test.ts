import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {beforeAll,afterAll,afterEach,beforeEach,describe,it,expect} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
const fichier='20261016200000_jour_paris_complements';
const signatures=['public.org_ecriture_ouverte(uuid)','public.generer_alertes_assurance()','public.generer_alertes_restitution()','public.rafraichir_alerte_restitution(uuid)','public.actualiser_orchestration_socle()'];
const colonnes=[['factures_honoraires','emise_le'],['appels_charges','date_reception'],['cles_repartition','date_effet']];
describe.skipIf(!url)('compléments du jour de Paris — Q3',()=>{
 let db:Client;
 const def=async(s:string)=>(await db.query('select pg_get_functiondef($1::regprocedure) as d',[s])).rows[0].d as string;
 const empreinte=async()=>{
  const fonctions=await db.query('select oid::regprocedure::text as signature,md5(pg_get_functiondef(oid)) as definition,proacl::text as droits from pg_proc where oid=any($1::regprocedure[]) order by 1',[signatures]);
  const valeurs=[];for(const [t,c] of colonnes)valeurs.push((await db.query('select column_default from information_schema.columns where table_schema=\'public\' and table_name=$1 and column_name=$2',[t,c])).rows[0]);
  return {fonctions:fonctions.rows,valeurs};
 };
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();await db.query('begin');});
 afterAll(async()=>{await db?.query('rollback');await db?.end();});
 beforeEach(async()=>{await db.query('savepoint cas');});
 afterEach(async()=>{await db.query('rollback to cas');await db.query('release cas');});
 it('les cinq fonctions et les trois dates par défaut utilisent Paris',async()=>{
  for(const s of signatures){expect(await def(s),s).not.toMatch(/\bcurrent_date\b/i);expect(await def(s),s).toContain('aujourdhui_paris()');}
  for(const [t,c] of colonnes)expect((await db.query('select column_default from information_schema.columns where table_schema=\'public\' and table_name=$1 and column_name=$2',[t,c])).rows[0].column_default,`${t}.${c}`).toMatch(/aujourdhui_paris\(\)/);
 });
 it('la fin d’essai bascule au jour de Paris, même si la session est encore la veille',async()=>{
  await db.query("create or replace function public.aujourdhui_paris() returns date language sql stable set search_path='' as $$ select current_date+1 $$");
  const {rows:[org]}=await db.query("insert into public.organizations(name,type,status,essai_fin,grille_tarifaire) values('Recette Q3','proprietaire_direct','essai',current_date,'2026-09-28') returning id");
  expect((await db.query('select public.org_ecriture_ouverte($1) as ouverte',[org.id])).rows[0].ouverte).toBe(false);
 });
 it('rejeu, retour et réapplication conservent exactement définitions et droits',async()=>{
  const attendu=await empreinte();
  const aller=readFileSync(`supabase/migrations/${fichier}.sql`,'utf8');
  const retour=readFileSync(`supabase/retours-arriere/${fichier}.retour.sql`,'utf8');
  await db.query(aller);expect(await empreinte()).toEqual(attendu);
  await db.query(retour);await db.query(retour);
  for(const s of signatures)expect(await def(s),s).toMatch(/\bcurrent_date\b/i);
  await db.query(aller);expect(await empreinte()).toEqual(attendu);
 });
 it('une définition divergente arrête le lot sans écrasement',async()=>{
  await db.query((await def(signatures[0])).replace('o.essai_fin is null','o.essai_fin is null or current_date is null'));
  await expect(db.query(readFileSync(`supabase/migrations/${fichier}.sql`,'utf8'))).rejects.toThrow(/inattendue/i);
 });
});
