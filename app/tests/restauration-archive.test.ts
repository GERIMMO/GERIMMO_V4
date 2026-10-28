import { describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { verifierBaseDeTest } from "./garde-base";
import { verifierConsommationsInterne, verifierDestination, verifierPrefixe } from "../scripts/sauvegarde/restaurer-archive.mjs";

const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe("restauration d'une archive réelle dans un banc jetable", () => {
  it.each([
    "postgres://postgres@aws-0-eu-west-3.pooler.supabase.com/gerimmo_restauration_test",
    "postgres://postgres@127.0.0.1/postgres",
    "postgres://postgres@127.0.0.1/gerimmo_restauration_test?host=externe",
    "postgres://postgres.rddlxunppddzpsaatdaz@127.0.0.1/gerimmo_restauration_test",
    "https://127.0.0.1/gerimmo_restauration_test",
  ])("refuse une destination ambiguë ou qui pourrait toucher une base existante : %s", url => {
    expect(() => verifierDestination(url)).toThrow();
  });
  it("accepte seulement les cibles locales explicitement nommées pour l'exercice", () => {
    expect(verifierDestination("postgres://postgres@127.0.0.1:5432/gerimmo_restauration_123").hostname).toBe("127.0.0.1");
  });
  it("refuse un chemin libre dans le préfixe téléchargé", () => {
    expect(verifierPrefixe("20260927-0639")).toBe("20260927-0639");
    for (const v of ["../prod", "20260927-0639/../../x", "", "latest"]) expect(() => verifierPrefixe(v)).toThrow();
  });

  it("accepte une ancienne archive sans consommations, mais refuse une dépendance ou un manifeste incomplets", async () => {
    const absent = () => ({ query: vi.fn().mockResolvedValue({ rows: [{ present: false }] }) });
    await expect(verifierConsommationsInterne(absent(), false)).resolves.toEqual({ present: false });
    await expect(verifierConsommationsInterne(absent(), true)).rejects.toThrow(/consommations manque/);
    const dependance = { query: vi.fn().mockResolvedValueOnce({ rows: [{ present: false }] }).mockResolvedValueOnce({ rows: [{ present: true }] }) };
    await expect(verifierConsommationsInterne(dependance, false)).rejects.toThrow(/consommations manque/);
  });

  it.skipIf(!DB_URL || !/127\.0\.0\.1|localhost/.test(DB_URL ?? ""))("contrôle les vrais droits du schéma privé et les gardes de répartition après restauration", async () => {
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      await db.query("begin");
      await expect(verifierConsommationsInterne(db, true)).resolves.toEqual({ present: true, protections: "validées" });
      await db.query("savepoint droits");
      await db.query("grant usage on schema consommations_interne to anon");
      await expect(verifierConsommationsInterne(db, true)).rejects.toThrow(/protections/);
      await db.query("rollback to savepoint droits");
      await db.query("alter table public.repartitions_fourniture disable trigger conso_empreinte_repartition");
      await expect(verifierConsommationsInterne(db, true)).rejects.toThrow(/protections/);
      await db.query("rollback to savepoint droits");
      await expect(verifierConsommationsInterne(db, true)).resolves.toEqual({ present: true, protections: "validées" });
    } finally { await db.query("rollback"); await db.end(); }
  });
});
