/**
 * Audit final du 27/10 (COD-02) : toute migration écrite depuis le 28/10 se rejoue sans erreur sur la base déjà migrée.
 *
 * La convention (passation du 16/10, § 6) veut des migrations rejouables (`if not exists`, `drop … if exists` avant
 * `create`, `create or replace`). Trois fichiers du 26/10 ne l'étaient pas ; on ne les réécrit pas (déjà appliqués en
 * production), mais la règle est tenue pour les suivants : chaque migration du manifeste à partir du 28/10 est jouée deux
 * fois dans une transaction annulée, sans erreur. DDL tenu pendant l'essai : fichier en série (FICHIERS_EN_SERIE).
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const DEPUIS = "20261028";
const MANIFESTE = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
const RECENTES = MANIFESTE.filter((m) => m >= DEPUIS);

describe("migrations depuis le 28 octobre 2026 — rejouables", () => {
  it("le manifeste nomme chaque migration récente une seule fois, et chacune a un fichier", () => {
    for (const nom of RECENTES) {
      expect(MANIFESTE.filter((l) => l === nom), nom).toHaveLength(1);
      expect(() => readFileSync(`supabase/migrations/${nom}`, "utf8"), nom).not.toThrow();
    }
  });

  describe.skipIf(!url || RECENTES.length === 0)("sur la base migrée", () => {
    it.each(RECENTES)("%s se rejoue deux fois sans erreur", async (nom) => {
      const db = new Client({ connectionString: url });
      await db.connect();
      try {
        await db.query("begin");
        const sql = readFileSync(`supabase/migrations/${nom}`, "utf8");
        await db.query(sql);
        await db.query(sql);
      } finally {
        await db.query("rollback");
        await db.end();
      }
    });
  });
});
