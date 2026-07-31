/**
 * Tests d'intégration Sprint 3 — Dossier locataire versionné (module 0b).
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;

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
      'test-s3d-' || gen_random_uuid() || '@test.local',
      'x', now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), '', '', '', '', ''
    ) returning id
  `);
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

describe.skipIf(!DB_URL)("Sprint 3 — dossier locataire versionné", () => {
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
      `insert into public.organizations (name, status) values ('S3D Alpha', 'active') returning id`
    );
    orgA = org;
    agentA = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1, $2, 'agent')`,
      [agentA, orgA]
    );
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1, 'Nguyen', 'Lea') returning id`,
      [orgA]
    );
    locataire = id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function deposerPiece(
    type: string,
    titre: string,
    remplaceId: string | null = null
  ): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents
         (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, remplace_id)
       values ($1, $2::public.document_type, $3,
               $1::uuid::text || '/' || gen_random_uuid() || '.pdf',
               'application/pdf', 1000, 'e-' || gen_random_uuid(), $4)
       returning id`,
      [orgA, type, titre, remplaceId]
    );
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1, $2, 'personne', $3)`,
      [id, orgA, locataire]
    );
    return id;
  }

  it("le dossier n'affiche que la version courante, mais conserve tout (RM-0b.4.1)", async () => {
    await simuler(db, agentA);
    const v1 = await deposerPiece("piece_identite", "CNI 2024");
    const v2 = await deposerPiece("piece_identite", "CNI 2025", v1); // remplace v1

    // Le dossier courant ne montre que v2
    const courant = await db.query(
      `select document_id, titre from public.dossier_personne($1)`,
      [locataire]
    );
    expect(courant.rows).toHaveLength(1);
    expect(courant.rows[0].titre).toBe("CNI 2025");
    expect(courant.rows[0].document_id).toBe(v2);

    // Mais les deux versions existent toujours (aucune écrasée)
    await simuler(db, null, "postgres");
    const toutes = await db.query(
      `select count(*)::int as n from public.documents d
       join public.document_liens dl on dl.document_id = d.id
       where dl.entite = 'personne' and dl.entite_id = $1`,
      [locataire]
    );
    expect(toutes.rows[0].n).toBe(2);
  });

  it("plusieurs pièces d'un même dossier coexistent (identité + assurance)", async () => {
    await simuler(db, agentA);
    await deposerPiece("piece_identite", "Passeport");
    await deposerPiece("attestation_assurance", "MAIF 2025");
    const courant = await db.query(`select type from public.dossier_personne($1)`, [locataire]);
    expect(courant.rows.map((r) => r.type).sort()).toEqual([
      "attestation_assurance",
      "piece_identite",
    ]);
  });
});
