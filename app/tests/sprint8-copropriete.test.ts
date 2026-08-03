/**
 * Tests d'intégration Sprint 8 — Copropriété / appels de charges (module 0c).
 * Ventilation : total bloquant, poste « à qualifier » bloquant, fonds ALUR jamais
 * récupérable (contrainte), figeage à la régularisation. Régularisation d'un lot
 * en copropriété bloquée sans appel ventilé (RM-3.9.2).
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

describe.skipIf(!DB_URL)("Sprint 8 — copropriété / appels de charges", () => {
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
    } = await db.query(`insert into public.organizations (name, status) values ('CC 0c','active') returning id`);
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

  // Bien EN COPROPRIÉTÉ (9e arg = true) avec un lot
  async function lotCopro(): Promise<string> {
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'Copro','appartement'::public.bien_type,'1 rue Copro',null,'75001','Paris',1990,true,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    return lot;
  }

  async function appel(lot: string, exercice: number, total: number): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into public.appels_charges (organization_id, lot_id, exercice, total) values ($1,$2,$3,$4) returning id`,
      [orgA, lot, exercice, total]
    );
    return id;
  }

  async function poste(appelId: string, libelle: string, montant: number, nature: string) {
    await db.query(
      `insert into public.appel_charges_postes (organization_id, appel_id, libelle, montant, nature)
       values ($1,$2,$3,$4,$5)`,
      [orgA, appelId, libelle, montant, nature]
    );
  }

  it("le fonds travaux ALUR ne peut jamais être récupérable (contrainte)", async () => {
    const lot = await lotCopro();
    const a = await appel(lot, 2025, 1000);
    await attendreEchec(
      db,
      /alur_jamais_recuperable|violates check/,
      `insert into public.appel_charges_postes (organization_id, appel_id, libelle, montant, nature, fonds_alur)
       values ($1,$2,'Fonds travaux ALUR',500,'recuperable',true)`,
      [orgA, a]
    );
  });

  it("ventilation bloquée si un poste reste à qualifier, puis si le total diffère", async () => {
    const lot = await lotCopro();
    const a = await appel(lot, 2025, 1000);
    await poste(a, "Ascenseur entretien", 600, "recuperable");
    await poste(a, "Poste mystère", 400, "a_qualifier");
    // Un poste à qualifier bloque
    await attendreEchec(db, /à qualifier/, `select public.valider_ventilation($1)`, [a]);
    // Qualifié mais total volontairement faux (600+300 ≠ 1000)
    await db.query(
      `update public.appel_charges_postes set nature='non_recuperable', montant=300 where appel_id=$1 and libelle='Poste mystère'`,
      [a]
    );
    await attendreEchec(db, /différent du total/, `select public.valider_ventilation($1)`, [a]);
  });

  it("ventilation valide → part récupérable calculée ; appel figé par la régularisation", async () => {
    const lot = await lotCopro();
    // Détention + bail actif pour pouvoir régulariser
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat) values ($1,$2,$3,'actif') returning id`,
      [orgA, lot, locataire]
    );

    // Régularisation bloquée tant qu'aucun appel ventilé
    const {
      rows: [{ id: doc }],
    } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte)
       values ($1,'justificatif','D',$1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',10,'e-'||gen_random_uuid()) returning id`,
      [orgA]
    );
    await attendreEchec(
      db,
      /aucun appel de charges saisi et ventilé/,
      `select public.regulariser_charges($1,2025,0,$2,null)`,
      [bail, doc]
    );

    // Appel : 700 récupérable + 300 non récupérable = 1000
    const a = await appel(lot, 2025, 1000);
    await poste(a, "Eau froide", 700, "recuperable");
    await poste(a, "Honoraires syndic", 300, "non_recuperable");
    await db.query(`select public.valider_ventilation($1)`, [a]);

    const { rows: rec } = await db.query(
      `select public.charges_recuperables_exercice($1,2025) as r`,
      [lot]
    );
    expect(Number(rec[0].r)).toBe(700);

    // Régularisation : dérive la part récupérable (700) et fige l'appel
    await db.query(`select public.regulariser_charges($1,2025,999,$2,null)`, [bail, doc]);
    const reg = await db.query(
      `select charges_reelles from public.regularisations_charges where bail_id=$1 and annee=2025`,
      [bail]
    );
    expect(Number(reg.rows[0].charges_reelles)).toBe(700); // 999 ignoré, dérivé des appels
    const st = await db.query(`select statut from public.appels_charges where id=$1`, [a]);
    expect(st.rows[0].statut).toBe("fige");

    // Appel figé → poste immuable (trigger)
    await attendreEchec(
      db,
      /figé/,
      `update public.appel_charges_postes set montant=800 where appel_id=$1 and libelle='Eau froide'`,
      [a]
    );
  });
});
