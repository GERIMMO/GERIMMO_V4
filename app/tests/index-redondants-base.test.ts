/**
 * Audit final du 27/10 (COD-06) : aucun index ne doublonne exactement un autre (mêmes colonnes, même ordre, même sens de
 * tri, même classe d'opérateurs, même prédicat ; `points_du_matin_jour_idx`, en `jour desc`, n'est donc pas un doublon). Migration 20261028100500_index_redondants.sql : `appels_loyer_bail_idx` et l'index de clé
 * étrangère `fk_marketing_campagnes_<empreinte>` (publication_id) retirés, leur index unique jumeau couvrant les mêmes
 * lectures. L'empreinte dépend de l'oid de la contrainte, donc de la base : la migration le retrouve par sa définition.
 *
 * Sans base : conventions du fichier (rejouable, retour nommé et atomique, manifeste, LISEZ-MOI). Sur la base migrée : la
 * requête de regroupement ne rend aucune paire ; le retour recrée les deux index et la migration les retire de nouveau, dans
 * une transaction annulée (DDL : fichier en série).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261028100500_index_redondants";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const REDONDANTS = `
  select array_agg(indexrelid::regclass::text order by indexrelid::regclass::text) as indexes
  from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
  group by indrelid, indkey, indclass, indoption, indpred, indexprs having count(*) > 1 order by 1`;

describe("index redondants — fichiers (sans base)", () => {
  it("la migration retire les deux doublons, est rejouable, au manifeste une fois, avec son retour au LISEZ-MOI", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    expect(sql).toContain("drop index if exists public.appels_loyer_bail_idx;");
    expect(sql).toContain("u.indexrelid::regclass::text = 'marketing_campagnes_publication_unique'");
    expect(sql).not.toMatch(/fk_marketing_campagnes_[0-9a-f]{10}/);
    expect(sql).not.toMatch(/^(begin|commit);$/m);
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261027100500_parcours_demarrage_pluriel_baux.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    expect(retour).toMatch(/^do \$retour_atomique\$/m);
    expect(retour).toContain("create index if not exists appels_loyer_bail_idx on public.appels_loyer (bail_id, periode)");
    expect(retour).toContain("substr(md5(c.oid::text), 1, 10)");
    expect(retour).toContain("on public.marketing_campagnes (publication_id)");
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain(`"tests/${NOM.slice(15).replace(/_/g, "-")}-base.test.ts"`);
  });
});

describe.skipIf(!url)("index redondants — base migrée", () => {
  let db: Client;
  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); await db.query("begin"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  it("aucune paire d'index strictement redondants, et les index uniques jumeaux sont toujours là", async () => {
    expect((await db.query(REDONDANTS)).rows).toEqual([]);
    const { rows } = await db.query(`select indexname from pg_indexes where schemaname = 'public'
      and (indexname = any($1::text[]) or (tablename = 'marketing_campagnes' and indexname like 'fk\\_marketing\\_campagnes\\_%' and indexdef like '%(publication_id)')) order by 1`,
      [["appels_loyer_bail_id_periode_key", "marketing_campagnes_publication_unique", "appels_loyer_bail_idx"]]);
    expect(rows.map((r) => r.indexname)).toEqual(["appels_loyer_bail_id_periode_key", "marketing_campagnes_publication_unique"]);
  });

  it("le retour recrée les deux doublons ; la migration les retire de nouveau, deux fois sans erreur", async () => {
    await db.query(readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8"));
    const paires = (await db.query(REDONDANTS)).rows.map((r) => r.indexes as string[]);
    expect(paires).toHaveLength(2);
    expect(paires[0]).toEqual(["appels_loyer_bail_id_periode_key", "appels_loyer_bail_idx"]);
    // Le nom de l'index de clé étrangère porte l'empreinte de sa contrainte, propre à cette base.
    expect(paires[1]).toEqual([expect.stringMatching(/^fk_marketing_campagnes_[0-9a-f]{10}$/), "marketing_campagnes_publication_unique"]);
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    await db.query(migration);
    await db.query(migration);
    expect((await db.query(REDONDANTS)).rows).toEqual([]);
  });
});
