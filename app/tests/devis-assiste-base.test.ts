import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({path:".env.local"});
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)("Devis assisté : droits, envoi et moyennes réelles",()=>{
  let db:Client;let org:string;let lot:string;let compte:string;let demandeur:string;let artisan:string;let demande:string;let document:string;const artisans:string[]=[];
  const id=async(sql:string,params:unknown[]=[])=> (await db.query(sql,params)).rows[0].id as string;
  const agir=async(c:string)=>{await db.query("reset role");await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)",[c]);await db.query("set local role authenticated");};
  const essai=async(sql:string,params:unknown[]=[])=>{await db.query("savepoint essai");try{const r=await db.query(sql,params);await db.query("release savepoint essai");return r;}catch(e){await db.query("rollback to savepoint essai");throw e;}};
  async function creerDemande(a:string){
    const inc=await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description,etat) values($1,$2,gen_random_uuid()::text,'agence','plomberie_canalisation','Test devis','declare') returning id",[org,lot]);
    const cons=await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,inc]);
    const s=await id("insert into incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'envoyee') returning id",[org,cons,inc,a]);return {s,inc};
  }
  beforeAll(async()=>{
    db=new Client({connectionString:url});await db.connect();await db.query("begin");
    org=await id("insert into organizations(name,status) values('Test devis assisté','active') returning id");
    const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Test devis','immeuble','1 rue Test','75011','Paris') returning id",[org]);
    lot=await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot test','disponible') returning id",[org,bien]);
    compte=await id("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),gen_random_uuid()::text||'@test.local','{}','{}') returning id");
    demandeur=await id("insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),gen_random_uuid()::text||'@test.local','{}','{}') returning id");
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[demandeur,org]);
    await db.query("insert into storage.objects(bucket_id,name,owner) values('devis-preparations',$1,$2)",[`${org}/non-envoye.pdf`,compte]);
    for(let n=0;n<3;n++)artisans.push(await id("insert into artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'Test devis', $2,'0600000000','valide','verifie') returning id",[n===0?compte:null,`${Math.floor(Math.random()*9e13)+1e13}`]));
    artisan=artisans[0];demande=(await creerDemande(artisan)).s;
    const path=`${org}/test-devis-valide.pdf`;
    await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)",[path,compte]);
    document=await id("insert into documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'devis',$2,'application/pdf',100,$3) returning id",[org,`${org}/facture-test.pdf`,'f'.repeat(64)]);
    const saisie={lignes:[{code:"plomberie_heure",libelle:"Main-d’œuvre (h)",quantite:2,prix_unitaire_ht_cents:5000,tva_bps:1000}],diagnostic:"Joint usé",prestations:"Main-d’œuvre",delai:"Cinq jours",duree:"Deux heures",valideJusquAu:"2099-01-01"};
    await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,saisie,statut,entreprise,pdf_path,pdf_sha,pdf_taille,valide_le) values($1,$2,$3,'valide','{}',$4,$5,100,now())",[demande,artisan,JSON.stringify(saisie),path,'e'.repeat(64)]);
  });
  afterAll(async()=>{await db?.query("rollback");await db?.end();});
  it("ne permet pas de lire les préparations ou les moyennes directement",async()=>{await agir(compte);await expect(essai("select * from artisan_devis_preparations")).rejects.toThrow(/permission denied/);await expect(essai("select * from reperes_devis_realises('plomberie_canalisation')")).rejects.toThrow(/permission denied/);});
  it("ne dévoile pas le PDF avant envoi au propriétaire de l’organisation",async()=>{await agir(demandeur);const r=await db.query("select name from storage.objects where bucket_id='devis-preparations' and name=$1",[`${org}/non-envoye.pdf`]);expect(r.rows).toEqual([]);});
  it("refuse un autre compte et une révision périmée",async()=>{await agir(org);await expect(essai("select envoyer_mon_devis_prepare($1,1)",[demande])).rejects.toThrow(/Accès refusé/);await agir(compte);await expect(essai("select envoyer_mon_devis_prepare($1,0)",[demande])).rejects.toThrow(/changé/);});
  it("dépose un seul devis calculé avec le PDF validé et classe le document",async()=>{
    await agir(compte);const r=await db.query("select envoyer_mon_devis_prepare($1,1) id",[demande]);const second=await db.query("select envoyer_mon_devis_prepare($1,1) id",[demande]);expect(second.rows[0].id).toBe(r.rows[0].id);
    await db.query("reset role");const q=await db.query("select d.montant_ttc_cents,d.document_id,p.statut,p.devis_id from incident_devis d join artisan_devis_preparations p on p.devis_id=d.id where p.sollicitation_id=$1",[demande]);expect(q.rows).toHaveLength(1);expect(Number(q.rows[0].montant_ttc_cents)).toBe(11000);expect(q.rows[0].document_id).toBeTruthy();expect(q.rows[0].statut).toBe("envoye");
  });
  it("ne retient que les travaux terminés et factures contrôlées, à partir de 10 chantiers et 3 artisans",async()=>{
    await db.query("reset role");const factures:string[]=[];
    for(let n=0;n<10;n++){
      const a=artisans[n%3];const {s,inc}=await creerDemande(a);
      const d=await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,statut) values($1,$2,$3,$4,6000,'Test',current_date+30,'retenu') returning id",[org,s,inc,a]);
      const iv=await id("insert into incident_interventions(organization_id,incident_id,artisan_id,devis_id,nature_travaux,statut,terminee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',null) returning id",[org,inc,a,d]);
      const photo=await id("insert into documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident',$2,'image/png',100,$3) returning id",[org,`${org}/photo-${n}.png`,`${n}`.padStart(64,'f')]);
      await db.query("insert into intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')",[org,iv,photo]);
      await db.query("insert into intervention_comptes_rendus(organization_id,intervention_id,artisan_id,travaux_realises) values($1,$2,$3,'Travaux test terminés')",[org,iv,a]);
      await db.query("update incident_interventions set statut='terminee',terminee_le=now() where id=$1",[iv]);
      await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,saisie,statut,entreprise,pdf_path,pdf_sha,pdf_taille,valide_le,devis_id) values($1,$2,$3,'envoye','{}','test',$4,100,now(),$5)",[s,a,JSON.stringify({lignes:[{code:'plomberie_heure',prix_unitaire_ht_cents:5000+n*100}]}),'a'.repeat(64),d]);
      factures.push(await id("insert into intervention_factures(organization_id,intervention_id,artisan_id,numero,montant_ttc_cents,document_id,validee_le) values($1,$2,$3,'Test',6000,$4,now()) returning id",[org,iv,a,document]));
    }
    const lire=()=>db.query("select * from reperes_devis_realises('plomberie_canalisation')");
    const r=await lire();expect(r.rows).toHaveLength(1);expect(Number(r.rows[0].nombre)).toBe(10);expect(Number(r.rows[0].moyenne_ht_cents)).toBe(5450);
    await db.query("update intervention_factures set validee_le=null where id=$1",[factures[0]]);expect((await lire()).rows).toEqual([]);
    await db.query("update intervention_factures set validee_le=now(),montant_ttc_cents=7000 where id=$1",[factures[0]]);expect((await lire()).rows).toEqual([]);
    expect((await db.query("select * from reperes_devis_realises('electricite')")).rows).toEqual([]);
  });
});
