import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({path:'.env.local'});
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
const ENVOI="select public.soumettre_retour($1,$2,$3,$4,$5,$6,$7) as id";

describe.skipIf(!url)("Retours utilisateurs : droits, traçabilité et idempotence",()=>{
 let db:Client; let orgA:string;let orgB:string;let auteur:string;let collegue:string;let adminA:string;let autre:string;let sa:string;let artisan:string;
 async function compte(){const {rows:[u]}=await db.query(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(gen_random_uuid(),'authenticated','authenticated','retour-'||gen_random_uuid()||'@test.local','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()) returning id`);return u.id as string;}
 async function agir(id:string){await db.query('reset role');await db.query(`select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)`,[id]);await db.query('set local role authenticated');}
 async function refus(sql:string,params:unknown[],motif:RegExp){await db.query('savepoint refus');await expect(db.query(sql,params)).rejects.toThrow(motif);await db.query('rollback to savepoint refus');}
 async function creer(nature='bug',org:string|null=orgA,cle=randomUUID()){const {rows:[r]}=await db.query(ENVOI,[cle,nature,'Problème de sauvegarde','La sauvegarde du dossier ne donne pas de confirmation.','Une confirmation visible','/agence/123456/personnes/Jean-Dupont?email=jean@example.org#IBAN',org]);return r.id as string;}
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 beforeEach(async()=>{
  await db.query('begin');
  const {rows:orgs}=await db.query(`insert into public.organizations(name,status) values ('Retours A','active'),('Retours B','active') returning id`);[orgA,orgB]=orgs.map(x=>x.id);
  const comptes:string[]=[]; for(let i=0;i<6;i++) comptes.push(await compte());
  [auteur,collegue,adminA,autre,sa,artisan]=comptes;
  await db.query(`insert into public.memberships(account_id,organization_id,role) values($1,$6,'agent'),($2,$6,'locataire'),($3,$6,'admin_agence'),($4,$7,'admin_agence'),($5,null,'super_admin')`,[auteur,collegue,adminA,autre,sa,orgA,orgB]);
  await db.query(`insert into public.artisans(raison_sociale,siret,telephone,account_id) values('Recette retours',$1,'0600000000',$2)`,['88'+String(Date.now()).slice(-12),artisan]);
  await agir(auteur);
 });
 afterEach(async()=>{await db.query('rollback');});
 it('refuse les écritures directes et ne donne aucun TRUNCATE client',async()=>{
  for(const table of ['retours_utilisateurs','retours_historique','retours_soutiens']){
   const {rows:[r]}=await db.query(`select has_table_privilege('authenticated',$1,'INSERT') i,has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d,has_table_privilege('authenticated',$1,'TRUNCATE') t`,['public.'+table]);
   expect(r).toEqual({i:false,u:false,d:false,t:false});
  }
  const {rows:[r]}=await db.query(`select has_function_privilege('anon','public.soumettre_retour(uuid,text,text,text,text,text,uuid,text)','EXECUTE') as permis`);expect(r.permis).toBe(false);
 });
 it('conserve un seul envoi et une seule trace quand la demande est rejouée',async()=>{
  const cle=randomUUID();const id=await creer('bug',orgA,cle);expect(await creer('bug',orgA,cle)).toBe(id);
  expect((await db.query('select * from public.retours_historique where retour_id=$1',[id])).rows).toHaveLength(1);
  expect((await db.query('select ecran from public.retours_utilisateurs where id=$1',[id])).rows[0].ecran).toBe('/agence/[dossier]/personnes/[dossier]');
 });
 it('refuse une organisation injectée et un résultat attendu absent',async()=>{
  await refus(ENVOI,[randomUUID(),'bug','Un problème','Une description assez détaillée','Un résultat','/',orgB],/espace ne vous est pas accessible/);
  await refus(ENVOI,[randomUUID(),'bug','Un problème','Une description assez détaillée','','/',orgA],/résultat attendu/);
 });
 it('rend un bug visible à son auteur, à son administrateur et à la supervision seulement',async()=>{
  const id=await creer();
  for(const [user,visible] of [[collegue,false],[autre,false],[adminA,true],[sa,true],[auteur,true]] as const){await agir(user);expect((await db.query('select id from public.retours_utilisateurs where id=$1',[id])).rows.length).toBe(visible?1:0);}
 });
 it('réserve les contestations au compte artisan et les cache aux agences',async()=>{
  await refus(ENVOI,[randomUUID(),'contestation','Note contestée','Des faits à réexaminer par la plateforme',null,'/artisan/note',null],/réservée au titulaire/);
  await agir(artisan);const id=await creer('contestation',null);
  for(const user of [adminA,autre]){await agir(user);expect((await db.query('select id from public.retours_utilisateurs where id=$1',[id])).rows).toHaveLength(0);}
  await agir(sa);expect((await db.query('select id from public.retours_utilisateurs where id=$1',[id])).rows).toHaveLength(1);
 });
 it('partage les idées dans leur organisation et déduplique les soutiens',async()=>{
  const id=await creer('idee');await agir(collegue);await db.query('select public.soutenir_idee($1)',[id]);await db.query('select public.soutenir_idee($1)',[id]);
  expect((await db.query('select * from public.retours_soutiens where retour_id=$1',[id])).rows).toHaveLength(2);
  await agir(autre);await refus('select public.soutenir_idee($1)',[id],/inaccessible/);
 });
 it('ne laisse pas une agence décider ; trace la réponse SA et bloque une version périmée',async()=>{
  const id=await creer();const sql='select public.traiter_retour($1,$2,$3,$4,$5,$6)';
  await agir(adminA);await refus(sql,[id,1,'resolu','N2','Correction vérifiée',null],/réservée à la supervision/);
  await agir(sa);await db.query(sql,[id,1,'en_examen','N1','Nous vérifions le comportement décrit.',null]);
  await refus(sql,[id,1,'resolu','N2','Ancienne décision',null],/a changé/);
  await agir(auteur);const {rows:[r]}=await db.query('select etat,version,reponse from public.retours_utilisateurs where id=$1',[id]);expect(r).toMatchObject({etat:'en_examen',version:2});expect(r.reponse).toMatch(/vérifions/);
  expect((await db.query('select * from public.retours_historique where retour_id=$1',[id])).rows).toHaveLength(2);
 });
 it('exige motif et réexamen futur pour une idée non retenue, sans suppression',async()=>{
  const id=await creer('idee');await agir(sa);const sql='select public.traiter_retour($1,$2,$3,$4,$5,$6)';
  await refus(sql,[id,1,'non_retenue','N3','À étudier plus tard',null],/date future/);
  await db.query(sql,[id,1,'non_retenue','N3','À étudier après la prochaine version','2099-01-01']);
  await agir(auteur);expect((await db.query('select etat from public.retours_utilisateurs where id=$1',[id])).rows[0].etat).toBe('non_retenue');
 });
 it('regroupe les idées sans ouvrir les textes aux autres organisations',async()=>{
  const idA=await creer('idee');await agir(autre);const idB=await creer('idee',orgB);await agir(sa);await db.query('select public.regrouper_idees($1,$2)',[idA,idB]);
  expect((await db.query('select count(distinct groupe_id)::int n from public.retours_utilisateurs where id=any($1::uuid[])',[[idA,idB]])).rows[0].n).toBe(1);
  await agir(auteur);expect((await db.query('select id from public.retours_utilisateurs where id=any($1::uuid[])',[[idA,idB]])).rows.map(x=>x.id)).toEqual([idA]);
 });
 it('classe sur tout l’historique avant pagination et réserve le filtre agence à la supervision',async()=>{
  const idA=await creer('idee');await agir(collegue);await db.query('select public.soutenir_idee($1)',[idA]);
  await agir(autre);const idB=await creer('idee',orgB);await agir(sa);await db.query('select public.regrouper_idees($1,$2)',[idA,idB]);
  await db.query('reset role');
  await db.query(`insert into public.retours_utilisateurs(id,auteur_id,cle_envoi,nature,titre,description,groupe_id,organization_id)
    select id,$1,gen_random_uuid(),'idee','Idée plus récente','Une autre demande indépendante',id,$2 from (select gen_random_uuid() id from generate_series(1,55)) x`,[auteur,orgA]);
  await agir(sa);const sql='select * from public.file_retours_supervision($1,$2,$3,$4)';
  const page1=(await db.query(sql,['idee',null,null,1])).rows;expect(page1).toHaveLength(50);expect(Number(page1[0].total)).toBe(57);expect(Number(page1[0].organisations)).toBe(2);expect(Number(page1[0].soutiens)).toBe(3);
  expect((await db.query(sql,['idee',null,null,2])).rows).toHaveLength(7);
  expect((await db.query(sql,['idee',null,orgB,1])).rows.map(r=>r.retour.id)).toEqual([idB]);
  await agir(auteur);await refus(sql,['idee',null,null,1],/réservée/);
 });
 it('prépare un seul brouillon pour une idée retenue sans copier son texte privé',async()=>{
  const id=await creer('idee');await agir(sa);
  await db.query("select public.traiter_retour($1,1,'retenue','N3','Cette amélioration entre dans la préparation.',null)",[id]);
  const lire=()=>db.query('select p.id,p.statut,p.titre,p.corps from public.retours_utilisateurs r join public.publications p on p.id=r.publication_id where r.id=$1',[id]);
  const premier=(await lire()).rows[0];expect(premier.statut).toBe('brouillon');expect(premier.corps).toContain('[[à compléter');expect(premier.corps).not.toContain('sauvegarde');
  await db.query("select public.traiter_retour($1,2,'retenue','N3','Le calendrier reste à préciser.',null)",[id]);expect((await lire()).rows[0].id).toBe(premier.id);
  await agir(auteur);expect((await db.query('select id from public.publications where id=$1',[premier.id])).rows).toHaveLength(0);
 });
 it('enregistre une revue mensuelle une seule fois, avec un bilan et une garde SA',async()=>{
  await refus('select public.clore_revue_idees($1)',['Revue des priorités et prochaines étapes'],/réservée/);
  await agir(sa);await refus('select public.clore_revue_idees($1)',[''],/bilan/);
  for(let i=0;i<2;i++)await db.query('select public.clore_revue_idees($1)',['Revue des priorités et prochaines étapes']);
  expect((await db.query('select * from public.retours_revues')).rows).toHaveLength(1);
  await agir(auteur);expect((await db.query('select * from public.retours_revues')).rows).toHaveLength(0);
 });

 it('reste accessible en abonnement suspendu, après la pose des gardes métier par la migration',async()=>{
  await agir(sa);await db.query('reset role');await db.query("update public.organizations set status='suspendue' where id=$1",[orgA]);
  await agir(auteur);const id=await creer('bug');expect(id).toBeTruthy();
  const idee=await creer('idee');await agir(collegue);await db.query('select public.soutenir_idee($1)',[idee]);
 });

});
