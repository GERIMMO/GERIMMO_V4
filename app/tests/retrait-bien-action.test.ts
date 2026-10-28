/**
 * Retirer un bien du parc, ou l'y remettre (audit du 27/09) : la règle vit en base (`retirer_bien`, `retablir_bien`), l'action
 * garde l'accès du gérant, traduit le refus et rafraîchit les quatre écrans concernés. Audit final du 27/10 (COD-15) :
 * aucun test ne la citait. Sans base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: { id: "gerant" } as { id: string } | null, rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({ supabase: { rpc: m.rpc }, user: m.user, role: m.user ? "admin_agence" : null }) }));

import { retablirBien, retirerBien } from "@/app/actions/retrait-bien";

const ORG = "00000000-0000-4000-8000-000000000001", BIEN = "00000000-0000-4000-8000-000000000002";
const ECRANS = [`/agence/${ORG}/parc/${BIEN}`, `/agence/${ORG}/parc`, `/agence/${ORG}/abonnement`, `/agence/${ORG}`];

beforeEach(() => { vi.clearAllMocks(); m.user = { id: "gerant" }; m.rpc.mockResolvedValue({ data: null, error: null }); });

describe.each([
  ["retirer", retirerBien, "retirer_bien", "n'est plus compté"],
  ["rétablir", retablirBien, "retablir_bien", "de nouveau compté"],
] as const)("%s un bien du parc", (_nom, action, fonction, attendu) => {
  it("refuse sans adhésion gérante, sans toucher la base", async () => {
    m.user = null;
    expect(await action(ORG, BIEN, {}, new FormData())).toEqual({ erreur: "Accès refusé." });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("un refus de la base (bail ou mandat en cours) est rendu en français, rien n'est rafraîchi", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Ce bien porte un bail en cours." } });
    expect(await action(ORG, BIEN, {}, new FormData())).toEqual({ erreur: "Ce bien porte un bail en cours." });
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("cas nominal : la fonction de base reçoit l'organisation et le bien, les quatre écrans sont rafraîchis", async () => {
    const retour = await action(ORG, BIEN, {}, new FormData());
    expect(m.rpc).toHaveBeenCalledWith(fonction, { p_org: ORG, p_bien: BIEN });
    expect(retour.succes).toContain(attendu);
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual(ECRANS);
  });
});
