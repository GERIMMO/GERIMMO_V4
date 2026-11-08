import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({precedent: null as Record<string,unknown>|null, rpc:vi.fn(), from:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:vi.fn(async()=>({user:{id:"test"},supabase:{from:mocks.from,rpc:mocks.rpc}}))}));
vi.mock("@/lib/documents/rendu",()=>({rendrePdf:vi.fn()}));
vi.mock("@/lib/ged-depot",()=>({preparerFichierGed:vi.fn(),abandonnerPieceGed:vi.fn()}));
import { preparerRegularisationFournitures } from "../src/app/actions/regularisation-fournitures";
const org="11111111-1111-4111-8111-111111111111";
const bail="22222222-2222-4222-8222-222222222222";
const facture="33333333-3333-4333-8333-333333333333";
beforeEach(()=>{
  mocks.rpc.mockReset().mockResolvedValue({data:"brouillon",error:null});
  mocks.precedent={id:"brouillon",bail_id:bail,annee:2026,regularisation_id:null,source:{factures:[]}};
  mocks.from.mockImplementation((table:string)=>{
    const query:Record<string,unknown>={};
    for(const method of ["select","eq"]) query[method]=()=>query;
    query.maybeSingle=async()=>({data:table==="reglages_avis_decompte"?{automatique:false}:mocks.precedent,error:null});
    query.single=async()=>({data:{...mocks.precedent,source:{factures:[{facture_id:facture}] }},error:null});
    return query;
  });
});
function form(){const f=new FormData();f.set("annee","2026");f.set("ligne","oui");f.set("facture_id",facture);return f;}
describe("préparation annuelle depuis une facture",()=>{
  it("actualise un brouillon antérieur à la nouvelle facture",async()=>{
    const r=await preparerRegularisationFournitures(org,bail,{},form());
    expect(mocks.rpc).toHaveBeenCalledWith("preparer_regularisation_fourniture",{p_org:org,p_bail:bail,p_annee:2026});
    expect(r.brouillon?.source.factures[0].facture_id).toBe(facture);
  });
  it("réutilise le brouillon lorsque la facture est déjà incluse",async()=>{
    mocks.precedent!.source={factures:[{facture_id:facture}]};
    await preparerRegularisationFournitures(org,bail,{},form());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("bloque une facture supplémentaire sur un exercice clôturé",async()=>{
    mocks.precedent!.regularisation_id="reg";
    const r=await preparerRegularisationFournitures(org,bail,{},form());
    expect(r.erreur).toContain("déjà clôturé");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(r.succes).toBeUndefined();
  });
});
