import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({lecture:vi.fn(),mutation:vi.fn(),service:vi.fn(),rpc:vi.fn(),proposition:vi.fn(),notification:vi.fn()}));
vi.mock("@/app/artisan/acces",()=>({verifierArtisanLecture:m.lecture,verifierArtisanMutation:m.mutation,verifierArtisanAction:m.mutation}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:m.service}));
vi.mock("@/lib/proposition-devis-ia",()=>({proposerDevis:m.proposition}));
vi.mock("@/lib/notifications",()=>({notifierDevisRecu:m.notification}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
import {accesPreparationDevis} from "../src/lib/parcours-devis-serveur";
import {preparerPropositionDevis,enregistrerBrouillonDevis,envoyerDevisValide,enregistrerProfilDocuments} from "../src/app/artisan/devis/actions-preparation";
const fiche={artisan_id:"artisan-A"};
beforeEach(()=>{vi.clearAllMocks();m.lecture.mockResolvedValue({fiche,supabase:{rpc:m.rpc}});m.mutation.mockResolvedValue({fiche:null,supabase:{rpc:m.rpc}});m.rpc.mockResolvedValue({data:[{sollicitation_id:"demande-A"}],error:null});m.service.mockReturnValue({});});
describe("diagnostic artisan : lecture et actions de devis",()=>{
 it("autorise seulement la lecture d’une sollicitation de la cible",async()=>{expect((await accesPreparationDevis("demande-A")).fiche).toEqual(fiche);expect(m.mutation).not.toHaveBeenCalled();});
 it("refuse une autre sollicitation avant l’accès au service",async()=>{await expect(accesPreparationDevis("demande-B")).rejects.toThrow("pas adressée");expect(m.service).not.toHaveBeenCalled();});
 it.each(["proposer","brouillon","envoyer","profil"])("refuse %s sans fournisseur ni mutation service",async(action)=>{
   const f=new FormData();
   const r=action==="proposer"?await preparerPropositionDevis("demande-A"):action==="brouillon"?await enregistrerBrouillonDevis("demande-A",f):action==="envoyer"?await envoyerDevisValide("demande-A",{},f):await enregistrerProfilDocuments({},f);
   expect(r.erreur).toBeTruthy();expect(m.mutation).toHaveBeenCalled();expect(m.service).not.toHaveBeenCalled();expect(m.proposition).not.toHaveBeenCalled();expect(m.notification).not.toHaveBeenCalled();
 });
 it("conserve l’accès à la mutation pour l’artisan réel",async()=>{m.mutation.mockResolvedValue({fiche,supabase:{rpc:m.rpc}});expect((await accesPreparationDevis("demande-A",true)).fiche).toEqual(fiche);expect(m.lecture).not.toHaveBeenCalled();});
});
