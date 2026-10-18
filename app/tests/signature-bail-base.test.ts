import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const url=process.env.SUPABASE_DB_URL;
if(url && (!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname) || !new URL(url).pathname.includes('ci_')))throw new Error("Une base CI locale fictive est obligatoire.");
describe.skipIf(!url)("Circuit de signature : droits, concurrence et archives",()=>{
 let db:Client,org:string,owner:string,autre:string,lot:string,bail:string,doc:string,circuit:string,tenant:string;
 const parties=[{personId:"tenant",qualite:"Locataire",prenom:"Alice",nom:"Test",email:"alice@example.test",telephone:"+33600000001",externalId:"s1",statut:"signed"},{personId:"owner",qualite:"Propriétaire",prenom:"Benoit",nom:"Test",email:"benoit@example.test",telephone:"+33600000002",externalId:"s2",statut:"signed"}];
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 afterEach(async()=>{await db.query('rollback');});
 const id=async(sql:string,params:unknown[]=[])=>String((await db.query(sql,params)).rows[0].id);
 beforeEach(async()=>{
  await db.query('begin');
  org=await id("insert into public.organizations(name,type,status) values('Essai signature','proprietaire_direct','active') returning id");
  owner=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  autre=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,null,'super_admin')",[owner,org,autre]);
  const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Bien fictif','appartement','1 rue Test','69001','Lyon',false) returning id",[org]);
  lot=await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','brouillon') returning id",[org,bien]);
  tenant=await id("insert into public.persons(organization_id,nom,prenom,email) values($1,'Test','Alice','alice@example.test') returning id",[org]);
  bail=await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',current_date,500,20) returning id",[org,lot,tenant]);
  doc=await id("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'bail','Contrat fictif',$1::uuid::text||'/bail.pdf','application/pdf',100,repeat('a',64)) returning id",[org]);
  await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)",[org,doc,bail]);
  circuit=await id("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires) values($1,$2,$3,$4,'production',repeat('b',64),repeat('a',64),$5) returning id",[org,bail,doc,owner,JSON.stringify(parties)]);
 });
 async function role(user:string|null,r='authenticated'){
  await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:r,aal:'aal2'})]);await db.query('set local role '+r);
 }
 async function reserver(){return db.query('select (public.reserver_envoi_signature_bail($1,$2)).id',[circuit,owner]);}
 async function suspendre(){
  await db.query('reset role');await db.query('select public.tache_systeme()');
  await db.query("update public.organizations set status='suspendue' where id=$1",[org]);
  await db.query("select set_config('gerimmo.systeme','',true)");
 }
 function archives(){return ['contrat','preuve-1','preuve-2'].map((n,i)=>({path:`${org}/signature-bail/${circuit}/${n}.pdf`,size:100,hash:String(i+1).repeat(64)}));}
 it('conserve le prestataire historique et interdit un prestataire inconnu',async()=>{
  expect((await db.query('select prestataire from public.bail_signature_circuits where id=$1',[circuit])).rows[0].prestataire).toBe('youtrust');
  await expect(db.query("update public.bail_signature_circuits set prestataire='inconnu' where id=$1",[circuit])).rejects.toThrow(/check constraint/);
 });
 it('refuse aussi une archive Zoho dépassant la limite GED de 10 Mo',async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho' where id=$1",[circuit]);
  await role(null,'service_role');await reserver();const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const pieces=archives();pieces[0].size=15_000_000;
  await expect(db.query('select public.archiver_signature_bail($1,$2,$3) id',[circuit,jeton,JSON.stringify(pieces)])).rejects.toThrow(/Archive invalide/);
 });
 it('partage le certificat Zoho entre les signataires sans collision de son empreinte',async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho' where id=$1",[circuit]);
  await role(null,'service_role');await reserver();const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const pieces=archives();pieces[2]={...pieces[1]};
  await db.query('select public.archiver_signature_bail($1,$2,$3)',[circuit,jeton,JSON.stringify(pieces)]);
  const c=(await db.query('select etat,signataires from public.bail_signature_circuits where id=$1',[circuit])).rows[0];
  expect(c.etat).toBe('termine');expect(c.signataires[0].preuveDocumentId).toBe(c.signataires[1].preuveDocumentId);
  expect((await db.query('select count(*)::int n from public.documents where organization_id=$1',[org])).rows[0].n).toBe(3);
 });
 it('refuse deux contenus différents présentés comme un même certificat commun',async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho' where id=$1",[circuit]);
  await role(null,'service_role');const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const pieces=archives();pieces[2].path=pieces[1].path;
  await expect(db.query('select public.archiver_signature_bail($1,$2,$3)',[circuit,jeton,JSON.stringify(pieces)])).rejects.toThrow(/Certificat commun incohérent/);
 });
 it('le propriétaire voit son circuit mais le superadmin de supervision n’envoie rien à sa place',async()=>{
  await role(owner);expect((await db.query('select id from public.bail_signature_circuits where id=$1',[circuit])).rows).toHaveLength(1);
  await role(autre);expect((await db.query('select id from public.bail_signature_circuits where id=$1',[circuit])).rows).toHaveLength(0);
  await expect(reserver()).rejects.toThrow(/permission denied/);
 });
 it.each(['anon','authenticated'])('le rôle %s ne peut falsifier le circuit ni appeler le classement serveur',async r=>{
  await role(owner,r);await expect(db.query("update public.bail_signature_circuits set etat='termine' where id=$1",[circuit])).rejects.toThrow(/permission denied/);
 });
 it('même un appel serveur ne réserve pas pour un autre utilisateur',async()=>{
  await role(null,'service_role');await expect(db.query('select public.reserver_envoi_signature_bail($1,$2)',[circuit,autre])).rejects.toThrow(/Accès refusé/);
 });
 it('un double clic ne réserve et ne journalise qu’un envoi',async()=>{
  await role(null,'service_role');await reserver();
  expect((await db.query("select count(*)::int n from public.audit_log where action='signature_bail_envoi_demande' and details->>'circuit_id'=$1",[circuit])).rows[0].n).toBe(1);
  await expect(reserver()).rejects.toThrow(/déjà été envoyé/);
 });
 it('un abonnement suspendu refuse une nouvelle réservation serveur',async()=>{
  await suspendre();
  await role(null,'service_role');await expect(reserver()).rejects.toThrow(/Abonnement suspendu/);
 });
 it('la suspension laisse annuler une préparation mais ne permet pas de la réutiliser',async()=>{
  await suspendre();
  await role(null,'service_role');
  await db.query("update public.bail_signature_circuits set etat='annule' where id=$1",[circuit]);
  await expect(db.query("update public.bail_signature_circuits set etat='pret' where id=$1",[circuit])).rejects.toThrow(/Abonnement suspendu/);
 });
 it('archive un circuit déjà engagé après suspension et restaure le contexte de garde',async()=>{
  await role(null,'service_role');await reserver();await db.query('reset role');
  await suspendre();
  await role(null,'service_role');const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  await db.query('select public.archiver_signature_bail($1,$2,$3)',[circuit,jeton,JSON.stringify(archives())]);
  expect((await db.query('select etat from public.bail_signature_circuits where id=$1',[circuit])).rows[0].etat).toBe('termine');
  expect((await db.query("select current_setting('gerimmo.systeme',true) reglage")).rows[0].reglage).not.toBe('on');
 });
 it('interdit deux circuits actifs sur deux versions du même bail',async()=>{
  await expect(db.query("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires) select organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires from public.bail_signature_circuits where id=$1",[circuit])).rejects.toThrow(/bail_signature_un_circuit_actif/);
 });
 it.each(['update','delete'])('le PDF envoyé est verrouillé contre %s',async op=>{
  await role(null,'service_role');await reserver();
  const sql=op==='update'?"update public.documents set titre='Modifié' where id=$1":"delete from public.documents where id=$1";
  await expect(db.query(sql,[doc])).rejects.toThrow(/Annulez le circuit/);
 });
 it('empêche de supprimer le brouillon pendant un envoi',async()=>{
  await role(null,'service_role');await reserver();await db.query('reset role');
  await expect(db.query('delete from public.baux where id=$1',[bail])).rejects.toThrow(/Annulez le circuit/);
 });
 it('autorise la suppression d’une simple préparation en conservant son historique',async()=>{
  await db.query('delete from public.document_liens where document_id=$1',[doc]);
  await db.query('delete from public.baux where id=$1',[bail]);
  expect((await db.query('select etat,bail_id from public.bail_signature_circuits where id=$1',[circuit])).rows[0]).toEqual({etat:'annule',bail_id:null});
 });
 it('un seul travailleur peut archiver le circuit',async()=>{
  await role(null,'service_role');
  const a=(await db.query('select public.verrouiller_signature_bail($1,gen_random_uuid()) ok',[circuit])).rows[0].ok;
  const b=(await db.query('select public.verrouiller_signature_bail($1,gen_random_uuid()) ok',[circuit])).rows[0].ok;
  expect([a,b]).toEqual([true,false]);
 });
 it('archive le signé et une preuve par personne une seule fois, sans activer le bail',async()=>{
  await role(null,'service_role');await reserver();
  const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const result=await db.query('select public.archiver_signature_bail($1,$2,$3) id',[circuit,jeton,JSON.stringify(archives())]);
  const signe=result.rows[0].id;
  expect((await db.query('select public.archiver_signature_bail($1,$2,$3) id',[circuit,jeton,JSON.stringify(archives())])).rows[0].id).toBe(signe);
  expect((await db.query('select signataires,etat from public.bail_signature_circuits where id=$1',[circuit])).rows[0].signataires.every((p:{preuveDocumentId:string})=>p.preuveDocumentId)).toBe(true);
  expect((await db.query('select count(*)::int n from public.documents where organization_id=$1',[org])).rows[0].n).toBe(4);
  expect((await db.query('select etat from public.baux where id=$1',[bail])).rows[0].etat).toBe('brouillon');
 });
 it('refuse les archives incomplètes ou provenant d’un autre espace',async()=>{
  await role(null,'service_role');const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const pieces=archives();pieces[1].path='autre-espace/preuve.pdf';
  await expect(db.query('select public.archiver_signature_bail($1,$2,$3)',[circuit,jeton,JSON.stringify(pieces)])).rejects.toThrow(/Archive invalide/);
 });
 it('une signature sandbox n’active jamais le contrat',async()=>{
  await db.query("update public.bail_signature_circuits set environnement='sandbox',etat='termine',document_signe=$1 where id=$2",[doc,circuit]);
  await role(owner);await expect(db.query('select public.activer_bail_signature_electronique($1)',[circuit])).rejects.toThrow(/réellement signé/);
 });
 it.each([null,'[]'])('refuse une archive vide : %s',async pieces=>{
  await role(null,'service_role');const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  await expect(db.query('select public.archiver_signature_bail($1,$2,$3)',[circuit,jeton,pieces])).rejects.toThrow(/Archives incomplètes/);
 });
 it('refuse un archivage sans verrou',async()=>{
  await role(null,'service_role');
  await expect(db.query('select public.archiver_signature_bail($1,null,$2)',[circuit,JSON.stringify(archives())])).rejects.toThrow(/Verrou expiré/);
 });
 it('ne révèle pas à un autre espace si un fichier est en signature',async()=>{
  await role(null,'service_role');await reserver();
  await role(owner);expect((await db.query('select public.fichier_en_signature_bail($1) actif',[org+'/bail.pdf'])).rows[0].actif).toBe(true);
  await role(autre);expect((await db.query('select public.fichier_en_signature_bail($1) actif',[org+'/bail.pdf'])).rows[0].actif).toBe(false);
 });
});
