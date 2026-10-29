import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),user:true,revalider:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:m.user?{id:"locataire"}:null}})},rpc:m.rpc})}));
vi.mock("next/cache",()=>({revalidatePath:m.revalider}));
import { modifierConsentementDocument } from "@/app/actions/consentements-documents";
const form=(accepte="oui")=>{const f=new FormData();f.set("accepte",accepte);f.set("email","locataire@test.local");return f;};
beforeEach(()=>{vi.clearAllMocks();m.user=true;m.rpc.mockResolvedValue({data:true,error:null});});
it("exige un compte et un choix explicite",async()=>{
 m.user=false;expect((await modifierConsentementDocument("org","quittances",{},form())).erreur).toContain("Connectez-vous");expect(m.rpc).not.toHaveBeenCalled();
 m.user=true;expect((await modifierConsentementDocument("org","quittances",{},form(""))).erreur).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
});
it("transmet seulement le type de document, l’accord et l’adresse relue, jamais une personne choisie par l’appelant",async()=>{
 expect((await modifierConsentementDocument("org","quittances",{},form())).accepte).toBe(true);
 expect(m.rpc).toHaveBeenCalledWith("modifier_consentement_document",{p_org:"org",p_nature:"quittances",p_accepte:true,p_email:"locataire@test.local"});
 expect(m.revalider).toHaveBeenCalledWith("/locataire/org/documents");
});
it("le retrait du recommandé reste distinct de la quittance",async()=>{
 m.rpc.mockResolvedValue({data:false,error:null});expect((await modifierConsentementDocument("org","recommandes",{},form("non"))).accepte).toBe(false);
 expect(m.rpc).toHaveBeenCalledWith("modifier_consentement_document",expect.objectContaining({p_nature:"recommandes",p_accepte:false}));
});
it("ne confirme pas un retour incohérent ou une erreur de droits",async()=>{
 m.rpc.mockResolvedValue({data:null,error:null});expect((await modifierConsentementDocument("org","quittances",{},form())).erreur).toContain("pas pu être confirmé");
 m.rpc.mockResolvedValue({data:null,error:{message:"Accès refusé"}});expect((await modifierConsentementDocument("org","quittances",{},form())).erreur).toBeTruthy();expect(m.revalider).not.toHaveBeenCalled();
});
