import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_DB_URL;
// Ce test écrit exclusivement dans des transactions annulées sur une base locale de recette.
if (url) {
  const cible = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(cible.hostname) || !/^\/gerimmo_ci_[a-z_]+$/.test(cible.pathname)) {
    throw Error("Base locale de recette requise pour les qualifications de diagnostics.");
  }
}

describe.skipIf(!url)("qualifications de diagnostics — intégrité et droits en base", () => {
  let db: Client, org: string, autreOrg: string, proprietaire: string, etranger: string, agent: string, superadmin: string;
  let lot: string, autreLot: string, lotConfie: string;
  async function compte() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role, aal: "aal2" })]);
    await db.query(`set local role ${role}`);
  }
  async function refus(action: () => Promise<unknown>) {
    await db.query("savepoint refus");
    try { await action(); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
    finally { await db.query("release savepoint refus"); }
  }
  const deposer = (situation = "absente", type = "gaz", date: string | null = null, cibleLot = lot, cibleOrg = org, annee: number | null = null) =>
    db.query(`insert into public.qualifications_diagnostics_lot(organization_id,lot_id,type,situation,date_installation,annee_installation)
      values($1,$2,$3,$4,$5,$6) returning type,situation,date_installation,annee_installation,updated_by`, [cibleOrg, cibleLot, type, situation, date, annee]);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
    proprietaire = await compte(); etranger = await compte(); agent = await compte(); superadmin = await compte();
    [org, autreOrg] = (await db.query("insert into organizations(name,type,status) values('TEST qualification','agence','active'),('TEST autre qualification','proprietaire_direct','active') returning id")).rows.map(r => r.id);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'proprietaire_direct'),($5,$2,'agent'),($6,null,'super_admin')", [proprietaire, org, etranger, autreOrg, agent, superadmin]);
    const nouveauBien = async (organisation: string) => (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Qualification','immeuble','1 rue fictive','75001','Paris') returning id", [organisation])).rows[0].id;
    const bien = await nouveauBien(org), autreBien = await nouveauBien(autreOrg);
    const nouveauLot = async (organisation: string, bienId: string) => (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Lot','disponible') returning id", [organisation, bienId])).rows[0].id;
    lot = await nouveauLot(org, bien); lotConfie = await nouveauLot(org, bien); autreLot = await nouveauLot(autreOrg, autreBien);
    const mandant = (await db.query("insert into persons(organization_id,nom) values($1,'TEST Mandant') returning id", [org])).rows[0].id;
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lotConfie, mandant]);
    const mandat = (await db.query("insert into mandats(organization_id,person_id,etat,date_debut,agent_account_id) values($1,$2,'brouillon','2025-01-01',$3) returning id", [org, mandant, agent])).rows[0].id;
    await db.query("insert into mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,'2025-01-01')", [org, mandat, lotConfie]);
    await agir(proprietaire);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("enregistre et remplace une réponse, avec un auteur imposé par la session", async () => {
    expect((await deposer()).rows[0].updated_by).toBe(proprietaire);
    await db.query(`insert into qualifications_diagnostics_lot(organization_id,lot_id,type,situation,date_installation,updated_by)
      values($1,$2,'gaz','date_connue','2020-01-01',$3)
      on conflict(organization_id,lot_id,type) do update set situation=excluded.situation,date_installation=excluded.date_installation,updated_by=excluded.updated_by`, [org, lot, etranger]);
    const lignes = (await db.query("select situation,date_installation::text,updated_by from qualifications_diagnostics_lot where lot_id=$1", [lot])).rows;
    expect(lignes).toEqual([{ situation: "date_connue", date_installation: "2020-01-01", updated_by: proprietaire }]);
  });
  it("le propriétaire direct peut gérer son lot", async () => {
    await agir(etranger); expect((await deposer("absente", "gaz", null, autreLot, autreOrg)).rows).toHaveLength(1);
  });
  it("mémorise seulement l'année puis permet de préciser la date ou de corriger la réponse", async () => {
    const reponse = (await deposer("annee_connue", "electricite", null, lot, org, 2015)).rows[0];
    expect(reponse.annee_installation).toBe(2015); expect(reponse.date_installation).toBeNull();
    await db.query("update qualifications_diagnostics_lot set situation='date_connue',date_installation='2015-03-12',annee_installation=null where organization_id=$1 and lot_id=$2", [org, lot]);
    await db.query("update qualifications_diagnostics_lot set situation='inconnue',date_installation=null,annee_installation=null where organization_id=$1 and lot_id=$2", [org, lot]);
    const lignes = (await db.query("select situation,date_installation,annee_installation from qualifications_diagnostics_lot where lot_id=$1", [lot])).rows;
    expect(lignes).toEqual([{ situation: "inconnue", date_installation: null, annee_installation: null }]);
  });
  it.each([
    ["annee_connue", null, null], ["annee_connue", "2015-01-01", 2015],
    ["date_connue", "2015-01-01", 2015], ["inconnue", null, 2015],
    ["annee_connue", null, 1799], ["annee_connue", null, 2999],
  ] as const)("refuse une précision annuelle incohérente : %s / %s / %s", async (situation, date, annee) => {
    expect(await refus(() => deposer(situation, "gaz", date, lot, org, annee))).toContain("check constraint");
  });
  it("l'autre organisation ne peut ni lire ni écrire", async () => {
    await deposer(); await agir(etranger);
    expect((await db.query("select * from qualifications_diagnostics_lot where lot_id=$1", [lot])).rowCount).toBe(0);
    expect(await refus(() => deposer())).toContain("row-level security");
    expect((await db.query("update qualifications_diagnostics_lot set situation='inconnue' where lot_id=$1 returning type", [lot])).rowCount).toBe(0);
  });
  it("une adhésion désactivée perd les droits sur les réponses", async () => {
    await deposer(); await db.query("reset role");
    await db.query("update memberships set status='inactive' where account_id=$1 and organization_id=$2", [proprietaire, org]);
    await agir(proprietaire);
    expect((await db.query("select * from qualifications_diagnostics_lot where lot_id=$1", [lot])).rowCount).toBe(0);
    expect(await refus(() => deposer("plus_15_ans", "electricite"))).toMatch(/Traversée en lecture seule|row-level security/);
  });
  it("refuse un lot d'une autre organisation même au gérant", async () => {
    expect(await refus(() => deposer("absente", "gaz", null, autreLot))).toContain("qualifications_diagnostics_lot_meme_org_fk");
  });
  it("l'agent gère uniquement les lots de ses mandats", async () => {
    await deposer(); await agir(agent);
    expect((await db.query("select * from qualifications_diagnostics_lot where lot_id=$1", [lot])).rowCount).toBe(0);
    expect(await refus(() => deposer())).toContain("row-level security");
    expect((await deposer("plus_15_ans", "electricite", null, lotConfie)).rows).toHaveLength(1);
    expect(await refus(() => db.query("update qualifications_diagnostics_lot set lot_id=$1 where lot_id=$2", [lot, lotConfie]))).toContain("row-level security");
  });
  it("la traversée superadmin reste en lecture seule", async () => {
    await deposer(); await agir(superadmin);
    expect((await db.query("select * from qualifications_diagnostics_lot where lot_id=$1", [lot])).rowCount).toBe(1);
    expect(await refus(() => deposer("plus_15_ans", "electricite"))).toMatch(/Traversée en lecture seule|row-level security/);
    expect((await db.query("update qualifications_diagnostics_lot set situation='inconnue' where lot_id=$1 returning type", [lot])).rowCount).toBe(0);
  });
  it("les droits anonymes et la suppression directe sont fermés", async () => {
    expect(await refus(() => db.query("delete from qualifications_diagnostics_lot"))).toContain("permission denied");
    await agir(etranger, "anon");
    expect(await refus(() => db.query("select * from qualifications_diagnostics_lot"))).toContain("permission denied");
  });
  it.each([
    ["absente", "electricite", null], ["date_connue", "gaz", null], ["inconnue", "gaz", "2020-01-01"],
    ["date_connue", "gaz", "2999-01-01"], ["date_connue", "gaz", "1799-01-01"], ["plus_15_ans", "termites", null],
  ])("refuse les valeurs incohérentes en SQL : %s / %s / %s", async (situation, type, date) => {
    expect(await refus(() => deposer(situation!, type!, date))).toContain("check constraint");
  });
});
