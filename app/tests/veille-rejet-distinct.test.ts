import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bilanMission } from "@/lib/missions";
import { resumerBilan } from "@/lib/sante-service";
const m = vi.hoisted(() => ({ etudier: vi.fn(), rpc: vi.fn(), insert: vi.fn(), update: vi.fn(), erreurStockage: false }));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: vi.fn(), ArretSupervision: class extends Error {} }));
vi.mock("@/lib/veille-reglementaire", () => ({ FLUX_VEILLE: [], lireFluxVeille: vi.fn(), chargerFluxVeille: vi.fn() }));
vi.mock("@/lib/analyse-veille", () => ({ lireSourceEtude: async () => "Source fictive", etudierVeille: m.etudier }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: m.rpc, from: (table: string) => {
  let ecriture = false;
  const q = {
    select: () => q, eq: () => q, is: () => q, or: () => q, order: () => q, limit: () => q,
    insert: (v: unknown) => { m.insert(v); ecriture = true; return q; },
    update: (v: unknown) => { m.update(v); ecriture = true; return q; },
    then: (f: (v: unknown) => unknown) => Promise.resolve({ data: !ecriture && table === "regulatory_watch" ? [{ id: "source", titre: "Fictive", source_url: "https://example.invalid/source" }] : [], error: ecriture && m.erreurStockage ? { message: "indisponible" } : null }).then(f),
  }; return q;
} }) }));
import { traiterVeille } from "@/lib/missions-planifiees/veille";
beforeEach(() => { vi.clearAllMocks(); m.erreurStockage = false; m.rpc.mockResolvedValue({ data: null, error: null }); vi.stubEnv("CRON_SECRET", "secret-local"); });
afterEach(() => vi.unstubAllEnvs());
const lancer = () => traiterVeille(new Request("http://localhost/essai", { headers: { authorization: "Bearer secret-local" } }));
describe("veille : rejet éditorial et panne restent distincts", () => {
  it("le rejet d'une citation n'est pas une panne et conserve un bilan explicite", async () => {
    m.etudier.mockResolvedValue({ analyses: [], rejets: [{ id: "source", motif: "Citation introuvable dans la source." }] });
    const r = await lancer(); const b = await r.json();
    expect(r.status).toBe(200);
    expect(b).toMatchObject({ etudiees: 0, rejetees: 1, echecs: [] });
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ evenement: "veille_analyse_rejetee" }));
    expect(bilanMission(b, r.status)).toMatchObject({ ok: true, bilan: { rejetees: 1, echecs: 0 } });
    expect(resumerBilan(b, "veille")).toContain("études non retenues par le contrôle des sources");
  });
  it("une panne du service reste à reprendre", async () => {
    m.etudier.mockRejectedValue(new Error("indisponible"));
    const r = await lancer();
    expect(r.status).toBe(503);
    expect(bilanMission(await r.json(), r.status).ok).toBe(false);
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ evenement: "veille_analyse_echec" }));
  });
  it("une impossibilité d'enregistrer le contrôle ne devient pas un succès", async () => {
    m.erreurStockage = true;
    m.etudier.mockResolvedValue({ analyses: [], rejets: [{ id: "source", motif: "Source à relire." }] });
    const r = await lancer();
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ rejetees: 0, echecs: ["Enregistrement du contrôle d’une étude"] });
  });
});
