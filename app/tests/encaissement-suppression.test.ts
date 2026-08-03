/**
 * Suppression d'un encaissement — le journal doit revenir à son état d'avant.
 *
 * Régression A-03 : le déclencheur d'écriture était en AFTER INSERT seulement.
 * Supprimer un encaissement laissait donc le loyer et les honoraires au journal,
 * et le rapport de gestion surévaluait les recettes du mandant.
 *
 * Les écritures étant immuables par conception, la correction ne les efface pas :
 * elle inscrit l'écriture inverse.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Suppression d'un encaissement", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
  let lot: string;
  let bail: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });

  async function solde(): Promise<number> {
    const { rows: [r] } = await db.query(
      `select coalesce(sum(case when sens='recette' then montant else -montant end),0) as s
         from public.ecritures where bail_id=$1`, [bail]);
    return Number(r.s);
  }

  beforeEach(async () => {
    await db.query("begin");
    const { rows: [{ id: org }] } = await db.query(
      `insert into public.organizations (name, status) values ('CC encaissement','active') returning id`);
    orgA = org;
    const { rows: [{ id: u }] } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'enc-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    gerant = u;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, orgA]);
    const { rows: [proprio] } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur') returning id`, [orgA]);
    const { rows: [locataire] } = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Loc') returning id`, [orgA]);

    await db.query(`select set_config('request.jwt.claims',
      json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [gerant]);
    await db.query("set local role authenticated");

    const { rows: [{ id: bien }] } = await db.query(
      `select public.creer_bien_avec_lot($1,'E','appartement'::public.bien_type,'2 rue E',null,'75002','Paris',2010,false,40,2) as id`,
      [orgA]);
    const { rows: [l] } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    lot = l.id;

    // Le lot doit être détenu par le mandant avant d'entrer au mandat (RM-5.1.1).
    await db.query(
      `insert into public.detentions (organization_id, lot_id, person_id, quote_part, date_debut)
       values ($1,$2,$3,100,'2026-01-01')`, [orgA, lot, proprio.id]);

    // Un mandat avec honoraires : la suppression doit annuler les DEUX écritures.
    const { rows: [m] } = await db.query(
      `insert into public.mandats (organization_id, person_id, date_debut, etat)
       values ($1,$2,'2026-01-01','actif') returning id`, [orgA, proprio.id]);
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
       values ($1,$2,$3,9,'2026-01-01')`, [orgA, m.id, lot]);

    const { rows: [b] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, date_debut, etat)
       values ($1,$2,$3,1000,0,'2026-01-01','actif') returning id`,
      [orgA, lot, locataire.id]);
    bail = b.id;
  });

  afterEach(async () => { await db.query("rollback"); });

  async function encaisser(montant: number): Promise<string> {
    const { rows: [e] } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,$3,'2026-02-05','virement') returning id`, [orgA, bail, montant]);
    return e.id;
  }

  it("écrit le loyer et les honoraires, tous deux rattachés à l'encaissement", async () => {
    const enc = await encaisser(1000);
    const { rows } = await db.query(
      `select categorie, sens, montant from public.ecritures
        where encaissement_id=$1 order by categorie`, [enc]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ categorie: "honoraires", sens: "depense" });
    expect(Number(rows[0].montant)).toBe(90);
    expect(rows[1]).toMatchObject({ categorie: "loyer", sens: "recette" });
    expect(Number(rows[1].montant)).toBe(1000);
  });

  it("ramène le solde du journal à sa valeur d'avant", async () => {
    const avant = await solde();
    const enc = await encaisser(1000);
    expect(await solde()).toBeCloseTo(avant + 910, 2); // 1000 encaissés − 90 d'honoraires
    await db.query(`delete from public.encaissements where id=$1`, [enc]);
    expect(await solde()).toBeCloseTo(avant, 2);
  });

  it("annule sans rien effacer : les écritures d'origine restent au journal", async () => {
    const enc = await encaisser(1000);
    await db.query(`delete from public.encaissements where id=$1`, [enc]);
    const { rows } = await db.query(
      `select count(*) filter (where contre_ecriture_de is null) as origine,
              count(*) filter (where contre_ecriture_de is not null) as annulations
         from public.ecritures where bail_id=$1`, [bail]);
    expect(Number(rows[0].origine)).toBe(2);
    expect(Number(rows[0].annulations)).toBe(2);
  });

  it("n'annule qu'un seul règlement quand deux tombent le même jour", async () => {
    // Deux versements le 5 février : un partiel puis le complément. Supprimer
    // le premier ne doit pas emporter les écritures du second.
    const partiel = await encaisser(400);
    await encaisser(600);
    await db.query(`delete from public.encaissements where id=$1`, [partiel]);
    const { rows } = await db.query(
      `select count(*) as n from public.ecritures
        where bail_id=$1 and contre_ecriture_de is not null`, [bail]);
    expect(Number(rows[0].n)).toBe(2);
    expect(await solde()).toBeCloseTo(546, 2); // 600 − 54 d'honoraires
  });
});
