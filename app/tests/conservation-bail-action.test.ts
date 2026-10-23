/**
 * Gel de la suppression des pièces d'un bail (plan de conformité du 23/10/2026, lot 1E) — action serveur, sans base :
 * contrôles de saisie avant tout appel, appel de `geler_conservation_bail` (la base plafonne à douze mois, journalise),
 * levée du gel. La partie base est dans tests/conservation-prospection-base.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
import { gelerConservationBail } from "@/app/actions/conservation-bail";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
const form = (valeurs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(valeurs)) f.set(k, v); return f; };
const BASE = { orgId: ORG, bailId: BAIL, base: `/espace/${ORG}`, geste: "geler", jusqu_au: "2027-06-30", motif: "Contestation du dépôt de garantie" };

beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: {}, error: null }); });

describe("gel de la conservation d'un bail", () => {
  it("refuse avant tout appel : bail mal formé, date absente, motif trop court", async () => {
    expect((await gelerConservationBail({}, form({ ...BASE, bailId: "x" }))).erreur).toMatch(/introuvable/);
    expect((await gelerConservationBail({}, form({ ...BASE, jusqu_au: "" }))).erreur).toMatch(/date de fin/);
    expect((await gelerConservationBail({}, form({ ...BASE, motif: "abc" }))).erreur).toMatch(/litige/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pose le gel par la base, puis rafraîchit la fiche du bail", async () => {
    const r = await gelerConservationBail({}, form(BASE));
    expect(r.succes).toMatch(/Suppression suspendue/);
    expect(rpc).toHaveBeenCalledWith("geler_conservation_bail", { p_bail: BAIL, p_jusqu_au: "2027-06-30", p_motif: "Contestation du dépôt de garantie" });
    expect(revalidatePath).toHaveBeenCalledWith(`/espace/${ORG}/baux/${BAIL}`);
  });

  it("lève le gel sans date ni motif ; le refus de la base est traduit", async () => {
    expect((await gelerConservationBail({}, form({ ...BASE, geste: "lever", jusqu_au: "", motif: "" }))).succes).toMatch(/Gel levé/);
    expect(rpc).toHaveBeenLastCalledWith("geler_conservation_bail", { p_bail: BAIL, p_jusqu_au: null, p_motif: null });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Un gel dure douze mois au plus ; il se renouvelle ensuite si le litige continue" } });
    expect((await gelerConservationBail({}, form(BASE))).erreur).toMatch(/douze mois au plus/);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Bail introuvable" } });
    expect((await gelerConservationBail({}, form(BASE))).erreur).toMatch(/pas accessible/);
  });
});
