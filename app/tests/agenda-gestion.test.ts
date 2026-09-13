import { beforeEach, describe, expect, it, vi } from "vitest";
import { minuitParis, semaineAgenda, pageAgenda, vueAgenda } from "@/lib/agenda-gestion";
import { chargerAgendaGestion } from "@/app/actions/agenda-gestion";
import { PortefeuilleIndisponible } from "@/lib/portefeuille";
const mocks = vi.hoisted(() => ({ acces: vi.fn(), portefeuille: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: mocks.acces }));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: mocks.portefeuille, PortefeuilleIndisponible: class extends Set {} }));
function contexte(data: unknown[] = [], erreur = false) {
  const appels: [string, ...unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const nom of ["select", "eq", "in", "is", "lt", "or", "order"]) q[nom] = (...args: unknown[]) => { appels.push([nom, ...args]); return q; };
  q.range = (...args: unknown[]) => { appels.push(["range", ...args]); return Promise.resolve({ data, error: erreur ? new Error("lecture impossible") : null, count: data.length }); };
  const from = vi.fn(() => q);
  mocks.acces.mockResolvedValue({ supabase: { from }, user: { id: "agent" }, role: "agent" });
  mocks.portefeuille.mockResolvedValue(new Set(["lot-a"]));
  return { from, appels };
}
beforeEach(() => vi.resetAllMocks());
describe("agenda de gestion", () => {
  it("refuse l’accès avant toute lecture", async () => {
    const c = contexte(); mocks.acces.mockRejectedValue(new Error("non autorisé"));
    await expect(chargerAgendaGestion("autre-org", {})).rejects.toThrow("non autorisé");
    expect(c.from).not.toHaveBeenCalled();
  });
  it("distingue un portefeuille vide d’un portefeuille indisponible", async () => {
    const c = contexte(); mocks.portefeuille.mockResolvedValue(new Set());
    expect(await chargerAgendaGestion("org", {})).toMatchObject({ lignes: [], total: 0, erreur: false });
    mocks.portefeuille.mockResolvedValue(new PortefeuilleIndisponible());
    expect(await chargerAgendaGestion("org", {})).toMatchObject({ lignes: [], erreur: true });
    expect(c.from).not.toHaveBeenCalled();
  });
  it("filtre l’organisation et le portefeuille avant la pagination et le comptage", async () => {
    const c = contexte([{ id: "rdv", incident: { id: "incident", lot_id: "lot-a" } }]);
    const r = await chargerAgendaGestion("alpha", { semaine: "2026-09-14", page: "2" });
    expect(r.lignes).toHaveLength(1);
    expect(c.appels).toContainEqual(["eq", "organization_id", "alpha"]);
    expect(c.appels).toContainEqual(["eq", "incident.organization_id", "alpha"]);
    expect(c.appels).toContainEqual(["in", "incident.lot_id", ["lot-a"]]);
    expect(c.appels[0][1]).toContain("!inner");
    expect(c.appels[0][2]).toEqual({ count: "exact" });
    expect(c.appels.at(-1)).toEqual(["range", 30, 59]);
    expect(c.appels).toContainEqual(["lt", "debut_prevu", "2026-09-20T22:00:00.000Z"]);
    expect(c.appels.find(([m]) => m === "or")?.[1]).toContain("fin_prevue.gt.2026-09-13T22:00:00.000Z");
  });
  it("sépare les propositions non datées des rendez-vous et des missions passées à vérifier", async () => {
    const c = contexte(); await chargerAgendaGestion("alpha", { vue: "a-planifier" });
    expect(c.appels).toContainEqual(["in", "statut", ["proposee", "acceptee"]]);
    expect(c.appels).toContainEqual(["is", "debut_prevu", null]);
    const d = contexte(); await chargerAgendaGestion("alpha", { vue: "a-verifier" });
    expect(d.appels).toContainEqual(["in", "statut", ["planifiee", "en_cours"]]);
    expect(d.appels.some(([m, col]) => m === "lt" && col === "fin_prevue")).toBe(true);
  });
  it("ne transforme pas une erreur de lecture en agenda vide rassurant", async () => {
    contexte([], true); expect(await chargerAgendaGestion("alpha", {})).toMatchObject({ erreur: true });
  });
  it("refuse une projection orpheline ou hors portefeuille", async () => {
    contexte([{ id: "intrus", incident: { id: "b", lot_id: "lot-b" } }, { id: "absent", incident: null }]);
    expect((await chargerAgendaGestion("alpha", {})).lignes).toEqual([]);
  });
  it("l’admin conserve l’accès aux rendez-vous de son organisation", async () => {
    const c = contexte(); mocks.portefeuille.mockResolvedValue(null);
    await chargerAgendaGestion("alpha", {});
    expect(c.appels).toContainEqual(["eq", "organization_id", "alpha"]);
    expect(c.appels.some(([m, col]) => m === "in" && col === "incident.lot_id")).toBe(false);
  });
});
describe("dates civiles de l’agenda", () => {
  it("utilise le lundi et le jour parisien, même dimanche en UTC", () => {
    expect(semaineAgenda(undefined, new Date("2026-09-13T23:30:00Z")).lundi).toBe("2026-09-14");
    expect(semaineAgenda("2026-09-20")).toMatchObject({ lundi: "2026-09-14", suivant: "2026-09-21", precedent: "2026-09-07" });
  });
  it("gère les semaines de 167 et 169 heures lors du changement d’heure", () => {
    expect((Date.parse(minuitParis("2026-03-30")) - Date.parse(minuitParis("2026-03-23"))) / 3_600_000).toBe(167);
    expect((Date.parse(minuitParis("2026-10-26")) - Date.parse(minuitParis("2026-10-19"))) / 3_600_000).toBe(169);
  });
  it("rejette dates impossibles, tableaux et paramètres arbitraires", () => {
    const date = new Date("2026-09-14T10:00:00Z");
    expect(semaineAgenda("2026-02-30", date).lundi).toBe("2026-09-14");
    expect(semaineAgenda(["2026-01-01"], date).lundi).toBe("2026-09-14");
    expect(vueAgenda("inconnue")).toBe("semaine");
    expect(pageAgenda("-5")).toBe(1); expect(pageAgenda("999999999")).toBe(1);
  });
});
