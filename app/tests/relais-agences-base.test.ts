import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const cible = process.env.SUPABASE_DB_URL;
if (cible) {
  const u = new URL(cible);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || !/^gerimmo_ci_[a-z_]+$/.test(u.pathname.slice(1))) throw new Error("Base fictive locale exigée.");
}
const nom = "20261021133650_relais_point_agences";
const migration = readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");
const fonction = "public.agences_en_attente_relais()";
let db: Client;
async function compter() {
  await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
  await db.query("set local role service_role");
  const { rows } = await db.query(`select ${fonction} as n`);
  await db.query("reset role");
  return rows[0].n;
}
describe.skipIf(!cible)("agences du relais — base locale", () => {
  beforeAll(async () => { db = new Client({ connectionString: cible }); await db.connect(); });
  beforeEach(async () => { await db.query("begin"); await db.query("delete from public.liste_attente_agences"); });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db.end(); });
  it("ne compte que les agences encore en attente, sans transmettre de donnée personnelle", async () => {
    expect(await compter()).toEqual({ en_attente: 0 });
    for (const [i, statut] of ["en_attente", "en_attente", "contactee", "convertie", "retiree"].entries()) {
      await db.query("insert into public.liste_attente_agences(email, agence, contact, statut, code_postal, nb_lots) values($1, 'Agence fictive', 'Personne fictive', $2, '75011', 'moins_de_50')", [`agence-${i}@example.com`, statut]);
    }
    expect(await compter()).toEqual({ en_attente: 2 });
  });
  it("refuse les visiteurs et comptes connectés ; aucune élévation de droits", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query("select has_function_privilege($1,$2,'EXECUTE') as droit", [role, fonction]);
      expect(rows[0].droit).toBe(role === "service_role");
    }
    expect((await db.query("select prosecdef from pg_proc where oid=$1::regprocedure", [fonction])).rows[0].prosecdef).toBe(false);
    await db.query("savepoint refus");
    await expect(db.query(`select ${fonction}`)).rejects.toThrow("Accès réservé au traitement");
    await db.query("rollback to savepoint refus");
  });
  it("migration et retour rejouables sans effacer les inscriptions", async () => {
    await db.query("insert into public.liste_attente_agences(email, agence, contact, code_postal, nb_lots) values('conservee@example.com','Agence fictive','Personne fictive','75011','moins_de_50')");
    await db.query(migration); await db.query(migration);
    expect(await compter()).toEqual({ en_attente: 1 });
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261021133650','relais_point_agences') on conflict do nothing");
    await db.query(retour); await db.query(retour);
    expect((await db.query("select to_regprocedure($1) as f", [fonction])).rows[0].f).toBeNull();
    expect((await db.query("select count(*)::int as n from public.liste_attente_agences")).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations where version='20261021133650'")).rows[0].n).toBe(0);
    await db.query(migration);
    expect(await compter()).toEqual({ en_attente: 1 });
  });
});
