/**
 * Tests d'intégration Sprint 4 — État des lieux (EDL) (module 1).
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
      'test-edl-'||gen_random_uuid()||'@test.local','x', now(),
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

describe.skipIf(!DB_URL)("Sprint 4 — état des lieux", () => {
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
       values ('EDL Alpha','active'),('EDL Beta','active') returning id, name`
    );
    orgA = orgs.rows.find((o) => o.name === "EDL Alpha")!.id;
    const orgB = orgs.rows.find((o) => o.name === "EDL Beta")!.id;
    agentA = await creerUtilisateur(db);
    adminB = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'),($3,$4,'admin_agence')`,
      [agentA, orgA, adminB, orgB]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bail'),($1,'Loc') returning id, nom`,
      [orgA]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Bail")!.id;
    locataire = pers.rows.find((p) => p.nom === "Loc")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Un bail brouillon sur un lot doté d'un équipement
  async function creerBailAvecEquipement(): Promise<string> {
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'3 rue EDL','appartement'::public.bien_type,
        '3 rue EDL',null,'75001','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    // équipement au catalogue + sur le lot
    const {
      rows: [{ id: eq }],
    } = await db.query(
      `insert into public.equipements_catalogue (organization_id, nom) values ($1,'Chaudière') returning id`,
      [orgA]
    );
    await db.query(`insert into public.lot_equipements (lot_id, equipement_id) values ($1,$2)`, [
      lot,
      eq,
    ]);
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal) values ($1,$2,$3) returning id`,
      [orgA, lot, locataire]
    );
    return bail;
  }

  async function creerEdl(bail: string): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    return id;
  }

  it("la grille se génère depuis le lot (éléments standard + équipements)", async () => {
    const bail = await creerBailAvecEquipement();
    const edl = await creerEdl(bail);
    const {
      rows: [{ n }],
    } = await db.query(`select public.generer_grille_edl($1) as n`, [edl]);
    // 7 éléments standard + 1 équipement (Chaudière)
    expect(Number(n)).toBe(8);
    const equip = await db.query(
      `select count(*)::int as n from public.edl_lignes where edl_id=$1 and categorie='equipement'`,
      [edl]
    );
    expect(equip.rows[0].n).toBe(1);
  });

  it("on ne peut pas signer tant qu'une ligne est sans état", async () => {
    const bail = await creerBailAvecEquipement();
    const edl = await creerEdl(bail);
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await attendreEchec(db, /sans état/, `select public.signer_edl($1)`, [edl]);
  });

  it("une fois toutes les lignes renseignées, l'EDL se signe et se fige", async () => {
    const bail = await creerBailAvecEquipement();
    const edl = await creerEdl(bail);
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon' where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);

    const e = await db.query(`select etat, signe_le from public.etats_des_lieux where id=$1`, [edl]);
    expect(e.rows[0].etat).toBe("signe");
    expect(e.rows[0].signe_le).toBeTruthy();

    // Figé : plus aucune modification des lignes
    await attendreEchec(
      db,
      /figées/,
      `update public.edl_lignes set etat='mauvais' where edl_id=$1`,
      [edl]
    );
  });

  it("les EDL sont isolés par agence (RM-A1.7)", async () => {
    const bail = await creerBailAvecEquipement();
    const edl = await creerEdl(bail);
    await simuler(db, adminB);
    const vue = await db.query(`select count(*)::int as n from public.etats_des_lieux where id=$1`, [
      edl,
    ]);
    expect(vue.rows[0].n).toBe(0);
  });
});
