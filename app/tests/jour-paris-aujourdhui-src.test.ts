/**
 * Audit du 23/10/2026 (TST-5) : deux calculs d'« aujourd'hui » en jour UTC échappaient aux gardes, qui ne couvrent que
 * les formulaires et les actions (tests/jour-paris-formulaires.test.ts) :
 *  - le modèle de facture d'honoraires (mois révolu, date d'émission) — éprouvé dans tests/facture-honoraires.test.ts ;
 *  - la fiche d'un bien, qui filtrait les annonces encore visibles sur le jour UTC : entre minuit et 2 h à Paris, une
 *    annonce échue la veille restait affichée.
 * Même motif, à l'année : l'année par défaut d'un document du catalogue était celle du serveur, encore la précédente le
 * 1er janvier entre minuit et 1 h à Paris.
 *
 * Le dernier bloc garde TOUT `src/` contre l'écriture directe du jour UTC de l'instant présent
 * (`new Date().toISOString().slice(0, 10)` et ses variantes) : aucune exception admise.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anneeDocument } from "@/lib/documents/modeles/catalogue-bail";

afterEach(() => vi.useRealTimers());

describe("l'année par défaut d'un document est celle de Paris", () => {
  it("le 1er janvier 2027 à 0 h 30 à Paris (23 h 30 UTC le 31/12), l'année proposée est 2027", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(anneeDocument()).toBe(2027);
    expect(anneeDocument({ annee: "2028" })).toBe(2028);
    expect(() => anneeDocument({ annee: "2029" })).toThrow("Choisissez une année valide.");
  });

  it("le 31 décembre à 23 h 30 à Paris (22 h 30 UTC), l'année reste 2026", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T22:30:00Z"));
    expect(anneeDocument()).toBe(2026);
  });
});

const RACINE = resolve(__dirname, "..");

describe("la fiche d'un bien n'affiche que les annonces encore visibles au jour de Paris", () => {
  const source = readFileSync(join(RACINE, "src/app/agence/[orgId]/parc/[bienId]/page.tsx"), "utf8");
  it("le filtre de visibilité lit aujourdhuiParis(), plus le jour UTC du serveur", () => {
    expect(source).toContain('.gte("visible_jusquau", aujourdhuiParis())');
    expect(source).not.toMatch(/visible_jusquau",\s*new Date\(\)/);
  });
});

// --- Garde de source : tout src/ -----------------------------------------------------------------------------------

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

/** Le jour UTC de l'instant présent : `new Date()` ou `Date.now()` suivis de `.toISOString().slice(0, 10)` (ou variantes). */
const AUJOURDHUI_UTC =
  /new Date\(\s*(?:Date\.now\(\)\s*)?\)\s*\.\s*toISOString\(\)\s*\.\s*(?:(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)|split\(\s*["']T["']\s*\)\s*\[\s*0\s*\])/;

describe("aucun fichier de src/ n'écrit « aujourd'hui » en jour UTC", () => {
  const candidats = fichiers(join(RACINE, "src")).map((chemin) => ({
    rel: relative(RACINE, chemin).split("\\").join("/"),
    source: readFileSync(chemin, "utf8"),
  }));

  it("la recherche voit bien tout src/ (sinon la garde ne garde rien)", () => {
    const noms = candidats.map((c) => c.rel);
    expect(noms).toContain("src/lib/documents/modeles/facture-honoraires.ts");
    expect(noms).toContain("src/app/agence/[orgId]/parc/[bienId]/page.tsx");
    expect(candidats.length).toBeGreaterThan(500);
  });

  it("aucune ligne ne l'utilise : utilisez aujourdhuiParis() (src/lib/ged.ts)", () => {
    const fautes = candidats.flatMap(({ rel, source }) =>
      source.split("\n").flatMap((ligne, i) => (AUJOURDHUI_UTC.test(ligne) ? [`${rel}:${i + 1}  ${ligne.trim().slice(0, 120)}`] : []))
    );
    expect(fautes).toEqual([]);
  });

  it("la garde reconnaît les variantes d'écriture, et seulement l'instant présent", () => {
    for (const ecriture of [
      "new Date().toISOString().slice(0, 10)",
      "new Date().toISOString().slice(0,10)",
      "new Date(Date.now()).toISOString().substring(0, 10)",
      'new Date().toISOString().split("T")[0]',
    ]) expect(AUJOURDHUI_UTC.test(ecriture), ecriture).toBe(true);
    // Un aller-retour de validation d'une date saisie, ou un calcul sur un jour de Paris, n'est pas « aujourd'hui ».
    expect(AUJOURDHUI_UTC.test("new Date(value).toISOString().slice(0,10) === value")).toBe(false);
    expect(AUJOURDHUI_UTC.test("finDate.toISOString().slice(0, 10)")).toBe(false);
    expect(AUJOURDHUI_UTC.test("aujourdhuiParis()")).toBe(false);
  });
});
