/**
 * Prorata du premier loyer — vérifié au centime.
 *
 * Régression A-01 : le coefficient était arrondi à 4 décimales avant d'être
 * appliqué, ce qui décalait le loyer de quelques centimes sur toute entrée en
 * cours de mois.
 * Régression A-02 : le montant dû était calculé à part et pouvait différer d'un
 * centime de la somme « loyer + charges » affichée sur la quittance.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Prorata du premier loyer", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
  let lot: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });

  beforeEach(async () => {
    await db.query("begin");
    const { rows: [{ id: org }] } = await db.query(
      `insert into public.organizations (name, status) values ('CC prorata','active') returning id`);
    orgA = org;
    const { rows: [{ id: u }] } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'prorata-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    gerant = u;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, orgA]);
    const { rows: [p] } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Loc') returning id`, [orgA]);
    locataire = p.id;
    await db.query(`select set_config('request.jwt.claims',
      json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [gerant]);
    await db.query("set local role authenticated");
    const { rows: [{ id: bien }] } = await db.query(
      `select public.creer_bien_avec_lot($1,'P','appartement'::public.bien_type,'1 rue P',null,'75001','Paris',2010,false,40,2) as id`,
      [orgA]);
    const { rows: [l] } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    lot = l.id;
  });

  afterEach(async () => { await db.query("rollback"); });

  async function appelDuPremierMois(debut: string, loyer: number, charges: number) {
    const { rows: [b] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, date_debut, etat)
       values ($1,$2,$3,$4,$5,$6,'actif') returning id`,
      [orgA, lot, locataire, loyer, charges, debut]);
    await db.query(`select public.generer_appels_loyer($1)`, [b.id]);
    const { rows } = await db.query(
      `select loyer_hc, charges, montant_du, prorata from public.appels_loyer
       where bail_id=$1 order by periode limit 1`, [b.id]);
    return rows[0];
  }

  it("proratise au centime exact — entrée le 12 d'un mois de 31 jours", async () => {
    // 20 jours dus sur 31 : 780 × 20/31 = 503,2258 → 503,23
    const a = await appelDuPremierMois("2026-03-12", 780, 90);
    expect(Number(a.loyer_hc)).toBeCloseTo(503.23, 2);
    expect(Number(a.charges)).toBeCloseTo(58.06, 2);
    expect(a.prorata).toBe(true);
  });

  it("le montant dû est toujours la somme des lignes affichées", async () => {
    // La quittance détaille loyer et charges : leur somme doit faire le total,
    // sinon le document se contredit lui-même.
    for (const debut of ["2026-03-12", "2026-01-07", "2026-02-23", "2026-04-15"]) {
      const a = await appelDuPremierMois(debut, 780, 90);
      expect(Number(a.montant_du)).toBe(Number(a.loyer_hc) + Number(a.charges));
      await db.query(`delete from public.appels_loyer`);
      await db.query(`delete from public.baux`);
    }
  });

  it("n'applique aucun prorata sur un mois entier", async () => {
    const a = await appelDuPremierMois("2026-03-01", 780, 90);
    expect(Number(a.loyer_hc)).toBe(780);
    expect(Number(a.montant_du)).toBe(870);
    expect(a.prorata).toBe(false);
  });
});
