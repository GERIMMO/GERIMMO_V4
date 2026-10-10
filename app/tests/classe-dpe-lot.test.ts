import { beforeEach, expect, it, vi } from "vitest";
import { corrigerClasseDpeLot } from "@/app/actions/classe-dpe-lot";
const m=vi.hoisted(()=>({acces:vi.fn(),update:vi.fn(),eq:vi.fn(),is:vi.fn(),select:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
const form=(classe="C")=>{const f=new FormData();f.set("classe_dpe",classe);return f;};
beforeEach(()=>{vi.clearAllMocks();const q={eq:m.eq,is:m.is,select:m.select};m.eq.mockReturnValue(q);m.is.mockReturnValue(q);m.update.mockReturnValue(q);m.select.mockResolvedValue({data:[{id:"dpe"}],error:null});m.acces.mockResolvedValue({user:{id:"moi"},supabase:{from:()=>({update:m.update})}});});
it("corrige le rapport actif du lot et actualise les baux sans nouveau dépôt",async()=>{
 expect(await corrigerClasseDpeLot("org","lot","dpe",{},form())).toHaveProperty("succes");
 expect(m.update).toHaveBeenCalledWith({classe_dpe:"C"});
 for(const paire of [["organization_id","org"],["lot_id","lot"],["id","dpe"],["type","dpe"]])expect(m.eq).toHaveBeenCalledWith(...paire);
 expect(m.is).toHaveBeenCalledWith("archived_at",null);expect(m.revalidate).toHaveBeenCalledWith("/agence/org/baux","layout");
});
it("refuse toute modification sans accès gérant",async()=>{m.acces.mockResolvedValue({user:null});expect(await corrigerClasseDpeLot("org","lot","dpe",{},form())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();});
it.each(["","H","c","AA"])("refuse la classe invalide %s",async classe=>{expect(await corrigerClasseDpeLot("org","lot","dpe",{},form(classe))).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();});
it("ne confirme pas une correction d’un rapport absent, archivé ou d’un autre lot",async()=>{m.select.mockResolvedValue({data:[],error:null});expect(await corrigerClasseDpeLot("org","lot","autre",{},form())).toHaveProperty("erreur");expect(m.revalidate).not.toHaveBeenCalled();});
it("remonte un refus d’écriture",async()=>{m.select.mockResolvedValue({data:null,error:{message:"Accès refusé"}});expect(await corrigerClasseDpeLot("org","lot","dpe",{},form())).toHaveProperty("erreur");expect(m.revalidate).not.toHaveBeenCalled();});
