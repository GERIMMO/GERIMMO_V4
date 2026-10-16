/** Deux connexions réelles : la deuxième passe attend la première puis ne reçoit aucun envoi à effectuer. */
import { randomInt } from 'node:crypto';
import { Client } from 'pg';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
import { supprimerOrganisationDeTest } from './fixtures/nettoyer-organisation';
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)('D22 relance — réservation concurrente réelle',()=>{
 let db:Client,a:Client,b:Client,org:string,artisan:string,demande:string;
 const inserer=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows[0].id as string;
 beforeAll(async()=>{
  db=new Client({connectionString:url});a=new Client({connectionString:url});b=new Client({connectionString:url});
  await Promise.all([db.connect(),a.connect(),b.connect()]);
  await db.query('begin');
  org=await inserer("insert into public.organizations(name,status) values('TEST D22 concurrence relance','active') returning id");
  artisan=await inserer("insert into public.artisans(raison_sociale,siret,telephone,email,statut_plateforme,siret_etat) values('TEST D22 concurrence',$1,'0600000000','artisan@example.invalid','valide','verifie') returning id",[String(randomInt(10000000000000,99999999999999))]);
  const bien=await inserer("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST','appartement','1 rue TEST','75001','Paris') returning id",[org]);
  const lot=await inserer("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','disponible') returning id",[org,bien]);
  const incident=await inserer("insert into public.incidents(organization_id,numero,lot_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,'TEST-'||gen_random_uuid(),$2,'espace_locataire','plomberie_canalisation','TEST','qualifie','proprietaire','TEST') returning id",[org,lot]);
  const mission=await inserer("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut,debut_prevu,fin_prevue) values($1,$2,$3,'entretien_courant','planifiee',now()+interval '7 days',now()+interval '7 days 2 hours') returning id",[org,incident,artisan]);
  demande=await inserer("insert into public.intervention_demandes_rdv(organization_id,intervention_id,rdv_debut,type,motif_code,expire_le,cle_envoi) values($1,$2,now()+interval '7 days','report','travail',now()+interval '48 hours',gen_random_uuid()) returning id",[org,mission]);
  await db.query('commit');
 });
 afterAll(async()=>{
  await Promise.all([a?.query('rollback'),b?.query('rollback')]);
  await db?.query('rollback');
  await supprimerOrganisationDeTest(db,org,[]);
  if(artisan)await db.query('delete from public.artisans where id=$1',[artisan]);
  await Promise.all([a?.end(),b?.end(),db?.end()]);
 });
 it('une seule réservation malgré deux passes qui se croisent, puis aucun rejeu après perte de réponse',async()=>{
  for(const c of [a,b]) {await c.query('begin');await c.query('set local role service_role');}
  const premiere=(await a.query('select public.reserver_relance_report_rdv($1) as r',[demande])).rows[0].r;
  expect(premiere.demande_id).toBe(demande);
  const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  const seconde=b.query('select public.reserver_relance_report_rdv($1) as r',[demande]);
  let bloque=false;
  for(let n=0;n<100;n++) {const r=(await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];if(r.wait_event_type==='Lock'){bloque=true;break;}await new Promise(r=>setTimeout(r,20));}
  expect(bloque).toBe(true);
  await a.query('commit');
  expect((await seconde).rows[0].r).toBeNull();await b.query('commit');
  // Le service aurait pu accepter le courrier ; aucune confirmation n'est écrite. La prochaine passe reste exclue.
  expect((await db.query('select public.reserver_relance_report_rdv($1) as r',[demande])).rows[0].r).toBeNull();
 });
 it('une reprise exige le bon identifiant et exclut un nettoyage tardif ou une tentative déjà notée',async()=>{
  const ancienne=(await db.query('select relance_reservation_id from public.intervention_demandes_rdv where id=$1',[demande])).rows[0].relance_reservation_id;
  expect(ancienne).toBeTruthy();
  for(const role of ['anon','authenticated']) {
   expect((await db.query("select has_function_privilege($1,'public.liberer_relance_report_rdv(uuid,uuid)','execute') ok",[role])).rows[0].ok).toBe(false);
  }
  await a.query('begin');await a.query('set local role service_role');
  expect((await a.query('select public.liberer_relance_report_rdv($1,gen_random_uuid()) ok',[demande])).rows[0].ok).toBe(false);
  expect((await a.query('select public.liberer_relance_report_rdv($1,$2) ok',[demande,ancienne])).rows[0].ok).toBe(true);
  const nouvelle=(await a.query('select public.reserver_relance_report_rdv($1) r',[demande])).rows[0].r;
  expect(nouvelle.reservation_id).not.toBe(ancienne);
  await b.query('begin');await b.query('set local role service_role');
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  const concurrente=b.query('select public.reserver_relance_report_rdv($1) r',[demande]);
  let bloque=false;
  for(let n=0;n<100;n++){if((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0].wait_event_type==='Lock'){bloque=true;break;}await new Promise(r=>setTimeout(r,20));}
  expect(bloque).toBe(true);await a.query('commit');
  expect((await concurrente).rows[0].r).toBeNull();await b.query('commit');
  expect((await db.query('select public.liberer_relance_report_rdv($1,$2) ok',[demande,ancienne])).rows[0].ok).toBe(false);
  await db.query('select public.noter_relance_report_rdv($1,false)',[demande]);
  expect((await db.query('select public.liberer_relance_report_rdv($1,$2) ok',[demande,nouvelle.reservation_id])).rows[0].ok).toBe(false);
  expect((await db.query('select public.reserver_relance_report_rdv($1) r',[demande])).rows[0].r).toBeNull();
 });
});
