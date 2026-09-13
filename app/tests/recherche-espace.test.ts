import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechercherDansEspace } from "@/app/actions/recherche-espace";
import { filtreRecherche, filtrePersonnes, normaliserRecherche } from "@/lib/recherche-espace";
import { PortefeuilleIndisponible } from "@/lib/portefeuille";

const mocks = vi.hoisted(() => ({ acces: vi.fn(), portefeuille: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: mocks.acces }));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: mocks.portefeuille, PortefeuilleIndisponible: class extends Set {} }));
type Ligne = Record<string, unknown>;
function preparer(tables: Record<string, Ligne[]> = {}, erreurs: string[] = []) {
  const lectures: { table: string; appels: [string, ...unknown[]][] }[] = [];
  const from = vi.fn((table: string) => {
    const appels: [string, ...unknown[]][] = [];
    lectures.push({ table, appels });
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "eq", "neq", "is", "in", "or", "order"])
      q[methode] = (...args: unknown[]) => { appels.push([methode, ...args]); return q; };
    q.limit = (n: number) => { appels.push(["limit", n]); return Promise.resolve({ data: erreurs.includes(table) ? null : tables[table] ?? [], error: erreurs.includes(table) ? { message: "indisponible" } : null }); };
    return q;
  });
  mocks.acces.mockResolvedValue({ supabase: { from }, user: { id: "agent" }, role: "agent" });
  mocks.portefeuille.mockResolvedValue(new Set(["lot-visible"]));
  return { from, lectures };
}
beforeEach(() => vi.resetAllMocks());

describe("recherche dans l’espace de gestion", () => {
  it("contrôle l’accès avant de lire les dossiers", async () => {
    const c = preparer(); mocks.acces.mockRejectedValue(new Error("accès refusé"));
    await expect(rechercherDansEspace("autre-agence", "test")).rejects.toThrow("accès refusé");
    expect(c.from).not.toHaveBeenCalled();
  });
  it("ne cherche pas sur un caractère et borne la saisie", async () => {
    const c = preparer(); expect(await rechercherDansEspace("org", " x ")).toEqual({ resultats: [] });
    expect(c.from).not.toHaveBeenCalled();
    expect(normaliserRecherche("  rue   des Lilas ")).toBe("rue des Lilas");
    expect(normaliserRecherche("x".repeat(100)).length).toBe(80);
  });
  it("n’ouvre jamais le parc si la lecture des droits échoue", async () => {
    const c = preparer(); mocks.portefeuille.mockResolvedValue(new PortefeuilleIndisponible());
    expect(await rechercherDansEspace("org", "test")).toMatchObject({ resultats: [], erreur: expect.any(String) });
    expect(c.from).not.toHaveBeenCalled();
  });
  it("applique agence et portefeuille avant les limites, dédoublonne les logements et ouvre les bonnes fiches", async () => {
    const c = preparer({ lots: [{ id: "lot-visible", nom: "Lot test", bien_id: "bien", bien: { nom: "Maison", city: "Lyon" } }], biens: [{ id: "bien" }], persons: [{ id: "personne", nom: "Dupont", prenom: "Alice", email: "test@example.test" }], baux: [{ id: "bail", lot_id: "lot-visible", locataire_principal: "personne", etat: "actif" }] });
    const r = await rechercherDansEspace("org", "test");
    expect(r.resultats.map((x) => x.href)).toEqual(["/agence/org/parc?sel=lot:lot-visible", "/agence/org/personnes/personne", "/agence/org/baux/bail"]);
    for (const q of c.lectures) {
      expect(q.appels).toContainEqual(["eq", "organization_id", "org"]);
      if (["lots", "baux"].includes(q.table)) {
        const index = q.appels.findIndex((a) => a[0] === "in" && a[1] === (q.table === "lots" ? "id" : "lot_id"));
        expect(q.appels[index]).toEqual(["in", q.table === "lots" ? "id" : "lot_id", ["lot-visible"]]);
        expect(index).toBeLessThan(q.appels.findIndex((a) => a[0] === "limit"));
      }
    }
  });
  it("un portefeuille vide ne déclenche aucune recherche de lot ni de bail", async () => {
    const c = preparer({ persons: [{ id: "p", nom: "Test" }], biens: [{ id: "b" }] });
    mocks.portefeuille.mockResolvedValue(new Set());
    const r = await rechercherDansEspace("org", "test");
    expect(r.resultats.every((x) => x.type === "Personne")).toBe(true);
    expect(c.lectures.map((q) => q.table)).not.toContain("lots");
    expect(c.lectures.map((q) => q.table)).not.toContain("baux");
  });
  it("distingue les échecs de lecture d’une recherche sans résultat", async () => {
    preparer({}, ["persons"]);
    expect(await rechercherDansEspace("org", "test")).toMatchObject({ resultats: [], erreur: expect.any(String) });
    preparer(); expect(await rechercherDansEspace("org", "absent")).toEqual({ resultats: [] });
  });
  it("protège la grammaire PostgREST et les jokers LIKE, accepte nom/prénom inversés", () => {
    expect(filtreRecherche(["nom"], 'x,y"%_')).toBe('nom.ilike."%x,y\\"\\\\%\\\\_%"');
    expect(filtrePersonnes("Alice Dupont")).toContain('and(prenom.ilike."%Alice%",nom.ilike."%Dupont%")');
    expect(filtrePersonnes("Alice Dupont")).toContain('and(nom.ilike."%Alice%",prenom.ilike."%Dupont%")');
  });
});
