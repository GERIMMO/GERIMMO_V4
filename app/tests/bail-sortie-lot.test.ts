/**
 * Lot « bail-sortie » — décisions D01, D34 et D35 du 14/10/2026, en base.
 *
 *   D01 (PROP-14)       : le premier terme d'un bail qui commence en cours de mois
 *                         n'est jamais exigible avant l'entrée (nouveaux appels).
 *   D34 (SOR-03/SOR-04) : date de sortie réelle à la clôture, confirmation d'une
 *                         clôture avant la fin du préavis, refus d'activer un bail
 *                         qui entre avant la sortie du précédent.
 *   D35 (SOR-02)        : remise des clés jamais datée d'après aujourd'hui, et
 *                         correction possible tant que la restitution est en cours.
 *
 * Transaction annulée à la fin de chaque test. Nécessite SUPABASE_DB_URL (base
 * locale jetable) ; sans elle, les tests se sautent.
 */
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Lot bail-sortie — D01, D34, D35 en base", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let bien: string;
  let locataire: string;

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
    await db.query("reset role");
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Lot bail-sortie','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'sortie-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [b],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, zone_tendue)
       values ($1,'Bien sortie','appartement'::public.bien_type,'1 rue A','75012','Paris', false) returning id`,
      [org]
    );
    bien = b.id;
    const {
      rows: [p],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, email)
       values ($1,'Martin','Claire','claire.martin@exemple.fr') returning id`,
      [org]
    );
    locataire = p.id;
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  async function lot(etat = "loue"): Promise<string> {
    await db.query("reset role");
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot '||gen_random_uuid(),$3::public.lot_etat) returning id`,
      [org, bien, etat]
    );
    return l.id;
  }

  async function bail(champs: Record<string, unknown>): Promise<string> {
    await db.query("reset role");
    const l = (champs.lot_id as string | undefined) ?? (await lot());
    const donnees: Record<string, unknown> = {
      organization_id: org,
      lot_id: l,
      locataire_principal: locataire,
      type: "nu",
      etat: "actif",
      loyer_hc: 650,
      charges: 50,
      jour_echeance: 1,
      ...champs,
    };
    const cols = Object.keys(donnees);
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      Object.values(donnees)
    );
    await couvrirParMandat(db, b.id);
    return b.id;
  }

  async function echec(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint e");
    await expect(db.query(sql, params)).rejects.toThrow(motif);
    await db.query("rollback to savepoint e");
  }

  /** Date relative au jour de la base (le test ne dépend pas de la date d'exécution). */
  async function jour(expression: string): Promise<string> {
    const {
      rows: [r],
    } = await db.query(`select to_char(${expression}, 'YYYY-MM-DD') as d`);
    return r.d;
  }

  const MOIS_PRECEDENT = "(date_trunc('month', current_date) - interval '1 month')::date";
  const MOIS_COURANT = "date_trunc('month', current_date)::date";

  async function appels(b: string) {
    await db.query("reset role");
    const { rows } = await db.query(
      `select to_char(periode,'YYYY-MM-DD') as periode, to_char(date_echeance,'YYYY-MM-DD') as echeance,
              prorata, montant_du::text as du
         from public.appels_loyer where bail_id = $1 order by periode`,
      [b]
    );
    return rows as { periode: string; echeance: string; prorata: boolean; du: string }[];
  }

  // ------------------------------------------------------------------------
  // D01 (PROP-14) — option A : échéance = la plus tardive de l'échéance calculée
  // et de la date d'entrée, pour les NOUVEAUX appels seulement.
  // ------------------------------------------------------------------------
  describe("D01 — premier terme d'un bail qui entre en cours de mois", () => {
    it("entrée le 16 du mois dernier, échéance le 1er : le premier terme est exigible à l'entrée, pas avant", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const [premier, ...suite] = await appels(b);
      expect(premier.periode).toBe(await jour(MOIS_PRECEDENT));
      expect(premier.prorata).toBe(true);
      // Jusqu'ici l'échéance était le 1er du mois, quinze jours avant l'entrée
      expect(premier.echeance).toBe(entree);
      // Les termes suivants gardent leur échéance habituelle (le 1er)
      expect(suite.map((a) => a.echeance)).toEqual([await jour(MOIS_COURANT)]);
    });

    it("entrée le 1er du mois : rien ne change (échéance au jour d'échéance du bail)", async () => {
      const entree = await jour(MOIS_PRECEDENT);
      const b = await bail({ date_debut: entree, jour_echeance: 5 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const lignes = await appels(b);
      expect(lignes[0]).toMatchObject({ periode: entree, echeance: await jour(`${MOIS_PRECEDENT} + 4`), prorata: false });
      expect(lignes[1].echeance).toBe(await jour(`${MOIS_COURANT} + 4`));
    });

    it("entrée le 3, échéance le 5 : l'échéance calculée est la plus tardive, elle reste", async () => {
      const b = await bail({ date_debut: await jour(`${MOIS_PRECEDENT} + 2`), jour_echeance: 5 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      expect((await appels(b))[0].echeance).toBe(await jour(`${MOIS_PRECEDENT} + 4`));
    });

    it("entrée le dernier jour du mois courant : l'appel du mois est dû ce jour-là, jamais le 1er", async () => {
      const entree = await jour(`(${MOIS_COURANT} + interval '1 month - 1 day')::date`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const lignes = await appels(b);
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toMatchObject({ periode: await jour(MOIS_COURANT), echeance: entree, prorata: true });
    });

    it("bail qui commence le mois prochain : aucun appel n'est créé, donc rien d'exigible", async () => {
      const b = await bail({ date_debut: await jour(`(${MOIS_COURANT} + interval '1 month')::date + 9`), jour_echeance: 1 });
      await enGerant();
      const { rows } = await db.query(`select public.generer_appels_loyer($1) as n`, [b]);
      expect(rows[0].n).toBe(0);
      expect(await appels(b)).toEqual([]);
    });

    it("terme échu : l'échéance reste le jour du mois suivant (déjà après l'entrée)", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 5, paiement_echeance: "echu" });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      expect((await appels(b))[0].echeance).toBe(await jour(`${MOIS_COURANT} + 4`));
    });

    it("le prorata et le montant dû ne changent pas : seule l'échéance bouge", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const {
        rows: [attendu],
      } = await db.query(
        `select round(650 * (extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::int - 15)
                      / extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::numeric, 2)
              + round(50 * (extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::int - 15)
                      / extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::numeric, 2) as du`
      );
      expect((await appels(b))[0].du).toBe(Number(attendu.du).toFixed(2));
    });

    it("aucun appel existant n'est modifié, et un second passage ne crée rien", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      // Un appel déjà généré avant la décision, avec l'ancienne échéance (le 1er)
      await db.query(
        `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
         values ($1,$2,${MOIS_PRECEDENT},300,20,320,${MOIS_PRECEDENT},true)`,
        [org, b]
      );
      await enGerant();
      const { rows } = await db.query(`select public.generer_appels_loyer($1) as n`, [b]);
      expect(rows[0].n).toBe(1); // seul le mois courant manquait
      const lignes = await appels(b);
      expect(lignes[0].echeance).toBe(await jour(MOIS_PRECEDENT));
      expect(Number(lignes[0].du)).toBe(320);
      const { rows: encore } = await db.query(`select public.generer_appels_loyer($1) as n`, [b]);
      expect(encore[0].n).toBe(0);
      expect((await appels(b))[0].echeance).toBe(await jour(MOIS_PRECEDENT));
    });
  });
});
