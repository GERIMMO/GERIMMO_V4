/**
 * D08 (audit du 13/10, SA-01), relecture — chaque action FINANCIÈRE dit son nom et sa cible à la porte des gestes
 * (`verifierGerant(orgId, { geste, cible })`), pour que la ligne d'audit d'une traversée du super-administrateur
 * dise « encaissement » et le bail visé, au lieu de « geste, rubrique parc ».
 *
 * Le test lit le code : une action financière ajoutée demain sans nom fait échouer ce fichier.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GESTES_TRACE, estCodeGeste } from "../src/lib/gestes-trace";
import { detailsExpurges } from "../src/lib/libelles-journaux";

const FICHIERS = ["loyers", "quittancement", "compta", "restitution", "depot", "appels-charges"];
const lire = (nom: string) => readFileSync(join(__dirname, "..", "src", "app", "actions", `${nom}.ts`), "utf8");

/** Chaque appel de verifierGerant du fichier, avec ce qui suit l'identifiant d'organisation. */
function appels(source: string) {
  return [...source.matchAll(/verifierGerant\(orgId(\s*,\s*\{[^}]*\})?\)/g)].map((m) => ({ complet: m[0], trace: m[1] ?? null }));
}

describe("D08 — les actions financières nomment leur geste", () => {
  it.each(FICHIERS)("%s : chaque appel de verifierGerant porte un geste de la liste", (fichier) => {
    const source = lire(fichier);
    const tous = appels(source);
    expect(tous.length, `${fichier}: aucun appel trouvé`).toBeGreaterThan(0);
    // Tout appel, sans exception : un appel sans nom est écrit dans la liste des fautifs.
    const sansNom = tous.filter((a) => !a.trace || !/geste:\s*"[a-z_]+"/.test(a.trace)).map((a) => a.complet);
    expect(sansNom, `${fichier}: appels sans geste`).toEqual([]);
    for (const a of tous) {
      const code = /geste:\s*"([a-z_]+)"/.exec(a.trace ?? "")?.[1];
      expect(estCodeGeste(code), `${fichier}: « ${code} » n'est pas dans GESTES_TRACE`).toBe(true);
    }
    // Aucun appel n'a échappé à l'expression ci-dessus (un appel écrit autrement serait invisible pour elle).
    expect((source.match(/verifierGerant\(/g) ?? []).length).toBe(tous.length);
  });

  it("chaque geste de la liste sert au moins une fois, et chacun a un libellé français lisible à l'écran", () => {
    const utilises = new Set<string>();
    for (const f of FICHIERS) for (const m of lire(f).matchAll(/geste:\s*"([a-z_]+)"/g)) utilises.add(m[1]);
    for (const [code, libelle] of Object.entries(GESTES_TRACE)) {
      expect(utilises.has(code), `${code} n'est utilisé par aucune action`).toBe(true);
      expect(libelle.length).toBeGreaterThan(8);
      expect(libelle, code).toMatch(/^[a-zàâçéèêëîïôûùü]/);
      expect(detailsExpurges({ geste: code }), code).toBe(`geste : ${libelle}`);
    }
    expect([...utilises].filter((c) => !estCodeGeste(c))).toEqual([]);
  });

  it("une action qui cible un bail, un rapport ou une écriture passe son identifiant (pas une chaîne figée)", () => {
    // Les actions qui reçoivent bailId/rapportId/... doivent le transmettre comme cible.
    const sansCible: string[] = [];
    for (const f of FICHIERS) {
      const source = lire(f);
      for (const m of source.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{\s*const [^=]*= await verifierGerant\(orgId(?:,\s*\{([^}]*)\})?\)/g)) {
        const parametres = m[2];
        const trace = m[3] ?? "";
        const cibles = ["bailId", "rapportId", "mandatId", "ecritureId", "appelId", "posteId"].filter((c) => new RegExp(`\\b${c}\\b`).test(parametres));
        if (cibles.length > 0 && !/cible:/.test(trace)) sansCible.push(`${f}.${m[1]}`);
      }
    }
    expect(sansCible).toEqual([]);
  });
});
