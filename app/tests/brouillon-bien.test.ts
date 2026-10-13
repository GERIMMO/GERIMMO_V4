import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleBrouillonBien, champsBrouillonBien, sauverBrouillonBien, lireBrouillonBien, effacerBrouillonBien, DUREE_BROUILLON_BIEN, type BrouillonBien } from "@/lib/brouillon-bien";
const cle = cleBrouillonBien("compte-a", "org-a");
function brouillon(): BrouillonBien { return { version:1, enregistreLe:Date.now(), creationId:"d1d71ee6-931f-40be-9c34-3106053d4993", etape:1, type:"appartement", divise:false, champs:{nom:"TEST Lot",copropriete:"on"}, lots:[{nom:"",surface:"",pieces:""}],lotUnique:{nom:"T2",surface:"42.25",pieces:"2"} }; }
beforeEach(()=>{const donnees=new Map<string,string>(); vi.stubGlobal("localStorage",{getItem:(k:string)=>donnees.get(k)??null,setItem:(k:string,v:string)=>donnees.set(k,v),removeItem:(k:string)=>donnees.delete(k)});});
afterEach(()=>vi.unstubAllGlobals());
it("garde les saisies et la même clé de création, isolées par compte et organisation",()=>{
 const b=brouillon(); expect(sauverBrouillonBien(cle,b)).toBe(true);
 expect(lireBrouillonBien(cle)).toMatchObject(b);
 expect(lireBrouillonBien(cleBrouillonBien("compte-b","org-a"))).toBeNull();
 expect(lireBrouillonBien(cleBrouillonBien("compte-a","org-b"))).toBeNull();
});
it.each(["illisible",JSON.stringify({version:8}),JSON.stringify({...brouillon(),creationId:"cle invalide"}),JSON.stringify({...brouillon(),enregistreLe:Date.now()-DUREE_BROUILLON_BIEN-1}),JSON.stringify({...brouillon(),lots:[null]})])("ignore les brouillons corrompus ou périmés : %s",brut=>{
 localStorage.setItem(cle,brut);expect(lireBrouillonBien(cle)).toBeNull();
});
it("ne conserve que les champs du logement, sans pièce ou secret",()=>{
 const f=new FormData();f.set("nom","T2");f.set("$ACTION_ID","secret");f.set("password","secret");f.set("creation_id","secret");f.set("piece",new Blob(["privé"]),"identite.pdf");
 const champs=champsBrouillonBien(f);expect(champs.nom).toBe("T2");expect(JSON.stringify(champs)).not.toMatch(/secret|identite|privé/);
});
it("l’indisponibilité du stockage n’empêche pas de remplir le formulaire",()=>{
 vi.stubGlobal("localStorage",{getItem:()=>{throw Error("Refus");},setItem:()=>{throw Error("Quota");}});
 expect(lireBrouillonBien(cle)).toBeNull();expect(sauverBrouillonBien(cle,brouillon())).toBe(false);expect(()=>effacerBrouillonBien(cle,brouillon().creationId)).not.toThrow();
});
it("efface la création confirmée sans effacer une autre préparation",()=>{
 const b=brouillon();sauverBrouillonBien(cle,b);effacerBrouillonBien(cle,"autre-cle");expect(lireBrouillonBien(cle)).not.toBeNull();effacerBrouillonBien(cle,b.creationId);expect(lireBrouillonBien(cle)).toBeNull();
});
