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

// Les neuf fonctions que la migration réécrit, et la marque que chacune garde de son correctif.
const FONCTIONS: [string, string][] = [
  ["public.definir_equipements_lot(uuid,uuid[])", "Audit du 13/10 (AUD-A-01)"],
  ["public.contre_ecriture(uuid,text)", "Audit du 13/10 (AUD-A-02)"],
  ["public.annuler_mission(uuid,uuid,text)", "Audit du 13/10 (AUD-A-03)"],
  ["public.supprimer_detention(uuid)", "Audit du 13/10 (AUD-A-04)"],
  ["public.poser_gardes_diagnostic_artisan()", "'supervision_arrets','supervision_operations','supervision_vacances'"],
  ["public.traiter_vacances()", "Audit du 13/10 (SUP-08)"],
  ["public.contre_proposer_creneaux(uuid,uuid,jsonb)", "Audit du 13/10 (REP-01)"],
  ["public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)", "Audit du 13/10 (ARC-10)"],
  ["public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)", "Audit du 13/10 (ARC-10)"],
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

  it("ARC-10 : sur les définitions d'avant le correctif, elle pose le jour de Paris", async () => {
    // On reconstitue l'état précédent depuis la définition en vigueur : le jour de session à la place du jour de Paris,
    // sans la marque. C'est la base du banc, migrée par la première version du fichier.
    for (const [signature, marque] of FONCTIONS.filter(([, m]) => m.includes("ARC-10"))) {
      const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
      const ancienne = (rows[0].def as string)
        .replaceAll("(d.created_at at time zone 'Europe/Paris')::date", "d.created_at::date")
        .replaceAll("(now() at time zone 'Europe/Paris')::date", "current_date")
        .replaceAll(marque, "Audit du 13/10 (avant)");
      await db.query(ancienne);
    }
    await db.query(MIGRATION);
    for (const [signature, marque] of FONCTIONS.filter(([, m]) => m.includes("ARC-10"))) {
      const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
      expect(rows[0].def, signature).toContain(marque);
      expect(rows[0].def, signature).not.toMatch(/current_date|d\.created_at::date/);
    }
  });

  it("ARC-10 : une définition inattendue l'arrête, pour le règlement comme pour le chantier externe", async () => {
    await db.query("savepoint avant_reglement");
    await db.query(
      `create or replace function public.artisan_reglement_ecrire(p_action text, p_origine text, p_facture uuid, p_donnees jsonb, p_cle uuid)
       returns uuid language plpgsql security definer set search_path to '' as $f$ begin return null; end $f$`
    );
    await expect(db.query(MIGRATION)).rejects.toThrow(/ARC-10 \(règlement\) : définition inattendue/);
    await db.query("rollback to savepoint avant_reglement");
    await db.query(
      `create or replace function public.artisan_externe_ecrire(p_action text, p_id uuid, p_revision integer, p_donnees jsonb, p_cle uuid)
       returns uuid language plpgsql security definer set search_path to '' as $f$ begin return null; end $f$`
    );
    await expect(db.query(MIGRATION)).rejects.toThrow(/ARC-10 \(externe\) : définition inattendue/);
  });
});
