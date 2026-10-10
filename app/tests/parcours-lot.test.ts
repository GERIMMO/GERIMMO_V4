import { describe, expect, it } from "vitest";
import { indexEtapeLot, lienLotDepuisBail, retourBailDuLot } from "@/lib/parcours-lot";
import { indexEtapeBail } from "@/lib/champs-etape-bail";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
describe("passage entre le lot et son bail", () => {
  it.each([["logement",3],["detention",2],["pieces",3],["diagnostics-immeuble",4],["finalisation",5],["inconnu",1]])("conserve les anciens liens %s",(cle,index)=>expect(indexEtapeLot(String(cle))).toBe(index));
  it("revient à l’étape du bail d’origine après une correction du lot",()=> {
    const url = new URL(lienLotDepuisBail("org","bien","lot","bail","diagnostics",5),"http://localhost");
    expect(url.pathname).toBe("/agence/org/parc/bien/lots/lot");
    expect(indexEtapeLot(url.searchParams.get("etape")!)).toBe(4);
    expect(retourBailDuLot("org",url.searchParams.get("retourBail"),url.searchParams.get("retourEtape"),[{id:"bail"}])).toBe("/agence/org/baux/bail#etape-bail-5");
  });
  it("n’offre aucun retour vers un bail d’un autre lot",()=>expect(retourBailDuLot("org","autre","2",[{id:"bail"}])).toBeNull());
  it.each(["https://exemple.fr","99",["2","3"],null])("ignore une étape de retour invalide %s",etape=>expect(retourBailDuLot("org","bail",etape,[{id:"bail"}])).toBe("/agence/org/baux/bail#etape-bail-3"));
  it("dirige le plafond financier vers le loyer, les caractéristiques vers le logement",()=>{
    const plafond=cibleChampBail("loyer maximum du logement","org");
    expect(plafond.etape).toBe("loyer");expect(indexEtapeBail(plafond.href)).toBe(3);
    expect(cibleChampBail("surface privative","org").etape).toBe("logement");
  });
});
