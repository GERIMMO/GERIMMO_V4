import {Client} from 'pg';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)('Devis signé : offre figée, droits et absence de mission implicite',()=>{
 let db:Client,org:string,owner:string,artisanCompte:string,artisan:string,lot:string,incident:string,devis:string,sollicitation:string,doc:string,circuit:string;
 const id=async(sql:string,p:unknown[]=[])=>String((await db.query(sql,p)).rows[0].id);
 async function role(user:string|null,r='authenticated'){await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:r,aal:'aal2'})]);await db.query('set local role '+r);}
 /** Lecture hors de tout rôle (propriétaire de la base) : l'état réel, sans politique de lecture. */
 const lire=async(sql:string,p:unknown[]=[])=>{await db.query('reset role');return (await db.query(sql,p)).rows[0];};
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
  // Artisan affectable (retenir_devis le revérifie) : validé, SIRET vérifié, visible, du métier de la consultation.
  artisan=await id("insert into artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite) values($1,'Fictif',floor(random()*9e13+1e13)::bigint::text,'0600000000','valide','verifie','publique') returning id",[artisanCompte]);
  await db.query("insert into artisan_metiers values($1,'plomberie')",[artisan]);
  incident=await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','Test signature','qualifie','proprietaire','Essai fictif') returning id",[org,lot]);
  const consultation=await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,incident]);
  sollicitation=await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'devis_depose') returning id",[org,consultation,incident,artisan]);
  doc=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'devis','Offre fictive',$1::uuid::text||'/offre.pdf','application/pdf',100,repeat('a',64)) returning id",[org]);
  devis=await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,document_id) values($1,$2,$3,$4,11000,'Fictif',current_date+10,$5) returning id",[org,sollicitation,incident,artisan,doc]);
  const parties=[{personId:person,qualite:'Propriétaire',prenom:'Client',nom:'Test',email:'client@example.test',telephone:'+33600000001',externalId:'s1',statut:'signed'}];
  circuit=await id("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,annexes) values($1,$2,'devis_artisan',$3,$4,$5,'zoho','production',repeat('b',64),repeat('a',64),$6,$7) returning id",[org,incident,devis,doc,owner,JSON.stringify(parties),JSON.stringify([{id:doc,empreinte:'a'.repeat(64)}])]);
  await db.query('update signature_budget set devis_actif=true,plafond_demi_credits=100');
 });
 const reserver=(c=circuit)=>db.query('select public.reserver_envoi_signature_bail($1,$2)',[c,owner]);
 /** Le circuit va jusqu'à l'archive signée (etat 'termine', PDF signé et certificat), comme le travailleur de signature. */
 async function archiver(c=circuit,graine=1){
  await role(null,'service_role');await reserver(c);const jeton=(await db.query('select gen_random_uuid() id')).rows[0].id;
  await db.query('select verrouiller_signature_bail($1,$2)',[c,jeton]);
  // Empreintes distinctes par archive (documents_empreinte_unique) : chiffres `graine` et `graine+1`.
  const archives=['contrat','preuve-1'].map((n,i)=>({path:`${org}/signature-bail/${c}/${n}.pdf`,size:100,hash:String(graine+i).repeat(64)}));
  await db.query('select archiver_signature_bail($1,$2,$3)',[c,jeton,JSON.stringify(archives)]);
 }
 const etatDevis=(d=devis)=>lire('select d.statut::text statut,s.statut::text sollicitation,i.etat::text incident from incident_devis d join incident_sollicitations s on s.id=d.sollicitation_id join incidents i on i.id=d.incident_id where d.id=$1',[d]);
 const etatCircuit=(c=circuit)=>lire('select etat,document_signe from bail_signature_circuits where id=$1',[c]);
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
  await db.query('rollback to modification');
  // B5 (19/10) : le SORT de l'offre engagée reste décidable (caducité, artisan écarté) ; seul le statut change.
  await db.query("update incident_devis set statut='expire' where id=$1",[devis]);expect((await etatDevis()).statut).toBe('expire');
  await db.query('rollback to modification');
  await db.query("update incident_devis set statut='annule' where id=$1",[devis]);expect((await etatDevis()).statut).toBe('annule');
  await db.query('rollback to modification');await db.query("update bail_signature_circuits set etat='annule' where id=$1",[circuit]);
  await db.query("update incident_devis set description='révision' where id=$1",[devis]);
 });
 it('empêche deux offres simultanées même sans bail associé',async()=>{
  await expect(db.query("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires) select organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires from bail_signature_circuits where id=$1",[circuit])).rejects.toThrow(/signature_devis_une_offre/);
 });
 it('archive le signé et le certificat pour les deux parties sans confier de mission',async()=>{
  await archiver();
  for(const user of [owner,artisanCompte]){await role(user);const a=(await db.query('select lire_signature_devis_archive($1) v',[sollicitation])).rows[0].v;expect(a.etat).toBe('termine');expect(a.preuve_path).toContain('preuve-1');}
  await role(null,'service_role');expect((await db.query('select id from incident_interventions where incident_id=$1',[incident])).rows).toHaveLength(0);
 });
 it('un autre client ne récupère pas l’archive du devis',async()=>{
  const autre=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  await role(autre);await expect(db.query('select lire_signature_devis_archive($1)',[sollicitation])).rejects.toThrow(/Accès refusé/);
 });
 // Audit du 19/10 (B5) : un devis SIGNÉ garde son contenu et son archive, mais son sort reste décidable.
 it('un devis signé peut expirer ou être annulé ; son contenu, son archive et le circuit terminé restent figés',async()=>{
  await archiver();await role(null,'service_role');await db.query('savepoint sort');
  await db.query("update incident_devis set statut='expire' where id=$1",[devis]);
  expect((await etatDevis()).statut).toBe('expire');expect((await etatCircuit()).etat).toBe('termine');expect((await etatCircuit()).document_signe).not.toBeNull();
  await role(owner);const a=(await db.query('select lire_signature_devis_archive($1) v',[sollicitation])).rows[0].v;expect(a.etat).toBe('termine');expect(a.preuve_path).toContain('preuve-1');
  await db.query('rollback to sort');
  await db.query("update incident_devis set statut='annule' where id=$1",[devis]);expect((await etatDevis()).statut).toBe('annule');
  await db.query('rollback to sort');
  await db.query("update incident_devis set statut='retenu',retenu_le=now(),retenu_par=$2 where id=$1",[devis,owner]);
  await db.query("update incident_devis set statut='annule' where id=$1",[devis]);expect((await etatDevis()).statut).toBe('annule');
  await db.query('rollback to sort');
  for(const sql of ["update incident_devis set statut='refuse' where id=$1","update incident_devis set statut='revise' where id=$1","update incident_devis set statut='non_retenu' where id=$1",
    "update incident_devis set description='autre' where id=$1","update incident_devis set statut='expire',valide_jusqu_au=valide_jusqu_au-1 where id=$1","update incident_devis set statut='annule',montant_ttc_cents=1 where id=$1"]){
   await expect(db.query(sql,[devis]),sql).rejects.toThrow(/conservée/);await db.query('rollback to sort');
  }
  await expect(db.query('delete from incident_devis where id=$1',[devis])).rejects.toThrow(/engagé/);await db.query('rollback to sort');
 });
 it('la tâche de nuit expire un devis signé périmé et libère sa sollicitation ; le circuit terminé et son archive restent',async()=>{
  // Avant la signature (circuit 'pret', contenu encore libre) l'offre devient périmée ; le circuit est ensuite porté directement
  // à 'termine' avec son archive : la réservation refuserait une offre périmée, et le déclencheur refuserait de changer la validité après.
  await role(null,'service_role');
  await db.query("update incident_devis set valide_jusqu_au=(now() at time zone 'Europe/Paris')::date-1 where id=$1",[devis]);
  const signe=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'devis','Offre fictive — signé',$1::uuid::text||'/offre-signe.pdf','application/pdf',100,repeat('c',64)) returning id",[org]);
  await db.query("update bail_signature_circuits set etat='termine',document_signe=$2::uuid,signataires=jsonb_set(signataires,'{0,preuveDocumentId}',to_jsonb(($2::uuid)::text)) where id=$1",[circuit,signe]);
  // La commande exacte de pg_cron : rôle de la base, sans jeton.
  await db.query('reset role');await db.query("select set_config('request.jwt.claims','',true)");
  const n=(await db.query('select public.maintenance_artisans_interne() n')).rows[0].n;
  expect(n).toBeGreaterThanOrEqual(1);
  expect(await etatDevis()).toEqual({statut:'expire',sollicitation:'expiree',incident:'qualifie'});
  expect(await etatCircuit()).toEqual({etat:'termine',document_signe:signe});
  await role(owner);expect((await db.query('select lire_signature_devis_archive($1) v',[sollicitation])).rows[0].v.etat).toBe('termine');
 });
 it('après signature, confier la mission puis l’annuler, ou la voir refusée par l’artisan, reste possible',async()=>{
  await archiver();
  await role(owner);const intervention=(await db.query('select retenir_devis($1,$2) id',[org,devis])).rows[0].id;
  expect((await etatDevis()).statut).toBe('retenu');await db.query('savepoint mission');
  await role(owner);await db.query("select annuler_mission($1,$2,'Travaux reportés par le propriétaire')",[org,intervention]);
  expect(await etatDevis()).toEqual({statut:'annule',sollicitation:'retenue',incident:'qualifie'});
  await db.query('rollback to mission');
  await role(artisanCompte);await db.query("select refuser_mission($1,'Indisponible à ces dates')",[intervention]);
  expect(await etatDevis()).toEqual({statut:'annule',sollicitation:'retenue',incident:'qualifie'});
  expect((await etatCircuit()).etat).toBe('termine');
 });
 it('une seule offre signée vivante par dossier : la seconde se signe après le désistement de la première, et les deux circuits terminés coexistent',async()=>{
  const compteB=await id("insert into auth.users(id,email) values(gen_random_uuid(),gen_random_uuid()||'@example.test') returning id");
  const artisanB=await id("insert into artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite) values($1,'Fictif B',floor(random()*9e13+1e13)::bigint::text,'0600000002','valide','verifie','publique') returning id",[compteB]);
  const consultation=(await lire('select consultation_id id from incident_sollicitations where id=$1',[sollicitation])).id;
  const sollB=await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'devis_depose') returning id",[org,consultation,incident,artisanB]);
  const docB=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'devis','Offre B',$1::uuid::text||'/offre-b.pdf','application/pdf',100,repeat('d',64)) returning id",[org]);
  const devisB=await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,document_id) values($1,$2,$3,$4,12000,'Fictif B',current_date+10,$5) returning id",[org,sollB,incident,artisanB,docB]);
  await archiver();
  // L'index ne retient plus le circuit terminé : le circuit de B se prépare…
  const circuitB=await id("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,annexes) select organization_id,incident_id,modele,$2,$3,created_by,prestataire,environnement,repeat('e',64),repeat('d',64),signataires,$4 from bail_signature_circuits where id=$1 returning id",[circuit,devisB,docB,JSON.stringify([{id:docB,empreinte:'d'.repeat(64)}])]);
  // … mais tant que l'offre signée de A est vivante, ni la lecture ni la réservation ne passent.
  await role(null,'service_role');await db.query('savepoint refus');
  await expect(reserver(circuitB)).rejects.toThrow(/Une offre déjà signée est encore valable sur ce dossier/);await db.query('rollback to refus');
  await role(owner);await db.query('savepoint refus');
  await expect(db.query('select lire_signature_devis($1,$2)',[org,devisB])).rejects.toThrow(/Une offre déjà signée est encore valable sur ce dossier/);await db.query('rollback to refus');
  // Désistement : A est retenu (B bascule « non retenu », la consultation se ferme) puis la mission est refusée par l'artisan ;
  // le devis signé tombe « annulé », le dossier redevient à affecter.
  await role(owner);const intervention=(await db.query('select retenir_devis($1,$2) id',[org,devis])).rows[0].id;
  await role(artisanCompte);await db.query("select refuser_mission($1,'Indisponible')",[intervention]);
  expect(await etatDevis()).toEqual({statut:'annule',sollicitation:'retenue',incident:'qualifie'});
  expect((await etatDevis(devisB)).statut).toBe('non_retenu');
  // Nouvelle consultation, nouvelle offre de B : elle se lit, se réserve et s'archive ; deux circuits terminés coexistent sur le dossier.
  await role(null,'service_role');await db.query("update bail_signature_circuits set etat='annule' where id=$1",[circuitB]);
  const consultation2=await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,incident]);
  const sollB2=await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'devis_depose') returning id",[org,consultation2,incident,artisanB]);
  const docB2=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'devis','Offre B2',$1::uuid::text||'/offre-b2.pdf','application/pdf',100,repeat('f',64)) returning id",[org]);
  const devisB2=await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,document_id) values($1,$2,$3,$4,13000,'Fictif B2',current_date+10,$5) returning id",[org,sollB2,incident,artisanB,docB2]);
  const circuitB2=await id("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,annexes) select organization_id,incident_id,modele,$2,$3,created_by,prestataire,environnement,repeat('0',64),repeat('f',64),signataires,$4 from bail_signature_circuits where id=$1 returning id",[circuit,devisB2,docB2,JSON.stringify([{id:docB2,empreinte:'f'.repeat(64)}])]);
  await role(owner);expect((await db.query('select lire_signature_devis($1,$2) v',[org,devisB2])).rows[0].v.id).toBe(devisB2);
  await archiver(circuitB2,3);
  expect((await lire('select count(*)::int n from signature_consommations where circuit_id=$1',[circuitB2])).n).toBe(1);
  expect((await lire("select count(*)::int n from bail_signature_circuits where incident_id=$1 and modele='devis_artisan' and etat='termine'",[incident])).n).toBe(2);
  // Et le doublon en circuit ACTIF reste interdit par l'index.
  await expect(db.query("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires) select organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires from bail_signature_circuits where id=$1",[circuitB2])).resolves.toBeDefined();
  await expect(db.query("insert into bail_signature_circuits(organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires) select organization_id,incident_id,modele,cible_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires from bail_signature_circuits where id=$1",[circuitB2])).rejects.toThrow(/signature_devis_une_offre/);
 });
});
