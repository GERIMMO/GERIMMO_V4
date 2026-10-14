/**
 * Audit du 13/10/2026 (PR178-A-01) : les copies de saisie gardées sur l'appareil (identité, pièce d'identité,
 * prix de devis) restaient après la déconnexion. Elles s'effacent à la déconnexion, et un compte qui ouvre un
 * formulaire efface celles des autres comptes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compteDeLaCle, purgerCopiesAutresComptes, purgerCopiesLocales } from "../src/lib/copies-locales";
import { cleCopieFichiers } from "../src/lib/brouillon-fichiers";
import { cleDevisLocal } from "../src/lib/brouillon-devis-local";

function faux(initial: Record<string, string>) {
  const m = new Map(Object.entries(initial));
  return {
    map: m,
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

describe("compteDeLaCle", () => {
  it("lit le compte dans les clés de copie", () => {
    expect(compteDeLaCle(cleCopieFichiers("personne", "compte-1", "org-1"))).toBe("compte-1");
    expect(compteDeLaCle(cleDevisLocal("compte/2", "demande-9"))).toBe("compte/2");
  });
  it("ignore une clé qui n'est pas une copie de saisie", () => {
    expect(compteDeLaCle("gerimmo-edl-brouillon-42")).toBeNull();
    expect(compteDeLaCle("gerimmo_quittance")).toBeNull();
    expect(compteDeLaCle("gerimmo:court")).toBeNull();
  });
});

describe("purge", () => {
  let local: ReturnType<typeof faux>, session: ReturnType<typeof faux>, supprimees: string[];
  beforeEach(() => {
    local = faux({
      [cleCopieFichiers("personne", "A", "org")]: "{}",
      [cleDevisLocal("A", "d1")]: "{}",
      [cleDevisLocal("B", "d2")]: "{}",
      "gerimmo-edl-brouillon-42": "{}",
      "gerimmo_quittance": "{}",
      "theme": "sombre",
    });
    session = faux({ [cleCopieFichiers("incident", "A", "org")]: "{}", "autre": "1" });
    supprimees = [];
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("indexedDB", { deleteDatabase: (n: string) => { supprimees.push(n); } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("à la déconnexion : toutes les copies de saisie partent (dont la quittance de l'outil public), rien d'autre", () => {
    purgerCopiesLocales();
    // Le brouillon d'état des lieux suit sa propre règle (D15, 14/10/2026 ; voir edl-brouillon-compte.test.ts) : l'ancienne clé
    // sans compte, qui ne peut plus être rattachée à personne, part aussi. Une copie d'état des lieux portant des relevés
    // non envoyés resterait (copie de travail hors ligne de l'agent, RM-19.1.1, 19.1.2, 19.1.6).
    expect([...local.map.keys()].sort()).toEqual(["theme"]);
    expect([...session.map.keys()]).toEqual(["autre"]);
    expect(supprimees).toEqual(["gerimmo-reprises"]);
  });

  it("à l'ouverture d'un formulaire : seules les copies des autres comptes partent", () => {
    expect(purgerCopiesAutresComptes("A")).toBe(1);
    expect(local.map.has(cleDevisLocal("B", "d2"))).toBe(false);
    expect(local.map.has(cleDevisLocal("A", "d1"))).toBe(true);
    expect(local.map.has(cleCopieFichiers("personne", "A", "org"))).toBe(true);
  });

  it("ne lève jamais d'erreur si le stockage est refusé", () => {
    vi.stubGlobal("localStorage", { get length() { throw new Error("refusé"); } });
    vi.stubGlobal("indexedDB", { deleteDatabase: () => { throw new Error("refusé"); } });
    expect(() => purgerCopiesLocales()).not.toThrow();
    expect(() => purgerCopiesAutresComptes("A")).not.toThrow();
  });
});
