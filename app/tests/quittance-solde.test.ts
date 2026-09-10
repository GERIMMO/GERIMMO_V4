/**
 * Le solde d'un reçu partiel se calcule sur le terme RÉELLEMENT DÛ.
 *
 * La quittance existe sous deux formes — page web et PDF — et elles ne
 * calculaient pas le même solde. Elles coïncident sur un mois plein, et
 * divergent dès que le terme n'est pas la somme du loyer et des charges :
 * un mois au prorata, ou un terme portant une régularisation. La page web
 * annonçait alors une dette PLUS ÉLEVÉE que la vraie (RM-3.4.2).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Quittance — le solde suit le terme dû", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let bail: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Quittance Solde','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'qs-'||gen_random_uuid()||'@test.local','x', now(),'{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [{ id: locataire }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1,'Martin','Jules') returning id`,
      [org]
    );
    const {
      rows: [bien],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Bien Q','appartement'::public.bien_type,'1 rue Q','75001','Paris') returning id`,
      [org]
    );
    const {
      rows: [lot],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot Q','loue'::public.lot_etat) returning id`,
      [org, bien.id]
    );
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, type, etat,
         loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,$3,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,current_date - 60, 5)
       returning id`,
      [org, lot.id, locataire]
    );
    bail = b.id;
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  it("sur un mois AU PRORATA, le solde est celui du terme réduit, pas d'un loyer plein", async () => {
    // Terme proratisé : 10 jours sur 30 → 216,67 € pour un loyer plein de 650 €.
    const {
      rows: [a],
    } = await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance,
         loyer_hc, charges, montant_du, prorata)
       values ($1,$2,date_trunc('month',current_date)::date,current_date,600,50,216.67,true)
       returning id`,
      [org, bail]
    );
    // Le locataire verse 100 € : reçu partiel.
    const {
      rows: [q],
    } = await db.query(
      `insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
       values ($1,$2,$3,false,100) returning id`,
      [org, bail, a.id]
    );

    await enGerant();
    const {
      rows: [detail],
    } = await db.query(`select * from public.quittance_detail($1)`, [q.id]);

    // La donnée qui manquait à la page web
    expect(Number(detail.montant_du)).toBeCloseTo(216.67, 2);
    expect(detail.prorata).toBe(true);

    const soldeJuste = Number(detail.montant_du) - Number(detail.montant);
    const soldeAncienCalcul =
      Number(detail.loyer_hc) + Number(detail.charges) - Number(detail.montant);

    expect(soldeJuste).toBeCloseTo(116.67, 2);
    // L'ancien calcul réclamait 433,33 € de plus que le dû : c'est le défaut.
    expect(soldeAncienCalcul).toBeCloseTo(550, 2);
    expect(soldeAncienCalcul).toBeGreaterThan(soldeJuste);
  });

  it("sur un mois plein, les deux calculs coïncident (aucune régression)", async () => {
    const {
      rows: [a],
    } = await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance,
         loyer_hc, charges, montant_du)
       values ($1,$2,date_trunc('month',current_date)::date,current_date,600,50,650)
       returning id`,
      [org, bail]
    );
    const {
      rows: [q],
    } = await db.query(
      `insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
       values ($1,$2,$3,false,300) returning id`,
      [org, bail, a.id]
    );
    await enGerant();
    const {
      rows: [detail],
    } = await db.query(`select * from public.quittance_detail($1)`, [q.id]);
    expect(Number(detail.montant_du) - Number(detail.montant)).toBeCloseTo(350, 2);
    expect(
      Number(detail.loyer_hc) + Number(detail.charges) - Number(detail.montant)
    ).toBeCloseTo(350, 2);
    expect(detail.prorata).toBe(false);
  });
});
