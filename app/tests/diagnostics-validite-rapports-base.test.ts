/**
 * Migration 20261027100200 (audit de la refonte #264, domaine diagnostics), côté base :
 *  - DOC-01 : décret n° 2020-1610 — un DPE réalisé du 01/01/2013 au 31/12/2017 ne vaut que jusqu'au 31/12/2022, du
 *    01/01/2018 au 30/06/2021 que jusqu'au 31/12/2024. L'échéance saisie n'est pas réécrite ; le blocage de mise en
 *    location et l'alerte quotidienne lisent l'échéance plafonnée ;
 *  - DOC-02 : un rapport rangé en « Autre » ou « Courrier », cité par un diagnostic, est reclassé « Diagnostic » dans
 *    la même transaction (trace dans audit_log) ; une pièce d'un autre type ne l'est jamais ; un fichier d'une signature
 *    en cours (verrouillé) est refusé avec un message qui parle du diagnostic ;
 *  - DOC-04 : diagnostics_a_renouveler rend le rapport d'un DPE expiré par le plafond, avec son bien et son lot.
 * Transaction annulée, base locale jetable (SUPABASE_DB_URL).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("Diagnostics : validité réglementaire du DPE, rapport reclassé, rapports à renouveler", () => {
  let db: Client;
  let gerant: string, org: string, bien: string, lot: string;
  let n = 0;

  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const comme = async (id: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  };
  const document = async (type: string, titre = "Rapport") => {
    n += 1;
    const empreinte = String(n).padStart(64, "d");
    return (await db.query(
      `insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
       values($1,$2,$3,$4,'application/pdf',1234,$5) returning id`,
      [org, type, titre, `${org}/${empreinte}.pdf`, empreinte])).rows[0].id as string;
  };
  const dpe = async (realisation: string, expiration: string | null, doc: string | null = null) => (await db.query(
    `insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id,classe_dpe)
     values($1,$2,'dpe',$3,$4,$5,'D') returning id`, [org, lot, realisation, expiration, doc])).rows[0].id as string;
  const blocages = async () => (await db.query("select public.lot_blocages_location($1) as b", [lot])).rows[0].b as string[];
  const typeDocument = async (doc: string) => (await db.query("select type::text as t from public.documents where id=$1", [doc])).rows[0].t as string;

  beforeAll(async () => {
    if (!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(url)) throw Error("Base locale dédiée requise");
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    gerant = (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-doc264-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
    org = (await db.query("insert into organizations(name,status,type) values('TEST DOC-264','active','proprietaire_direct') returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, org]);
    bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Gambetta','appartement','1 rue TEST','75020','Paris') returning id", [org])).rows[0].id;
    lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat,surface_m2) values($1,$2,'Lot unique','brouillon',48) returning id", [org, bien])).rows[0].id;
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("DOC-01 : l'échéance qui fait foi suit le décret n° 2020-1610", async () => {
    const r = (await db.query(`select
      public.echeance_reglementaire_diagnostic('dpe','2019-05-10','2029-05-10') a,
      public.echeance_reglementaire_diagnostic('dpe','2015-01-01','2025-01-01') b,
      public.echeance_reglementaire_diagnostic('dpe','2021-06-30','2031-06-30') c,
      public.echeance_reglementaire_diagnostic('dpe','2021-07-01','2031-07-01') d,
      public.echeance_reglementaire_diagnostic('dpe','2014-03-10',null) e,
      public.echeance_reglementaire_diagnostic('dpe','2019-05-10','2023-01-01') f,
      public.echeance_reglementaire_diagnostic('erp','2019-05-10','2019-11-10') g`)).rows[0];
    const jour = (d: Date | null) => d && new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    expect([r.a, r.b, r.c, r.d, r.e, r.f, r.g].map(jour)).toEqual(
      ["2024-12-31", "2022-12-31", "2024-12-31", "2031-07-01", "2022-12-31", "2023-01-01", "2019-11-10"]);
  });

  it("DOC-01 : un DPE de 2019 saisi « jusqu'en 2029 » garde le blocage, sans que son échéance soit réécrite", async () => {
    await comme(gerant);
    const id = await dpe("2019-05-10", "2029-05-10");
    expect(await blocages()).toContain("DPE absent ou expiré (obligatoire en habitation)");
    await admin();
    const lu = (await db.query("select to_char(date_expiration,'YYYY-MM-DD') e from public.diagnostics where id=$1", [id])).rows[0].e;
    expect(lu).toBe("2029-05-10");
  });

  it("DOC-01 : un DPE réalisé depuis le 1er juillet 2021 lève le blocage pour dix ans", async () => {
    await comme(gerant);
    await dpe("2021-07-01", "2031-07-01");
    expect(await blocages()).not.toContain("DPE absent ou expiré (obligatoire en habitation)");
  });

  it("DOC-01 : l'alerte quotidienne signale le DPE expiré par le plafond", async () => {
    const id = await dpe("2019-05-10", "2029-05-10");
    await db.query("select public.generer_alertes_diagnostics()");
    const alerte = (await db.query(
      "select details->>'seuil' seuil, criticite::text, to_char(echeance,'YYYY-MM-DD') echeance from public.alerts where organization_id=$1 and type='diagnostic_expiration' and details->>'diagnostic_id'=$2",
      [org, id])).rows;
    expect(alerte).toEqual([{ seuil: "J+0", criticite: "critique", echeance: "2024-12-31" }]);
  });

  it("DOC-02 : un rapport rangé en « Autre » est reclassé « Diagnostic » par le diagnostic qui le cite, avec une trace", async () => {
    const piece = await document("autre", "VDD-DPE-2019-v2");
    await comme(gerant);
    // La fiche document reste fermée en écriture au compte…
    await db.query("savepoint direct");
    await expect(db.query("update public.documents set type='diagnostic' where id=$1", [piece])).rejects.toThrow(/permission denied/);
    await db.query("rollback to savepoint direct");
    // … seul le diagnostic qui la cite la reclasse, dans la même transaction.
    const diag = await dpe("2022-03-15", "2032-03-15", piece);
    await admin();
    expect(await typeDocument(piece)).toBe("diagnostic");
    const trace = (await db.query("select account_id, details from public.audit_log where organization_id=$1 and action='document_reclasse_diagnostic'", [org])).rows;
    expect(trace).toEqual([{ account_id: gerant, details: { document_id: piece, ancien_type: "autre", diagnostic_id: diag, type_diagnostic: "dpe" } }]);
  });

  it("DOC-02 : un courrier aussi ; une pièce d'identité ou un rapport déjà classé ne changent pas", async () => {
    const courrier = await document("courrier");
    const identite = await document("piece_identite");
    const rapport = await document("diagnostic");
    await comme(gerant);
    await dpe("2022-03-15", "2032-03-15", courrier);
    await dpe("2022-03-15", "2032-03-15", identite);
    await dpe("2022-03-15", "2032-03-15", rapport);
    await admin();
    expect([await typeDocument(courrier), await typeDocument(identite), await typeDocument(rapport)]).toEqual(["diagnostic", "piece_identite", "diagnostic"]);
    expect((await db.query("select count(*)::int n from public.audit_log where organization_id=$1 and action='document_reclasse_diagnostic'", [org])).rows[0].n).toBe(1);
  });

  it("DOC-02 : un fichier qui fait partie d'une signature en cours n'est pas reclassé ; le refus parle du diagnostic", async () => {
    const annexe = await document("autre", "Annexe CREP");
    const acte = await document("bail", "Avenant à signer");
    // Circuit posé tel que l'écrit le serveur (déclencheurs de préparation contournés, comme les tests de signature).
    await db.query("set local session_replication_role = replica");
    await db.query(`insert into public.bail_signature_circuits(organization_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,annexes,etat,modele,cible_id)
      values($1,$2,$3,'zoho','sandbox',repeat('a',64),repeat('a',64),'[{"statut":"sent"},{"statut":"sent"}]',$4,'en_cours','avenant',gen_random_uuid())`,
      [org, acte, gerant, JSON.stringify([{ id: annexe }])]);
    await db.query("set local session_replication_role = origin");
    await comme(gerant);
    await db.query("savepoint verrou");
    await expect(dpe("2022-03-15", "2032-03-15", annexe)).rejects.toThrow(
      "Ce fichier fait partie d’une signature en cours : déclarez ce diagnostic une fois la signature terminée ou annulée.");
    await db.query("rollback to savepoint verrou");
    await admin();
    expect(await typeDocument(annexe)).toBe("autre");
    expect((await db.query("select count(*)::int n from public.diagnostics where document_id=$1", [annexe])).rows[0].n).toBe(0);
  });

  it("DOC-04 : diagnostics_a_renouveler rend le rapport du DPE expiré par le plafond, avec son bien et son lot", async () => {
    const ancien = await document("diagnostic", "DPE — 10/05/2019");
    const recent = await document("diagnostic", "DPE — 01/07/2021");
    await dpe("2019-05-10", "2029-05-10", ancien);
    const autreLot = (await db.query("insert into lots(organization_id,bien_id,nom,etat,surface_m2) values($1,$2,'Lot 2','brouillon',30) returning id", [org, bien])).rows[0].id;
    await db.query(`insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id,classe_dpe)
      values($1,$2,'dpe','2021-07-01','2031-07-01',$3,'C')`, [org, autreLot, recent]);
    await comme(gerant);
    const lignes = (await db.query("select id, titre, to_char(expire_le,'YYYY-MM-DD') expire_le, rattachement from public.diagnostics_a_renouveler($1, current_date + 30, null)", [org])).rows;
    expect(lignes).toEqual([{ id: ancien, titre: "DPE — 10/05/2019", expire_le: "2024-12-31", rattachement: "TEST Gambetta · Lot unique" }]);
  });
});
