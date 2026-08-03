/**
 * Tests d'intégration Sprint 3 — Mandat de gestion (module 5).
 * Directement contre Postgres (comme sprint2-parc.test.ts) : rôles simulés,
 * transaction annulée à la fin. Nécessite SUPABASE_DB_URL.
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
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated',
      'test-s3-' || gen_random_uuid() || '@test.local',
      'x', now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', '', ''
    ) returning id
  `);
  return id;
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint echec_attendu");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint echec_attendu");
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

describe.skipIf(!DB_URL)("Sprint 3 — mandat de gestion", () => {
  let db: Client;
  let orgA: string;
  let orgB: string;
  let agentA: string;
  let adminB: string;
  let proprietaire: string;
  let autrePersonne: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const orgs = await db.query(`
      insert into public.organizations (name, status)
      values ('S3 Alpha', 'active'), ('S3 Beta', 'active')
      returning id, name
    `);
    orgA = orgs.rows.find((o) => o.name === "S3 Alpha")!.id;
    orgB = orgs.rows.find((o) => o.name === "S3 Beta")!.id;

    agentA = await creerUtilisateur(db);
    adminB = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
       ($1, $2, 'agent'), ($3, $4, 'admin_agence')`,
      [agentA, orgA, adminB, orgB]
    );
    const personnes = await db.query(
      `insert into public.persons (organization_id, nom, prenom)
       values ($1, 'Martin', 'Paul'), ($1, 'Durand', 'Sophie') returning id, nom`,
      [orgA]
    );
    proprietaire = personnes.rows.find((p) => p.nom === "Martin")!.id;
    autrePersonne = personnes.rows.find((p) => p.nom === "Durand")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Crée un bien + son lot unique, détenu à 100 % par `person`, en tant qu'agent A.
  async function lotDetenuPar(person: string): Promise<string> {
    await simuler(db, agentA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot(
         $1, '1 rue du Mandat', 'appartement'::public.bien_type,
         '1 rue du Mandat', null, '75001', 'Paris', 1990, false, 40, 2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 100)`,
      [lot, orgA, person]
    );
    return lot;
  }

  async function creerMandat(person: string): Promise<string> {
    await simuler(db, agentA);
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat)
       values ($1, $2, 'actif') returning id`,
      [orgA, person]
    );
    return id;
  }

  it("un mandat actif couvre 3 lots, chacun avec son taux (RM-5.1.4)", async () => {
    const lots = [
      await lotDetenuPar(proprietaire),
      await lotDetenuPar(proprietaire),
      await lotDetenuPar(proprietaire),
    ];
    const mandat = await creerMandat(proprietaire);
    await simuler(db, agentA);
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires)
       values ($1, $2, $3, 7), ($1, $2, $4, 6.5), ($1, $2, $5, 8)`,
      [orgA, mandat, lots[0], lots[1], lots[2]]
    );
    const { rows } = await db.query(
      `select count(*)::int as n from public.mandat_lignes
       where mandat_id = $1 and date_fin is null`,
      [mandat]
    );
    expect(rows[0].n).toBe(3);
  });

  it("taux par défaut 7 % et date de rapport le 10 (RM-5.3)", async () => {
    const lot = await lotDetenuPar(proprietaire);
    const mandat = await creerMandat(proprietaire);
    await simuler(db, agentA);
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id)
       values ($1, $2, $3) returning id`,
      [orgA, mandat, lot]
    );
    const ligne = await db.query(
      `select taux_honoraires from public.mandat_lignes where id = $1`,
      [id]
    );
    expect(Number(ligne.rows[0].taux_honoraires)).toBe(7);
    const m = await db.query(`select date_rapport from public.mandats where id = $1`, [mandat]);
    expect(Number(m.rows[0].date_rapport)).toBe(10);
  });

  it("seuls les lots du mandant sont intégrables (RM-5.1.1)", async () => {
    const lotAutrui = await lotDetenuPar(autrePersonne);
    const mandat = await creerMandat(proprietaire);
    await simuler(db, agentA);
    await attendreEchec(
      db,
      /non détenu/,
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id) values ($1, $2, $3)`,
      [orgA, mandat, lotAutrui]
    );
  });

  it("un lot n'a qu'un mandat actif à la fois (RM-5.1.3)", async () => {
    const lot = await lotDetenuPar(proprietaire);
    const mandat1 = await creerMandat(proprietaire);
    const mandat2 = await creerMandat(proprietaire);
    await simuler(db, agentA);
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id) values ($1, $2, $3)`,
      [orgA, mandat1, lot]
    );
    await attendreEchec(
      db,
      /déjà couvert/,
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id) values ($1, $2, $3)`,
      [orgA, mandat2, lot]
    );
  });

  it("les mandats sont isolés par agence (RM-A1.7)", async () => {
    const lot = await lotDetenuPar(proprietaire);
    const mandat = await creerMandat(proprietaire);
    await simuler(db, agentA);
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id) values ($1, $2, $3)`,
      [orgA, mandat, lot]
    );
    await simuler(db, adminB);
    const vue = await db.query(`select count(*)::int as n from public.mandats where id = $1`, [
      mandat,
    ]);
    expect(vue.rows[0].n).toBe(0);
  });
});
