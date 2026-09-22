import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);
describe.skipIf(!DB_URL)("Autonomie V3 — devis, droits et absence d’escalade", () => {
  let db: Client;
  let org: string, autreOrg: string, admin: string, autreAdmin: string, sa: string, loc: string, compteArtisan: string, autreArtisan: string;
  let artisan: string, incident: string, sollicitation: string, devis: string, intervention: string;
  const id = async (sql: string, args: unknown[] = []) => (await db.query<{id:string}>(sql,args)).rows[0].id;
  const utilisateur = () => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-v3-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
  const postgres = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const agir = async (compte: string|null, aal = "aal2", role="authenticated") => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role,aal})]); await db.query(`set local role ${role}`); };
  const refus = async (sql: string, args: unknown[] = []) => { await db.query("savepoint refus"); try {await db.query(sql,args); return "";} catch(e) {await db.query("rollback to savepoint refus"); return (e as Error).message;} finally {await db.query("release savepoint refus");} };
  const lignes = (prix=15000) => JSON.stringify([{libelle:"Travaux complets",quantite:1,prix_unitaire_ht_cents:prix,tva_bps:0}]);
  const demander = async (prix=15000) => id("select public.demander_avenant_devis($1,$2,'Canalisation supplémentaire à remplacer',$3::jsonb) id",[intervention,prix,lignes(prix)]);
  beforeAll(async () => {
    db=new Client({connectionString:DB_URL}); await db.connect(); await db.query("begin");
    org=await id("insert into public.organizations(name,status,type) values('Agence V3','active','agence') returning id");
    autreOrg=await id("insert into public.organizations(name,status,type) values('Agence étrangère V3','active','agence') returning id");
    [admin,autreAdmin,sa,loc,compteArtisan,autreArtisan]=[await utilisateur(),await utilisateur(),await utilisateur(),await utilisateur(),await utilisateur(),await utilisateur()];
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,null,'super_admin'),($6,$2,'locataire')",[admin,org,autreAdmin,autreOrg,sa,loc]);
    const bien=await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Appartement V3','appartement','1 rue du Test','75001','Paris') returning id",[org]);
    const lot=await id("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'Lot V3') returning id",[org,bien]);
    incident=await id("insert into public.incidents(organization_id,lot_id,numero,canal,categorie,description) values($1,$2,'INC-V3-DEVIS','espace_locataire','plomberie_canalisation','Fuite de test') returning id",[org,lot]);
    artisan=await id("insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme) values($1,'Artisan V3',lpad((random()*10^13)::bigint::text,14,'0'),'0600000000','valide') returning id",[compteArtisan]);
    const consultation=await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,incident]);
    sollicitation=await id("insert into public.incident_sollicitations(organization_id,incident_id,consultation_id,artisan_id) values($1,$2,$3,$4) returning id",[org,incident,consultation,artisan]);
    devis=await id("insert into public.incident_devis(organization_id,incident_id,sollicitation_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au) values($1,$2,$3,$4,10000,'Devis de test',current_date+30) returning id",[org,incident,sollicitation,artisan]);
    intervention=await id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,devis_id,nature_travaux,statut) values($1,$2,$3,$4,'entretien_courant','acceptee') returning id",[org,incident,artisan,devis]);
  });
  afterAll(async()=>{await db?.query("rollback");await db?.end();});
  beforeEach(async()=>{await db.query("savepoint cas");});
  afterEach(async()=>{await db.query("rollback to savepoint cas");await db.query("release savepoint cas");});
  it("dépose les lignes et le total dans une seule transaction, sans accès au devis d’autrui",async()=>{
    await db.query("delete from public.incident_interventions where id=$1",[intervention]);
    await db.query("delete from public.incident_devis where id=$1",[devis]);
    await agir(autreArtisan);
    const sql="select public.deposer_devis_structure($1,$2::jsonb,'Joint endommagé','Remplacer le joint','Sous cinq jours','Une heure') id";
    expect(await refus(sql,[sollicitation,lignes()])).toMatch(/refusé/i);
    await agir(compteArtisan);const nouveau=await id(sql,[sollicitation,lignes()]);
    await postgres();const r=(await db.query("select lignes,montant_ht_cents,montant_ttc_cents,delai_intervention from public.incident_devis where id=$1",[nouveau])).rows[0];
    expect(r.lignes).toHaveLength(1); expect(Number(r.montant_ttc_cents)).toBe(15000);expect(r.delai_intervention).toBe("Sous cinq jours");
  });
  it("calcule le détail en base et refuse NaN, négatifs et total falsifié",async()=>{
    const r=await db.query("select * from public.calculer_devis_lignes($1::jsonb)",[JSON.stringify([{libelle:"Main-d’œuvre",quantite:1.5,prix_unitaire_ht_cents:4500,tva_bps:2000}])]);
    expect(Number(r.rows[0].montant_ttc_cents)).toBe(8100);
    for(const quantite of ["NaN","Infinity",-1,0,1.0001]) expect(await refus("select * from public.calculer_devis_lignes($1::jsonb)",[JSON.stringify([{libelle:"Travaux",quantite,prix_unitaire_ht_cents:100,tva_bps:0}])])).not.toBe("");
    await agir(compteArtisan);
    expect(await refus("select public.demander_avenant_devis($1,16000,'Motif suffisamment détaillé',$2::jsonb)",[intervention,lignes()])).toMatch(/total/i);
  });
  it("bloque les utilisateurs sans identité et les artisans non concernés",async()=>{
    for(const utilisateur of [null,autreArtisan,loc]) { await agir(utilisateur); expect(await refus("select public.demander_avenant_devis($1,15000,'Motif suffisamment détaillé',$2::jsonb)",[intervention,lignes()])).toMatch(/refusé/i); }
  });
  it("refuse la lecture du devis à un locataire et à une agence étrangère",async()=>{
    await agir(compteArtisan);const avenant=await demander();
    expect((await db.query("select id from public.devis_avenants where id=$1",[avenant])).rows).toHaveLength(1);
    for(const utilisateur of [loc,autreAdmin]) {await agir(utilisateur);expect((await db.query("select id from public.devis_avenants where id=$1",[avenant])).rows).toHaveLength(0);expect(await refus("select public.decider_avenant_devis($1,true)",[avenant])).toMatch(/refusé/i);}
  });
  it("autorise le PDF uniquement à son artisan, au responsable ou à la supervision",async()=>{
    for (const compte of [null,loc,autreAdmin,autreArtisan]) {await agir(compte);expect(await refus("select public.lire_devis_structure($1)",[sollicitation])).toMatch(/refusé/i);}
    for (const compte of [compteArtisan,admin,sa]) {await agir(compte);const doc=(await db.query("select public.lire_devis_structure($1) doc",[sollicitation])).rows[0].doc;expect(doc.id).toBe(devis);expect(doc).not.toHaveProperty("address_line1");}
  });
  it("exige une décision, empêche le double envoi et conserve le plafond accepté",async()=>{
    await agir(compteArtisan); const avenant=await demander();
    expect(await refus("select public.demander_avenant_devis($1,15000,'Motif suffisamment détaillé',$2::jsonb)",[intervention,lignes()])).toMatch(/attente/i);
    await agir(admin);expect(await refus("select public.decider_avenant_devis($1,null)",[avenant])).toMatch(/décision/i);
    expect(await refus("select public.decider_avenant_devis($1,false)",[avenant])).toMatch(/refus/i);
    await db.query("select public.decider_avenant_devis($1,true)",[avenant]);
    expect(await refus("select public.decider_avenant_devis($1,true)",[avenant])).toMatch(/déjà/i);
    await agir(compteArtisan);expect(await refus("select public.demander_avenant_devis($1,14000,'Motif suffisamment détaillé',$2::jsonb)",[intervention,lignes(14000)])).toMatch(/dernier montant/i);
    await postgres();expect((await db.query("select statut from public.alerts where details->>'avenant_id'=$1",[avenant])).rows[0].statut).toBe("fermee");
  });
  it("bloque directement en base tout compte rendu dépassant le plafond",async()=>{
    const inserer="insert into public.intervention_comptes_rendus(organization_id,intervention_id,artisan_id,travaux_realises,montant_final_cents) values($1,$2,$3,'Travaux de test',$4)";
    expect(await refus(inserer,[org,intervention,artisan,15000])).toMatch(/avenant/i);
    expect(await refus(inserer,[org,intervention,artisan,-1])).not.toBe("");
    await agir(compteArtisan);const avenant=await demander();await agir(admin);await db.query("select public.decider_avenant_devis($1,true)",[avenant]);await postgres();
    await db.query(inserer,[org,intervention,artisan,15000]);
  });
  it("réserve les mesures au service et dédouble les reprises",async()=>{
    await agir(admin);expect(await refus("select public.log_automation_event($1,'automatique','incident','test')",[org])).toMatch(/permission/i);
    await agir(null,"aal1","service_role");
    const sql="select public.log_automation_event($1,'automatique','incident','test',0,0,null,null,null,'{}','cas-unique-test-v3') id";
    expect(await id(sql,[org])).toBe(await id(sql,[org]));
  });
  it("une délégation ne devient pas superadmin et reste bornée",async()=>{
    await agir(sa);await db.query("insert into public.supervision_delegations(account_id,commence_le,termine_le,pouvoirs,motif,cree_par) values($1,now()-interval '1 hour',now()+interval '1 day',array['lecture'],'Absence de test',$2)",[autreAdmin,sa]);
    const delegation=(await db.query("select id,cree_par from public.supervision_delegations where account_id=$1",[autreAdmin])).rows[0];
    expect(delegation.cree_par).toBe(sa);
    expect(await refus("update public.supervision_delegations set pouvoirs=array['lecture','qualite'] where id=$1",[delegation.id])).toMatch(/nouvelle délégation/i);
    await agir(autreAdmin);expect((await db.query("select public.is_super_admin() sa,public.has_supervision_power('lecture') lecture,public.has_supervision_power('finances') finances")).rows[0]).toEqual({sa:false,lecture:true,finances:false});
    await agir(autreAdmin,"aal1");expect((await db.query("select public.has_supervision_power('lecture') autorise")).rows[0].autorise).toBe(false);
    await agir(sa);await db.query("update public.supervision_delegations set active=false where id=$1",[delegation.id]);
    expect(await refus("update public.supervision_delegations set active=true where id=$1",[delegation.id])).toMatch(/réactivée/i);
    await agir(autreAdmin);expect((await db.query("select public.has_supervision_power('lecture') autorise")).rows[0].autorise).toBe(false);
  });
});
