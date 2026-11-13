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
import {randomUUID} from "node:crypto";
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

  it("conserve la trace du retrait seulement pour le locataire concerné, sans reçu payable", async () => {
    const compte = randomUUID(), voisin = randomUUID();
    for (const id of [compte, voisin]) {
      await db.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,'{}','{}')", [id,id+"@example.invalid"]);
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')", [id,org]);
    }
    await db.query("update persons set account_id=$1 where id=(select locataire_principal from baux where id=$2)", [compte,bail]);
    await db.query("insert into persons(organization_id,account_id,nom,prenom) values($1,$2,'Voisin','Fictif')", [org,voisin]);
    const paiement = (await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,500,current_date,'virement') returning id", [org,bail])).rows[0].id;
    // Ce colocataire rejoint le même bail après émission du document d’origine.
    await db.query("insert into bail_personnes(organization_id,bail_id,person_id,role) select $1,$2,id,'colocataire' from persons where account_id=$3", [org,bail,voisin]);
    await db.query("delete from encaissements where id=$1", [paiement]);
    await db.query("select resynchroniser_quittances($1)", [bail]);
    const trace = async (id: string) => {
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:id,role:"authenticated"})]);
      return (await db.query("select montant_precedent::float8,etait_quittance,retire from mes_rectifications_quittances($1)", [org])).rows;
    };
    await db.query("set local role authenticated");
    expect(await trace(compte)).toEqual([{montant_precedent:500,etait_quittance:true,retire:true}]);
    expect(await trace(voisin)).toEqual([]);
    expect((await db.query("select has_table_privilege(current_user,'rectifications_quittances','SELECT') allowed")).rows[0].allowed).toBe(false);
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
