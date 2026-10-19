/**
 * L'exercice de restauration (audit sécurité du 27/09, RM-A4.12).
 *
 * Une sauvegarde jamais restaurée n'est qu'une hypothèse. Le programme
 * scripts/sauvegarde/exercice-restauration.mjs rejoue la chaîne complète sur
 * le banc local : export chiffré → vérification → déchiffrement → base neuve →
 * pg_restore → comparaison des lignes ET des droits. Ce test vérifie ses
 * garde-fous (jamais la production, jamais une base qui n'est pas jetable) et,
 * quand une base locale est disponible, joue l'exercice en entier.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exporter } from "../scripts/sauvegarde/base.mjs";
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { exercer, verifierCibles } from "../scripts/sauvegarde/exercice-restauration.mjs";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);
const pgDisponible = spawnSync("pg_dump", ["--version"]).status === 0 && spawnSync("pg_restore", ["--version"]).status === 0;

describe("exercice de restauration", () => {
  it("refuse la production, une source distante et une cible qui n'est pas jetable", () => {
    expect(() => verifierCibles("postgres://postgres.rddlxunppddzpsaatdaz@127.0.0.1:5432/postgres", "gerimmo_restauration")).toThrow(/production/);
    expect(() => verifierCibles("postgres://postgres@db.exemple.fr:5432/postgres", "gerimmo_restauration")).toThrow(/locale/);
    expect(() => verifierCibles("postgres://postgres@127.0.0.1:55432/gerimmo_ci_neuf", "gerimmo_ci_neuf")).toThrow(/jetable/);
    expect(() => verifierCibles("postgres://postgres@127.0.0.1:55432/x", "gerimmo_restauration; drop database y")).toThrow(/jetable/);
    expect(verifierCibles("postgres://postgres@127.0.0.1:55432/gerimmo_ci_neuf", "gerimmo_restauration_test").cibleUrl)
      .toBe("postgres://postgres@127.0.0.1:55432/gerimmo_restauration_test");
  });

  it.skipIf(!DB_URL || !pgDisponible || !/127\.0\.0\.1|localhost/.test(DB_URL ?? ""))(
    "refuse dès l’export un schéma requis absent et ne produit aucune archive trompeuse",
    async () => {
      const dossier = await fs.mkdtemp(path.join(os.tmpdir(), "gerimmo-export-incomplet-"));
      const archive = path.join(dossier, "archive");
      try {
        await expect(exporter(archive, randomBytes(32), DB_URL!, { schemas: ["public", "support_absent_de_recette"] })).rejects.toThrow(/support_absent_de_recette/);
        await expect(fs.stat(archive)).rejects.toThrow(/ENOENT/);
      } finally { await fs.rm(dossier, { recursive: true, force: true }); }
    }
  );

  it.skipIf(!DB_URL || !pgDisponible || !/127\.0\.0\.1|localhost/.test(DB_URL ?? ""))(
    "restaure la base locale à l'identique, droits compris, sans rouvrir une fonction à anon",
    async () => {
      const bilan = await exercer({ source: DB_URL, cible: "gerimmo_restauration_test" });
      expect(bilan.tables_differentes).toEqual([]);
      expect(bilan.ecarts_droits).toEqual({});
      expect(bilan.fonctions_ouvertes_a_anon).toBe(0);
      expect(bilan.support_interne).toEqual({ present: true, protections: "validées" });
      expect(bilan.historique_migrations.present).toBe(true);
      expect(bilan.historique_migrations.versions).toBeGreaterThan(0);
      expect(bilan.objets_compares.historique_migrations).toBe(bilan.historique_migrations.versions);
      expect(bilan.reussi).toBe(true);
    },
    180_000
  );
});
