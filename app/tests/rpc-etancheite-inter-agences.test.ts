/**
 * Audit 2026-09-10 (P0) — étanchéité des RPC SECURITY DEFINER.
 *
 * Une fonction SECURITY DEFINER contourne le RLS : son contrôle d'accès est
 * ENTIÈREMENT à sa charge. La faille corrigée ici tenait à une confusion de
 * rôles — la garde de portefeuille (`*_hors_portefeuille`) ne répond qu'à
 * « cet agent restreint a-t-il ce lot ? », jamais à « cet appelant
 * appartient-il seulement à l'organisation ? ».
 *
 * Le test joue l'attaquant réaliste : un compte authentifié SANS adhésion,
 * qui connaît un UUID (fuité, deviné, ou hérité d'un ancien accès).
 * Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("RPC — étanchéité inter-organisations (RM-A1.7)", () => {
  let db: Client;
  let org: string;
  let bail: string;
  let lot: string;
  let intrus: string;
  let gerant: string;

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

  async function creerCompte(email: string): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         $1||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`,
      [email]
    );
    return id;
  }

  async function devenir(compte: string) {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
  }

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Étanche','active') returning id`
    );
    org = o.id;
    gerant = await creerCompte("gerant");
    intrus = await creerCompte("intrus");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [bien],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Bien étanche','appartement'::public.bien_type,'1 rue É','75001','Paris') returning id`,
      [org]
    );
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot étanche','loue'::public.lot_etat) returning id`,
      [org, bien.id]
    );
    lot = l.id;
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,700,100,current_date - 60, 5) returning id`,
      [org, lot]
    );
    bail = b.id;
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance, loyer_hc, charges, montant_du)
       values ($1,$2,date_trunc('month',current_date)::date,current_date,700,100,800)`,
      [org, bail]
    );
  });

  it("etat_loyers_bail : un compte sans adhésion ne lit RIEN, même avec l'UUID du bail", async () => {
    await devenir(intrus);
    const { rows } = await db.query(`select * from public.etat_loyers_bail($1)`, [bail]);
    expect(rows, "l'échéancier d'une autre organisation doit rester invisible").toHaveLength(0);
  });

  it("etat_loyers_bail : le gérant de l'organisation lit bien son échéancier", async () => {
    await devenir(gerant);
    const { rows } = await db.query(`select * from public.etat_loyers_bail($1)`, [bail]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].montant_du)).toBe(800);
  });

  it("charges_recuperables_exercice : agrégat inaccessible hors organisation", async () => {
    await devenir(intrus);
    const {
      rows: [{ charges_recuperables_exercice: montant }],
    } = await db.query(`select public.charges_recuperables_exercice($1, $2)`, [
      lot,
      new Date().getFullYear(),
    ]);
    expect(Number(montant)).toBe(0);
  });

  it("provisions_charges_annee : agrégat inaccessible hors organisation", async () => {
    await devenir(intrus);
    const {
      rows: [{ provisions_charges_annee: montant }],
    } = await db.query(`select public.provisions_charges_annee($1, $2)`, [
      bail,
      new Date().getFullYear(),
    ]);
    expect(Number(montant)).toBe(0);
    await devenir(gerant);
    const {
      rows: [{ provisions_charges_annee: vu }],
    } = await db.query(`select public.provisions_charges_annee($1, $2)`, [
      bail,
      new Date().getFullYear(),
    ]);
    expect(Number(vu)).toBe(100);
  });

  it("aucune RPC exposée à `authenticated` ne reste sans contrôle d'appartenance", async () => {
    // Filet permanent : toute fonction SECURITY DEFINER exposée qui prend un
    // identifiant doit contrôler l'appartenance — soit directement
    // (org_ids_avec_roles, has_org_role, auth.uid(), is_super_admin), soit en
    // DÉLÉGUANT à une fonction qui le fait (les RPC locataire passent par
    // ma_personne_espace / mon_dernier_bail_locataire). La récursion suit
    // cette délégation : c'est le contrôle effectif qui compte, pas sa forme.
    const { rows } = await db.query(`
      with recursive controlees as (
        select p.oid, p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.prosrc like '%org_ids_avec_roles%'
            or p.prosrc like '%has_org_role%'
            or p.prosrc like '%auth.uid()%'
            or p.prosrc like '%is_super_admin%')
        union
        select p.oid, p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        join controlees c on p.prosrc like '%' || c.proname || '%'
        where n.nspname = 'public' and p.oid <> c.oid
      )
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.pronargs > 0
        and pg_get_function_identity_arguments(p.oid) like '%uuid%'
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not exists (select 1 from controlees c where c.oid = p.oid)
      order by 1`);
    const nues = rows.map((r) => r.proname);
    expect(
      nues,
      `RPC sans contrôle d'appartenance exposées à authenticated : ${nues.join(", ")}`
    ).toEqual([]);
  });
});
