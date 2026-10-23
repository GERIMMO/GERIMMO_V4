import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
import { simulerConservation } from "@/app/actions/retention";

beforeEach(() => vi.resetAllMocks());
describe("bilan de conservation sans suppression", () => {
  it.each([false, null, "true"])("refuse les droits non confirmés (%s)", async data => {
    rpc.mockResolvedValue({ data, error: null });
    expect((await simulerConservation()).erreur).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("ne retourne que le bilan et n'appelle aucune purge", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: {
      categories: [{ categorie: "invitation:locataire", echus: 2, actif: false, duree_mois: 3, libelle: "Invitations" }],
      preuves_protegees: 8, suppressions: 0,
    }, error: null });
    expect(await simulerConservation()).toMatchObject({ preuves_protegees: 8, categories: [expect.objectContaining({ echus: 2 })] });
    expect(rpc.mock.calls.map(c => c[0])).toEqual(["is_permanent_super_admin", "simuler_conservation_contacts"]);
  });
  it.each([null, { suppressions: 1, categories: [] }, { suppressions: 0, categories: null }])("refuse un résultat inattendu", async data => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data, error: null });
    expect((await simulerConservation()).erreur).toContain("indisponible");
  });
});
