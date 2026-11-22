/**
 * LES INSCRIPTIONS DANS L'E-MAIL DE 5 H DU RELAIS — la fonction de comptage, sur la base locale (22/11/2026).
 *
 * `inscriptions_relais()` rend cinq nombres sur les espaces de propriétaires : ouverts en 24 h, sur 7 jours, au total,
 * sans aucun bien, avec un bail en cours. Ce que ces tests tiennent :
 *  1. le comptage, borne des 24 h et des 7 jours comprise ; les agences et les espaces archivés n'y entrent pas ;
 *  2. un bien archivé ne compte pas comme un bien ; seul un bail « actif » ou « preavis » est un bail en cours ;
 *  3. réservée au traitement, sans élévation de droits, et sans donnée personnelle dans le résultat ;
 *  4. migration et retour rejouables, sans rien effacer.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const cible = process.env.SUPABASE_DB_URL;
if (cible) {
  const u = new URL(cible);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || !/^gerimmo_ci_[a-z_]+$/.test(u.pathname.slice(1))) throw new Error("Base fictive locale exigée.");
}
const nom = "20261122100000_relais_point_inscriptions";
const migration = readFileSync(`supabase/migrations/${nom}.sql`, "utf8");
const retour = readFileSync(`supabase/retours-arriere/${nom}.retour.sql`, "utf8");
const fonction = "public.inscriptions_relais()";
let db: Client;

async function compter() {
  await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
  await db.query("set local role service_role");
  const { rows } = await db.query(`select ${fonction} as n`);
  await db.query("reset role");
  return rows[0].n as Record<string, number>;
}
/** Un espace fictif, ouvert il y a `heures` heures. */
async function espace(heures: number, o: { type?: string; statut?: string } = {}) {
  const id = randomUUID();
  await db.query(
    `insert into public.organizations (id, name, type, status, created_at)
     values ($1, $2, $3::public.organization_type, $4::public.organization_status, now() - make_interval(hours => $5))`,
    [id, `Espace fictif ${id.slice(0, 8)}`, o.type ?? "proprietaire_direct", o.statut ?? "active", heures]);
  return id;
}

describe.skipIf(!cible)("inscriptions du relais — base locale", () => {
  beforeAll(async () => { db = new Client({ connectionString: cible }); await db.connect(); });
  beforeEach(async () => { await db.query("begin"); });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db.end(); });

  it("compte les espaces de propriétaires ouverts en 24 h, sur 7 jours et au total ; ni les agences, ni les espaces archivés", async () => {
    const avant = await compter();
    await espace(1);
    await espace(23);
    await espace(25);
    await espace(24 * 6);
    await espace(24 * 8);
    await espace(1, { type: "agence" });
    await espace(1, { statut: "archivee" });
    await espace(2, { statut: "essai" });
    await espace(3, { statut: "suspendue" });
    const apres = await compter();
    expect(apres.depuis_24h - avant.depuis_24h).toBe(4);
    expect(apres.depuis_7j - avant.depuis_7j).toBe(6);
    expect(apres.espaces - avant.espaces).toBe(7);
    // Aucun de ces espaces n'a de bien ni de bail.
    expect(apres.sans_bien - avant.sans_bien).toBe(7);
    expect(apres.bail_en_cours - avant.bail_en_cours).toBe(0);
  });

  it("ne rend que cinq nombres : aucun nom, aucune adresse, aucun identifiant", async () => {
    const id = await espace(1);
    const n = await compter();
    expect(Object.keys(n).sort()).toEqual(["bail_en_cours", "depuis_24h", "depuis_7j", "espaces", "sans_bien"]);
    for (const v of Object.values(n)) expect(Number.isSafeInteger(v) && v >= 0).toBe(true);
    expect(JSON.stringify(n)).not.toContain(id);
    expect(JSON.stringify(n)).not.toContain("Espace fictif");
  });

  it("un bien archivé ne compte pas ; seul un bail actif ou en préavis est un bail en cours", async () => {
    const org = await espace(1);
    const avant = await compter();
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1, 'Bien fictif', 'appartement', '1 rue Fictive', '33000', 'Bordeaux') returning id`, [org]);
    expect((await compter()).sans_bien - avant.sans_bien).toBe(-1);
    await db.query("update public.biens set archived_at = now() where id = $1", [bien.id]);
    expect((await compter()).sans_bien - avant.sans_bien).toBe(0);
    await db.query("update public.biens set archived_at = null where id = $1", [bien.id]);

    const { rows: [lot] } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom) values ($1, $2, 'Lot fictif') returning id`, [org, bien.id]);
    // Le bail est posé directement dans chaque état : ce test ne porte que sur le comptage.
    await db.query("set local session_replication_role = replica");
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, date_debut, loyer_hc, charges, depot_garantie)
       values ($1, $2, 'nu', 'brouillon', current_date, 700, 50, 700) returning id`, [org, lot.id]);
    const enCours = async () => (await compter()).bail_en_cours - avant.bail_en_cours;
    expect(await enCours()).toBe(0);
    for (const [etat, attendu] of [["actif", 1], ["preavis", 1], ["termine", 0], ["brouillon", 0]] as const) {
      await db.query("update public.baux set etat = $2::public.bail_etat where id = $1", [bail.id, etat]);
      expect(await enCours(), etat).toBe(attendu);
    }
    await db.query("set local session_replication_role = origin");
  });

  it("refuse les visiteurs et les comptes connectés ; aucune élévation de droits", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query("select has_function_privilege($1,$2,'EXECUTE') as droit", [role, fonction]);
      expect(rows[0].droit, role).toBe(role === "service_role");
    }
    expect((await db.query("select prosecdef from pg_proc where oid=$1::regprocedure", [fonction])).rows[0].prosecdef).toBe(false);
    await db.query("savepoint refus");
    await expect(db.query(`select ${fonction}`)).rejects.toThrow("Accès réservé au traitement");
    await db.query("rollback to savepoint refus");
  });

  it("migration et retour rejouables, sans effacer aucun espace", async () => {
    await espace(1);
    const { rows: [{ n: espaces }] } = await db.query("select count(*)::int as n from public.organizations");
    await db.query(migration); await db.query(migration);
    const reference = await compter();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122100000','relais_point_inscriptions') on conflict do nothing");
    await db.query(retour); await db.query(retour);
    expect((await db.query("select to_regprocedure($1) as f", [fonction])).rows[0].f).toBeNull();
    expect((await db.query("select count(*)::int as n from public.organizations")).rows[0].n).toBe(espaces);
    expect((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations where version='20261122100000'")).rows[0].n).toBe(0);
    await db.query(migration);
    expect(await compter()).toEqual(reference);
  });
});
