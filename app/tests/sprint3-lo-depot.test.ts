/**
 * Tests d'intégration Sprint 3 — Dépôt d'attestation par le locataire (espace LO).
 * Vérifie le flux réel côté base : deposer_mon_attestation + mon_dossier_locataire
 * + la policy de stockage locataire. Nécessite SUPABASE_DB_URL.
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

describe.skipIf(!DB_URL)("Sprint 3 — dépôt LO (attestation)", () => {
  let db: Client;
  let orgA: string;
  let compteLo: string;

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
      `insert into public.organizations (name, status) values ('S3LO Alpha','active') returning id`
    );
    orgA = org;
    // Compte locataire + fiche rattachée
    const {
      rows: [{ id: uid }],
    } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-lo-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    compteLo = uid;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'locataire')`,
      [compteLo, orgA]
    );
    await db.query(
      `insert into public.persons (organization_id, account_id, nom) values ($1,$2,'Occupant')`,
      [orgA, compteLo]
    );
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  it("le locataire dépose son attestation et la retrouve dans son dossier", async () => {
    await simuler(db, compteLo);
    const {
      rows: [{ doc }],
    } = await db.query(
      `select public.deposer_mon_attestation(
         $1, $1::uuid::text || '/att.pdf', 'application/pdf', 1234,
         'emp-' || gen_random_uuid(), 'MAIF', current_date + 200) as doc`,
      [orgA]
    );
    expect(doc).toBeTruthy();

    const dossier = await db.query(`select type, expire_le from public.mon_dossier_locataire($1)`, [
      orgA,
    ]);
    expect(dossier.rows).toHaveLength(1);
    expect(dossier.rows[0].type).toBe("attestation_assurance");
    expect(dossier.rows[0].expire_le).toBeTruthy();
  });

  it("la condition de la policy de stockage est vraie pour le locataire", async () => {
    await simuler(db, compteLo);
    // Ce que la WITH CHECK de ged_insert_locataire évalue pour un chemin <org>/x
    const { rows } = await db.query(
      `select (storage.foldername($1))[1] in (
         select o::text from public.org_ids_avec_roles(
           array['locataire']::public.membership_role[]) o) as autorise`,
      [`${orgA}/depot-lo.pdf`]
    );
    expect(rows[0].autorise).toBe(true);
  });

  it("un compte sans fiche ne peut pas déposer", async () => {
    // Nouveau compte sans fiche personne
    const {
      rows: [{ id: autre }],
    } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-lo2-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'locataire')`,
      [autre, orgA]
    );
    await simuler(db, autre);
    await db.query("savepoint e");
    await expect(
      db.query(
        `select public.deposer_mon_attestation($1, 'x/y.pdf','application/pdf',1,'e',null,current_date+1)`,
        [orgA]
      )
    ).rejects.toThrow(/Aucune fiche/);
    await db.query("rollback to savepoint e");
  });
});
