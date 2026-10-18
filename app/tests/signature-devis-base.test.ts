import {Client} from 'pg';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)('Devis signé : offre figée, droits et absence de mission implicite',()=>{
 let db:Client,org:string,owner:string,artisanCompte:string,artisan:string,lot:string,incident:string,devis:string,sollicitation:string,doc:string,circuit:string;
 const id=async(sql:string,p:unknown[]=[])=>String((await db.query(sql,p)).rows[0].id);
 async function role(user:string|null,r='authenticated'){await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:r,aal:'aal2'})]);await db.query('set local role '+r);}
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});afterAll(async()=>{await db?.end();});afterEach(async()=>{await db.query('rollback');});
 beforeEach(async()=>{
  await db.query('begin');
  org=await id("insert into organizations(name,type,status) values('Signature devis fictive','proprietaire_direct','active') returning id");
  owner=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  artisanCompte=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[owner,org]);
  const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Fictif','appartement','1 rue Test','75011','Paris') returning id",[org]);
  lot=await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Fictif','disponible') returning id",[org,bien]);
  const person=await id("insert into persons(organization_id,nom,prenom,email,telephone) values($1,'Test','Client','client@example.test','0600000001') returning id",[org]);
  await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date)",[org,lot,person]);
  artisan=await id("insert into artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'Fictif',floor(random()*9e13+1e13)::bigint::text,'0600000000','valide','verifie') returning id",[artisanCompte]);
  incident=await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','Test signature','qualifie','proprietaire','Essai fictif') returning id",[org,lot]);
  const consultation=await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,incident]);
  sollicitation=await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'devis_depose') returning id",[org,consultation,incident,artisan]);
  doc=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'devis','Offre fictive',$1::uuid::text||'/offre.pdf','application/pdf',100,repeat('a',64)) returning id",[org]);
  devis=await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,document_id) values($1,$2,$3,$4,11000,'Fictif',current_date+10,$5) returning id",[org,sollicitation,incident,artisan,doc]);
  const parties=[{personId:person,qualite:'Propriétaire',prenom:'Client',nom:'Test',email:'client@example.test',telephone:'+33600000001',externalId:'s1',statut:'signed'}];
  circuit=await id("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,annexes) values($1,$2,'devis_artisan',$3,$4,$5,'zoho','production',repeat('b',64),repeat('a',64),$6,$7) returning id",[org,incident,devis,doc,owner,JSON.stringify(parties),JSON.stringify([{id:doc,empreinte:'a'.repeat(64)}])]);
  await db.query('update signature_budget set devis_actif=true,plafond_demi_credits=100');
 });
 const reserver=()=>db.query('select public.reserver_envoi_signature_bail($1,$2)',[circuit,owner]);
 it('réserve un seul signataire client et son coût sans créer de mission',async()=>{
  await role(owner);const r=(await db.query('select lire_signature_devis($1,$2) v',[org,devis])).rows[0].v;
  expect(r.proprietaires).toHaveLength(1);expect(r.document.id).toBe(doc);
  await role(null,'service_role');await reserver();
  expect((await db.query('select demi_credits from signature_consommations where circuit_id=$1',[circuit])).rows[0].demi_credits).toBe(11);
  expect((await db.query('select id from incident_interventions where incident_id=$1',[incident])).rows).toHaveLength(0);
 });
 it('ne divulgue pas les propriétaires à un artisan ou à un autre compte',async()=>{
  await role(artisanCompte);await expect(db.query('select lire_signature_devis($1,$2)',[org,devis])).rejects.toThrow(/Accès refusé/);
 });
 it('refuse une offre expirée avant toute réservation et tout coût',async()=>{
  await db.query('update incident_devis set valide_jusqu_au=current_date-1 where id=$1',[devis]);await role(null,'service_role');
  await expect(reserver()).rejects.toThrow(/expiré/);
 });
 it('fige l’offre envoyée jusqu’à annulation, sans bloquer les anciennes versions historiques',async()=>{
  await role(null,'service_role');await reserver();await db.query('savepoint modification');
  await expect(db.query("update incident_devis set description='autre' where id=$1",[devis])).rejects.toThrow(/Annulez/);
  await db.query('rollback to modification');await db.query("update bail_signature_circuits set etat='annule' where id=$1",[circuit]);
  await db.query("update incident_devis set description='révision' where id=$1",[devis]);
 });
 it('empêche deux offres simultanées même sans bail associé',async()=>{
  await expect(db.query("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires) select organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires from bail_signature_circuits where id=$1",[circuit])).rejects.toThrow(/signature_devis_une_offre/);
 });
 it('archive le signé et le certificat pour les deux parties sans confier de mission',async()=>{
  await role(null,'service_role');await reserver();const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select verrouiller_signature_bail($1,$2)',[circuit,jeton]);
  const archives=['contrat','preuve-1'].map((n,i)=>({path:`${org}/signature-bail/${circuit}/${n}.pdf`,size:100,hash:String(i+1).repeat(64)}));
  await db.query('select archiver_signature_bail($1,$2,$3)',[circuit,jeton,JSON.stringify(archives)]);
  for(const user of [owner,artisanCompte]){await role(user);const a=(await db.query('select lire_signature_devis_archive($1) v',[sollicitation])).rows[0].v;expect(a.etat).toBe('termine');expect(a.preuve_path).toContain('preuve-1');}
  await role(null,'service_role');expect((await db.query('select id from incident_interventions where incident_id=$1',[incident])).rows).toHaveLength(0);
 });
 it('un autre client ne récupère pas l’archive du devis',async()=>{
  const autre=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  await role(autre);await expect(db.query('select lire_signature_devis_archive($1)',[sollicitation])).rejects.toThrow(/Accès refusé/);
 });
});
