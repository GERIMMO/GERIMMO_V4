/**
 * Audit du 13/10/2026 (VER-PR178-07) : si le navigateur refuse sessionStorage (la propriété lève une SecurityError),
 * la synthèse d'alertes et la page de connexion lisaient et écrivaient dedans sans protection, et TOUTE l'application
 * affichait « Cette page n'a pas pu s'afficher ». Le drapeau « synthèse déjà vue » est une commodité : il devient
 * simplement non mémorisé.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ecrireSession, lireSession, oublierSession } from "../src/lib/stockage-session";

afterEach(() => vi.unstubAllGlobals());

function refuse() {
  // Comme Chromium quand les données de site sont bloquées : c'est l'ACCÈS à la propriété qui lève.
  vi.stubGlobal("sessionStorage", undefined);
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() { throw new DOMException("Access is denied for this document.", "SecurityError"); },
  });
}
function retablir() { Reflect.deleteProperty(globalThis, "sessionStorage"); }

describe("sessionStorage disponible", () => {
  it("lit, écrit et oublie", () => {
    const m = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } });
    expect(lireSession("k")).toBeNull();
    ecrireSession("k", "1");
    expect(lireSession("k")).toBe("1");
    oublierSession("k");
    expect(lireSession("k")).toBeNull();
  });
});

describe("sessionStorage refusé par le navigateur", () => {
  afterEach(retablir);
  it("ne lève jamais : lecture vide, écriture et oubli sans effet", () => {
    refuse();
    expect(() => sessionStorage.getItem("k")).toThrow();
    expect(lireSession("k")).toBeNull();
    expect(() => ecrireSession("k", "1")).not.toThrow();
    expect(() => oublierSession("k")).not.toThrow();
  });
});
