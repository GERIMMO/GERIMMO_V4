/**
 * La décision de la supervision sur une information de veille (publier ou écarter). Audit final (COD-15, relecture du
 * 28/10) : aucun test n'importait l'action. Sans base : supervision exigée, décision bornée, état attendu transmis, refus
 * de la base rendus en français.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ superadmin: true, rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));

import { deciderVeille } from "@/app/actions/veille";

const ID = "00000000-0000-4000-8000-000000000001";
const form = (champs: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const decision = (sur: Record<string, string | string[]> = {}) =>
  form({ decision: "publier", resume: "Nouveau plafond de loyer en zone tendue.", action: "Vérifier vos baux.", publics: ["agence", "proprietaire"], etat_attendu: "a_examiner", ...sur });

beforeEach(() => {
  vi.clearAllMocks(); m.superadmin = true;
  m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: m.superadmin, error: null } : { data: null, error: null }));
});

describe("décider d'une information de veille", () => {
  it("refuse hors supervision, sans décider", async () => {
    m.superadmin = false;
    expect(await deciderVeille(ID, {}, decision())).toEqual({ erreur: "Accès réservé à la supervision." });
    expect(m.rpc.mock.calls.map(([n]) => n)).toEqual(["is_permanent_super_admin"]);
  });

  it("refuse une décision inconnue", async () => {
    expect(await deciderVeille(ID, {}, decision({ decision: "supprimer" }))).toEqual({ erreur: "Choisissez une décision." });
    expect(m.rpc.mock.calls.map(([n]) => n)).not.toContain("decider_veille");
  });

  it("publie avec l'état affiché, les publics et le résumé ; rafraîchit le brief et les deux pages de veille", async () => {
    const retour = await deciderVeille(ID, {}, decision());
    expect(m.rpc).toHaveBeenCalledWith("decider_veille", {
      p_id: ID, p_publier: true, p_resume: "Nouveau plafond de loyer en zone tendue.", p_action: "Vérifier vos baux.",
      p_publics: ["agence", "proprietaire"], p_application: null, p_statut_attendu: "a_examiner",
    });
    expect(retour.succes).toContain("disponible");
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual(["/admin/brief", "/admin/veille", "/veille"]);
  });

  it("écarte ; un état attendu inconnu n'est pas transmis tel quel", async () => {
    expect((await deciderVeille(ID, {}, decision({ decision: "ecarter", etat_attendu: "n'importe" }))).succes).toContain("retirée");
    expect(m.rpc).toHaveBeenCalledWith("decider_veille", expect.objectContaining({ p_publier: false, p_statut_attendu: null }));
  });

  it("une information qui a changé d'état depuis l'affichage : demander de recharger ; autre refus : vérifier la saisie", async () => {
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: null, error: { message: "L’information a changé d’état." } }));
    expect((await deciderVeille(ID, {}, decision())).erreur).toContain("rechargez la page");
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: null, error: { message: "check constraint" } }));
    expect((await deciderVeille(ID, {}, decision())).erreur).toBe("Vérifiez le résumé, l’action conseillée, les publics et la date.");
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
