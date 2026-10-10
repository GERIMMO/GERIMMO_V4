import { beforeEach, describe, expect, it, vi } from "vitest";
import { deposerPieceDossier } from "@/app/actions/dossier";
const m=vi.hoisted(()=>({acces:vi.fn(),depot:vi.fn(),revalidate:vi.fn(),update:vi.fn(),eq:vi.fn(),lien:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));
vi.mock("@/lib/ged-depot",()=>({deposerFichierGed:m.depot}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
function preparer({demande=true,type="piece_identite",echecSolde=false,echecLien=false}={}){
  let modification=false;
  const q={select:vi.fn(),eq:m.eq,is:vi.fn(),update:m.update,maybeSingle:vi.fn(async()=>({data:modification ? (echecSolde?null:{id:"demande"}) : demande ? {id:"demande",type}:null,error:modification&&echecSolde?{message:"Indisponible"}:null}))};
  q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.is.mockReturnValue(q);m.update.mockImplementation(()=>{modification=true;return q;});
  m.lien.mockResolvedValue({error:echecLien?{message:"Rattachement refusé"}:null});
  m.acces.mockResolvedValue({user:{id:"proprietaire"},supabase:{from:(t:string)=>t==="pieces_demandees"?q:{insert:m.lien}}});
}
function form(){const f=new FormData();f.set("demande_id","demande");f.set("type","piece_identite");f.set("fichier",new File(["test"],"document.pdf"));return f;}
beforeEach(()=>{vi.clearAllMocks();preparer();m.depot.mockResolvedValue({documentId:"document"});});
describe("dépôt du propriétaire en réponse à une demande",()=>{
  it("rattache la pièce à la bonne personne puis solde exactement cette demande",async()=>{
    expect((await deposerPieceDossier("org","personne",{},form())).succes).toBeTruthy();
    expect(m.eq).toHaveBeenCalledWith("organization_id","org");expect(m.eq).toHaveBeenCalledWith("person_id","personne");
    expect(m.lien).toHaveBeenCalledWith({document_id:"document",organization_id:"org",entite:"personne",entite_id:"personne"});
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({document_id:"document",satisfaite_le:expect.any(String)}));
    expect(m.revalidate).toHaveBeenCalledWith("/locataire/org/documents");
  });
  it("ne dépose pas pour une demande absente ou déjà satisfaite",async()=>{
    preparer({demande:false});expect((await deposerPieceDossier("org","personne",{},form())).erreur).toBeTruthy();expect(m.depot).not.toHaveBeenCalled();
  });
  it("refuse un type différent de la demande",async()=>{
    preparer({type:"justificatif"});expect((await deposerPieceDossier("org","personne",{},form())).erreur).toBeTruthy();expect(m.depot).not.toHaveBeenCalled();
  });
  it("ne marque pas reçue une pièce dont le dépôt a échoué",async()=>{
    m.depot.mockResolvedValue({erreur:"Fichier refusé"});expect((await deposerPieceDossier("org","personne",{},form())).erreur).toBeTruthy();expect(m.update).not.toHaveBeenCalled();
  });
  it("ne marque pas reçue une pièce dont le rattachement a échoué",async()=>{
    preparer({echecLien:true});expect((await deposerPieceDossier("org","personne",{},form())).erreur).toBeTruthy();expect(m.update).not.toHaveBeenCalled();
  });
  it("distingue le dépôt confirmé d’un suivi de demande non confirmé",async()=>{
    preparer({echecSolde:true});const r=await deposerPieceDossier("org","personne",{},form());expect(r.succes).toBeTruthy();expect(r.avertissement).toBeTruthy();
  });
});
