/**
 * Tests d'intégration Sprint 3 — Attestation d'assurance : alertes d'expiration
 * (module 0b). Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
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

async function attendreEchec(db: Client, motif: RegExp, sql: string) {
  await db.query("savepoint e");
  await expect(db.query(sql)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Sprint 3 — attestation d'assurance", () => {
  let db: Client;
  let orgA: string;
  let agentA: string;
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
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('S3A Alpha', 'active') returning id`
    );
    orgA = org;
    const {
      rows: [{ id: uid }],
    } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-s3a-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    agentA = uid;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')`,
      [agentA, orgA]
    );
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1, 'Nguyen') returning id`,
      [orgA]
    );
    locataire = id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function deposerAttestation(joursAvantExpiration: number): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents
         (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, expire_le)
       values ($1, 'attestation_assurance', 'Assurance',
               $1::uuid::text || '/' || gen_random_uuid() || '.pdf',
               'application/pdf', 1000, 'e-' || gen_random_uuid(),
               current_date + ($2 || ' days')::interval)
       returning id`,
      [orgA, joursAvantExpiration]
    );
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1, $2, 'personne', $3)`,
      [id, orgA, locataire]
    );
    return id;
  }

  it("génère les bons seuils J-30 / J-15 / J+0 / J+15", async () => {
    await deposerAttestation(25); // dans 25 j -> J-30
    await deposerAttestation(10); // dans 10 j -> J-15
    await deposerAttestation(-2); // expirée depuis 2 j -> J+0
    await deposerAttestation(-20); // expirée depuis 20 j -> J+15

    // Un compte d'agence ne peut pas déclencher (réservé cron/SA)
    await simuler(db, agentA);
    await attendreEchec(db, /reserve|super admin/, `select public.generer_alertes_assurance()`);

    // Le cron génère les 4 alertes aux bons seuils
    await simuler(db, null, "postgres");
    const {
      rows: [{ generer_alertes_assurance: crees }],
    } = await db.query(`select public.generer_alertes_assurance()`);
    expect(Number(crees)).toBe(4);

    const alertes = await db.query(
      `select criticite, details->>'seuil' as seuil from public.alerts
       where organization_id = $1 and type = 'assurance_expiration'
       order by case details->>'seuil'
         when 'J-30' then 1 when 'J-15' then 2 when 'J+0' then 3 when 'J+15' then 4 end`,
      [orgA]
    );
    expect(alertes.rows).toEqual([
      { criticite: "informative", seuil: "J-30" },
      { criticite: "normale", seuil: "J-15" },
      { criticite: "critique", seuil: "J+0" },
      { criticite: "critique", seuil: "J+15" },
    ]);
  });

  it("idempotence : une seconde passe ne recrée rien", async () => {
    await deposerAttestation(10);
    await simuler(db, null, "postgres");
    await db.query(`select public.generer_alertes_assurance()`);
    const {
      rows: [{ generer_alertes_assurance: crees2 }],
    } = await db.query(`select public.generer_alertes_assurance()`);
    expect(Number(crees2)).toBe(0);
  });
});
