import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {config} from 'dotenv';
import {Client} from 'pg';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
config({path:'.env.local'});const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
const entree={nom:'TEST Creation',type:'appartement',address_line1:'1 rue TEST',address_line2:'Batiment B',postal_code:'75001',city:'Paris',annee_construction:1990,copropriete:true,zone_tendue:null,parties_communes:'Hall',acces_tic:'Fibre',commune_insee:null,lots:[{nom:'TEST Lot',surface_m2:42.25,pieces:2}]};
describe.skipIf(!url)('Creation bien complete : atomicite, reprise et droits, transaction annulee',()=>{
 let db:Client,owner:string,autre:string,agent:string,collegue:string,locataire:string,org:string,orgB:string,agence:string;
 const service=async()=>{await db.query('reset role');await db.query("select set_config('request.jwt.claims','',true)");};
 const as=async(id:string)=>{await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:'authenticated',aal:'aal2'})]);await db.query('set local role authenticated');};
 const compte=async()=>(await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-creation-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
 const creer=async(cle=randomUUID(),saisie:unknown=entree,cible=org)=>(await db.query('select public.creer_bien_complet($1,$2,$3) r',[cible,cle,saisie])).rows[0].r;
 const refuse=async(cle=randomUUID(),saisie:unknown=entree,cible=org)=>{await db.query('savepoint refus');try{await creer(cle,saisie,cible);return '';}catch(e){await db.query('rollback to savepoint refus');return(e as Error).message;}finally{await db.query('release savepoint refus');}};
 const nombres=async()=>{await service();return(await db.query(`select (select count(*)::int from biens where organization_id=$1) biens,(select count(*)::int from lots where organization_id=$1) lots,(select count(*)::int from persons where organization_id=$1) persons,(select count(*)::int from detentions where organization_id=$1) detentions`,[org])).rows[0];};
 beforeAll(async()=>{
  if(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url))throw Error('Base locale dediee requise');
  db=new Client({connectionString:url});await db.connect();await db.query('begin');
  if(process.env.CREATION_BIEN_PREVIEW==='1')await db.query(readFileSync(new URL('../supabase/migrations/20261013103000_creation_bien_reprise.sql',import.meta.url),'utf8'));
  owner=await compte();autre=await compte();agent=await compte();collegue=await compte();locataire=await compte();
  const organisation=async(type:string)=>(await db.query("insert into organizations(name,status,type,address_line1,postal_code,city,email_contact) values('TEST Creation','active',$1,'1 rue TEST','75001','Paris','test@example.invalid') returning id",[type])).rows[0].id;
  org=await organisation('proprietaire_direct');orgB=await organisation('proprietaire_direct');agence=await organisation('agence');
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct'),($5,$6,'agent'),($7,$6,'agent'),($8,$2,'locataire')",[owner,org,autre,orgB,agent,agence,collegue,locataire]);
  await db.query(`create function pg_temp.creation_refus() returns trigger language plpgsql as $$ begin
   if (current_setting('test.creation_phase',true)='complements' and tg_table_name='biens')
    or (current_setting('test.creation_phase',true)='fiche' and tg_table_name='persons')
    or (current_setting('test.creation_phase',true)='detention' and tg_table_name='detentions')
    or (current_setting('test.creation_phase',true)='nom' and tg_table_name='lots' and tg_op='UPDATE')
    or (current_setting('test.creation_phase',true)='second_lot' and tg_table_name='lots' and tg_op='INSERT' and (select count(*) from public.lots where bien_id=(to_jsonb(new)->>'bien_id')::uuid)>1)
   then raise exception 'Panne TEST apres insertion : %',current_setting('test.creation_phase'); end if; return new; end $$;`);
  for(const [table,event] of [['biens','update'],['persons','insert'],['detentions','insert'],['lots','insert or update']])await db.query(`create trigger zz_test_creation_refus after ${event} on public.${table} for each row execute function pg_temp.creation_refus()`);
 });
 beforeEach(async()=>{await service();await db.query('savepoint scenario');});
 afterEach(async()=>{await db.query('rollback to savepoint scenario');});
 afterAll(async()=>{await db?.query('rollback');await db?.end();});
 it.each(['complements','fiche','detention','nom','second_lot'])('panne %s : aucune fiche partielle, puis meme demande reussie',async(phase)=>{
  const cle=randomUUID(),saisie=phase==='second_lot'?{...entree,type:'immeuble',lots:[...entree.lots,{nom:'Lot 2',surface_m2:30,pieces:1}]}:entree;
  await as(owner);await db.query("select set_config('test.creation_phase',$1,true)",[phase]);expect(await refuse(cle,saisie)).toContain('Panne TEST apres insertion');expect(await nombres()).toEqual({biens:0,lots:0,persons:0,detentions:0});
  await as(owner);await db.query("select set_config('test.creation_phase','',true)");await creer(cle,saisie);const nb=phase==='second_lot'?2:1;expect(await nombres()).toEqual({biens:1,lots:nb,persons:1,detentions:nb});
 });
 it('reponse perdue : rejoue un seul bien, un lot et une detention sans nouvelle ecriture',async()=>{
  await as(owner);const cle=randomUUID(),premier=await creer(cle),second=await creer(cle);expect(second).toEqual({...premier,rejoue:true});expect(await nombres()).toEqual({biens:1,lots:1,persons:1,detentions:1});
 });
 it('saisie differente avec cle deja reussie : signale le dossier sans remplacer son contenu',async()=>{
  await as(owner);const cle=randomUUID(),premier=await creer(cle),second=await creer(cle,{...entree,nom:'Autre nom'});expect(second).toEqual({...premier,rejoue:true,saisie_differente:true});expect((await db.query('select nom,address_line2,zone_tendue,parties_communes from biens where id=$1',[premier.bien_id])).rows[0]).toEqual({nom:entree.nom,address_line2:'Batiment B',zone_tendue:null,parties_communes:'Hall'});
 });
 it('deux demandes distinctes du proprietaire reutilisent sa fiche',async()=>{await as(owner);await creer();await creer();expect(await nombres()).toEqual({biens:2,lots:2,persons:1,detentions:2});});
 it('agent : le nouveau dossier lui appartient, son collegue ne le lit pas',async()=>{await as(agent);const r=await creer(randomUUID(),entree,agence);expect((await db.query('select created_by from biens where id=$1',[r.bien_id])).rows).toEqual([{created_by:agent}]);await as(collegue);expect((await db.query('select id from biens where id=$1',[r.bien_id])).rows).toHaveLength(0);});
 it.each(['autre','locataire'])('refuse le role %s dans le dossier proprietaire',async(role)=>{await as(role==='autre'?autre:locataire);expect(await refuse()).toMatch(/Accès refusé/);expect(await nombres()).toEqual({biens:0,lots:0,persons:0,detentions:0});});
 it('profil incomplet : rien enregistre',async()=>{await db.query('update organizations set address_line1=null where id=$1',[org]);await as(owner);expect(await refuse()).toContain('profil');expect(await nombres()).toEqual({biens:0,lots:0,persons:0,detentions:0});});
 it('commune invalide : toute la creation est annulee',async()=>{await as(owner);expect(await refuse(randomUUID(),{...entree,commune_insee:'99999'})).toMatch(/commune/i);expect(await nombres()).toEqual({biens:0,lots:0,persons:0,detentions:0});});
 it('appartement non decoupable : garde metier existante conservee',async()=>{await as(owner);expect(await refuse(randomUUID(),{...entree,lots:[...entree.lots,...entree.lots]})).toBeTruthy();expect(await nombres()).toEqual({biens:0,lots:0,persons:0,detentions:0});});
 it('abonnement suspendu : garde existante conservee',async()=>{await db.query('select public.tache_systeme()');await db.query("update organizations set status='suspendue' where id=$1",[org]);await db.query("select set_config('gerimmo.systeme','',true)");await as(owner);expect(await refuse()).toMatch(/Abonnement suspendu/);expect(await nombres()).toEqual({biens:0,lots:0,persons:0,detentions:0});});
 it('reference de reprise immuable, fonction fermee a anon et invoker',async()=>{await as(owner);const r=await creer();await db.query('savepoint immutable');await expect(db.query('update biens set creation_cle=null where id=$1',[r.bien_id])).rejects.toThrow(/conservée/);await db.query('rollback to savepoint immutable');await service();expect((await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where oid='public.creer_bien_complet(uuid,uuid,jsonb)'::regprocedure")).rows).toEqual([{prosecdef:false,anon:false}]);});
});
