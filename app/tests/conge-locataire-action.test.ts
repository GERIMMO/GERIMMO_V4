/**
 * L'action « donner mon congé » du locataire : une intention transmise au gestionnaire, rien d'irréversible (RM-A3 : le congé
 * se donne par lettre recommandée). Audit final du 27/10 (COD-15) : aucun test ne la citait. Sans base : refus sans
 * session, refus de la base rendu en français avec la saisie conservée, cas nominal qui rafraîchit l'espace.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: { id: "locataire" } as { id: string } | null, rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) }, rpc: m.rpc }),
}));

import { donnerMonConge } from "@/app/actions/conge-locataire";

const ORG = "00000000-0000-4000-8000-000000000001";
const form = (motif?: string) => { const f = new FormData(); if (motif !== undefined) f.set("motif", motif); return f; };

beforeEach(() => { vi.clearAllMocks(); m.user = { id: "locataire" }; m.rpc.mockResolvedValue({ data: null, error: null }); });

describe("donner mon congé (locataire)", () => {
  it("refuse sans session, sans toucher la base", async () => {
    m.user = null;
    expect(await donnerMonConge(ORG, {}, form("Je déménage"))).toEqual({ erreur: "Vous n'êtes pas connecté." });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("transmet l'intention à la base, motif épuré ; sans motif, null", async () => {
    await donnerMonConge(ORG, {}, form("  Mutation professionnelle  "));
    expect(m.rpc).toHaveBeenCalledWith("mon_conge_locataire", { p_org: ORG, p_motif: "Mutation professionnelle" });
    await donnerMonConge(ORG, {}, form("   "));
    expect(m.rpc).toHaveBeenLastCalledWith("mon_conge_locataire", { p_org: ORG, p_motif: null });
  });

  it("un refus de la base est rendu en français, la saisie conservée pour la reposer", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Aucun bail en cours pour ce compte." } });
    const retour = await donnerMonConge(ORG, {}, form("Je pars"));
    expect(retour.erreur).toBe("Aucun bail en cours pour ce compte.");
    expect(retour.valeurs).toEqual({ motif: "Je pars" });
    expect(retour.succes).toBeUndefined();
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("cas nominal : le gestionnaire est prévenu, la lettre recommandée reste à envoyer, l'espace est rafraîchi", async () => {
    const retour = await donnerMonConge(ORG, {}, form("Je pars"));
    expect(retour.succes).toContain("lettre recommandée");
    expect(retour.erreur).toBeUndefined();
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual([`/locataire/${ORG}`, `/locataire/${ORG}/logement`]);
  });
});
