/**
 * Tests d'intégration — le parrainage : qui a amené qui (19/09).
 *
 * La mécanique seule : un code par organisation, un parrain au plus par
 * filleul, et un geste réservé aux membres du filleul. Ce que ces tests
 * gardent surtout : qu'on ne puisse ni se parrainer soi-même, ni changer de
 * parrain, ni écrire dans la table autrement que par la fonction — et qu'une
 * organisation tierce ne voie rien.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;
let parrain: string;
let codeParrain: string;
let filleul: string;
let tiers: string;
let membreFilleul: string;
let membreParrain: string;
let membreTiers: string;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-pa-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }) : "",
  ]);
  await db.query(`set local role ${role}`);
}

async function organisation(nom: string, type = "agence"): Promise<{ id: string; code: string }> {
  await db.query("reset role");
  const {
    rows: [ligne],
  } = await db.query<{ id: string; code: string }>(
    `insert into public.organizations (name, status, type) values ($1,'essai',$2::public.organization_type)
     returning id, code_parrainage as code`,
    [nom, type]
  );
  return ligne;
}

async function membre(org: string, role = "admin_agence"): Promise<string> {
  const compte = await creerUtilisateur();
  await db.query("reset role");
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,$3::public.membership_role)`,
    [compte, org, role]
  );
  return compte;
}

/** Un appel dont on attend le refus, isolé dans un savepoint pour ne pas casser la transaction. */
async function refus(sql: string, params: unknown[]): Promise<string> {
  await db.query("savepoint refus");
  try {
    await db.query(sql, params);
    await db.query("release savepoint refus");
    return "";
  } catch (e) {
    await db.query("rollback to savepoint refus");
    return (e as Error).message;
  }
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
  const p = await organisation("Agence marraine");
  parrain = p.id;
  codeParrain = p.code;
  filleul = (await organisation("Propriétaire filleul", "proprietaire_direct")).id;
  tiers = (await organisation("Agence tierce")).id;
  membreFilleul = await membre(filleul, "proprietaire_direct");
  membreParrain = await membre(parrain);
  membreTiers = await membre(tiers);
});

describe("le code de parrainage", () => {
  it("naît avec l'organisation, en huit caractères hexadécimaux, unique", async () => {
    expect(codeParrain).toMatch(/^[0-9A-F]{8}$/);
    const autre = await organisation("Encore une");
    expect(autre.code).toMatch(/^[0-9A-F]{8}$/);
    expect(autre.code).not.toBe(codeParrain);
    await db.query("reset role");
    const { rows } = await db.query(`select count(*)::int as n from public.organizations where code_parrainage is null`);
    expect(rows[0].n).toBe(0);
  });

  it("ne peut pas être dupliqué", async () => {
    await db.query("reset role");
    const message = await refus(
      `insert into public.organizations (name, status, code_parrainage) values ('Doublon','essai',$1)`,
      [codeParrain]
    );
    expect(message).toMatch(/organizations_code_parrainage_idx|duplicate key/i);
  });
});

describe("enregistrer un parrainage", () => {
  it("rattache le filleul à son parrain, une fois, et redonne le même rattachement au rappel", async () => {
    await simuler(membreFilleul);
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(`select public.enregistrer_parrainage($1,$2) as id`, [filleul, codeParrain]);
    expect(id).toBeTruthy();
    const {
      rows: [{ id: encore }],
    } = await db.query<{ id: string }>(`select public.enregistrer_parrainage($1,$2) as id`, [filleul, codeParrain]);
    expect(encore).toBe(id);
    await db.query("reset role");
    const { rows } = await db.query(
      `select parrain_organization_id, filleul_organization_id, code from public.parrainages where id=$1`,
      [id]
    );
    expect(rows[0]).toEqual({ parrain_organization_id: parrain, filleul_organization_id: filleul, code: codeParrain });
  });

  it("pardonne la casse, les espaces et les tirets dans le code", async () => {
    await simuler(membreFilleul);
    const tordu = ` ${codeParrain.slice(0, 4).toLowerCase()}-${codeParrain.slice(4)} `;
    const { rows } = await db.query(`select public.enregistrer_parrainage($1,$2) as id`, [filleul, tordu]);
    expect(rows[0].id).toBeTruthy();
  });

  it("refuse un code mal formé, inconnu, ou d'une organisation archivée", async () => {
    // Une organisation archivée naît archivée ici : la garde « seul le super
    // admin modifie le statut » interdit de l'archiver après coup, et ce test
    // ne parle pas de cette garde-là.
    await db.query("reset role");
    const {
      rows: [{ code: codeArchive }],
    } = await db.query<{ code: string }>(
      `insert into public.organizations (name, status) values ('Agence disparue','archivee') returning code_parrainage as code`
    );
    await simuler(membreFilleul);
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [filleul, "pas-un-code"])).toMatch(/invalide/);
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [filleul, "00000000"])).toMatch(/inconnu/);
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [filleul, codeArchive])).toMatch(/inconnu/);
  });

  it("refuse l'auto-parrainage", async () => {
    await simuler(membreParrain);
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [parrain, codeParrain])).toMatch(/elle-meme/);
  });

  it("refuse un second parrain", async () => {
    const autre = await organisation("Autre marraine");
    await simuler(membreFilleul);
    await db.query(`select public.enregistrer_parrainage($1,$2)`, [filleul, codeParrain]);
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [filleul, autre.code])).toMatch(/deja un parrain/);
  });

  it("est réservé aux membres du filleul — pas à un tiers, pas à un anonyme", async () => {
    await simuler(membreTiers);
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [filleul, codeParrain])).toMatch(/reserve aux membres/);
    await simuler(null, "anon");
    expect(await refus(`select public.enregistrer_parrainage($1,$2)`, [filleul, codeParrain])).toMatch(/permission denied/i);
  });

  it("ne s'écrit pas autrement que par la fonction", async () => {
    await simuler(membreFilleul);
    expect(
      await refus(
        `insert into public.parrainages (parrain_organization_id, filleul_organization_id, code) values ($1,$2,$3)`,
        [parrain, filleul, codeParrain]
      )
    ).toMatch(/permission denied/i);
  });
});

describe("qui voit le parrainage", () => {
  beforeEach(async () => {
    await simuler(membreFilleul);
    await db.query(`select public.enregistrer_parrainage($1,$2)`, [filleul, codeParrain]);
  });

  it("les membres du parrain et du filleul, pas une organisation tierce", async () => {
    for (const [compte, attendu] of [
      [membreParrain, 1],
      [membreFilleul, 1],
      [membreTiers, 0],
    ] as const) {
      await simuler(compte);
      const { rows } = await db.query(`select count(*)::int as n from public.parrainages`);
      expect(rows[0].n).toBe(attendu);
    }
  });
});
