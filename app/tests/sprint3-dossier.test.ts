/**
 * Tests d'intégration Sprint 3 — Dossier locataire versionné (module 0b).
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
  let adminA: string;
  let agentA: string;
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
    const {
      rows: [{ id: org }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('S3D Alpha', 'active') returning id`
    );
    orgA = org;
    adminA = await creerUtilisateur(db);
    agentA = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
       ($1, $2, 'admin_agence'), ($3, $2, 'agent')`,
      [adminA, orgA, agentA]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom, prenom)
       values ($1, 'Nguyen', 'Lea'), ($1, 'Martin', 'Paul') returning id, nom`,
      [orgA]
    );
    locataire = pers.rows.find((p) => p.nom === "Nguyen")!.id;
    proprietaire = pers.rows.find((p) => p.nom === "Martin")!.id;

    // Depuis le périmètre du portefeuille (2026-09-09), l'agent ne voit que
    // les lots des mandats dont il est TITULAIRE. C'est donc l'ADMIN d'agence
    // qui constitue le parc puis confie le mandat (RM-18.1.4) : Léa n'entre
    // dans le périmètre de l'agent que parce qu'elle est la locataire d'un
    // bail portant sur un lot de son portefeuille.
    await simuler(db, adminA);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot(
         $1, '8 rue du Dossier', 'appartement'::public.bien_type,
         '8 rue du Dossier', null, '75011', 'Paris', 1985, false, 38.0, 2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part)
       values ($1, $2, $3, 100)`,
      [lot, orgA, proprietaire]
    );
    const {
      rows: [{ id: mandat }],
    } = await db.query(
      `insert into public.mandats (organization_id, person_id, etat, agent_account_id)
       values ($1, $2, 'actif', $3) returning id`,
      [orgA, proprietaire, agentA]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires)
       values ($1, $2, $3, 7.0)`,
      [orgA, mandat, lot]
    );
    await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal,
                                loyer_hc, charges, jour_echeance)
       values ($1, $2, $3, 750, 50, 5)`,
      [orgA, lot, locataire]
    );
    await simuler(db, null, "postgres");
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // L'agent dépose la pièce puis la rattache au dossier de Léa. `deposited_by`
  // n'est pas décoratif : le `returning` traverse la policy de lecture
  // `documents_agent_portefeuille`, or à cet instant le document n'a pas
  // encore de lien — il n'est du portefeuille que parce que c'est l'agent
  // lui-même qui vient de le déposer.
  async function deposerPiece(
    type: string,
    titre: string,
    remplaceId: string | null = null
  ): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.documents
         (organization_id, type, titre, storage_path, mime_type, taille_octets,
          empreinte, remplace_id, deposited_by)
       values ($1, $2::public.document_type, $3,
               $1::uuid::text || '/' || gen_random_uuid() || '.pdf',
               'application/pdf', 1000, 'e-' || gen_random_uuid(), $4, $5)
       returning id`,
      [orgA, type, titre, remplaceId, agentA]
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
