/**
 * Audit palier 1, P2-08 — ménage de la base : droits d'écriture qu'aucune règle n'autorise, exception consignée.
 *
 * Ce que ce fichier prouve, sur une vraie base, dans une transaction annulée :
 *  1. après la migration, plus aucun droit d'écriture des comptes connectés n'est sans politique ;
 *  2. la migration ne retire QUE des droits déjà sans effet : si une politique autorise la commande, ou si le
 *     cloisonnement n'est pas actif, le droit est laissé ;
 *  3. rien n'est supprimé (ni table, ni fonction, ni donnée) ; les lectures ne changent pas ;
 *  4. la vue du portail est intacte et porte son exception ; la procédure nocturne reste sans chemin de recherche
 *     fixé (lui en fixer un l'empêcherait de valider ses étapes), et tout y est écrit avec son schéma ;
 *  5. la migration se rejoue ; son retour rend exactement les droits retirés.
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261122235959";
const NOM = `${CODE}_menage_droits_sans_politique`;
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
const sansCommentaires = (sql: string) => sql.replace(/^\s*--.*$/gm, "");

/** Les couples (table, commande) que la migration retire. */
const RETRAITS = [...sansCommentaires(migration).matchAll(/\('([a-z_]+)',\s*'(INSERT|UPDATE|DELETE)'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
/** Les couples que le retour rend. */
const RENDUS = [...sansCommentaires(retour).matchAll(/grant ([a-z, ]+) on table public\.([a-z_]+) to authenticated;/g)]
  .flatMap((m) => m[1].split(",").map((c) => `${m[2]}:${c.trim().toUpperCase()}`)).sort();

/** Relevé R13 de l'audit : droits d'écriture des comptes connectés sans politique permissive pour la commande. */
const R13 = `
  with t as (
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity
  ), cmd(nom, lettre) as (values ('INSERT','a'), ('UPDATE','w'), ('DELETE','d'))
  select t.relname || ':' || cmd.nom couple from t cross join cmd
   where has_table_privilege('authenticated', t.oid, cmd.nom)
     and not exists (select 1 from pg_policy p where p.polrelid = t.oid and p.polpermissive
           and (p.polcmd = cmd.lettre or p.polcmd = '*')
           and (p.polroles = '{0}' or 'authenticated'::regrole = any (p.polroles)))
   order by 1`;

describe("ménage des droits sans politique — manifeste et écriture (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.slice(0, manifeste.indexOf(`${NOM}.sql`)).every((l) => l < `${NOM}.sql`)).toBe(true);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/menage-droits-sans-politique-base.test.ts"');
  });

  it("elle ne supprime rien, ne touche aucune donnée, et ne retire des droits qu'aux comptes connectés", () => {
    const sql = sansCommentaires(migration);
    expect(sql).not.toMatch(/\bdrop\b|\btruncate\b|\bdelete from\b|\binsert into\b|\balter (table|function|procedure|view)\b|\bcreate\b/i);
    expect(sql.match(/\brevoke\b/gi)).toHaveLength(1);
    expect(sql).toContain("execute format('revoke %s on table %s from authenticated', r.commande, v_table);");
    expect(sql).not.toMatch(/from (anon|public|service_role)\b/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    // 21 tables, 46 droits : INSERT sur 13, UPDATE sur 17, DELETE sur 16 (relevé R13 de l'audit).
    expect(new Set(RETRAITS.map((c) => c.split(":")[0])).size).toBe(21);
    expect(RETRAITS).toHaveLength(46);
    expect(new Set(RETRAITS).size).toBe(46);
    const compte = (commande: string) => RETRAITS.filter((c) => c.endsWith(`:${commande}`)).length;
    expect([compte("INSERT"), compte("UPDATE"), compte("DELETE")]).toEqual([13, 17, 16]);
    expect(RETRAITS.some((c) => c.endsWith(":SELECT"))).toBe(false);
  });

  it("le retour rend exactement les droits retirés, et rien d'autre", () => {
    expect(RENDUS).toEqual(RETRAITS);
    const sql = sansCommentaires(retour);
    expect(sql).not.toMatch(/\bdrop\b|\btruncate\b|delete from public\.|\brevoke\b|to (anon|public)\b/i);
    expect(sql).toContain("comment on view public.organisations_portail is null;");
  });
});

describe.skipIf(!url)("ménage des droits sans politique — base réelle", () => {
  let db: Client;
  const liste = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
  const r13 = async () => (await liste(R13)).map((l) => String(l.couple));
  const aLeDroit = async (table: string, commande: string) =>
    Boolean((await liste("select has_table_privilege('authenticated', ('public.' || $1)::regclass, $2) d", [table, commande]))[0].d);

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => { await db.query("begin"); await db.query(migration); });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("plus aucun droit d'écriture des comptes connectés n'est sans politique ; les lectures n'ont pas bougé", async () => {
    expect(await r13()).toEqual([]);
    for (const couple of RETRAITS) {
      const [table, commande] = couple.split(":");
      expect(await aLeDroit(table, commande), couple).toBe(false);
    }
    // Les lectures de ces tables restent celles d'avant : la migration ne cite jamais SELECT.
    const lectures = await liste(
      "select count(*)::int n from unnest($1::text[]) t where has_table_privilege('authenticated', ('public.' || t)::regclass, 'SELECT')",
      [[...new Set(RETRAITS.map((c) => c.split(":")[0]))]],
    );
    expect(lectures[0].n).toBe(21);
    // Le cloisonnement reste actif sur les 21 tables, et aucune n'a disparu.
    const tables = await liste(
      "select count(*)::int n from pg_class c where c.oid = any (select ('public.' || t)::regclass from unnest($1::text[]) t) and c.relrowsecurity",
      [[...new Set(RETRAITS.map((c) => c.split(":")[0]))]],
    );
    expect(tables[0].n).toBe(21);
  });

  it("un droit qu'une politique autorise est laissé : la migration ne retire que ce qui est déjà sans effet", async () => {
    await db.query("grant update on table public.annonces to authenticated");
    await db.query("create policy essai_menage on public.annonces for update to authenticated using (false)");
    await db.query(migration);
    expect(await aLeDroit("annonces", "UPDATE")).toBe(true);
    // Sans la politique, le même droit repart.
    await db.query("drop policy essai_menage on public.annonces");
    await db.query(migration);
    expect(await aLeDroit("annonces", "UPDATE")).toBe(false);
  });

  it("une politique « pour toutes les commandes », ou un cloisonnement inactif, font aussi laisser le droit", async () => {
    await db.query("grant insert, delete on table public.quittances to authenticated");
    await db.query("create policy essai_menage_tout on public.quittances for all to public using (false) with check (false)");
    await db.query(migration);
    expect([await aLeDroit("quittances", "INSERT"), await aLeDroit("quittances", "DELETE")]).toEqual([true, true]);

    await db.query("grant insert on table public.site_pages to authenticated");
    await db.query("alter table public.site_pages disable row level security");
    await db.query(migration);
    expect(await aLeDroit("site_pages", "INSERT")).toBe(true);
  });

  it("une table attendue absente arrête la migration au lieu de passer en silence", async () => {
    await db.query("savepoint absent");
    await db.query("alter table public.site_pages rename to site_pages_renommee");
    await expect(db.query(migration)).rejects.toThrow(/la table public\.site_pages est absente/);
    await db.query("rollback to savepoint absent");
  });

  it("la vue du portail est intacte et porte son exception", async () => {
    const [vue] = await liste(
      "select c.reloptions::text options, obj_description(c.oid) commentaire, pg_get_viewdef(c.oid) definition, has_table_privilege('authenticated', c.oid, 'SELECT') lecture, has_table_privilege('anon', c.oid, 'SELECT') visiteur from pg_class c where c.oid = 'public.organisations_portail'::regclass",
    );
    expect(vue.options).toBe("{security_barrier=true}");
    expect(vue.commentaire).toMatch(/^Exception consignée \(audit palier 1, P2-08/);
    expect(vue.commentaire).toContain("security_definer_view");
    expect(vue.definition).toContain("user_org_ids()");
    expect(vue.definition).toMatch(/loc\.role = 'locataire'/);
    expect([vue.lecture, vue.visiteur]).toEqual([true, false]);
  });

  it("la procédure nocturne des fermetures de compte reste sans chemin de recherche fixé, et nomme tout avec son schéma", async () => {
    const [p] = await liste(
      "select p.prokind, p.proconfig, p.prosecdef, p.prosrc, has_function_privilege('authenticated', p.oid, 'execute') connecte, has_function_privilege('anon', p.oid, 'execute') visiteur from pg_proc p where p.oid = 'public.fermetures_comptes_nuit()'::regprocedure",
    );
    // Une procédure qui porte un réglage (« SET search_path ») ne peut plus valider ses étapes (COMMIT) : la corriger
    // comme le demandait l'audit casserait la tâche de nuit. Vérifié par exécution le 22/11 ; voir l'erratum d'AUDIT.md.
    expect(p.prokind).toBe("p");
    expect(p.proconfig).toBeNull();
    expect(p.prosrc).toMatch(/\bcommit;/);
    expect([p.prosecdef, p.connecte, p.visiteur]).toEqual([false, false, false]);
    // Sans chemin fixé, la sûreté vient de l'écriture : chaque table et chaque fonction appelée porte son schéma.
    const cibles = [...String(p.prosrc).matchAll(/\b(?:from|join|insert into|update|delete from)\s+([a-z_."]+)/g)].map((m) => m[1]);
    expect(cibles.length).toBeGreaterThan(0);
    expect(cibles.filter((c) => !/^(public|pg_catalog)\./.test(c))).toEqual([]);
    const appels = [...String(p.prosrc).matchAll(/(?<![.\w])([a-z_]+)\s*\(/g)].map((m) => m[1]).filter((n) => !["values", "coalesce", "insert", "if", "elsif"].includes(n));
    expect(appels).toEqual([]);
  });

  it("la migration se rejoue ; le retour rend les droits (toujours sans effet) et retire le commentaire", async () => {
    await db.query(migration);
    expect(await r13()).toEqual([]);

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'menage_droits_sans_politique') on conflict do nothing", [CODE]);
    await db.query(retour);
    expect(await r13()).toEqual(RETRAITS);
    expect(Number((await liste("select count(*)::int n from supabase_migrations.schema_migrations where version=$1", [CODE]))[0].n)).toBe(0);
    expect((await liste("select obj_description('public.organisations_portail'::regclass) c"))[0].c).toBeNull();
    await db.query(retour);
    expect(await r13()).toEqual(RETRAITS);

    await db.query(migration);
    expect(await r13()).toEqual([]);
  });
});
