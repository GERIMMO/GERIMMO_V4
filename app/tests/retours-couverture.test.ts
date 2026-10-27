/**
 * Audit final du 27/10 (COD-02) : toute migration depuis le 15/10 a son script de retour arrière, nommé dans le LISEZ-MOI.
 *
 * Trois migrations du 26/10 (PR #264) avaient été appliquées en production sans `.retour.sql` : le retour du lot n'avait
 * d'autre voie que la restauration d'une sauvegarde. La convention (passation du 16/10, § 6) exige un retour par migration ;
 * ce test la tient pour les migrations postérieures au 15/10, hors l'exception documentée du 21/10 (effacement ponctuel,
 * irréversible par nature). Il garde aussi le LISEZ-MOI à jour : chaque fichier du dossier y est cité, et son titre ne date
 * plus d'une semaine révolue. Sans base.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS = "supabase/migrations";
const RETOURS = "supabase/retours-arriere";
/** Première version soumise à la règle : la passation du 16/10 écrit la convention pour les migrations qui suivent. */
const DEPUIS = "20261015";
/** Migrations sans retour possible, chacune justifiée dans le LISEZ-MOI (section « Nettoyage initial du 21 octobre 2026 »). */
const EXCEPTIONS = ["20261021175930_nettoyage_initial_comptes.sql"];

const lisezMoi = readFileSync(`${RETOURS}/LISEZ-MOI.md`, "utf8");
const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f >= DEPUIS).sort();

describe("retours arrière — couverture des migrations depuis le 15 octobre 2026", () => {
  it("la liste a quelque chose à contrôler", () => {
    expect(migrations.length).toBeGreaterThan(40);
    for (const e of EXCEPTIONS) expect(migrations, `${e} : exception sans migration`).toContain(e);
  });

  it.each(migrations.filter((m) => !EXCEPTIONS.includes(m)))("%s a son .retour.sql, cité dans le LISEZ-MOI", (migration) => {
    const retour = migration.replace(/\.sql$/, ".retour.sql");
    expect(existsSync(`${RETOURS}/${retour}`), `${RETOURS}/${retour} absent`).toBe(true);
    expect(lisezMoi, `${retour} n'est pas décrit dans le LISEZ-MOI`).toContain(`\`${retour}\``);
  });

  it.each(EXCEPTIONS)("%s : l'absence de retour est écrite dans le LISEZ-MOI", (migration) => {
    expect(existsSync(`${RETOURS}/${migration.replace(/\.sql$/, ".retour.sql")}`)).toBe(false);
    const position = lisezMoi.indexOf(`\`${migration}\``);
    expect(position, "la migration n'est pas nommée").toBeGreaterThan(-1);
    expect(lisezMoi.slice(position, position + 600)).toMatch(/aucun fichier `\.retour\.sql`/);
  });

  it("chaque script de retour du dossier est cité dans le LISEZ-MOI", () => {
    const orphelins = readdirSync(RETOURS).filter((f) => f.endsWith(".retour.sql") && !lisezMoi.includes(`\`${f}\``));
    expect(orphelins).toEqual([]);
  });

  it("le titre du LISEZ-MOI couvre tous les retours (« depuis le 13 octobre 2026 »)", () => {
    expect(lisezMoi.split("\n")[0]).toBe("# Retours arrière des migrations depuis le 13 octobre 2026");
  });

  it("les trois retours du 26/10 écrits par l'audit final sont atomiques, refusent de perdre une réponse et retirent leur version", () => {
    for (const version of ["20261026213652", "20261026214857", "20261026232941"]) {
      const [fichier] = readdirSync(RETOURS).filter((f) => f.startsWith(version) && f.endsWith(".retour.sql"));
      const sql = readFileSync(`${RETOURS}/${fichier}`, "utf8");
      expect(sql).toMatch(/^do \$retour_atomique\$/m);
      expect(sql).not.toMatch(/^(begin|commit);$/m);
      expect(sql).toContain("raise exception 'Retour refusé");
      expect(sql).toContain(`where version = '${version}'`);
    }
  });
});
