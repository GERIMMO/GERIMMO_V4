import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("consentements et confirmations aux paliers de relance", () => {
  let db: Client, org: string, autre: string, compte: string, etranger: string, bail: string, appel: string, suivant: string, futur: string, jour: string, locataire: string, personne: string;
  async function utilisateur() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string, role = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role, aal: "aal2" })]);
    await db.query(`set local role ${role}`);
  }
  async function reponse(choix: string, montant: number | null = null, cle = randomUUID(), cible = appel, reste = 800, date = jour) {
    return (await db.query("select public.declarer_reception_loyer($1,$2,$3,$4,$5,$6,$7,$8) r", [org, cible, choix, montant, choix === "non_recu" ? null : date, choix === "non_recu" ? null : "virement", cle, reste])).rows[0].r;
  }
  async function refus(action: () => Promise<unknown>) {
    await db.query("savepoint refus");
    try { await action(); return ""; } catch(e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  }
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    jour = (await db.query("select public.aujourdhui_paris()::text jour")).rows[0].jour;
    compte = await utilisateur(); etranger = await utilisateur();
    const orgs = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST rappels','proprietaire_direct','essai',public.aujourdhui_paris()+30),('TEST étranger','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows;
    [org, autre] = orgs.map(o => o.id);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct')", [compte, org, etranger, autre]);
    const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appartement','loue') returning id", [org, bien])).rows[0].id;
    personne = (await db.query("insert into persons(organization_id,nom) values($1,'TEST Locataire') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-100,750,50,5) returning id", [org, lot, personne])).rows[0].id;
    [appel, suivant, futur] = [randomUUID(),randomUUID(),randomUUID()];
    await db.query(`insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$4,$5,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date,public.aujourdhui_paris()-30,750,50,800),
      ($2,$4,$5,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris(),750,50,800),
      ($3,$4,$5,(date_trunc('month',public.aujourdhui_paris())+interval '1 month')::date,public.aujourdhui_paris()+30,750,50,800)`, [appel,suivant,futur,org,bail]);
    locataire=await utilisateur();
    await db.query("update persons set account_id=$1,email='locataire@test.local' where id=$2",[locataire,personne]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[locataire,org]);
    await db.query("update organizations set relances_envoi_auto=true,quittances_envoi_auto=true where id=$1",[org]);
    await agir(compte);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  async function accord(nature="quittances",accepte=true,email="locataire@test.local") {
    return (await db.query("select modifier_consentement_document($1,$2,$3,$4) r",[org,nature,accepte,email])).rows[0].r;
  }
  async function envoiAutorise() { return (await db.query("select quittance_envoi_autorise($1,$2) r",[org,bail])).rows[0].r; }
  async function relances() {
    await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");
    return (await db.query("select * from relances_loyer_dues(500) where bail_id=$1",[bail])).rows;
  }
  it("le silence ne vaut pas accord ; seul le locataire consent pour lui et les deux accords sont distincts",async()=>{
    expect(await envoiAutorise()).toBe(false);
    expect(await refus(()=>accord())).toContain("Accès refusé");
    await agir(locataire); expect(await accord()).toBe(true);
    const c=(await db.query("select * from consentements_documents_locataire where organization_id=$1",[org])).rows[0];
    expect(c.quittances_electroniques).toBe(true);expect(c.recommandes_electroniques).toBe(false);
    await agir(compte);expect(await envoiAutorise()).toBe(true);
    await agir(etranger);expect(await envoiAutorise()).toBe(false);
    expect((await db.query("select * from consentements_documents_locataire where organization_id=$1",[org])).rowCount).toBe(0);
  });
  it("la vérification finale compare l'adresse réellement envoyée, même après un nouvel accord", async () => {
    const autorise = async (destinataire: string | null) => (await db.query("select quittance_envoi_autorise($1,$2,$3::text) r", [org,bail,destinataire])).rows[0].r;
    await agir(locataire);await accord();await agir(compte);
    expect(await autorise("locataire@test.local")).toBe(true);
    expect(await autorise("autre@test.local")).toBe(false);expect(await autorise(null)).toBe(false);
    await agir(etranger);expect(await autorise("locataire@test.local")).toBe(false);
    await agir(locataire);await accord("quittances",false);await agir(compte);
    expect(await autorise("locataire@test.local")).toBe(false);
    await db.query("reset role");await db.query("update persons set email='nouvelle@test.local' where id=$1",[personne]);
    await agir(locataire);await accord("quittances",true,"nouvelle@test.local");await agir(compte);
    expect(await envoiAutorise()).toBe(true);
    expect(await autorise("locataire@test.local")).toBe(false);
    expect(await autorise("nouvelle@test.local")).toBe(true);
  });
  it("un retrait ou une nouvelle adresse arrêtent les envois et laissent une trace",async()=>{
    await agir(locataire);await accord();await accord();
    await agir(compte);expect(await envoiAutorise()).toBe(true);
    await agir(locataire);await accord("quittances",false);
    await agir(compte);expect(await envoiAutorise()).toBe(false);
    await agir(locataire);await accord();
    await db.query("reset role");await db.query("update persons set email='nouvelle@test.local' where id=$1",[personne]);
    await agir(compte);expect(await envoiAutorise()).toBe(false);
    await agir(locataire);expect(await refus(()=>accord())).toContain("adresse e-mail");
    await db.query("reset role");expect((await db.query("select * from audit_log where organization_id=$1 and action='consentement_document_modifie'",[org])).rowCount).toBe(3);
  });
  it("l’écriture directe et l’accord d’un autre compte sont refusés",async()=>{
    await agir(locataire);expect(await refus(()=>db.query("insert into consentements_documents_locataire(organization_id,person_id,adresse_email) values($1,$2,'x@test.local')",[org,personne]))).toContain("permission denied");
    await agir(etranger);expect(await refus(()=>accord())).toContain("Accès refusé");
    await agir(locataire,"anon");expect(await refus(()=>accord())).toContain("permission denied");
  });
  it("le cron exclut les quittances sans accord, puis après retrait",async()=>{
    await reponse("recu",800);await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");
    expect((await db.query("select * from quittances_a_envoyer(500) where bail_id=$1",[bail])).rowCount).toBe(0);
    await agir(locataire);await accord();await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");
    expect((await db.query("select * from quittances_a_envoyer(500) where bail_id=$1",[bail])).rowCount).toBe(1);
    await agir(locataire);await accord("quittances",false);await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");
    expect((await db.query("select * from quittances_a_envoyer(500) where bail_id=$1",[bail])).rowCount).toBe(0);
  });
  it("une dette sans réponse ne relance jamais le locataire ; une confirmation récente ouvre uniquement le palier prévu",async()=>{
    expect(await relances()).toHaveLength(0);await agir(compte);await reponse("non_recu");
    expect((await relances()).map(x=>x.niveau)).toEqual(["relance_1"]);
    await db.query("insert into relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,'relance_1',public.aujourdhui_paris())",[org,bail]);
    expect(await relances()).toHaveLength(0);
    await db.query("update relances set date_envoi=public.aujourdhui_paris()-2 where bail_id=$1",[bail]);
    await db.query("update receptions_loyers_signalees set signale_le=now()-interval '3 days' where appel_id=$1",[appel]);
    expect(await relances()).toHaveLength(0);
    await agir(compte);await reponse("non_recu");expect(await relances()).toHaveLength(0);
    await db.query("update relances set date_envoi=public.aujourdhui_paris()-20 where bail_id=$1",[bail]);
    await agir(compte);await reponse("non_recu");expect((await relances()).map(x=>x.niveau)).toEqual(["relance_2"]);
  });
  it("un encaissement saisi dans un autre écran invalide le montant précédemment confirmé",async()=>{
    await reponse("non_recu");
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,100,public.aujourdhui_paris(),'virement')",[org,bail]);
    expect(await relances()).toHaveLength(0);
  });
  it("le contrôle juste avant envoi refuse les montants ou paliers périmés",async()=>{
    await reponse("non_recu");await relances();
    expect((await db.query("select relance_loyer_envoi_confirme($1,'relance_1',public.aujourdhui_paris()-30,800,800) r",[bail])).rows[0].r).toBe(true);
    expect((await db.query("select relance_loyer_envoi_confirme($1,'relance_1',public.aujourdhui_paris()-30,700,800) r",[bail])).rows[0].r).toBe(false);
    expect((await db.query("select relance_loyer_envoi_confirme($1,'relance_2',public.aujourdhui_paris()-30,800,800) r",[bail])).rows[0].r).toBe(false);
    await agir(compte);expect(await refus(()=>db.query("select relance_loyer_envoi_confirme($1,'relance_1',public.aujourdhui_paris()-30,800,800)",[bail]))).toContain("permission denied");
  });
  it("un locataire sorti peut encore retirer ses accords sans en donner un nouveau",async()=>{
    await agir(locataire);await accord();await accord("recommandes");await db.query("reset role");await db.query("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[locataire,org]);
    await agir(locataire);expect((await db.query("select * from consentements_documents_locataire where organization_id=$1",[org])).rowCount).toBe(1);expect(await accord("quittances",false)).toBe(false);expect(await accord("recommandes",false)).toBe(false);expect(await refus(()=>accord())).toContain("ancien espace");
  });
  it("un paiement partiel invalide la confirmation ; le solde arrête le suivi",async()=>{
    await reponse("non_recu");await reponse("partiel",200);
    expect(await relances()).toHaveLength(0);
    await agir(compte);await reponse("non_recu",null,randomUUID(),appel,600);
    expect((await relances())[0].reste).toBe("600.00");
    await agir(compte);await reponse("recu",600,randomUUID(),appel,600);
    expect(await relances()).toHaveLength(0);
  });
  it("le retrait reste permis après expiration de l’essai sans laisser le contexte système ouvert",async()=>{
    await agir(locataire);await accord();await accord("recommandes");
    await db.query("reset role");await db.query("select tache_systeme()");
    await db.query("update organizations set status='essai',essai_fin=aujourdhui_paris()-1 where id=$1",[org]);
    await db.query("select set_config('gerimmo.systeme','',true)");
    await agir(locataire);
    expect(await accord("quittances",false)).toBe(false);
    expect((await db.query("select current_setting('gerimmo.systeme',true) contexte")).rows[0].contexte).toBe("");
    expect((await db.query("select recommandes_electroniques from consentements_documents_locataire where organization_id=$1",[org])).rows[0].recommandes_electroniques).toBe(true);
    expect(await accord("recommandes",false)).toBe(false);
    expect((await db.query("select current_setting('gerimmo.systeme',true) contexte")).rows[0].contexte).toBe("");
    await agir(compte);
    expect(await refus(()=>db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,10,aujourdhui_paris(),'virement')",[org,bail]))).toContain("Abonnement suspendu");
  });

});
