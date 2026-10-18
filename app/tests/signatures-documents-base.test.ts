import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const url=process.env.SUPABASE_DB_URL;
if(url && (!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname) || !new URL(url).pathname.includes('ci_')))throw new Error("Une base CI locale fictive est obligatoire.");
describe.skipIf(!url)("Documents signés : plafond, isolement, finalisation",()=>{
 let db:Client,org:string,owner:string,autre:string,lot:string,bail:string,doc:string,circuit:string,tenant:string;
 const parties=[{personId:"tenant",qualite:"Locataire",prenom:"Alice",nom:"Test",email:"alice@example.test",telephone:"+33600000001",externalId:"s1",statut:"signed"},{personId:"owner",qualite:"Propriétaire",prenom:"Benoit",nom:"Test",email:"benoit@example.test",telephone:"+33600000002",externalId:"s2",statut:"signed"}];
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 afterEach(async()=>{await db.query('rollback');});
 const id=async(sql:string,params:unknown[]=[])=>String((await db.query(sql,params)).rows[0].id);
 beforeEach(async()=>{
  await db.query('begin');
  await db.query('update public.signature_budget set plafond_demi_credits=12');
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
 function archives(){return ['contrat','preuve-1','preuve-2'].map((n,i)=>({path:`${org}/signature-bail/${circuit}/${n}.pdf`,size:100,hash:String(i+1).repeat(64)}));}

 it("bloque un envoi au-delà du plafond sans réserver ni changer l’état",async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho' where id=$1",[circuit]);
  await db.query("update public.signature_budget set plafond_demi_credits=11");
  await role(null,"service_role");await db.query('savepoint refus');
  await expect(reserver()).rejects.toThrow(/limite mensuelle/);
  await db.query('rollback to refus');
  expect((await db.query('select etat from public.bail_signature_circuits where id=$1',[circuit])).rows[0].etat).toBe('pret');
  expect((await db.query('select * from public.signature_consommations where circuit_id=$1',[circuit])).rows).toHaveLength(0);
 });
 it("réserve une seule fois et ne libère pas un coût incertain lors d’une annulation",async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho' where id=$1",[circuit]);
  await role(null,"service_role");await reserver();await db.query('select public.reserver_budget_signature($1)',[circuit]);
  await db.query("update public.bail_signature_circuits set etat='annule' where id=$1",[circuit]);
  expect((await db.query('select demi_credits from public.signature_consommations where circuit_id=$1',[circuit])).rows).toEqual([{demi_credits:12}]);
 });
 it("un second document du mois est bloqué quand le premier épuise la limite",async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho' where id=$1",[circuit]);
  const autreCircuit=await id("insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,modele,prestataire) select organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,'avenant','zoho' from public.bail_signature_circuits where id=$1 returning id",[circuit]);
  await role(null,"service_role");await reserver();
  await expect(db.query('select public.reserver_envoi_signature_bail($1,$2)',[autreCircuit,owner])).rejects.toThrow(/limite mensuelle/);
 });
 it("un essai reste hors plafond et ne peut pas activer un bail",async()=>{
  await db.query("update public.bail_signature_circuits set prestataire='zoho',essai=true,etat='termine',document_signe=document_id where id=$1",[circuit]);
  await role(null,"service_role");await db.query('select public.reserver_budget_signature($1)',[circuit]);
  expect((await db.query('select * from public.signature_consommations where circuit_id=$1',[circuit])).rows).toHaveLength(0);
  await role(owner);await expect(db.query('select public.activer_bail_signature_electronique($1)',[circuit])).rejects.toThrow(/réellement signé/);
 });
 it("seul le superadmin permanent règle le plafond et reçoit les compteurs sans données personnelles",async()=>{
  await role(owner);await db.query('savepoint refus');await expect(db.query('select public.regler_budget_signature(20,1)')).rejects.toThrow(/Accès refusé/);await db.query('rollback to refus');
  expect((await db.query('select * from public.signature_budget')).rows).toHaveLength(0);
  await role(autre);await db.query('select public.regler_budget_signature(20,1)');
  const budget=(await db.query('select public.lire_budget_signatures() as budget')).rows[0].budget;
  expect(budget).toMatchObject({plafond:20,utilise:0,revision:2});
  await expect(db.query('select public.regler_budget_signature(30,1)')).rejects.toThrow(/réglage a changé/);
 });
 it("un avenant signé ne peut jamais servir à activer le bail",async()=>{
  await db.query("update public.bail_signature_circuits set modele='avenant',etat='termine',document_signe=document_id where id=$1",[circuit]);
  await role(owner);await expect(db.query('select public.activer_bail_signature_electronique($1)',[circuit])).rejects.toThrow(/réellement signé/);
 });
 it("archive un courrier sous son propre type et conserve les preuves communes",async()=>{
  await db.query("update public.documents set type='courrier' where id=$1",[doc]);
  await db.query("update public.bail_signature_circuits set modele='protocole_apurement' where id=$1",[circuit]);
  await role(null,"service_role");await reserver();const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const signe=(await db.query('select public.archiver_signature_bail($1,$2,$3) id',[circuit,jeton,JSON.stringify(archives())])).rows[0].id;
  expect((await db.query('select type from public.documents where id=$1',[signe])).rows[0].type).toBe('courrier');
 });
 it("ne mélange pas les actes de deux garants, tout en bloquant le doublon du même garant",async()=>{
  await db.query("update public.bail_signature_circuits set modele='cautionnement',options=jsonb_build_object('garant','a') where id=$1",[circuit]);
  const sql="insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,modele,options) select organization_id,bail_id,document_id,created_by,environnement,empreinte,pdf_hash,signataires,modele,jsonb_build_object('garant',$2::text) from public.bail_signature_circuits where id=$1 returning id";
  expect(await id(sql,[circuit,'b'])).toBeTruthy();await expect(db.query(sql,[circuit,'a'])).rejects.toThrow(/bail_signature_un_circuit_actif/);
 });
 async function edlCircuit(){
  const edl=await id("insert into public.etats_des_lieux(organization_id,bail_id,type,date_edl) values($1,$2,'entree',current_date) returning id",[org,bail]);
  await db.query("insert into public.edl_lignes(organization_id,edl_id,libelle,etat) values($1,$2,'Porte','bon')",[org,edl]);
  await db.query("update public.documents set type='etat_des_lieux' where id=$1",[doc]);
  await db.query("update public.bail_signature_circuits set modele='edl',cible_id=$2 where id=$1",[circuit,edl]);
  return edl;
 }
 it("fige les lignes et les mentions d’un EDL envoyé, et autorise à nouveau l’édition après annulation",async()=>{
  const edl=await edlCircuit();await role(null,'service_role');await reserver();
  await db.query('savepoint grille');await expect(db.query("update public.edl_lignes set etat='mauvais' where edl_id=$1",[edl])).rejects.toThrow(/Annulez le circuit/);await db.query('rollback to grille');
  await db.query('savepoint mentions');await expect(db.query("update public.etats_des_lieux set observations='modification' where id=$1",[edl])).rejects.toThrow(/Annulez le circuit/);await db.query('rollback to mentions');
  await db.query("update public.bail_signature_circuits set etat='annule' where id=$1",[circuit]);
  await db.query("update public.edl_lignes set etat='mauvais' where edl_id=$1",[edl]);
 });
 it("fige l’EDL avec la preuve électronique quand toutes les signatures sont archivées",async()=>{
  const edl=await edlCircuit();await role(null,'service_role');await reserver();
  const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select public.verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const signe=(await db.query('select public.archiver_signature_bail($1,$2,$3) id',[circuit,jeton,JSON.stringify(archives())])).rows[0].id;
  expect((await db.query('select etat,preuve_signature_document from public.etats_des_lieux where id=$1',[edl])).rows[0]).toEqual({etat:'signe',preuve_signature_document:signe});
  await expect(db.query("update public.edl_lignes set etat='mauvais' where edl_id=$1",[edl])).rejects.toThrow(/fig|signé/);
 });

});
