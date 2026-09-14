import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const migration = readFileSync(new URL("../supabase/migrations/20260914100000_retrait_truncate_clients.sql", import.meta.url), "utf8");

describe.skipIf(!url)("Aucun client ne vide une table métier", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });

  it("aucune table existante n'accorde TRUNCATE à un client", async () => {
    const { rows } = await db.query(`select c.relname, r.nom from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      cross join (values ('anon'),('authenticated')) r(nom)
      where n.nspname='public' and c.relkind in ('r','p')
      and has_table_privilege(r.nom,c.oid,'TRUNCATE')`);
    expect(rows).toEqual([]);
  });

  it("retire un droit direct et PUBLIC sans changer les autres droits ni les lignes", async () => {
    await db.query(`create table public.recette_truncate_clients(id integer);
      alter table public.recette_truncate_clients enable row level security;
      insert into public.recette_truncate_clients values (1);
      grant select,insert,truncate on public.recette_truncate_clients to authenticated;
      grant truncate on public.recette_truncate_clients to public;
      grant truncate on public.recette_truncate_clients to service_role;`);
    // Preuve du risque sur cette seule table fictive, puis restauration locale.
    await db.query("savepoint risque; set local role authenticated; truncate public.recette_truncate_clients; reset role");
    expect((await db.query("select * from public.recette_truncate_clients")).rows).toEqual([]);
    await db.query("rollback to savepoint risque");
    await db.query(migration);
    expect((await db.query("select * from public.recette_truncate_clients")).rows).toEqual([{ id: 1 }]);
    expect((await db.query(`select has_table_privilege('authenticated','public.recette_truncate_clients','SELECT') lire,
      has_table_privilege('authenticated','public.recette_truncate_clients','INSERT') ajouter,
      has_table_privilege('service_role','public.recette_truncate_clients','TRUNCATE') service`)).rows[0])
      .toEqual({ lire: true, ajouter: true, service: true });
    await db.query("set local role authenticated");
    await expect(db.query("truncate public.recette_truncate_clients")).rejects.toMatchObject({ code: "42501" });
  });

  it("corrige les défauts globaux et du schéma pour les prochaines tables", async () => {
    await db.query(`alter default privileges grant truncate on tables to authenticated;
      alter default privileges in schema public grant truncate on tables to public, anon;
      alter default privileges in schema public grant select on tables to authenticated`);
    await db.query(migration);
    await db.query("create table public.recette_truncate_future(id integer)");
    expect((await db.query(`select has_table_privilege('authenticated','public.recette_truncate_future','TRUNCATE') connecter,
      has_table_privilege('anon','public.recette_truncate_future','TRUNCATE') anonyme,
      has_table_privilege('authenticated','public.recette_truncate_future','SELECT') lire`)).rows[0])
      .toEqual({ connecter: false, anonyme: false, lire: true });
  });
});
