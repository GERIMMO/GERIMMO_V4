/**
 * Constat de relecture du 14/10/2026 (suite intermittente) : certains fichiers de test ont besoin de la base pour eux
 * seuls. Une fixture VALIDÉE (essais à deux sessions) reste visible de toutes les sessions pendant l'essai et fait
 * échouer reprise-comptable.test.ts, qui compte toute la table des dépôts ; un DDL tenu pendant tout un fichier (rejeu de
 * migration, `create trigger` d'essai) se croise avec les écritures des autres fichiers et la base tue l'un des deux
 * (`deadlock detected`).
 *
 * `vitest.config.ts` les range dans un groupe « serie » : après tous les autres, un fichier à la fois. Ce test garde le
 * classement : la liste, ses fichiers, l'ordre des groupes, et l'oubli d'un nouveau fichier qui valide une fixture dans
 * les tables que reprise-comptable.test.ts compte en entier.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config, { FICHIERS_EN_SERIE } from "../vitest.config";

const RACINE = resolve(__dirname, "..");

type Projet = {
  test?: { name?: string; include?: string[]; exclude?: string[]; fileParallelism?: boolean; sequence?: { groupOrder?: number } };
};
const projets = (config.test?.projects ?? []) as Projet[];
const serie = projets.find((p) => p.test?.name === "serie")?.test;
const parallele = projets.find((p) => p.test?.name === "parallele")?.test;

describe("les fichiers qui ont besoin de la base pour eux seuls tournent en série", () => {
  it("la liste existe, sans doublon, et chaque fichier listé existe", () => {
    expect(Array.isArray(FICHIERS_EN_SERIE)).toBe(true);
    expect(FICHIERS_EN_SERIE.length).toBeGreaterThan(0);
    expect(new Set(FICHIERS_EN_SERIE).size).toBe(FICHIERS_EN_SERIE.length);
    for (const fichier of FICHIERS_EN_SERIE) expect(existsSync(resolve(RACINE, fichier)), fichier).toBe(true);
  });

  it("le groupe « serie » ne contient que ces fichiers, un à la fois", () => {
    expect(serie, "projet « serie » absent de vitest.config.ts").toBeDefined();
    expect(serie?.include).toEqual(FICHIERS_EN_SERIE);
    expect(serie?.fileParallelism).toBe(false);
  });

  it("il passe APRÈS le groupe parallèle, qui ne rejoue pas ces fichiers", () => {
    expect(parallele, "projet « parallele » absent de vitest.config.ts").toBeDefined();
    expect(serie?.sequence?.groupOrder ?? 0).toBeGreaterThan(parallele?.sequence?.groupOrder ?? 0);
    for (const fichier of FICHIERS_EN_SERIE) expect(parallele?.exclude, fichier).toContain(fichier);
    expect(parallele?.include).toEqual(["tests/**/*.test.ts"]);
  });

  it("les deux fichiers des clés d'envoi (fixtures validées, rejeu de migrations) y sont", () => {
    expect(FICHIERS_EN_SERIE).toContain("tests/cle-envoi-encaissements.test.ts");
    expect(FICHIERS_EN_SERIE).toContain("tests/encaissement-cle-envoi-action.test.ts");
  });

  it("tout fichier qui valide une fixture (commit) dans les tables comptées par reprise-comptable y est aussi", () => {
    // reprise-comptable.test.ts exige count(*) = 0 sur ces trois tables (le contrôle n'écrit rien) : une ligne validée par
    // un autre fichier, même quelques millisecondes, le fait échouer. `encaisser_depot` écrit dans depot_encaissements.
    const tablesComptees = /depot_encaissements|reprise_soldes|mouvements_mandants|encaisser_depot/;
    const valideUneFixture = /query\(\s*["'`]commit["'`]\s*\)|["'`]commit;?["'`]/;
    const fichiers = readdirSync(resolve(RACINE, "tests")).filter((f) => f.endsWith(".test.ts"));
    const oublies = fichiers.filter((f) => {
      const source = readFileSync(resolve(RACINE, "tests", f), "utf8");
      return valideUneFixture.test(source) && tablesComptees.test(source) && !FICHIERS_EN_SERIE.includes(`tests/${f}`);
    });
    expect(oublies, "à ajouter à FICHIERS_EN_SERIE de vitest.config.ts").toEqual([]);
  });
});
