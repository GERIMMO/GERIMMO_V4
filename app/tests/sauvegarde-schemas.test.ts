import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { SCHEMAS } from "../scripts/sauvegarde/base.mjs";

describe("périmètre des sauvegardes PostgreSQL", () => {
  it("sauvegarde chaque schéma applicatif créé par les migrations, avec ses fonctions et droits", async () => {
    const dossier = path.resolve("supabase/migrations");
    const schemas = new Set<string>();
    for (const fichier of (await fs.readdir(dossier)).filter(n => n.endsWith(".sql"))) {
      const sql = await fs.readFile(path.join(dossier, fichier), "utf8");
      for (const match of sql.matchAll(/\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        schemas.add(match[1].toLowerCase());
      }
    }
    expect([...schemas].filter(s => !SCHEMAS.includes(s)), "Un schéma créé par l’application ne peut pas être omis du pg_dump").toEqual([]);
    expect(SCHEMAS).toContain("consommations_interne");
    expect(SCHEMAS).toContain("support_interne");
    expect(new Set(SCHEMAS).size).toBe(SCHEMAS.length);
  });
});
