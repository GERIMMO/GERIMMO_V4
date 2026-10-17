import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);
const MIGRATION = readFileSync("supabase/migrations/20261016210000_retour_adresse_confirmee.sql", "utf8");
const REJOUABLE = MIGRATION.replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");
const RETOUR = readFileSync("supabase/retours-arriere/20261016210000_retour_adresse_confirmee.retour.sql", "utf8");
const SIGNATURE = "public.autoriser_retour_adresse_confirmee(text)";

it("le retour gère sa transaction et retire uniquement sa version", () => {
  expect(RETOUR).toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
  expect(RETOUR).toMatch(/^begin;$/m);
  expect(RETOUR).toMatch(/^commit;$/m);
  expect(RETOUR).toContain("where version = '20261016210000'");
  expect(RETOUR).not.toMatch(/delete from auth\.|drop (?:table|schema).*auth\./i);
});

describe.skipIf(!DB_URL)("Retour d'adresse — droits, retour et rejeu", () => {
  let db: Client;
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    await db.query(REJOUABLE);
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); });
  const empreinte = async () => (await db.query("select pg_get_functiondef(oid) definition, proacl::text droits, provolatile, prosecdef, proconfig from pg_proc where oid=$1::regprocedure", [SIGNATURE])).rows;

  it("n'accorde l'exécution qu'au service parmi les rôles de l'application", async () => {
    const { rows } = await db.query("select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') authenticated, has_function_privilege('service_role',$1,'execute') service", [SIGNATURE]);
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
  it("le retour brut refuse un lot sans modifier la fonction", async () => {
    const avant = await empreinte();
    await db.query("savepoint refus");
    await expect(db.query(RETOUR)).rejects.toThrow(/Retour arrière refusé/);
    await db.query("rollback to savepoint refus");
    expect(await empreinte()).toEqual(avant);
  });
  it("retire seulement sa version puis retrouve exactement la définition et les droits", async () => {
    const avant = await empreinte();
    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations(version text primary key)");
    await db.query("insert into supabase_migrations.schema_migrations(version) values ('20261016210000'), ('test_adresse_voisine') on conflict do nothing");
    const corps = RETOUR.replace(/do \$retour_arriere\$\nbegin\n  if statement_timestamp\(\)[\s\S]*?end \$retour_arriere\$;\n/, "").replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    await db.query(corps);
    expect((await db.query("select to_regprocedure($1) fonction", [SIGNATURE])).rows[0].fonction).toBeNull();
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ('20261016210000','test_adresse_voisine') order by version")).rows).toEqual([{ version: "test_adresse_voisine" }]);
    await db.query(corps);
    await db.query(REJOUABLE);
    expect(await empreinte()).toEqual(avant);
    await db.query(REJOUABLE);
    expect(await empreinte()).toEqual(avant);
  });
});
