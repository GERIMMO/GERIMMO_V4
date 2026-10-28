/**
 * Le plafond de crédits de signature réglé par la supervision (/admin/sante). Audit final (COD-15, relecture du 28/10) :
 * aucun test n'importait l'action. Sans base : saisie bornée avant tout appel, session exigée, refus en français.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: { id: "superadmin" } as { id: string } | null, rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) }, rpc: m.rpc }) }));

import { reglerBudgetSignatures } from "@/app/actions/budget-signatures";

const form = (credits: string, revision = "3") => { const f = new FormData(); f.set("credits", credits); f.set("revision", revision); return f; };
const REFUS = "Choisissez un plafond en crédits entiers ou demi-crédits.";

beforeEach(() => { vi.clearAllMocks(); m.user = { id: "superadmin" }; m.rpc.mockResolvedValue({ data: null, error: null }); });

describe("régler le plafond des signatures", () => {
  it.each([["abc", "3"], ["-1", "3"], ["1,25", "3"], ["2000000", "3"], ["10", "0"], ["10", "1,5"], ["10", ""]])(
    "refuse crédits=%j révision=%j avant tout appel", async (credits, revision) => {
      expect(await reglerBudgetSignatures({}, form(credits, revision))).toEqual({ erreur: REFUS });
      expect(m.rpc).not.toHaveBeenCalled();
    });

  it("exige une session", async () => {
    m.user = null;
    expect(await reglerBudgetSignatures({}, form("10"))).toEqual({ erreur: "Connectez-vous à votre compte superadmin." });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("un refus de la base (compte non superadmin, révision dépassée) est rendu en français, rien n'est rafraîchi", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Le réglage a changé depuis votre lecture." } });
    expect(await reglerBudgetSignatures({}, form("10"))).toEqual({ erreur: "Le réglage a changé depuis votre lecture." });
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("cas nominal : demi-crédits transmis en unités, révision attendue, page de santé rafraîchie", async () => {
    const retour = await reglerBudgetSignatures({}, form("12,5", "4"));
    expect(m.rpc).toHaveBeenCalledWith("regler_budget_signature", { p_plafond: 25, p_revision: 4 });
    expect(retour.succes).toContain("Aucun crédit n’a été acheté");
    expect(m.revalidate).toHaveBeenCalledWith("/admin/sante");
  });
});
