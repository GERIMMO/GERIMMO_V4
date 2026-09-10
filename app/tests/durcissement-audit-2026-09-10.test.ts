/**
 * Audit 2026-09-10 — non-régression du durcissement.
 * Chaque test rejoue l'abus constaté et vérifie qu'il est désormais refusé,
 * sans empêcher le geste légitime. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit 2026-09-10 — durcissement", () => {
  let db: Client;
  let org: string;
  let lot: string;
  let bail: string;
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

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Durci','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'durci-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [bien],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Bien durci','appartement'::public.bien_type,'1 rue D','75001','Paris') returning id`,
      [org]
    );
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot durci','loue'::public.lot_etat) returning id`,
      [org, bien.id]
    );
    lot = l.id;
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,current_date - 90, 5) returning id`,
      [org, lot]
    );
    bail = b.id;
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  it("un encaissement ne se modifie plus : on supprime et on ressaisit (RM-A6.3)", async () => {
    const {
      rows: [enc],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,650,current_date,'virement') returning id`,
      [org, bail]
    );
    await enGerant();
    await db.query("savepoint s");
    await expect(
      db.query(`update public.encaissements set montant = 5000 where id = $1`, [enc.id])
    ).rejects.toThrow(/permission denied|refus|denied/i);
    await db.query("rollback to savepoint s");
    // Le geste légitime reste ouvert
    await db.query(`delete from public.encaissements where id = $1`, [enc.id]);
  });

  it("une écriture ne se contre-passe qu'une fois", async () => {
    const {
      rows: [e],
    } = await db.query(
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
         date_imputation, libelle, bail_id, lot_id)
       values ($1,'loyer','recette',300,current_date,current_date,'Origine',$2,$3) returning id`,
      [org, bail, lot]
    );
    const contre = (motif: string) =>
      db.query(
        `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
           date_imputation, libelle, bail_id, lot_id, contre_ecriture_de)
         values ($1,'loyer','depense',300,current_date,current_date,$2,$3,$4,$5)`,
        [org, motif, bail, lot, e.id]
      );
    await contre("Annulation 1");
    await db.query("savepoint s");
    await expect(contre("Annulation 2")).rejects.toThrow(/duplicate|unique/i);
    await db.query("rollback to savepoint s");
  });

  it("un lot ne porte jamais deux baux vivants", async () => {
    // Un échec de contrainte avorte la transaction : on isole par un point de
    // reprise, sinon les vérifications suivantes ne peuvent plus s'exécuter.
    await db.query("savepoint s");
    await expect(
      db.query(
        `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
         values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,current_date,5)`,
        [org, lot]
      )
    ).rejects.toThrow(/duplicate|unique/i);
    await db.query("rollback to savepoint s");
    // Un bail terminé sur le même lot reste possible (l'historique vit)
    await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'termine'::public.bail_etat,600,50,current_date - 400,5)`,
      [org, lot]
    );
  });

  it("une révision IRL ne se rejoue pas à la même date d'effet", async () => {
    const revise = () =>
      db.query(
        `insert into public.revisions_loyer (organization_id, bail_id, date_effet,
           irl_reference, irl_nouveau, ancien_loyer, nouveau_loyer)
         values ($1,$2,current_date,100,103,600,618)`,
        [org, bail]
      );
    await revise();
    await db.query("savepoint s");
    await expect(revise()).rejects.toThrow(/duplicate|unique/i);
    await db.query("rollback to savepoint s");
  });

  it("la quittance n'est plus forgeable : seul l'horodatage d'envoi est écrit", async () => {
    const {
      rows: [a],
    } = await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance,
         loyer_hc, charges, montant_du)
       values ($1,$2,date_trunc('month',current_date)::date,current_date,600,50,650) returning id`,
      [org, bail]
    );
    const {
      rows: [q],
    } = await db.query(
      `insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
       values ($1,$2,$3,false,100) returning id`,
      [org, bail, a.id]
    );
    await enGerant();
    await db.query("savepoint s");
    await expect(
      db.query(`update public.quittances set est_quittance = true where id = $1`, [q.id])
    ).rejects.toThrow(/permission denied|denied/i);
    await db.query("rollback to savepoint s");
    // L'envoi, lui, reste enregistrable par l'application
    await db.query(`update public.quittances set email_envoye_at = now() where id = $1`, [q.id]);
  });
});
