import { beforeEach, describe, expect, it, vi } from "vitest";
import { demanderPieceLocataire, relancerPieceDemandee } from "@/app/actions/pieces-demandees";
const m = vi.hoisted(()=>({ acces:vi.fn(), notifier:vi.fn(), revalidate:vi.fn(), insert:vi.fn(), update:vi.fn(), eq:vi.fn() }));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));
vi.mock("@/lib/notifications",()=>({notifierPieceDemandee:m.notifier}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
function acces(compte: string | null, existe=true, connecte=true) {
  const q = {select:vi.fn(), eq:m.eq, is:vi.fn(), maybeSingle:vi.fn().mockResolvedValue({data:existe ? {id:"personne",account_id:compte}:null,error:null})};
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.is.mockReturnValue(q);
  const d={insert:m.insert,update:m.update,select:vi.fn(),single:vi.fn().mockResolvedValue({data:{id:"demande"},error:null})};
  m.insert.mockReturnValue(d); d.select.mockReturnValue(d);
  m.acces.mockResolvedValue({user:connecte?{id:"proprietaire"}:null,supabase:{from:(table:string)=>table==="persons"?q:d}});
}
function form(){const f=new FormData();f.set("type","piece_identite");f.set("libelle","Identité");return f;}
beforeEach(()=>{vi.clearAllMocks();acces(null);m.notifier.mockResolvedValue({envoyee:true});});
describe("demandes de justificatifs avant invitation",()=>{
  it("conserve la demande sans envoyer un lien à une personne sans accès",async()=>{
    const r=await demanderPieceLocataire("org","personne",{},form());
    expect(r.succes).toContain("invitez"); expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({organization_id:"org",person_id:"personne"}));expect(m.notifier).not.toHaveBeenCalled();
  });
  it("notifie une personne disposant déjà de son espace",async()=>{
    acces("compte"); expect((await demanderPieceLocataire("org","personne",{},form())).succes).toContain("e-mail");expect(m.notifier).toHaveBeenCalledTimes(1);
  });
  it("conserve un avertissement si l’email ne part pas",async()=>{
    acces("compte");m.notifier.mockResolvedValue({envoyee:false});expect((await demanderPieceLocataire("org","personne",{},form())).avertissement).toContain("n'a pas pu partir");
  });
  it("refuse une fiche inaccessible avant toute demande",async()=>{
    acces(null,false);expect((await demanderPieceLocataire("org","personne",{},form())).erreur).toBeTruthy();expect(m.insert).not.toHaveBeenCalled();expect(m.eq).toHaveBeenCalledWith("organization_id","org");
  });
  it("refuse un visiteur déconnecté",async()=>{
    acces(null,true,false);expect((await demanderPieceLocataire("org","personne",{},form())).erreur).toBeTruthy();expect(m.insert).not.toHaveBeenCalled();
  });
  it("ne relance pas une personne qui n’a pas encore d’accès",async()=>{
    expect((await relancerPieceDemandee("org","personne","demande")).erreur).toContain("Invitez");expect(m.update).not.toHaveBeenCalled();expect(m.notifier).not.toHaveBeenCalled();
  });
});
