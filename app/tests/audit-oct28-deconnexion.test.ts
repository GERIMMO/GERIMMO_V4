import {describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({signOut:vi.fn(),getSession:vi.fn(),cookieDelete:vi.fn(),redirect:vi.fn((url:string)=>{throw new Error(`NEXT_REDIRECT ${url}`)})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{signOut:mocks.signOut,getSession:mocks.getSession}})}));
vi.mock("next/headers",()=>({cookies:async()=>({delete:mocks.cookieDelete})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
import {seDeconnecter} from "@/app/actions/auth";
describe("Déconnexion : ne pas annoncer une révocation en échec",()=>{
 it("une réponse error conserve le témoin et ne redirige pas vers un succès",async()=>{
  mocks.getSession.mockResolvedValue({data:{session:{access_token:"fictif"}},error:null});
  mocks.signOut.mockResolvedValue({error:{name:"AuthRetryableFetchError",message:"service temporairement indisponible",status:503}});
  await expect(seDeconnecter()).rejects.toThrow("La déconnexion n’a pas pu être confirmée");
  expect(mocks.cookieDelete).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
 });
});

it("session locale fermée mais révocation distante non confirmée : avertissement explicite",async()=>{
 vi.clearAllMocks();
 mocks.signOut.mockResolvedValue({error:{message:"indisponible"}});
 mocks.getSession.mockResolvedValue({data:{session:null},error:null});
 await expect(seDeconnecter()).rejects.toThrow("NEXT_REDIRECT /connexion?raison=deconnecte-localement");
 expect(mocks.cookieDelete).toHaveBeenCalledWith("gerimmo-derniere-activite");
});
