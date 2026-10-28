/**
 * Audit final du 27/10 (COD-15) : chaque action serveur et chaque route a au moins un test qui l'exerce vraiment.
 *
 * Six fichiers d'actions et deux routes n'étaient exercés par aucun test. Relecture adverse du 28/10 : la première
 * version de cet inventaire se validait elle-même (ses commentaires citaient deux routes) et acceptait le nom nu d'une
 * action (« veille » dans un texte suffisait). Désormais :
 *  - seuls comptent les fichiers de tests/ et e2e/ qui contiennent un test (`describe(`, `it(`, `test(` ou `page.goto`),
 *    et jamais celui-ci ;
 *  - les commentaires sont retirés avant la recherche ;
 *  - une action est couverte si un fichier importe son module : `actions/<nom>` suivi d'une fin de chaîne ;
 *  - une route est couverte si un fichier importe `app/<chemin>/route`, ou appelle son URL, segments dynamiques remplis
 *    (ou assemblée : la partie fixe après le dernier segment dynamique, juste après `+ "` ou `}`).
 * Une exception se motive dans EXCEPTIONS. Sans base.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CE_FICHIER = "tests/couverture-actions-routes.test.ts";

/** Actions ou routes sans test d'exécution, avec la raison. Vide aujourd'hui : chaque entrée doit rester justifiée. */
const EXCEPTIONS: Record<string, string> = {};

function fichiers(dossier: string, filtre: (f: string) => boolean, acc: string[] = []): string[] {
  for (const e of readdirSync(dossier)) {
    const chemin = join(dossier, e);
    if (statSync(chemin).isDirectory()) { if (!["node_modules", ".auth", ".audit"].includes(e)) fichiers(chemin, filtre, acc); }
    else if (filtre(chemin)) acc.push(chemin);
  }
  return acc;
}

/** Le code sans ses commentaires (blocs, et lignes qui commencent par `//`, sans toucher aux `https://` des chaînes). */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/.*$/gm, "$1");

export const SOURCES = [...fichiers("tests", (f) => /\.(ts|tsx|mjs)$/.test(f)), ...fichiers("e2e", (f) => /\.(ts|tsx|mjs)$/.test(f))]
  .filter((f) => f !== CE_FICHIER)
  .map((f) => sansCommentaires(readFileSync(f, "utf8")))
  .filter((s) => /\b(describe|it|test)(\.\w+)*\(|page\.goto\(/.test(s));
const cite = (motif: RegExp) => SOURCES.some((s) => motif.test(s));
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ACTIONS = readdirSync("src/app/actions").filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));
const ROUTES = fichiers("src/app", (f) => f.endsWith("/route.ts")).map((f) => f.replace(/^src\/app\//, "").replace(/\/route\.ts$/, ""));

describe("couverture des actions serveur et des routes", () => {
  it("l'inventaire n'est pas vide, et ne se lit pas lui-même", () => {
    expect(ACTIONS.length).toBeGreaterThan(30);
    expect(ROUTES.length).toBeGreaterThan(15);
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.some((s) => s.includes("const CE_FICHIER"))).toBe(false);
  });

  it("chaque exception désigne une action ou une route qui existe encore", () => {
    for (const cle of Object.keys(EXCEPTIONS)) expect([...ACTIONS, ...ROUTES], cle).toContain(cle);
  });

  it.each(ACTIONS.filter((a) => !EXCEPTIONS[a]))("l'action %s est importée par un test", (nom) => {
    expect(cite(new RegExp(`actions/${echapper(nom)}["'\`]`)), `src/app/actions/${nom}.ts : aucun test ni parcours ne l'importe`).toBe(true);
  });

  it.each(ROUTES.filter((r) => !EXCEPTIONS[r]))("la route %s est importée ou appelée par un test", (chemin) => {
    const importee = new RegExp(`app/${echapper(chemin)}/route["'\`]`);
    const appelee = new RegExp(`/${chemin.split("/").map((seg) => (/^\[.+\]$/.test(seg) ? "[^/\\s\"'`?]+" : echapper(seg))).join("/")}(?=["'\`?#]|$)`, "m");
    // URL assemblée par concaténation (`"/agence/" + org + "/parc/import/modele"`) : la partie fixe qui suit le dernier segment
    // dynamique, ouverte par `+ "` (concaténation) ou par l'accolade fermante d'un gabarit, et suivie d'une fin de chaîne.
    // Un sélecteur qui vérifie l'ABSENCE d'un lien (`a[href$="/bail/fichier"]`) ne compte donc pas.
    const segments = chemin.split("/");
    const dernierDynamique = segments.map((seg) => /^\[.+\]$/.test(seg)).lastIndexOf(true);
    const queue = dernierDynamique >= 0 && dernierDynamique < segments.length - 1 ? segments.slice(dernierDynamique + 1).join("/") : null;
    const concatenee = queue ? new RegExp(`(\\+\\s*["'\`]|\\})/${echapper(queue)}["'\`?#]`) : null;
    expect(cite(importee) || cite(appelee) || (concatenee !== null && cite(concatenee)),
      `src/app/${chemin}/route.ts : aucun test ni parcours ne l'importe ni ne l'appelle`).toBe(true);
  });
});
