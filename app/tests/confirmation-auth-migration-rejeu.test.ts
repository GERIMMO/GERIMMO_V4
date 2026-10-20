import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);
const MIGRATION = readFileSync("supabase/migrations/20261016150000_confirmation_auth.sql", "utf8");
const RETOUR = readFileSync("supabase/retours-arriere/20261016150000_confirmation_auth.retour.sql", "utf8");
const SIGNATURE = "public.autoriser_confirmation_auth(text,text,text,text)";

it("le retour de confirmation gère sa transaction, refuse un lot et retire seulement sa version", () => {
  expect(RETOUR).not.toMatch(/statement_timestamp\(\) <> transaction_timestamp\(\)/);
  expect(RETOUR).toMatch(/do \$retour_atomique\$/);
  expect(RETOUR).toMatch(/end \$retour_atomique\$;/);
  expect(RETOUR).toContain("where version = '20261016150000'");
  expect(RETOUR).not.toMatch(/delete from auth\.|drop (?:table|schema).*auth\./i);
});

describe.skipIf(!DB_URL)("Confirmation — retour et rejeu sous transaction annulée", () => {
  let db: Client;
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); });

  async function empreinte() {
    const fonction = await db.query("select pg_get_functiondef(oid) definition, proacl::text droits from pg_proc where oid = $1::regprocedure", [SIGNATURE]);
    const table = await db.query("select relrowsecurity, relacl::text droits from pg_class where oid='public.tentatives_confirmation_auth'::regclass");
    const colonnes = await db.query("select column_name, data_type, is_nullable, column_default, is_identity, identity_generation from information_schema.columns where table_schema='public' and table_name='tentatives_confirmation_auth' order by ordinal_position");
    const index = await db.query("select indexname, indexdef from pg_indexes where schemaname='public' and tablename='tentatives_confirmation_auth' order by indexname");
    return { fonction: fonction.rows, table: table.rows, colonnes: colonnes.rows, index: index.rows };
  }

  it("le retour brut reste annulable sans modifier le catalogue", async () => {
    const avant = await empreinte();
    await db.query("savepoint refus");
    await db.query(RETOUR);
    await db.query("rollback to savepoint refus");
    expect(await empreinte()).toEqual(avant);
  });

  it("retire ses objets et sa version, conserve la voisine, puis restitue exactement les définitions et droits", async () => {
    const avant = await empreinte();
    await db.query("create schema if not exists supabase_migrations");
    await db.query("create table if not exists supabase_migrations.schema_migrations(version text primary key)");
    await db.query("insert into supabase_migrations.schema_migrations(version) values ('20261016150000'), ('test_confirmation_voisine') on conflict do nothing");
    const corps = RETOUR
      .replace(/do \$retour_arriere\$\nbegin\n  if statement_timestamp\(\)[\s\S]*?end \$retour_arriere\$;\n/, "")
      .replace(/^begin;$/m, "").replace(/^commit;$/m, "");
    await db.query(corps);
    expect((await db.query("select to_regprocedure($1) fonction, to_regclass('public.tentatives_confirmation_auth') compteur", [SIGNATURE])).rows[0]).toEqual({ fonction: null, compteur: null });
    expect((await db.query("select version from supabase_migrations.schema_migrations where version in ('20261016150000','test_confirmation_voisine') order by version")).rows).toEqual([{ version: "test_confirmation_voisine" }]);
    await db.query(corps); // Un second retour est sans effet.
    // La fermeture générale des fonctions est testée ailleurs ; la rejouer ici verrouillerait tous les autres lots.
    const rejouable = MIGRATION.replace(/^select public\.fermer_fonctions_a_anon\(\);$/m, "");
    await db.query(rejouable);
    expect(await empreinte()).toEqual(avant);
    await db.query(rejouable);
    expect(await empreinte()).toEqual(avant);
  });
});
