import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ acces: vi.fn(), revalider: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: mocks.acces }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalider }));
import { supprimerInventaireLigne } from "@/app/actions/baux";
beforeEach(() => vi.clearAllMocks());
function client(data: unknown, error: unknown = null) {
  const filtres: unknown[] = [];
  const q = { delete: () => q, eq: (k: string,v: unknown) => { filtres.push([k,v]); return q; }, select: async () => ({ data, error }) };
  mocks.acces.mockResolvedValue({ user: {id:"gerant"}, supabase: { from: () => q } });
  return filtres;
}
it("borne le retrait à l'organisation, au bail et à la ligne affichés", async () => {
  const filtres = client([{id:"meuble"}]);
  expect(await supprimerInventaireLigne("org","bail","meuble")).toHaveProperty("succes");
  expect(filtres).toEqual([["id","meuble"],["bail_id","bail"],["organization_id","org"]]);
  expect(mocks.revalider).toHaveBeenCalledWith("/agence/org/baux/bail");
});
it("ne confirme pas un retrait sans ligne autorisée ou déjà retirée", async () => {
  client([]); expect(await supprimerInventaireLigne("org","bail","autre")).toHaveProperty("erreur");
  expect(mocks.revalider).not.toHaveBeenCalled();
});
it("remonte le refus d'un inventaire figé", async () => {
  client(null,{message:"Inventaire figé"}); expect(await supprimerInventaireLigne("org","bail","meuble")).toHaveProperty("erreur");
  expect(mocks.revalider).not.toHaveBeenCalled();
});
