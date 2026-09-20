/**
 * Tests d'intégration — les relances d'impayé partent seules (20/09).
 *
 * Ces tests gardent surtout ce que la tâche NE DOIT PAS faire : relancer chez
 * qui n'a rien demandé, relancer un loyer réglé, relancer avant le délai,
 * relancer deux fois le même jour, repartir au niveau 1 quand le gérant a
 * déjà relancé à la main, ou relancer après une mise en demeure.
 *
 * Nécessite SUPABASE_DB_URL (avec la migration relances_loyer_automatiques).
 * Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;
let org: string;
let gerant: string;
let bail: string;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-rl-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  await db.query(
    `select set_config('request.jwt.claims', $1, true)`,
    [accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }) : ""]
  );
  await db.query(`set local role ${role}`);
}

type Due = { bail_id: string; niveau: string; destinataire: string; reste: string; jours_retard: number };
async function dues(): Promise<Due[]> {
  await simuler(null, "postgres");
  const { rows } = await db.query<Due>(`select * from public.relances_loyer_dues(200)`);
  return rows;
}
async function consigner(niveau: string): Promise<string | null> {
  await simuler(null, "postgres");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string | null }>(
    `select public.relance_loyer_consigner($1, $2, 'test') as id`,
    [bail, niveau]
  );
  return id;
}
/** Place l'échéance du terme impayé à N jours dans le passé. */
async function echeanceIlYA(jours: number) {
  await db.query("reset role");
  await db.query(
    `update public.appels_loyer set date_echeance = current_date - $1::int where bail_id = $2`,
    [jours, bail]
  );
}

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
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status, relances_envoi_auto) values ('Relance','active', true) returning id`
  );
  org = id;
  gerant = await creerUtilisateur();
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
    [gerant, org]
  );
  await simuler(gerant);
  const {
    rows: [{ id: bien }],
  } = await db.query<{ id: string }>(
    `select public.creer_bien_avec_lot($1,'3 rue RL','appartement'::public.bien_type,'3 rue RL',null,'75003','Paris',1990,false,40,2) as id`,
    [org]
  );
  const {
    rows: [{ id: lot }],
  } = await db.query<{ id: string }>(`select id from public.lots where bien_id=$1`, [bien]);
  await db.query("reset role");
  const {
    rows: [{ id: loc }],
  } = await db.query<{ id: string }>(
    `insert into public.persons (organization_id, nom, prenom, email)
     values ($1,'Martin','Claire','claire.martin@exemple.fr') returning id`,
    [org]
  );
  const {
    rows: [{ id: b }],
  } = await db.query<{ id: string }>(
    `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges,
                              etat, date_debut, jour_echeance)
     values ($1,$2,$3,700,50,'actif', date_trunc('month', current_date)::date, 1) returning id`,
    [org, lot, loc]
  );
  bail = b;
  // Un mois appelé, rien encaissé : le terme est impayé.
  await simuler(gerant);
  await db.query(`select public.generer_appels_loyer($1)`, [bail]);
  await db.query("reset role");
});

describe.skipIf(!DB_URL)("qui est relancé, et qui ne l'est pas", () => {
  it("rien tant que l'organisation n'a pas donné son accord (faux par défaut)", async () => {
    await db.query("reset role");
    const {
      rows: [{ d }],
    } = await db.query<{ d: boolean }>(
      `select column_default::text like '%false%' as d from information_schema.columns
       where table_name='organizations' and column_name='relances_envoi_auto'`
    );
    expect(d).toBe(true);
    await db.query(`update public.organizations set relances_envoi_auto = false where id=$1`, [org]);
    await echeanceIlYA(10);
    expect(await dues()).toEqual([]);
  });

  it("rien avant le premier délai", async () => {
    await echeanceIlYA(3); // délai par défaut : 5 jours
    expect(await dues()).toEqual([]);
  });

  it("première relance passé le délai, au locataire, avec le reste dû", async () => {
    await echeanceIlYA(6);
    const l = await dues();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ bail_id: bail, niveau: "relance_1", destinataire: "claire.martin@exemple.fr" });
    expect(Number(l[0].reste)).toBe(750);
    expect(l[0].jours_retard).toBe(6);
  });

  it("rien pour un loyer réglé", async () => {
    await echeanceIlYA(10);
    await simuler(gerant);
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement) values ($1,$2,750, current_date)`,
      [org, bail]
    );
    expect(await dues()).toEqual([]);
  });

  it("une fois consignée, plus rien le même jour — et la seconde attend son délai", async () => {
    await echeanceIlYA(6);
    const id = await consigner("relance_1");
    expect(id).not.toBeNull();
    expect(await dues()).toEqual([]);
    // Un second courrier le même jour est refusé par la base, quel qu'il soit.
    expect(await consigner("relance_2")).toBeNull();
    await db.query("reset role");
    const { rows } = await db.query(`select origine, niveau from public.relances where bail_id=$1`, [bail]);
    expect(rows).toEqual([{ origine: "automatique", niveau: "relance_1" }]);
  });

  it("seconde relance passé le second délai, si la première est partie — même à la main", async () => {
    await echeanceIlYA(16); // délai par défaut de la seconde : 15 jours
    // Le gérant a relancé lui-même il y a dix jours : la tâche ne repart pas au niveau 1.
    await db.query("reset role");
    await db.query(
      `insert into public.relances (organization_id, bail_id, niveau, date_envoi) values ($1,$2,'relance_1', current_date - 10)`,
      [org, bail]
    );
    const l = await dues();
    expect(l).toHaveLength(1);
    expect(l[0].niveau).toBe("relance_2");
  });

  it("rien après une mise en demeure : la suite n'est plus un e-mail", async () => {
    await echeanceIlYA(40);
    await db.query("reset role");
    await db.query(
      `insert into public.relances (organization_id, bail_id, niveau, date_envoi) values ($1,$2,'relance_1', current_date - 30), ($1,$2,'mise_en_demeure', current_date - 5)`,
      [org, bail]
    );
    expect(await dues()).toEqual([]);
  });

  it("respecte les délais de l'organisation", async () => {
    await db.query("reset role");
    await db.query(`update public.organizations set relance_1_jours = 20, relance_2_jours = 40 where id=$1`, [org]);
    await echeanceIlYA(10);
    expect(await dues()).toEqual([]);
    await echeanceIlYA(21);
    expect((await dues()).map((d) => d.niveau)).toEqual(["relance_1"]);
  });

  it("refuse des délais incohérents", async () => {
    await db.query("reset role");
    await expect(
      db.query(`update public.organizations set relance_1_jours = 20, relance_2_jours = 10 where id=$1`, [org])
    ).rejects.toThrow(/relances_delais/);
  });

  it("ne relance pas un locataire sans adresse — il est absent de la liste", async () => {
    await echeanceIlYA(10);
    await db.query("reset role");
    await db.query(`update public.persons set email = null where organization_id=$1`, [org]);
    expect(await dues()).toEqual([]);
  });
});

describe.skipIf(!DB_URL)("la mise en demeure ne s'automatise pas, et personne d'autre que la tâche n'écrit", () => {
  it("consigner une mise en demeure est refusé", async () => {
    await simuler(null, "postgres");
    await expect(
      db.query(`select public.relance_loyer_consigner($1, 'mise_en_demeure', 'x')`, [bail])
    ).rejects.toThrow(/ne s'automatise pas/);
  });

  it("un membre authentifié ne peut exécuter ni la lecture ni la consignation", async () => {
    await simuler(gerant);
    await db.query("savepoint lecture");
    await expect(db.query(`select * from public.relances_loyer_dues(10)`)).rejects.toThrow(/permission denied|droit|refus/i);
    await db.query("rollback to savepoint lecture");
    await expect(
      db.query(`select public.relance_loyer_consigner($1, 'relance_1', 'x')`, [bail])
    ).rejects.toThrow(/permission denied|droit|refus/i);
  });
});
