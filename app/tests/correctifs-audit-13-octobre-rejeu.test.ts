/**
 * Migration 20261013120000 (correctifs de l'audit du 13/10) : elle se rejoue sans effet.
 *
 * La vérification adverse (VER-SQL-01) a montré qu'un rejeu hors de la transaction du chantier
 * `migrations.yml` n'était pas neutre : le bloc AUD-A-01 ne se reconnaissait pas déjà appliqué et
 * dupliquait la garde de portefeuille de definir_equipements_lot avant que le bloc suivant ne
 * s'arrête. Chaque bloc cherche donc, dans la définition en vigueur, la marque de son propre
 * correctif et ne fait alors rien.
 *
 * La base visée est déjà migrée. Tout est joué dans une transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261013120000_correctifs_audit_13_octobre.sql", "utf8");

// Les sept fonctions que la migration réécrit, et la marque que chacune garde de son correctif.
const FONCTIONS: [string, string][] = [
  ["public.definir_equipements_lot(uuid,uuid[])", "Audit du 13/10 (AUD-A-01)"],
  ["public.contre_ecriture(uuid,text)", "Audit du 13/10 (AUD-A-02)"],
  ["public.annuler_mission(uuid,uuid,text)", "Audit du 13/10 (AUD-A-03)"],
  ["public.supprimer_detention(uuid)", "Audit du 13/10 (AUD-A-04)"],
  ["public.poser_gardes_diagnostic_artisan()", "'supervision_arrets','supervision_operations','supervision_vacances'"],
  ["public.traiter_vacances()", "Audit du 13/10 (SUP-08)"],
  ["public.contre_proposer_creneaux(uuid,uuid,jsonb)", "Audit du 13/10 (REP-01)"],
];

describe.skipIf(!DB_URL)("Migration 20261013120000 — rejeu", () => {
  let db: Client;

  /** Ce que la migration peut changer : définitions, droits, contrainte du fil d'incident, gardes de diagnostic. */
  async function empreinte() {
    const etat: Record<string, string> = {};
    for (const [signature] of FONCTIONS) {
      const { rows } = await db.query(
        `select md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') as v
         from pg_proc p where p.oid = $1::text::regprocedure`,
        [signature]
      );
      etat[`fonction ${signature}`] = rows[0].v;
    }
    const contrainte = await db.query(
      "select pg_get_constraintdef(oid) as v from pg_constraint where conname = 'incident_evenements_type_check'"
    );
    etat["contrainte incident_evenements_type_check"] = contrainte.rows.map((r) => r.v).join("|");
    const gardes = await db.query(
      `select tgrelid::regclass::text as t from pg_trigger
       where tgname = 'diagnostic_artisan_lecture' and not tgisinternal order by 1`
    );
    etat["gardes de diagnostic"] = gardes.rows.map((r) => r.t).join(",");
    return etat;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });
  beforeEach(async () => { await db.query("savepoint cas"); });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("release savepoint cas"); });

  it.each(FONCTIONS)("%s porte la marque de son correctif", async (signature, marque) => {
    const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
    expect(rows[0].def).toContain(marque);
  });

  it("rejouée sur une base déjà migrée, elle ne change rien (deux fois de suite)", async () => {
    const avant = await empreinte();
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(avant);
    await db.query(MIGRATION);
    expect(await empreinte()).toEqual(avant);
  });

  it("une définition inattendue l'arrête toujours : la marque ne dispense pas de l'ancre", async () => {
    await db.query(
      `create or replace function public.supprimer_detention(p_detention uuid) returns void
       language plpgsql security definer set search_path to '' as $f$ begin null; end $f$`
    );
    await expect(db.query(MIGRATION)).rejects.toThrow(/AUD-A-04 : définition inattendue/);
  });
});
