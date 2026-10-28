/**
 * Audit final du 27/10 (COD-15) : chaque action serveur et chaque route de fichier ou d'API a au moins un test qui la cite.
 *
 * Six fichiers d'actions et deux routes n'étaient cités par aucun test : seule la fonction SQL sous-jacente l'était parfois.
 * Une action livrée sans test (validation, refus d'accès, cas nominal) est une action dont la régression passe inaperçue.
 * Ici : le nom de chaque fichier de src/app/actions, et le chemin de chaque route.ts (ses segments dynamiques acceptés sous
 * leur forme littérale `[orgId]` ou remplacés par une valeur), apparaissent dans tests/ ou e2e/. Sans base.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fichiers(dossier: string, filtre: (f: string) => boolean, acc: string[] = []): string[] {
  for (const e of readdirSync(dossier)) {
    const chemin = join(dossier, e);
    if (statSync(chemin).isDirectory()) { if (e !== "node_modules") fichiers(chemin, filtre, acc); }
    else if (filtre(chemin)) acc.push(chemin);
  }
  return acc;
}

const SOURCES = [...fichiers("tests", (f) => /\.(ts|tsx|mjs)$/.test(f)), ...fichiers("e2e", (f) => /\.(ts|tsx|mjs)$/.test(f))]
  .map((f) => readFileSync(f, "utf8"));
const cite = (motif: RegExp) => SOURCES.some((s) => motif.test(s));
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ACTIONS = readdirSync("src/app/actions").filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
const ROUTES = fichiers("src/app", (f) => f.endsWith("/route.ts")).map((f) => f.replace(/^src\/app\//, "").replace(/\/route\.ts$/, ""));

describe("couverture des actions serveur et des routes", () => {
  it("l'inventaire n'est pas vide", () => {
    expect(ACTIONS.length).toBeGreaterThan(30);
    expect(ROUTES.length).toBeGreaterThan(15);
  });

  it.each(ACTIONS)("l'action %s est citée par un test", (nom) => {
    expect(cite(new RegExp(`\\b${echapper(nom)}\\b`)), `src/app/actions/${nom}.ts : aucun test ni parcours ne le cite`).toBe(true);
  });

  it.each(ROUTES)("la route %s est citée par un test ou un parcours", (chemin) => {
    // Littérale (`import … from "@/app/locataire/[orgId]/bail/fichier/route"`) ou avec ses segments dynamiques remplis
    // (`/agence/<identifiant>/parc/import/modele` dans un parcours).
    const litterale = new RegExp(echapper(chemin));
    const remplie = new RegExp(chemin.split("/").map((seg) => (/^\[.+\]$/.test(seg) ? "[^/\\s\"'`]+" : echapper(seg))).join("/"));
    expect(cite(litterale) || cite(remplie), `src/app/${chemin}/route.ts : aucun test ni parcours ne la cite`).toBe(true);
  });
});
