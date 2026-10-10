import {describe,it,expect} from "vitest";
import {lireEtapeBail,indexEtapeBail,ETAPES_BAIL} from "@/lib/champs-etape-bail";
const actuel={type:"nu",loyer_hc:500,charges:40,depot_garantie:400,charges_mode:"provision",locataire_principal:"locataire",jour_echeance:1,clause_resolutoire_assurance:true};
const logement={meuble:false,surface:46};
const form=(v:Record<string,string>)=>{const f=new FormData();Object.entries(v).forEach(([k,v])=>f.set(k,v));return f;};
const dates={type:"nu",date_debut:"2026-10-09",date_conclusion_prevue:""};
const montants={loyer_hc:"500",charges:"40",depot_garantie:"400",jour_echeance:"1",charges_mode:"provision",revision_irl:"false",paiement_echeance:"echoir"};
describe("saisie progressive du bail",()=>{
 it("respecte les sept étapes demandées",()=>expect(ETAPES_BAIL.map(e=>e.id)).toEqual(["bail","personnes","logement","loyer","documents","clauses","recapitulatif"]));
 it("les dates ne remplacent ni le locataire ni le loyer ni les clauses",()=>{
  const r=lireEtapeBail("bail",form({...dates,loyer_hc:"0",locataire_principal:"autre",clauses_particulieres:"effacer"}),actuel,logement);
  expect(r.erreur).toBeUndefined(); expect(r.patch).not.toHaveProperty("loyer_hc");expect(r.patch).not.toHaveProperty("locataire_principal");expect(r.patch).not.toHaveProperty("clauses_particulieres");
 });
 it("autorise de commencer par le bail sans personne sélectionnée",()=>expect(lireEtapeBail("bail",form(dates),{...actuel,locataire_principal:null},logement).erreur).toBeUndefined());
 it("enregistre le loyer sans effacer les dates, le DPE et les clauses",()=>{
  const r=lireEtapeBail("loyer",form(montants),actuel,logement);expect(r.erreur).toBeUndefined();expect(r.patch).not.toHaveProperty("date_debut");expect(r.patch).not.toHaveProperty("dpe_depenses_min");expect(r.patch).not.toHaveProperty("clause_resolutoire_assurance");expect(r.patch).not.toHaveProperty("honoraires_bailleur");
 });
 it.each(["0","29","1.5","abc"])("refuse le jour d’échéance %s",jour=>expect(lireEtapeBail("loyer",form({...montants,jour_echeance:jour}),actuel,logement).erreur).toBeTruthy());
 it("la première étape accepte une échéance encore inconnue",()=>{
  const r=lireEtapeBail("bail",form(dates),{...actuel,jour_echeance:null},logement);
  expect(r.erreur).toBeUndefined();expect(r.patch).not.toHaveProperty("jour_echeance");
 });
 it("la première étape ne peut pas écraser l’échéance enregistrée",()=>{
  const r=lireEtapeBail("bail",form({...dates,jour_echeance:"28"}),actuel,logement);
  expect(r.erreur).toBeUndefined();expect({...actuel,...r.patch}.jour_echeance).toBe(1);
 });
 it("enregistre le jour choisi dans l’étape Loyer",()=>{
  expect(lireEtapeBail("loyer",form({...montants,jour_echeance:"28"}),actuel,logement).patch?.jour_echeance).toBe(28);
 });
 it("refuse une date inexistante",()=>expect(lireEtapeBail("bail",form({...dates,date_debut:"2026-02-30"}),actuel,logement).erreur).toBeTruthy());
 it("refuse un dépôt trop élevé",()=>expect(lireEtapeBail("loyer",form({...montants,depot_garantie:"501"}),actuel,logement).erreur).toMatch(/plafond/));
 it("vérifie le plafond du meublé en colocation",()=>expect(lireEtapeBail("loyer",form({...montants,depot_garantie:"800"}),{...actuel,type:"colocation"},{...logement,meuble:true}).erreur).toBeUndefined());
 it("interdit le forfait pour le nu",()=>expect(lireEtapeBail("loyer",form({...montants,charges_mode:"forfait"}),actuel,logement).erreur).toMatch(/provisions/));
 it("le passage du meublé au nu revérifie le dépôt",()=>expect(lireEtapeBail("bail",form(dates),{...actuel,type:"meuble",depot_garantie:800},logement).erreur).toMatch(/plafond/));
 it("les dépenses maximales du DPE ne passent pas sous le minimum",()=>expect(lireEtapeBail("documents",form({dpe_depenses_min:"1000",dpe_depenses_max:"900"}),actuel,logement).erreur).toBeTruthy());
 it("désactive les montants de référence hors encadrement",()=>expect(lireEtapeBail("clauses",form({encadrement_loyer:"false",loyer_reference:"25"}),actuel,logement).patch?.loyer_reference).toBeNull());
 it("ne conserve pas une clause de servitude inapplicable",()=>expect(lireEtapeBail("clauses",form({servitude_residence_principale:"false",clause_resolutoire_servitude:"true"}),actuel,logement).patch?.clause_resolutoire_servitude).toBe(false));
 it("supprime les données conditionnelles d’un ancien loyer non applicable",()=>expect(lireEtapeBail("loyer",form({...montants,precedente_location:"premiere",dernier_loyer:"200"}),actuel,logement).patch?.dernier_loyer).toBeNull());
 it.each([["#etape-bail-1",0],["#etape-bail-7",6],["#etape-bail-11",6],["#completer-personnes",1],["#completer-lot",2],["#completer-dpe",4],["#complements-paiement",3],["#complements-precedent",3],["#complements-energie",4],["#complements-conditions",5],["#signature",6],["#edl",6]] as const)("oriente le lien %s",(hash,index)=>expect(indexEtapeBail(hash)).toBe(index));
});
