import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechercherDansSupervision } from "@/app/actions/recherche-supervision";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

function preparer(options: { autorise?: boolean; erreur?: string } = {}) {
  const lectures: { table: string; appels: unknown[][] }[] = [];
  const lignes: Record<string, Record<string, unknown>[]> = {
    organizations: [
      { id: "org", name: "Agence Alpha", type: "agence", status: "active", city: "Paris", email_contact: "alpha@test.fr" },
      // Sans `type` : une agence, comme sur la page Clients (25/09).
      { id: "sans-type", name: "Alpha Gestion", type: null, status: "essai", city: null, email_contact: null },
      { id: "direct", name: "Alpha Bailleur", type: "proprietaire_direct", status: "active", city: null, email_contact: null },
    ],
    artisans: [{ id: "artisan", raison_sociale: "Plomberie Alpha", statut_plateforme: "valide", email: "artisan@test.fr", siret: "123" }],
  };
  const from = vi.fn((table: string) => {
    const appels: unknown[][] = [];
    lectures.push({ table, appels });
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "or", "order"])
      q[methode] = (...args: unknown[]) => { appels.push([methode, ...args]); return q; };
    q.limit = (n: number) => {
      appels.push(["limit", n]);
      return Promise.resolve({ data: lignes[table] ?? [], error: options.erreur === table ? { message: "indisponible" } : null });
    };
    return q;
  });
  const rpc = vi.fn().mockResolvedValue({ data: options.autorise ?? true, error: null });
  mocks.createClient.mockResolvedValue({ from, rpc });
  return { from, rpc, lectures };
}

beforeEach(() => vi.resetAllMocks());

describe("recherche transversale de la supervision", () => {
  it("refuse avant toute lecture si le compte n'est pas Super Admin", async () => {
    const c = preparer({ autorise: false });
    await expect(rechercherDansSupervision("alpha")).rejects.toThrow("supervision");
    expect(c.from).not.toHaveBeenCalled();
  });

  it("retrouve organisations et artisans et ouvre leurs fiches", async () => {
    const c = preparer();
    const r = await rechercherDansSupervision(" alpha ");
    expect(r.resultats.map((x) => x.href)).toEqual([
      "/admin/organisations/org",
      "/admin/organisations/sans-type",
      "/admin/organisations/direct",
      "/admin/clients/artisans/artisan",
    ]);
    // Le même classement que Clients, et des statuts en français.
    expect(r.resultats[1].detail).toBe("Agence · En essai");
    expect(r.resultats[2].detail).toBe("Propriétaire bailleur · Active");
    expect(r.resultats[3].detail).toContain("Validé");
    expect(r.resultats[3].detail).not.toContain("valide ");
    for (const lecture of c.lectures) {
      expect(lecture.appels.find((a) => a[0] === "or")?.[1]).toContain("alpha");
      expect(lecture.appels).toContainEqual(["limit", 8]);
    }
  });

  it("distingue une lecture en panne d'une recherche vide", async () => {
    preparer({ erreur: "artisans" });
    expect(await rechercherDansSupervision("alpha")).toMatchObject({ erreur: expect.any(String) });
  });
});
