import { describe, expect, it } from "vitest";
import { calculerTarif, GRILLE_PARTICULIERS } from "../src/lib/tarification";

describe("Nouvelle grille : prix réels par portefeuille", () => {
  it.each([[0,599,5990,"solo"],[1,599,5990,"solo"],[2,999,9990,"bailleur"],[3,999,9990,"bailleur"],
    [4,1999,19990,"investisseur"],[10,1999,19990,"investisseur"],[11,2999,29990,"patrimoine"],
    [20,2999,29990,"patrimoine"],[21,3099,30990,"patrimoine"],[25,3499,34990,"patrimoine"]] as const)(
    "%i biens : la formule couvrant le portefeuille au prix minimum", (volume,mensuel,annuel,formule) => {
      expect(calculerTarif("proprietaire_direct",volume)).toMatchObject({formule,montantCentimes:mensuel,taxeIncluse:true});
      const an = calculerTarif("proprietaire_direct",volume,"annuel");
      expect(an.montantCentimes).toBe(annuel);
      expect(an.economieAnnuelleCentimes).toBe(mensuel*12-annuel);
      expect(an.capacite).toBeGreaterThanOrEqual(volume);
      for (const offre of GRILLE_PARTICULIERS.filter(o=>o.capacite>=volume)) expect(mensuel).toBeLessThanOrEqual(offre.mensuelCentimes);
    });
  it.each([[0,3900],[10,3900],[11,4100],[20,5900],[50,11900],[51,12050],[100,19400],
    [200,34400],[201,34500],[300,44400],[500,64400]])("%i lots agence : %i centimes HT", (volume,prix) => {
      const tarif = calculerTarif("agence",volume);
      expect(tarif.montantCentimes).toBe(prix);
      expect(tarif.taxeIncluse).toBe(false);
      expect(tarif.lignes.reduce((s,l)=>s+l.totalCentimes,0)).toBe(prix);
    });
  it("aucune marche régressive ni application du dernier taux à tout le parc",()=>{
    for(let n=1;n<=1000;n++) {
      const ecart=calculerTarif("agence",n).montantCentimes-calculerTarif("agence",n-1).montantCentimes;
      expect(ecart).toBe(n<=10?0:n<=50?200:n<=200?150:100);
    }
  });
  it("refuse les volumes invalides et une annualité agence",()=>{
    for (const n of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER]) expect(()=>calculerTarif("agence",n)).toThrow();
    expect(()=>calculerTarif("agence",20,"annuel")).toThrow();
  });
});
