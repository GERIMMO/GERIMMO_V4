/**
 * Tests d'intégration Sprint 8 — Restitution du dépôt de garantie.
 * Décote de vétusté linéaire, impayés imputés d'abord (RM-2.4.7),
 * garde-fou « sans EDL d'entrée = restitution intégrale » (RM-2.4.3),
 * finalisation du décompte (solde de tout compte + alerte).
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

describe.skipIf(!DB_URL)("Sprint 8 — restitution du dépôt", () => {
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
    } = await db.query(`insert into public.organizations (name, status) values ('CC S8','active') returning id`);
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
      `select public.creer_bien_avec_lot($1,'8 rue CC','appartement'::public.bien_type,'8 rue CC',null,'75001','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    return lot;
  }

  async function bailAvecDepot(depot: number): Promise<string> {
    const lot = await lotLouable();
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, depot_garantie, loyer_hc)
       values ($1,$2,$3,$4,700) returning id`,
      [orgA, lot, locataire, depot]
    );
    return bail;
  }

  async function edlEntreeSignee(bail: string): Promise<void> {
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
  }

  it("décote linéaire, impayés imputés d'abord, solde et alerte à la finalisation", async () => {
    const bail = await bailAvecDepot(900);
    await edlEntreeSignee(bail);
    // 800 dus, 500 payés → 300 d'impayés (appels générés hors RLS)
    await db.query("reset role");
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, montant_du, date_echeance)
       values ($1,$2,current_date,800,current_date)`,
      [orgA, bail]
    );
    await simuler(db, gerant);
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement)
       values ($1,$2,500,current_date)`,
      [orgA, bail]
    );

    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    const r = await db.query(
      `select delai_mois, depot, impayes, sans_edl_entree from public.restitutions where id=$1`,
      [rst]
    );
    expect(Number(r.rows[0].delai_mois)).toBe(1); // conforme
    expect(Number(r.rows[0].depot)).toBe(900);
    expect(Number(r.rows[0].impayes)).toBe(300);
    expect(r.rows[0].sans_edl_entree).toBe(false);

    // Retenue peinture : 900 € neuf, durée 7 ans, âge 3 → 900*(4/7)=514.29
    const {
      rows: [{ montant }],
    } = await db.query(`select public.ajouter_retenue($1,'Peinture',900,7,3,null) as montant`, [rst]);
    expect(Number(montant)).toBeCloseTo(514.29, 2);

    // Finalisation : solde = 900 - 300 - 514.29 = 85.71, alerte decompte_lrar (retenue > 0)
    const {
      rows: [{ solde }],
    } = await db.query(`select public.finaliser_decompte($1) as solde`, [rst]);
    expect(Number(solde)).toBeCloseTo(85.71, 2);

    const st = await db.query(`select statut, solde from public.restitutions where id=$1`, [rst]);
    expect(st.rows[0].statut).toBe("finalise");
    const al = await db.query(
      `select type from public.alerts where organization_id=$1 and details->>'restitution_id'=$2`,
      [orgA, rst]
    );
    expect(al.rows.map((a) => a.type)).toContain("decompte_lrar");
  });

  it("sans état des lieux d'entrée : aucune retenue possible (restitution intégrale)", async () => {
    const bail = await bailAvecDepot(700);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,false) as id`, [bail]);
    const r = await db.query(`select sans_edl_entree, delai_mois from public.restitutions where id=$1`, [rst]);
    expect(r.rows[0].sans_edl_entree).toBe(true);
    expect(Number(r.rows[0].delai_mois)).toBe(2); // non conforme

    await attendreEchec(
      db,
      /état des lieux d'entrée/,
      `select public.ajouter_retenue($1,'Peinture',900,7,3,null)`,
      [rst]
    );

    // Finalisation → restitution intégrale du dépôt
    const {
      rows: [{ solde }],
    } = await db.query(`select public.finaliser_decompte($1) as solde`, [rst]);
    expect(Number(solde)).toBe(700);
  });

  it("encaissement du dépôt : plafond légal bloquant (bail nu = 1 mois)", async () => {
    // loyer_hc 700, bail nu → plafond 700 ; dépôt de 900 refusé
    const bail = await bailAvecDepot(900);
    await attendreEchec(
      db,
      /plafond légal/,
      `select public.encaisser_depot($1,900,current_date,'virement',null,null)`,
      [bail]
    );
  });

  it("encaissement partiel puis solde, sans dépasser le dépôt dû", async () => {
    const bail = await bailAvecDepot(700);
    // 400 puis 300 → cumul 700
    const { rows: r1 } = await db.query(
      `select public.encaisser_depot($1,400,current_date,'virement',null,null) as cumul`,
      [bail]
    );
    expect(Number(r1[0].cumul)).toBe(400);
    const { rows: r2 } = await db.query(
      `select public.encaisser_depot($1,300,current_date,'cheque',$2,null) as cumul`,
      [bail, proprietaire]
    );
    expect(Number(r2[0].cumul)).toBe(700);
    // Un euro de plus dépasse le dépôt dû
    await attendreEchec(
      db,
      /dépasse le dépôt dû restant/,
      `select public.encaisser_depot($1,1,current_date,'espèces',null,null)`,
      [bail]
    );
    // Versant tiers tracé
    const enc = await db.query(
      `select versant_person_id from public.depot_encaissements where bail_id=$1 and montant=300`,
      [bail]
    );
    expect(enc.rows[0].versant_person_id).toBe(proprietaire);
  });
});
