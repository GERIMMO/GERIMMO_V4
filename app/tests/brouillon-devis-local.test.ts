import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleDevisLocal, contenuDevisLocal, sauverDevisLocal, lireDevisLocal, effacerDevisLocal, DUREE_DEVIS_LOCAL, type BrouillonDevisLocal } from "@/lib/brouillon-devis-local";
const cle = cleDevisLocal("compte-a", "demande-a");
const copie = (): BrouillonDevisLocal => ({ version:1, copieId:"d1d71ee6-931f-40be-9c34-3106053d4993", enregistreLe:Date.now(), revision:1, contenu:{diagnostic:"TEST Fuite",delai:"",duree:"",contraintes:"",observations:"",valide_jusqu_au:"",lignes:[{code:"",libelle:"Joint TEST",quantite:"1,",prix:"",tva:""}]} });
beforeEach(()=>{const donnees=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>donnees.get(k)??null,setItem:(k:string,v:string)=>donnees.set(k,v),removeItem:(k:string)=>donnees.delete(k)});});
afterEach(()=>vi.unstubAllGlobals());
it("conserve une ligne incomplète telle que saisie sans transformer un champ vide en zéro",()=>{
  const b=copie();expect(sauverDevisLocal(cle,b)).toBe(true);expect(lireDevisLocal(cle)).toEqual(b);
  expect(lireDevisLocal(cleDevisLocal("compte-b","demande-a"))).toBeNull();
  expect(lireDevisLocal(cleDevisLocal("compte-a","demande-b"))).toBeNull();
});
it("ne conserve pas la validation, les pièces ou les champs techniques",()=>{
  const f=new FormData();f.set("diagnostic","TEST");f.set("lignes_devis_saisie",JSON.stringify(copie().contenu.lignes));
  f.set("validation_artisan","oui");f.set("$ACTION_ID","secret");f.set("password","secret");f.set("piece",new Blob(["privé"]),"identite.pdf");
  expect(contenuDevisLocal(f)).toMatchObject({diagnostic:"TEST",lignes:[{quantite:"1,",prix:"",tva:""}]});
  expect(JSON.stringify(contenuDevisLocal(f))).not.toMatch(/validation_artisan|secret|identite|privé/);
});
it.each(["illisible",JSON.stringify({...copie(),version:2}),JSON.stringify({...copie(),revision:-1}),JSON.stringify({...copie(),enregistreLe:Date.now()-DUREE_DEVIS_LOCAL-1}),JSON.stringify({...copie(),enregistreLe:Date.now()+120000}),JSON.stringify({...copie(),contenu:{...copie().contenu,lignes:[null]}}),"x".repeat(200001)])("ignore une copie invalide ou expirée (%#)",brut=>{localStorage.setItem(cle,brut);expect(lireDevisLocal(cle)).toBeNull();});
it("ne supprime pas une modification plus récente lorsque la confirmation d’enregistrement arrive",()=>{
  const avant=copie();sauverDevisLocal(cle,avant);
  const apres={...avant,enregistreLe:avant.enregistreLe+1,contenu:{...avant.contenu,diagnostic:"Nouvelle saisie"}};
  sauverDevisLocal(cle,apres);effacerDevisLocal(cle,avant);expect(lireDevisLocal(cle)).toEqual(apres);
  effacerDevisLocal(cle,apres);expect(lireDevisLocal(cle)).toBeNull();
});
it("signale le refus du stockage sans bloquer la saisie ou effacer un autre brouillon",()=>{
  vi.stubGlobal("localStorage",{getItem:()=>{throw Error("Refus");},setItem:()=>{throw Error("Quota");}});
  expect(lireDevisLocal(cle)).toBeNull();expect(sauverDevisLocal(cle,copie())).toBe(false);expect(()=>effacerDevisLocal(cle,copie())).not.toThrow();
});
