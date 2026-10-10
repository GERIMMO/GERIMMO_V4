import {beforeEach,it,expect,vi} from "vitest";
import {modifierEtapeBail} from "@/app/actions/etapes-bail";
const m=vi.hoisted(()=>({acces:vi.fn(),update:vi.fn(),eq:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
function contexte({user=true,etat="brouillon",absent=false,modifies=true,error=null as null|{message:string}}={}){
 const q={select:vi.fn(),eq:m.eq,is:vi.fn(),maybeSingle:vi.fn(),update:m.update};
 q.eq.mockReturnValue(q);q.is.mockReturnValue(q);q.select.mockImplementation(()=>q);q.update.mockReturnValue({...q,select:async()=>({data:modifies?[{id:"bail"}]:[],error})});
 // La chaîne update garde ses filtres et sa réponse de mutation.
 const mutation={eq:vi.fn(),is:vi.fn(),select:async()=>({data:modifies?[{id:"bail"}]:[],error})};mutation.eq.mockReturnValue(mutation);mutation.is.mockReturnValue(mutation);q.update.mockReturnValue(mutation);
 q.maybeSingle.mockResolvedValue({data:absent?null:{etat,lot_id:"lot",type:"nu",loyer_hc:500,charges:40,depot_garantie:400,charges_mode:"provision",lot:{meuble:false,surface_m2:46}},error:null});
 m.acces.mockResolvedValue({user:user?{id:"moi"}:null,supabase:{from:()=>q}});return mutation;
}
function f(){const form=new FormData();Object.entries({type:"nu",date_debut:"2026-10-09",jour_echeance:"1",locataire_principal:"pirate"}).forEach(([k,v])=>form.set(k,v));return form;}
beforeEach(()=>{vi.clearAllMocks();contexte();});
it("refuse les utilisateurs non connectés",async()=>{contexte({user:false});expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();});
it.each(["actif","preavis","termine"])("refuse de modifier le bail %s",async etat=>{contexte({etat});expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();});
it("refuse un bail inaccessible",async()=>{contexte({absent:true});expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("erreur");expect(m.update).not.toHaveBeenCalled();});
it("n’enregistre que les données de l’étape dans le brouillon autorisé",async()=>{const mutation=contexte();expect(await modifierEtapeBail("org","bail","bail",{},f())).toHaveProperty("succes");expect(m.eq).toHaveBeenCalledWith("organization_id","org");expect(m.update.mock.calls[0][0]).not.toHaveProperty("locataire_principal");expect(m.update.mock.calls[0][0]).not.toHaveProperty("jour_echeance");expect(mutation.eq).toHaveBeenCalledWith("etat","brouillon");expect(mutation.eq).toHaveBeenCalledWith("loyer_hc",500);});
it("refuse de confirmer une écriture vide ou devenue obsolète",async()=>{contexte({modifies:false});const r=await modifierEtapeBail("org","bail","bail",{},f());expect(r.erreur).toBeTruthy();expect(r.valeurs?.date_debut).toBe("2026-10-09");expect(m.revalidate).not.toHaveBeenCalled();});
it("garde les saisies après une erreur de base",async()=>{contexte({error:{message:"Écriture refusée"}});const r=await modifierEtapeBail("org","bail","bail",{},f());expect(r.erreur).toBeTruthy();expect(r.valeurs?.date_debut).toBe("2026-10-09");});

it("commence un brouillon sans imposer les étapes personnes et montants à l’avance",async()=>{
 const {commencerBail}=await import("@/app/actions/etapes-bail");
 const insert=vi.fn();const q={select:vi.fn(),eq:vi.fn(),maybeSingle:async()=>({data:{id:"lot",meuble:false},error:null})};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);
 insert.mockReturnValue({select:()=>({single:async()=>({data:{id:"nouveau"},error:null})})});
 m.acces.mockResolvedValue({user:{id:"moi"},supabase:{from:(table:string)=>table==="lots"?q:{insert}}});
 expect(await commencerBail("org","lot","bien")).toHaveProperty("bailCree","nouveau");expect(insert).toHaveBeenCalledWith({organization_id:"org",lot_id:"lot",type:"nu",etat:"brouillon"});expect(q.eq).toHaveBeenCalledWith("bien_id","bien");expect(q.eq).toHaveBeenCalledWith("organization_id","org");
});
