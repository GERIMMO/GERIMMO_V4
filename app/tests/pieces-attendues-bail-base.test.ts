import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_DB_URL;
if (url) {
  const cible = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(cible.hostname) || !/^\/gerimmo_ci_[a-z_]+$/.test(cible.pathname)) {
    throw Error("Base locale de recette requise pour les assurances du bail.");
  }
}

describe.skipIf(!url)("assurances du bail — droits, intégrité et classement atomique", () => {
  let db: Client, org: string, autreOrg: string, gerant: string, etranger: string, agent: string, superadmin: string;
  let lot: string, lotConfie: string, autreLot: string, bail: string, secondBail: string, bailConfie: string, autreBail: string;
  let document: string, suivant: string, etrangerDocument: string;
  async function compte() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id = gerant, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role, aal: "aal2" })]);
    await db.query(`set local role ${role}`);
  }
  async function refus(action: () => Promise<unknown>) {
    await db.query("savepoint refus");
    try { await action(); return { code: "", message: "" }; }
    catch (e) { await db.query("rollback to savepoint refus"); return e as { code: string; message: string }; }
    finally { await db.query("release savepoint refus"); }
  }
  async function fichier(organisation = org, remplace: string | null = null, purge = false, auteur = gerant) {
    const id = randomUUID();
    return (await db.query(`insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,remplace_id,purged_at,deposited_by)
      values($1,'attestation_assurance','TEST assurance',$2,'application/pdf',1234,$3,$4,$5,$6) returning id`,
    [organisation, `${organisation}/${id}.pdf`, id.replaceAll("-", "").repeat(2), remplace, purge ? new Date() : null, auteur])).rows[0].id as string;
  }
  const affecter = (nature = "assurance_proprietaire", doc = document, precedent: string | null = null, contrat = bail, organisation = org) =>
    db.query("select public.affecter_piece_attendue_bail($1,$2,$3,$4,$5) document_id", [organisation, contrat, nature, doc, precedent]);
  const classementDirect = (nature: string, contrat: string | null, cibleLot = lot, doc = document, organisation = org) =>
    db.query(`insert into pieces_attendues_bail(organization_id,lot_id,bail_id,nature,document_id,updated_by)
      values($1,$2,$3,$4,$5,$6) returning updated_by`, [organisation, cibleLot, contrat, nature, doc, etranger]);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
    gerant = await compte(); etranger = await compte(); agent = await compte(); superadmin = await compte();
    [org, autreOrg] = (await db.query("insert into organizations(name,type,status) values('TEST assurance bail','agence','active'),('TEST autre assurance','proprietaire_direct','active') returning id")).rows.map(r => r.id);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'proprietaire_direct'),($5,$2,'agent'),($6,null,'super_admin')", [gerant, org, etranger, autreOrg, agent, superadmin]);
    const nouveauBien = async (organisation: string) => (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Assurance','immeuble','1 rue fictive','75001','Paris') returning id", [organisation])).rows[0].id;
    const bien = await nouveauBien(org), autreBien = await nouveauBien(autreOrg);
    const nouveauLot = async (organisation: string, bienId: string) => (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Lot','disponible') returning id", [organisation, bienId])).rows[0].id;
    lot = await nouveauLot(org, bien); lotConfie = await nouveauLot(org, bien); autreLot = await nouveauLot(autreOrg, autreBien);
    const nouveauBail = async (organisation: string, logement: string) => (await db.query("insert into baux(organization_id,lot_id,etat) values($1,$2,'brouillon') returning id", [organisation, logement])).rows[0].id;
    bail = await nouveauBail(org, lot); secondBail = await nouveauBail(org, lot); bailConfie = await nouveauBail(org, lotConfie); autreBail = await nouveauBail(autreOrg, autreLot);
    const mandant = (await db.query("insert into persons(organization_id,nom) values($1,'TEST Mandant') returning id", [org])).rows[0].id;
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)", [org, lotConfie, mandant]);
    const mandat = (await db.query("insert into mandats(organization_id,person_id,etat,date_debut,agent_account_id) values($1,$2,'brouillon','2025-01-01',$3) returning id", [org, mandant, agent])).rows[0].id;
    await db.query("insert into mandat_lignes(organization_id,mandat_id,lot_id,taux_honoraires,date_debut) values($1,$2,$3,7,'2025-01-01')", [org, mandat, lotConfie]);
    document = await fichier(); suivant = await fichier(); etrangerDocument = await fichier(autreOrg);
    await agir();
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("rattache la pièce propriétaire au logement avec l'auteur de la session", async () => {
    expect((await affecter()).rows[0].document_id).toBe(document);
    expect((await db.query("select lot_id,bail_id,nature,document_id,updated_by from pieces_attendues_bail")).rows).toEqual([
      { lot_id: lot, bail_id: null, nature: "assurance_proprietaire", document_id: document, updated_by: gerant },
    ]);
    expect((await db.query("select entite,entite_id from document_liens where document_id=$1", [document])).rows).toEqual([{ entite: "lot", entite_id: lot }]);
  });
  it("partage la pièce propriétaire entre baux du lot et isole les pièces locataires", async () => {
    await affecter(); await affecter("assurance_proprietaire", suivant, document, secondBail);
    await affecter("assurance_locataire", document); await affecter("assurance_locataire", suivant, null, secondBail);
    expect((await db.query("select document_id from pieces_attendues_bail where nature='assurance_proprietaire'")).rows).toEqual([{ document_id: suivant }]);
    expect((await db.query("select bail_id from pieces_attendues_bail where nature='assurance_locataire' order by bail_id")).rows.map(r => r.bail_id)).toEqual([bail, secondBail].sort());
    expect((await db.query("select entite_id from document_liens where entite='bail' order by entite_id")).rows.map(r => r.entite_id)).toEqual([bail, secondBail].sort());
    expect((await db.query("select id from documents where id=any($1::uuid[])", [[document, suivant]])).rowCount).toBe(2);
  });
  it("refuse une ancienne fenêtre sans laisser un lien incomplet", async () => {
    await affecter();
    expect((await refus(() => affecter("assurance_proprietaire", suivant))).code).toBe("40001");
    expect((await db.query("select id from document_liens where document_id=$1", [suivant])).rowCount).toBe(0);
    await affecter("assurance_proprietaire", suivant, document);
    expect((await refus(() => affecter("assurance_proprietaire", document, document))).code).toBe("40001");
    expect((await db.query("select document_id from pieces_attendues_bail")).rows).toEqual([{ document_id: suivant }]);
  });
  it("refuse une pièce purgée ou une ancienne version, et annule son rattachement", async () => {
    await db.query("reset role"); const purge = await fichier(org, null, true); await fichier(org, document); await agir();
    expect((await refus(() => affecter("assurance_proprietaire", purge))).message).toMatch(/purgé/);
    expect((await refus(() => affecter())).message).toMatch(/remplacée/);
    expect((await db.query("select id from document_liens where document_id=any($1::uuid[])", [[purge, document]])).rowCount).toBe(0);
  });
  it("refuse un bail actif dans la RPC et dans le classement direct", async () => {
    await db.query("reset role");
    const actif = (await db.query("insert into baux(organization_id,lot_id,etat) values($1,$2,'actif') returning id", [org, lot])).rows[0].id;
    await agir();
    expect((await refus(() => affecter("assurance_proprietaire", document, null, actif))).code).toBe("42501");
    expect((await refus(() => classementDirect("assurance_locataire", actif))).message).toMatch(/brouillon/);
  });
  it("vérifie les frontières organisation, logement et portée, même pour un gérant", async () => {
    expect((await refus(() => affecter("assurance_proprietaire", etrangerDocument))).message).toMatch(/document|organisation|security/i);
    expect((await refus(() => affecter("assurance_proprietaire", document, null, autreBail))).code).toBe("42501");
    expect((await refus(() => classementDirect("assurance_locataire", bailConfie))).message).toMatch(/brouillon/);
    expect((await refus(() => classementDirect("assurance_proprietaire", null, autreLot))).message).toMatch(/pieces_attendues_bail_lot_meme_org_fk/);
    expect((await refus(() => classementDirect("assurance_proprietaire", bail))).message).toMatch(/portee_check/);
    expect((await refus(() => classementDirect("assurance_locataire", null))).message).toMatch(/portee_check/);
    expect((await classementDirect("assurance_proprietaire", null)).rows[0].updated_by).toBe(gerant);
  });
  it("l'autre organisation ne peut lire ni classer les pièces du lot", async () => {
    await affecter(); await agir(etranger);
    expect((await db.query("select id from pieces_attendues_bail where lot_id=$1", [lot])).rowCount).toBe(0);
    expect((await refus(() => affecter())).code).toBe("42501");
    expect((await affecter("assurance_proprietaire", etrangerDocument, null, autreBail, autreOrg)).rows[0].document_id).toBe(etrangerDocument);
  });
  it("retire les accès d'une adhésion désactivée", async () => {
    await affecter(); await db.query("reset role");
    await db.query("update memberships set status='inactive' where account_id=$1 and organization_id=$2", [gerant, org]); await agir();
    expect((await db.query("select id from pieces_attendues_bail where lot_id=$1", [lot])).rowCount).toBe(0);
    expect((await refus(() => affecter("assurance_locataire"))).code).toBe("42501");
  });
  it("respecte le portefeuille d'un agent", async () => {
    await affecter(); await db.query("reset role");
    const depotAgent = await fichier(org, null, false, agent); await agir(agent);
    expect((await db.query("select id from pieces_attendues_bail where lot_id=$1", [lot])).rowCount).toBe(0);
    expect((await refus(() => affecter())).code).toBe("42501");
    expect((await refus(() => affecter("assurance_proprietaire", document, null, bailConfie))).message).toMatch(/portefeuille/);
    expect((await affecter("assurance_proprietaire", depotAgent, null, bailConfie)).rows[0].document_id).toBe(depotAgent);
    expect((await affecter("assurance_proprietaire", depotAgent, depotAgent, bailConfie)).rows[0].document_id).toBe(depotAgent);
  });
  it("garde le superadmin en consultation et interdit l'anonyme et la suppression", async () => {
    await affecter(); expect((await refus(() => db.query("delete from pieces_attendues_bail"))).code).toBe("42501");
    await agir(superadmin);
    expect((await db.query("select id from pieces_attendues_bail where lot_id=$1", [lot])).rowCount).toBe(1);
    expect((await refus(() => affecter("assurance_locataire"))).code).toBe("42501");
    await agir(etranger, "anon");
    expect((await refus(() => db.query("select id from pieces_attendues_bail"))).code).toBe("42501");
    expect((await refus(() => affecter())).code).toBe("42501");
  });
});
