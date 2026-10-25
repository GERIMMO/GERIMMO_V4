import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),service:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:m.service}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import { offrirMois } from "@/app/actions/mois-offerts";
const compte="00000000-0000-4000-8000-000000000001",org="00000000-0000-4000-8000-000000000002",id="00000000-0000-4000-8000-000000000003";
const form=()=>{const f=new FormData();f.set("organisation",org);f.set("cadeau",id);f.set("mois","2");f.set("motif","Compensation bug");return f;};
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockImplementation(async(n:string)=>({data:n==="is_permanent_super_admin"?true:{nature:"acces",fin:"2027-01-25"},error:null}));});
describe("mois offerts : action de supervision",()=>{
 it("refuse sans MFA avant tout geste",async()=>{m.rpc.mockResolvedValue({data:false,error:null});expect((await offrirMois(compte,{},form())).erreur).toContain("second facteur");expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.service).not.toHaveBeenCalled();});
 it("prépare un aperçu sans confirmer ni appeler Stripe",async()=>{expect((await offrirMois(compte,{},form())).apercu?.fin).toBe("2027-01-25");expect(m.rpc).toHaveBeenLastCalledWith("offrir_mois_abonnement",expect.objectContaining({p_confirmer:false,p_id:id,p_mois:2}));expect(m.service).not.toHaveBeenCalled();});
 it("refuse un nombre en notation exponentielle",async()=>{const f=form();f.set("mois","1e1");expect((await offrirMois(compte,{},f)).erreur).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();});
 it("conserve le jeton et l’aperçu à la confirmation",async()=>{const f=form(),p={nature:"acces",fin:"2027-01-25"};f.set("confirmation","oui");f.set("apercu",JSON.stringify(p));expect((await offrirMois(compte,{},f)).succes).toContain("25/01/2027");expect(m.rpc).toHaveBeenLastCalledWith("offrir_mois_abonnement",expect.objectContaining({p_id:id,p_attendu:p,p_confirmer:true}));expect(m.service).not.toHaveBeenCalled();});
});
