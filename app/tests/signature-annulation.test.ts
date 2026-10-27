import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), single: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { annulerDemandeSignature, partagerDocument } from "@/app/actions/signature";
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
    expect(m.revalidate).not.toHaveBeenCalled();
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
    expect(m.revalidate).toHaveBeenCalledWith("/agence/org/documents");
    expect(m.revalidate).toHaveBeenCalledWith("/espace/org/documents");
  });
  it("le superviseur sans rôle de gestion ne peut annuler", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    expect((await annulerDemandeSignature("org", "demande")).erreur).toBeTruthy();
    expect(m.single).not.toHaveBeenCalled(); expect(annulations()).toHaveLength(0);
  });
});

describe("Partage du document depuis sa fiche", () => {
  for (const partager of [true, false]) {
    it(`actualise les deux espaces après ${partager ? "mise à disposition" : "retrait"}`, async () => {
      expect((await partagerDocument("org", "doc", partager)).succes).toBeTruthy();
      expect(m.rpc).toHaveBeenCalledWith("partager_document_locataire", { p_org: "org", p_doc: "doc", p_partager: partager });
      expect(m.revalidate).toHaveBeenCalledWith("/agence/org/documents");
      expect(m.revalidate).toHaveBeenCalledWith("/espace/org/documents");
    });
  }

  it("n’annonce aucune actualisation après un refus du serveur", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Accès refusé" } });
    expect((await partagerDocument("org", "doc", true)).erreur).toBeTruthy();
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
