/**
 * Audit 2026-09-10 (P0) — le document suit l'argent.
 *
 * RM-3.4.1 : la quittance n'est émise qu'après encaissement intégral.
 * RM-3.4.2 : un paiement partiel produit un reçu, jamais une quittance.
 *
 * Le scénario constaté en production : un encaissement couvre plusieurs mois,
 * les quittances partent, l'encaissement est supprimé — les quittances doivent
 * disparaître avec lui. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Quittances — le document suit l'argent (RM-3.4.1/2)", () => {
  let db: Client;
  let org: string;
  let bail: string;
  let appels: { id: string; periode: string }[];

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
    // Un bail actif avec trois mois appelés à 500 €, sans encaissement
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Q Test','active') returning id`
    );
    org = o.id;
    const {
      rows: [bien],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Q Bien','appartement'::public.bien_type,'1 rue Q','75001','Paris') returning id`,
      [org]
    );
    const {
      rows: [lot],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Q Lot','loue'::public.lot_etat) returning id`,
      [org, bien.id]
    );
    const {
      rows: [loc],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1,'Q','Locataire') returning id`,
      [org]
    );
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges,
         date_debut, jour_echeance, locataire_principal)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,450,50,
               date_trunc('month', current_date - interval '3 months')::date, 5, $3)
       returning id`,
      [org, lot.id, loc.id]
    );
    bail = b.id;
    const { rows } = await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance,
         loyer_hc, charges, montant_du)
       select $1, $2, d::date, (d + interval '4 days')::date, 450, 50, 500
       from generate_series(date_trunc('month', current_date - interval '3 months'),
                            date_trunc('month', current_date - interval '1 month'),
                            interval '1 month') d
       returning id, periode`,
      [org, bail]
    );
    appels = rows;
    expect(appels).toHaveLength(3);
  });

  const etat = async () =>
    (
      await db.query(
        `select a.periode, q.est_quittance, q.montant
         from public.appels_loyer a
         left join public.quittances q on q.appel_id = a.id
         where a.bail_id = $1 order by a.periode`,
        [bail]
      )
    ).rows;

  it("un encaissement intégral produit des quittances ; sa suppression les retire", async () => {
    const {
      rows: [enc],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,1500,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(`select public.resynchroniser_quittances($1)`, [bail]);
    const apresEncaissement = await etat();
    expect(apresEncaissement.every((l) => l.est_quittance === true)).toBe(true);
    expect(apresEncaissement.map((l) => Number(l.montant))).toEqual([500, 500, 500]);

    // Le geste qui a produit l'anomalie de production
    await db.query(`delete from public.encaissements where id = $1`, [enc.id]);
    const apresSuppression = await etat();
    expect(
      apresSuppression.filter((l) => l.est_quittance !== null),
      "aucune quittance ne survit à la disparition de son encaissement"
    ).toHaveLength(0);
  });

  it("un paiement partiel produit un reçu, jamais une quittance", async () => {
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,300,current_date,'virement')`,
      [org, bail]
    );
    const lignes = await etat();
    expect(lignes[0].est_quittance).toBe(false);
    expect(Number(lignes[0].montant)).toBe(300);
    expect(lignes.slice(1).every((l) => l.est_quittance === null)).toBe(true);
  });

  it("un complément solde le mois : le reçu devient quittance du montant appelé", async () => {
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,300,current_date,'virement')`,
      [org, bail]
    );
    expect((await etat())[0].est_quittance).toBe(false);
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,200,current_date,'virement')`,
      [org, bail]
    );
    const lignes = await etat();
    expect(lignes[0].est_quittance).toBe(true);
    expect(Number(lignes[0].montant)).toBe(500);
  });

  it("une quittance ne peut jamais attester plus que l'encaissé du bail", async () => {
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,1100,current_date,'virement')`,
      [org, bail]
    );
    const {
      rows: [{ atteste, encaisse }],
    } = await db.query(
      `select coalesce((select sum(montant) from public.quittances where bail_id=$1), 0) as atteste,
              coalesce((select sum(montant) from public.encaissements where bail_id=$1), 0) as encaisse`,
      [bail]
    );
    expect(Number(atteste)).toBeLessThanOrEqual(Number(encaisse));
  });
});
