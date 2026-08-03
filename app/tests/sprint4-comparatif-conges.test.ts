/**
 * Tests d'intégration Sprint 4 — Comparatif EDL entrée/sortie + congés (module 1).
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
      'test-cc-'||gen_random_uuid()||'@test.local','x', now(),
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

describe.skipIf(!DB_URL)("Sprint 4 — comparatif EDL + congés", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
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
    } = await db.query(`insert into public.organizations (name, status) values ('CC Alpha','active') returning id`);
    orgA = org;
    gerant = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, orgA]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Prop'),($1,'Loc') returning id, nom`,
      [orgA]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Prop")!.id;
    locataire = pers.rows.find((p) => p.nom === "Loc")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function lotLouable(): Promise<string> {
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'4 rue CC','appartement'::public.bien_type,'4 rue CC',null,'75001','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration) values ($1,$2,'dpe',current_date,current_date+365)`,
      [orgA, lot]
    );
    await db.query(
      `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration) values ($1,$2,'erp',current_date,current_date+180)`,
      [orgA, bien]
    );
    await db.query(`update public.lots set etat='disponible' where id=$1`, [lot]);
    return lot;
  }

  async function edlSigne(bail: string, type: string, etatDefaut: string): Promise<string> {
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,$3) returning id`,
      [orgA, bail, type]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat=$2::public.etat_element where edl_id=$1`, [
      edl,
      etatDefaut,
    ]);
    return edl;
  }

  it("le comparatif entrée/sortie met les écarts en évidence", async () => {
    const lot = await lotLouable();
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal) values ($1,$2,$3) returning id`,
      [orgA, lot, locataire]
    );
    const entree = await edlSigne(bail, "entree", "bon");
    const sortie = await edlSigne(bail, "sortie", "bon");
    // Une dégradation sur "Sols" à la sortie
    await db.query(
      `update public.edl_lignes set etat='mauvais' where edl_id=$1 and libelle='Sols'`,
      [sortie]
    );
    await db.query(`select public.signer_edl($1)`, [entree]);
    await db.query(`select public.signer_edl($1)`, [sortie]);

    const comp = await db.query(
      `select libelle, etat_entree, etat_sortie, ecart from public.comparatif_edl($1) where ecart`,
      [bail]
    );
    expect(comp.rows).toHaveLength(1);
    expect(comp.rows[0].libelle).toBe("Sols");
    expect(comp.rows[0].etat_entree).toBe("bon");
    expect(comp.rows[0].etat_sortie).toBe("mauvais");
  });

  it("un congé passe le bail en préavis et fixe la date d'effet", async () => {
    const lot = await lotLouable();
    const {
      rows: [{ id: doc }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'bail','B',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'e-'||gen_random_uuid()) returning id`,
      [orgA]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, document_signe) values ($1,$2,$3,$4) returning id`,
      [orgA, lot, locataire, doc]
    );
    await db.query(`select public.activer_bail($1)`, [bail]);

    // Préavis réduit sans justificatif : refusé
    await attendreEchec(
      db,
      /justificatif/,
      `select public.enregistrer_conge($1,'locataire',current_date,1::smallint,'mutation',null)`,
      [bail]
    );

    // Congé standard 3 mois
    await db.query(
      `select public.enregistrer_conge($1,'locataire',current_date,3::smallint,null,null)`,
      [bail]
    );
    const b = await db.query(`select etat, date_fin from public.baux where id=$1`, [bail]);
    expect(b.rows[0].etat).toBe("preavis");
    expect(b.rows[0].date_fin).toBeTruthy();
  });
});
