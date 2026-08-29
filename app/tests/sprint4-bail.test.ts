/**
 * Tests d'intégration Sprint 4 — Bail : fondation et activation (module 1).
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-s4-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Sprint 4 — bail : validation", () => {
  let db: Client;
  let orgA: string;
  let agentA: string;
  let adminB: string;
  let proprietaire: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const orgs = await db.query(
      `insert into public.organizations (name, status)
       values ('S4 Alpha','active'), ('S4 Beta','active') returning id, name`
    );
    orgA = orgs.rows.find((o) => o.name === "S4 Alpha")!.id;
    const orgB = orgs.rows.find((o) => o.name === "S4 Beta")!.id;
    agentA = await creerUtilisateur(db);
    adminB = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'agent'), ($3,$4,'admin_agence')`,
      [agentA, orgA, adminB, orgB]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur'),($1,'Locataire') returning id, nom`,
      [orgA]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Bailleur")!.id;
    locataire = pers.rows.find((p) => p.nom === "Locataire")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Un lot prêt à louer : bien + lot, détention 100 %, diagnostics valides, disponible
  async function lotLouable(): Promise<string> {
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'2 rue du Bail','appartement'::public.bien_type,
         '2 rue du Bail', null, '75001','Paris',1990,false,50,3) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
       values ($1,$2,'dpe',current_date,current_date+365)`,
      [orgA, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
       values ($1,$2,'erp',current_date,current_date+180)`,
      [orgA, bien]
    );
    await db.query(`update public.lots set etat='disponible' where id=$1`, [lot]);
    return lot;
  }

  async function docBail(): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid())
       returning id`,
      [orgA]
    );
    return id;
  }

  async function creerBail(lot: string, doc: string | null): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, document_signe, loyer_hc, charges, jour_echeance)
       values ($1,$2,$3,$4,750,50,5) returning id`,
      [orgA, lot, locataire, doc]
    );
    return id;
  }

  // Décision 29/08 : l'EDL d'entrée signé est un prérequis de la validation
  async function signerEdlEntree(bail: string): Promise<string> {
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon' where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    return edl;
  }

  it("validation : PDF signé + EDL d'entrée signé + lot disponible → bail actif, lot loué, aucune alerte", async () => {
    const lot = await lotLouable();
    const doc = await docBail();
    await simuler(db, agentA);
    const bail = await creerBail(lot, doc);
    await signerEdlEntree(bail);

    await db.query(`select public.activer_bail($1)`, [bail]);

    const b = await db.query(`select etat from public.baux where id=$1`, [bail]);
    expect(b.rows[0].etat).toBe("actif");
    const l = await db.query(`select etat from public.lots where id=$1`, [lot]);
    expect(l.rows[0].etat).toBe("loue");
    // L'EDL d'entrée n'est plus une alerte : c'est un prérequis (29/08)
    const a = await db.query(
      `select count(*)::int as n from public.alerts where type='edl_entree' and details->>'bail_id'=$1`,
      [bail]
    );
    expect(a.rows[0].n).toBe(0);
  });

  it("refuse la validation sans état des lieux d'entrée signé", async () => {
    const lot = await lotLouable();
    const doc = await docBail();
    await simuler(db, agentA);
    const bail = await creerBail(lot, doc);
    await attendreEchec(db, /état des lieux d'entrée/, `select public.activer_bail($1)`, [bail]);
    // Un EDL créé mais non signé ne suffit pas
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await attendreEchec(db, /état des lieux d'entrée/, `select public.activer_bail($1)`, [bail]);
  });

  it("un seul bail en cours par lot — le brouillon suivant coexiste mais attend", async () => {
    const lot = await lotLouable();
    await simuler(db, agentA);
    const premier = await creerBail(lot, await docBail());
    await signerEdlEntree(premier);
    await db.query(`select public.activer_bail($1)`, [premier]);

    // Le brouillon suivant se crée sans obstacle sur un lot loué…
    const second = await creerBail(lot, await docBail());
    await signerEdlEntree(second);
    // …mais ne se valide pas tant que le premier est en cours
    await attendreEchec(db, /déjà en cours sur ce lot/, `select public.activer_bail($1)`, [second]);
    const b = await db.query(`select etat from public.baux where id=$1`, [second]);
    expect(b.rows[0].etat).toBe("brouillon");
  });

  it("refuse la validation sans bail signé déposé", async () => {
    const lot = await lotLouable();
    await simuler(db, agentA);
    const bail = await creerBail(lot, null);
    await signerEdlEntree(bail);
    await attendreEchec(db, /bail signé/, `select public.activer_bail($1)`, [bail]);
  });

  it("refuse la validation si un diagnostic est expiré (blocage location)", async () => {
    const lot = await lotLouable();
    const doc = await docBail();
    // le DPE expire (réalisation reculée pour rester cohérent : realisation < expiration)
    await db.query(
      `update public.diagnostics
       set date_realisation=current_date-400, date_expiration=current_date-1
       where lot_id=$1 and type='dpe'`,
      [lot]
    );
    await simuler(db, agentA);
    const bail = await creerBail(lot, doc);
    await signerEdlEntree(bail);
    await attendreEchec(db, /bloqu|DPE|disponible/, `select public.activer_bail($1)`, [bail]);
  });

  it("les baux sont isolés par agence (RM-A1.7)", async () => {
    const lot = await lotLouable();
    const doc = await docBail();
    await simuler(db, agentA);
    const bail = await creerBail(lot, doc);
    await simuler(db, adminB);
    const vue = await db.query(`select count(*)::int as n from public.baux where id=$1`, [bail]);
    expect(vue.rows[0].n).toBe(0);
  });
});
