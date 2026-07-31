/**
 * Tests d'intégration Sprint 3 — Invitation d'un locataire (module 0b).
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;

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

describe.skipIf(!DB_URL)("Sprint 3 — invitation locataire", () => {
  let db: Client;
  let orgA: string;
  let agentA: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('S3I Alpha', 'active') returning id`
    );
    orgA = org;
    const {
      rows: [{ id: uid }],
    } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-s3i-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    agentA = uid;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')`,
      [agentA, orgA]
    );
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  it("l'agence invite un locataire : compte + adhésion + rattachement", async () => {
    const {
      rows: [{ id: person }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, email)
       values ($1, 'Petit', 'petit-' || gen_random_uuid() || '@test.local') returning id`,
      [orgA]
    );

    await simuler(db, agentA);
    const {
      rows: [{ email }],
    } = await db.query(`select public.inviter_locataire($1, $2) as email`, [orgA, person]);

    await simuler(db, null, "postgres");
    const acc = await db.query(`select id from public.accounts where email = $1`, [email]);
    expect(acc.rows).toHaveLength(1);
    const accId = acc.rows[0].id;

    const mem = await db.query(
      `select 1 from public.memberships
       where account_id = $1 and organization_id = $2 and role = 'locataire'`,
      [accId, orgA]
    );
    expect(mem.rows).toHaveLength(1);

    const p = await db.query(`select account_id from public.persons where id = $1`, [person]);
    expect(p.rows[0].account_id).toBe(accId);
  });

  it("refuse d'inviter une personne sans email", async () => {
    const {
      rows: [{ id: person }],
    } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1, 'SansMail') returning id`,
      [orgA]
    );
    await simuler(db, agentA);
    await attendreEchec(db, /email/, `select public.inviter_locataire($1, $2)`, [orgA, person]);
  });
});
