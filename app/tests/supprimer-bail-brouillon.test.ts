import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), revalider: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalider }));
import { supprimerBailBrouillon } from "@/app/actions/supprimer-bail-brouillon";
const org = "00000000-0000-4000-8000-000000000001", bail = "00000000-0000-4000-8000-000000000002", lot = "00000000-0000-4000-8000-000000000003", bien = "00000000-0000-4000-8000-000000000004";
beforeEach(() => { vi.clearAllMocks(); m.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { rpc: m.rpc } }); });
it("refuse une identité absente et ne tente aucune suppression", async () => {
  m.acces.mockResolvedValue({user:null});
  expect(await supprimerBailBrouillon(org,bail)).toHaveProperty("erreur"); expect(m.rpc).not.toHaveBeenCalled();
});
it("refuse les identifiants invalides", async () => {
  expect(await supprimerBailBrouillon(org,"invalide")).toHaveProperty("erreur"); expect(m.acces).not.toHaveBeenCalled();
});
it("actualise le lot et ses listes uniquement après confirmation en base", async () => {
  m.rpc.mockResolvedValue({ data: {bail_id:bail,lot_id:lot,bien_id:bien},error:null });
  expect(await supprimerBailBrouillon(org,bail)).toMatchObject({succes:"Brouillon supprimé.",retour:`/agence/${org}/parc/${bien}/lots/${lot}#baux`});
  expect(m.rpc).toHaveBeenCalledWith("supprimer_bail_brouillon",{p_org:org,p_bail:bail});
  expect(m.revalider).toHaveBeenCalledWith(`/agence/${org}/parc/${bien}/lots/${lot}`);
  expect(m.revalider).toHaveBeenCalledWith(`/agence/${org}/baux/${bail}`);
});
it("affiche le refus de la base sans annoncer de suppression", async () => {
  m.rpc.mockResolvedValue({ data:null,error:{message:"Seuls les baux en brouillon peuvent être supprimés."} });
  expect(await supprimerBailBrouillon(org,bail)).toHaveProperty("erreur"); expect(m.revalider).not.toHaveBeenCalled();
});
it("ne confirme pas une réponse vide ou concernant un autre contrat", async () => {
  for (const data of [null,{bail_id:lot,lot_id:lot,bien_id:bien}]) {
    m.rpc.mockResolvedValue({ data,error:null });
    expect(await supprimerBailBrouillon(org,bail)).toHaveProperty("erreur");
  }
  expect(m.revalider).not.toHaveBeenCalled();
});
