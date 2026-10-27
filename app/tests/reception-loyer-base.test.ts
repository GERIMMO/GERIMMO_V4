import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("réception du loyer — droits, échéances, imputation et idempotence", () => {
  let db: Client, org: string, autre: string, compte: string, etranger: string, bail: string, appel: string, suivant: string, futur: string, jour: string;
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
    const personne = (await db.query("insert into persons(organization_id,nom) values($1,'TEST Locataire') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-100,750,50,5) returning id", [org, lot, personne])).rows[0].id;
    [appel, suivant, futur] = [randomUUID(),randomUUID(),randomUUID()];
    await db.query(`insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$4,$5,(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date,public.aujourdhui_paris()-30,750,50,800),
      ($2,$4,$5,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris(),750,50,800),
      ($3,$4,$5,(date_trunc('month',public.aujourdhui_paris())+interval '1 month')::date,public.aujourdhui_paris()+30,750,50,800)`, [appel,suivant,futur,org,bail]);
    await agir(compte);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });
  it("le propriétaire lit ses termes, l'étranger et anon ne les lisent pas", async () => {
    expect((await db.query("select * from rappels_loyers_proprietaire($1)",[org])).rows).toHaveLength(3);
    await agir(etranger); expect((await db.query("select * from rappels_loyers_proprietaire($1)",[org])).rows).toHaveLength(0);
    expect(await refus(() => reponse("non_recu"))).toContain("Accès refusé");
    await agir(etranger,"anon"); expect(await refus(() => db.query("select * from rappels_loyers_proprietaire($1)",[org]))).toContain("permission denied");
  });
  it("non reçu est mémorisé une fois par jour, sans encaissement ni quittance", async () => {
    expect((await reponse("non_recu")).statut).toBe("non_recu"); await reponse("non_recu");
    expect((await db.query("select * from receptions_loyers_signalees where appel_id=$1",[appel])).rows).toHaveLength(1);
    await db.query("reset role");
    expect((await db.query("select * from encaissements where bail_id=$1",[bail])).rowCount).toBe(0);
    expect((await db.query("select * from quittances where bail_id=$1",[bail])).rowCount).toBe(0);
    expect((await db.query("select * from audit_log where organization_id=$1 and action='loyer_non_recu_signale'",[org])).rowCount).toBe(1);
  });
  it("refuse un terme futur et un terme plus récent tant que l'ancien reste dû", async () => {
    expect(await refus(() => reponse("recu",800,randomUUID(),futur))).toContain("pas encore");
    expect(await refus(() => reponse("recu",800,randomUUID(),suivant))).toContain("plus ancien");
  });
  it("paiement partiel puis solde : reçu, quittance, et prochaine échéance", async () => {
    expect((await reponse("partiel",200)).statut).toBe("enregistre");
    expect((await db.query("select montant_couvert::float montant from etat_loyers_bail($1) where appel_id=$2",[bail,appel])).rows[0].montant).toBe(200);
    expect((await db.query("select est_quittance from quittances where appel_id=$1",[appel])).rows[0].est_quittance).toBe(false);
    await reponse("recu",600,randomUUID(),appel,600);
    expect((await db.query("select est_quittance from quittances where appel_id=$1",[appel])).rows[0].est_quittance).toBe(true);
    expect((await db.query("select appel_id from rappels_loyers_proprietaire($1)",[org])).rows.map(r=>r.appel_id)).not.toContain(appel);
    expect((await reponse("recu",800,randomUUID(),suivant)).statut).toBe("enregistre");
  });
  it("la même commande ne crée qu'un encaissement ; une autre commande obsolète ne le double pas", async () => {
    const cle=randomUUID(); await reponse("partiel",200,cle);
    expect((await reponse("partiel",200,cle)).statut).toBe("deja_enregistre");
    expect(await refus(() => reponse("partiel",200))).toContain("montant a changé");
    await db.query("reset role"); expect((await db.query("select * from encaissements where bail_id=$1",[bail])).rowCount).toBe(1);
  });
  it("une annulation conserve la commande et empêche un ancien formulaire de recréer le règlement", async () => {
    const cle=randomUUID();await reponse("partiel",200,cle);
    const reglement=(await db.query("select id from encaissements where bail_id=$1 and cle_envoi=$2",[bail,cle])).rows[0].id;
    await db.query("select public.supprimer_encaissement($1,$2)",[reglement,"TEST correction d’un règlement fictif"]);
    expect((await reponse("partiel",200,cle)).statut).toBe("annule");
    expect((await db.query("select id from encaissements where bail_id=$1",[bail])).rows).toHaveLength(0);
    expect((await db.query("select id from quittances where appel_id=$1",[appel])).rows).toHaveLength(0);
    expect((await db.query("select encaissement_id from commandes_encaissement_reste where id=$1",[cle])).rows[0].encaissement_id).toBe(reglement);
    expect((await reponse("partiel",200,randomUUID())).statut).toBe("enregistre");
  });
  it("ne permet pas de recycler une commande pour une autre échéance ou un autre montant", async () => {
    const cle=randomUUID();await reponse("recu",800,cle);
    expect(await refus(()=>reponse("recu",800,cle,suivant))).toContain("déjà été utilisée");
    expect(await refus(()=>reponse("partiel",200,cle))).toContain("déjà été utilisée");
  });
  it("refuse les dates futures, montants surpayés ou incohérents et l'écriture directe", async () => {
    expect(await refus(() => reponse("recu",801))).toContain("Vérifiez");
    expect(await refus(() => reponse("recu",200))).toContain("Vérifiez");
    expect(await refus(() => reponse("partiel",800))).toContain("Vérifiez");
    expect(await refus(() => reponse("partiel",200,randomUUID(),appel,800,"2099-01-01"))).toContain("Vérifiez");
    expect(await refus(() => db.query("insert into receptions_loyers_signalees(appel_id,organization_id) values($1,$2)",[appel,org]))).toContain("permission denied");
  });
});
