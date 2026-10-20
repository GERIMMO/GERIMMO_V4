import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { annulerDemandeSignature } from "@/app/actions/signature";
beforeEach(() => {
  vi.resetAllMocks();
  const q = { select: () => q, eq: () => q, single: m.single };
  m.acces.mockResolvedValue({ user: { id: "owner" }, supabase: { rpc: m.rpc, from: () => q } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.single.mockResolvedValue({ data: { prestataire: "youtrust", external_request_id: "req", signee_le: null }, error: null });
});
const annulations = () => m.rpc.mock.calls.filter(c => c[0] === "annuler_demande_signature");
describe("Archives de l’ancien prestataire", () => {
  it("conserve une ancienne demande sans annoncer une annulation distante non vérifiée", async () => {
    expect((await annulerDemandeSignature("org", "demande")).erreur).toContain("historique est conservé");
    expect(annulations()).toHaveLength(0);
  });
  it("n’annule jamais un document déjà signé", async () => {
    m.single.mockResolvedValue({ data: { prestataire: "youtrust", signee_le: "2026-10-18" }, error: null });
    expect((await annulerDemandeSignature("org", "demande")).erreur).toContain("déjà été signée");
    expect(annulations()).toHaveLength(0);
  });
  it("la demande manuelle reste annulable", async () => {
    m.single.mockResolvedValue({ data: { prestataire: "manuel", signee_le: null }, error: null });
    expect((await annulerDemandeSignature("org", "demande")).succes).toBeTruthy();
    expect(annulations()).toHaveLength(1);
  });
  it("le superviseur sans rôle de gestion ne peut annuler", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    expect((await annulerDemandeSignature("org", "demande")).erreur).toBeTruthy();
    expect(m.single).not.toHaveBeenCalled(); expect(annulations()).toHaveLength(0);
  });
});
