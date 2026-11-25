import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), single: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { partagerDocument } from "@/app/actions/signature";
beforeEach(() => {
  vi.resetAllMocks();
  const q = { select: () => q, eq: () => q, single: m.single };
  m.acces.mockResolvedValue({ user: { id: "owner" }, supabase: { rpc: m.rpc, from: () => q } });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.single.mockResolvedValue({ data: { prestataire: "youtrust", external_request_id: "req", signee_le: null }, error: null });
});
// Décision Q21 du 24/11 (lot D5) : l'ancien parcours « télécharger, signer, redéposer » est retiré, et avec lui
// l'action d'annulation d'une demande manuelle. Les quatre cas « Archives de l'ancien prestataire » qui l'exerçaient
// sont retirés avec elle ; ce fichier garde le partage du document, et vérifie que l'action ne revient pas.
describe("Ancien parcours de signature manuelle (retiré le 24/11)", () => {
  it("le module des actions n'expose plus ni l'envoi ni l'annulation d'une demande manuelle", async () => {
    const actions = await import("@/app/actions/signature");
    expect(Object.keys(actions).sort()).toEqual(["enregistrerSignature", "partagerDocument", "retirerSignature"]);
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
