import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
if(url && (!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)||!new URL(url).pathname.startsWith('/gerimmo_ci_'))) throw new Error('Base locale de recette obligatoire');
const nom='20261024105901_reglages_conservation_superadmin';
const migration=readFileSync(`supabase/migrations/${nom}.sql`,'utf8');
const retour=readFileSync(`supabase/retours-arriere/${nom}.retour.sql`,'utf8');
describe.skipIf(!url)('réglage de conservation sur base locale',()=>{
 let db:Client,sa:string,ordinaire:string;
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 beforeEach(async()=>{
  await db.query('begin');await db.query(migration);
  const r=await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) select gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','conservation-'||gen_random_uuid()||'@example.test','x',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','' from generate_series(1,2) returning id`);
  [sa,ordinaire]=r.rows.map(r=>r.id);
  await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,null,'super_admin','active')",[sa]);
 });
 afterEach(async()=>{await db.query('rollback');});
 async function role(id?:string,aal='aal2'){
  await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(id?{sub:id,role:'authenticated',aal}:{role:'anon'})]);
  await db.query(id?'set local role authenticated':'set local role anon');
 }
 async function revision(c='journal:tech_log'){return Number((await db.query('select revision as r from public.retention_rules where data_type=$1',[c])).rows[0].r);}
 async function modifier(c='journal:tech_log',mois:number|null=9,rev?:number,motif:string|null='Décision de recette locale'){
  return db.query('select public.modifier_duree_conservation($1,$2,$3,$4) as r',[c,mois,rev??await revision(c),motif]);
 }
 async function echec(fn:()=>Promise<unknown>){await db.query('savepoint essai');try{await fn();return '';}catch(e){await db.query('rollback to savepoint essai');return `${(e as {code:string}).code} ${(e as Error).message}`;}finally{await db.query('release savepoint essai');}}
 it('autorise uniquement le superadmin permanent avec MFA et refuse les écritures directes',async()=>{
  for(const [id,aal] of [[undefined,'aal2'],[ordinaire,'aal2'],[sa,'aal1']] as const){await role(id,aal);expect(await echec(()=>modifier())).toMatch(/^42501/);}
  await role(sa);expect(await echec(()=>db.query("update public.retention_rules set duree_mois=1 where data_type='journal:tech_log'"))).toMatch(/^42501/);
  await modifier();expect((await db.query("select duree_mois from public.retention_rules where data_type='journal:tech_log'")).rows[0].duree_mois).toBe(9);
 });
 it('trace avant/après et auteur ; refuse un deuxième envoi sur une révision ancienne',async()=>{
  await role(sa);const rev=await revision();await modifier('journal:tech_log',9,rev);
  expect(await echec(()=>modifier('journal:tech_log',12,rev))).toMatch(/^40001/);
  const h=(await db.query("select account_id,details from public.audit_log where action='conservation_regle_modifiee' and account_id=$1",[sa])).rows;
  expect(h).toHaveLength(1);expect(h[0]).toMatchObject({account_id:sa,details:{ancienne_duree_mois:6,nouvelle_duree_mois:9,motif:'Décision de recette locale'}});
 });
 it('valide les bornes et le motif en base sans activer les catégories désactivées',async()=>{
  await role(sa);
  for(const [c,m] of [['archive:facture',71],['archive:preuve_contrat',119],['compte:inactif',23],['journal:tech_log',-1],['journal:tech_log',241],['journal:tech_log',null]] as const)expect(await echec(()=>modifier(c,m))).toMatch(/^22023/);
  for(const motif of ['court',null])expect(await echec(()=>modifier('journal:tech_log',8,undefined,motif))).toMatch(/^22023/);
  await modifier('personne:fiche',48);expect((await db.query("select duree_mois,actif from public.retention_rules where data_type='personne:fiche'")).rows[0]).toEqual({duree_mois:48,actif:false});
 });
 it('publie les métadonnées sans donner accès aux identités et motifs à anon',async()=>{
  await role(sa);await modifier();await role();
  expect((await db.query("select duree_mois,duree_initiale_mois from public.retention_rules where data_type='journal:tech_log'")).rows[0]).toEqual({duree_mois:9,duree_initiale_mois:6});
  expect(await echec(()=>db.query('select id from public.retention_rules'))).toMatch(/^42501/);
  expect(await echec(()=>db.query('select * from public.audit_log'))).toMatch(/^42501/);
 });
 it('annule la mise à jour si le journal ne peut pas enregistrer la décision',async()=>{
  await db.query("create function pg_temp.refuser_trace() returns trigger language plpgsql as $$begin raise exception 'Trace indisponible'; end$$; create trigger recette_trace before insert on public.audit_log for each row execute function pg_temp.refuser_trace()");
  await role(sa);expect(await echec(()=>modifier())).toContain('Trace indisponible');
  expect((await db.query("select duree_mois from public.retention_rules where data_type='journal:tech_log'")).rows[0].duree_mois).toBe(6);
 });
 it('applique les durées aux nouvelles archives et préserve les anciennes échéances',async()=>{
  const creer=()=>db.query("insert into public.archives_comptes(account_id_origine,fin_dernier_abonnement_paye,factures) values(gen_random_uuid(),'2020-01-01','[{\"emise_le\":\"2020-01-01\",\"exercice_clos_le\":\"2020-12-31\"}]') returning id,preuve_conservee_jusqu_au::text as preuve,factures_conservees_jusqu_au::text as factures,factures_duree_mois");
  const avant=(await creer()).rows[0];await role(sa);await modifier('archive:facture',96);await modifier('archive:preuve_contrat',144);await db.query('reset role');const apres=(await creer()).rows[0];
  expect(avant).toMatchObject({preuve:'2030-01-01',factures:'2026-12-31',factures_duree_mois:72});expect(apres).toMatchObject({preuve:'2032-01-01',factures:'2028-12-31',factures_duree_mois:96});
  expect((await db.query('select factures_duree_mois from public.archives_comptes where id=$1',[avant.id])).rows[0].factures_duree_mois).toBe(72);
 });
 it('le bilan et la purge des factures gardent la même échéance après modification du catalogue',async()=>{
  const creer=()=>db.query(`insert into public.archives_comptes(account_id_origine,fin_dernier_abonnement_paye,factures) values(gen_random_uuid(),'2019-01-01','[{"emise_le":"2019-01-01","exercice_clos_le":"2019-12-31"}]') returning id`);
  const avant=(await creer()).rows[0].id;await role(sa);await modifier('archive:facture',96);await db.query('reset role');const apres=(await creer()).rows[0].id;
  const cibles=(await db.query("select id from public.cibles_conservation_complementaire() where categorie='archive:facture' and id=any($1::text[])",[[avant,apres]])).rows.map(r=>r.id);
  expect(cibles).toEqual([avant]);await db.query('select public.purger_archives_comptes()');
  const factures=(await db.query('select id,jsonb_array_length(factures) n from public.archives_comptes where id=any($1::uuid[])',[[avant,apres]])).rows;
  expect(factures.find(r=>r.id===avant).n).toBe(0);expect(factures.find(r=>r.id===apres).n).toBe(1);
 });
 it('le nettoyage réel lit le nouveau délai des journaux',async()=>{
  const ids=(await db.query("insert into public.tech_log(evenement,created_at) values('recette-conservation',now()-interval '7 months'),('recette-conservation',now()-interval '5 months') returning id")).rows.map(r=>r.id);
  await role(sa);await modifier('journal:tech_log',8);await db.query('reset role');await db.query('select public.appliquer_retention()');
  expect(Number((await db.query('select count(*) from public.tech_log where id=any($1)',[ids])).rows[0].count)).toBe(2);
  await role(sa);await modifier('journal:tech_log',6);await db.query('reset role');await db.query('select public.appliquer_retention()');
  expect(Number((await db.query('select count(*) from public.tech_log where id=any($1)',[ids])).rows[0].count)).toBe(1);
 });
 it('l’allongement de l’inactivité reporte les avertissements et la programmation',async()=>{
  const c=(await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,last_sign_in_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','dormant-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{"cgu_version":"2026-10-24"}',now()-interval '30 months',now(),now()-interval '30 months','','','','','') returning id`)).rows[0].id;
  const lire=()=>db.query("select * from public.comptes_inactifs_a_prevenir('2026-10-24',1000) where account_id=$1",[c]);
  expect((await lire()).rows).toHaveLength(1);
  const activite=(await db.query('select derniere_activite_le from public.activite_compte($1)',[c])).rows[0].derniere_activite_le;
  await db.query("insert into public.avertissements_inactivite(account_id,etape,derniere_activite_le,suppression_prevue_le,envoye_le) select $1,etape,$2,current_date-1,now()-interval '65 days' from unnest(array['j60','j15']) etape",[c,activite]);
  await role(sa);await modifier('compte:inactif',36);await db.query('reset role');await db.query("select set_config('request.jwt.claims','',true)");
  expect((await lire()).rows).toHaveLength(0);
  await db.query('select public.fermetures_comptes_programmer_inactifs()');
  expect((await db.query("select id from public.fermetures_comptes where account_id=$1 and statut='programmee'",[c])).rows).toHaveLength(0);
 });
 it('le rejeu conserve les décisions ; le retour refuse une durée changée puis se rejoue',async()=>{
  await role(sa);await modifier();await db.query('reset role');await db.query(migration);
  expect((await db.query("select duree_mois,duree_initiale_mois from public.retention_rules where data_type='journal:tech_log'")).rows[0]).toEqual({duree_mois:9,duree_initiale_mois:6});
  expect(await echec(()=>db.query(retour))).toContain('Retour refusé');await role(sa);await modifier('journal:tech_log',6);await db.query('reset role');
  await db.query(retour);await db.query(retour);await db.query(migration);
 });
});
