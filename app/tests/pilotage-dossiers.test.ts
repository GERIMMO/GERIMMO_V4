import { config } from "dotenv";
import { Client } from "pg";
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({path:".env.local"});const DB_URL=process.env.SUPABASE_DB_URL;verifierBaseDeTest(DB_URL);
describe.skipIf(!DB_URL)("Pilotage des dossiers et continuité",()=>{
 let db:Client, org:string, autreOrg:string, admin:string, autreAdmin:string, sa:string, relais:string, relaisEmail:string, incident:string, incidentB:string, bail:string, appel:string;
 const id=async(sql:string,args:unknown[]=[]) => (await db.query<{id:string}>(sql,args)).rows[0].id;
 const utilisateur=()=>id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
 values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-pilotage-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
 const agir=async(compte:string|null,aal="aal2",role="authenticated")=>{await db.query("reset role");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role,aal})]);await db.query(`set local role ${role}`);};
 const refus=async(sql:string,args:unknown[]=[])=>{await db.query("savepoint refus");try{await db.query(sql,args);return "";}catch(e){await db.query("rollback to savepoint refus");return (e as Error).message;}finally{await db.query("release savepoint refus");}};
 const lot=async(org:string)=>{const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien pilotage','appartement','1 rue du Test','75001','Paris') returning id",[org]);return id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot pilotage') returning id",[org,bien]);};
 const actualiser=()=>db.query("select public.actualiser_orchestration() n");
 beforeAll(async()=>{
  db=new Client({connectionString:DB_URL});await db.connect();await db.query("begin");
  org=await id("insert into public.organizations(name,status,type) values('Pilotage A','active','agence') returning id");autreOrg=await id("insert into public.organizations(name,status,type) values('Pilotage B','active','agence') returning id");
  [admin,autreAdmin,sa,relais]=[await utilisateur(),await utilisateur(),await utilisateur(),await utilisateur()];
  relaisEmail=(await db.query("select email from public.accounts where id=$1",[relais])).rows[0].email;
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,null,'super_admin')",[admin,org,autreAdmin,autreOrg,sa]);
  const lotA=await lot(org),lotB=await lot(autreOrg);
  const personne=await id("insert into public.persons(organization_id,nom) values($1,'Locataire fictif') returning id",[org]);
  bail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon',current_date,700,50) returning id",[org,lotA,personne]);
  appel=await id("insert into public.appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) values($1,$2,current_date,700,50,750,current_date) returning id",[org,bail]);
  const creerIncident=(org:string,lot:string)=>id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description) values($1,$2,'INC-PILOTAGE','agence','plomberie_canalisation','Incident fictif de pilotage') returning id",[org,lot]);
  incident=await creerIncident(org,lotA);incidentB=await creerIncident(autreOrg,lotB);
 });
 afterAll(async()=>{await db?.query("rollback");await db?.end();});beforeEach(async()=>{await db.query("savepoint cas");});afterEach(async()=>{await db.query("rollback to savepoint cas");await db.query("release savepoint cas");});
 it("est idempotent et retire la tâche active quand le dossier est clos",async()=>{
  await agir(null,"aal1","service_role");expect((await actualiser()).rows[0].n).toBeGreaterThan(0);expect((await actualiser()).rows[0].n).toBe(0);
  const avant=(await db.query("select id,updated_at from public.orchestration_cases where dossier_id=$1",[incident])).rows[0];await actualiser();expect((await db.query("select id,updated_at from public.orchestration_cases where dossier_id=$1",[incident])).rows[0]).toEqual(avant);
  await db.query("update public.incidents set etat='clos',clos_le=now(),cloture_motif='sans_suite' where id=$1",[incident]);await actualiser();expect((await db.query("select etat from public.orchestration_cases where dossier_id=$1",[incident])).rows[0].etat).toBe("termine");
 });
 it("refuse le moteur aux agences et ne montre que leur propre file",async()=>{
  await agir(null,"aal1","service_role");await actualiser();
  for(const acteur of [null,admin,autreAdmin]){await agir(acteur);expect(await refus("select public.actualiser_orchestration()")).toMatch(/supervision/i);}
  await agir(admin);expect((await db.query("select id from public.orchestration_cases where dossier_id=$1",[incident])).rows).toHaveLength(1);expect((await db.query("select id from public.orchestration_cases where dossier_id=$1",[incidentB])).rows).toHaveLength(0);
  await agir(sa,"aal1");expect(await refus("select public.actualiser_orchestration()")).toMatch(/supervision/i);
 });
 it("ne compte pas une origine inconnue et distingue action humaine, automatique et lecture",async()=>{
  expect((await db.query("select id from public.automation_events where dossier_id=$1",[bail])).rows).toHaveLength(0);
  const evenement="insert into public.incident_evenements(organization_id,incident_id,type,acteur_account_id) values($1,$2,'qualification',$3) returning id";
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin,role:"authenticated",aal:"aal2"})]);await id(evenement,[org,incident,admin]);
  await agir(null,"aal1","service_role");await id(evenement,[org,incident,null]);
  const mesures=(await db.query("select origine,sans_appel,clics_evites from public.automation_events where dossier_id=$1 order by origine",[incident])).rows;
  expect(mesures).toEqual([{origine:"automatique",sans_appel:null,clics_evites:0},{origine:"humaine",sans_appel:null,clics_evites:0}]);
  await db.query("select * from public.incidents where id=$1",[incident]);expect((await db.query("select id from public.automation_events where dossier_id=$1",[incident])).rows).toHaveLength(2);
 });
 it("ne mesure qu’une fois la confirmation d’un avis de loyer envoyé",async()=>{
  await agir(null,"aal1","service_role");await db.query("update public.appels_loyer set email_envoye_at=now() where id=$1",[appel]);await db.query("update public.appels_loyer set email_envoye_at=now()+interval '1 minute' where id=$1",[appel]);
  const messages=(await db.query("select origine,messages_envoyes from public.automation_events where cle_unique=$1",[`appels_loyer:${appel}:premier_envoi`])).rows;expect(messages).toEqual([{origine:"automatique",messages_envoyes:1}]);
 });
 it("réserve création et révocation au permanent avec double vérification",async()=>{
  const sql="select public.creer_relais_supervision($1,7,'Absence temporaire test') id";
  for(const acteur of [null,admin,relais]){await agir(acteur);expect(await refus(sql,[relaisEmail])).toMatch(/permanent/i);}
  await agir(sa,"aal1");expect(await refus(sql,[relaisEmail])).toMatch(/permanent/i);
  await agir(sa);const delegation=await id(sql,[relaisEmail]);await agir(admin);expect(await refus("select public.revoquer_relais_supervision($1)",[delegation])).toMatch(/permanent/i);await agir(sa);await db.query("select public.revoquer_relais_supervision($1)",[delegation]);await agir(relais);expect(await refus("select * from public.resume_relais_supervision()")).toMatch(/pas actif/i);
 });
 it("refuse les durées hors limites et le relais sur son propre compte",async()=>{
  await agir(sa);for(const jours of [null,0,91,-1])expect(await refus("select public.creer_relais_supervision($1,$2,'Absence temporaire')",[relaisEmail,jours])).toMatch(/1 à 90/i);
  const propre=(await db.query("select email from public.accounts where id=$1",[sa])).rows[0].email;expect(await refus("select public.creer_relais_supervision($1,1,'Absence temporaire')",[propre])).toMatch(/autre compte/i);
 });
 it("le relais consulte une synthèse sans accéder aux dossiers et expire effectivement",async()=>{
  await agir(null,"aal1","service_role");await actualiser();await agir(sa);const delegation=await id("select public.creer_relais_supervision($1,1,'Absence temporaire') id",[relaisEmail]);
  await agir(relais);const synthese=(await db.query("select * from public.resume_relais_supervision()")).rows;expect(synthese.length).toBeGreaterThan(0);expect(Object.keys(synthese[0]).sort()).toEqual(["a_traiter","en_attente","famille","urgents"]);
  expect((await db.query("select id from public.orchestration_cases where organization_id=$1",[org])).rows).toHaveLength(0);expect((await db.query("select public.is_super_admin() sa")).rows[0].sa).toBe(false);
  await agir(relais,"aal1");expect(await refus("select * from public.resume_relais_supervision()")).toMatch(/pas actif/i);
  await agir(sa);await db.query("select public.revoquer_relais_supervision($1)",[delegation]);
  await db.query("insert into public.supervision_delegations(account_id,commence_le,termine_le,pouvoirs,motif,cree_par) values($1,now()-interval '2 days',now()-interval '1 day',array['lecture'],'Relais expiré de test',$2)",[relais,sa]);
  await agir(relais);expect(await refus("select * from public.resume_relais_supervision()")).toMatch(/pas actif/i);
 });
});
