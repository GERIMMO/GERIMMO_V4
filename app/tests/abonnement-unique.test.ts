import { describe, expect, it } from "vitest";
import { montantAbonnementUnique, offreAbonnementUnique, respectePlancherOffre, offreParticulier } from "../src/lib/tarifs";

describe("Barème public de Gerimmo", () => {
  it.each([[0,0],[1,599],[2,798],[3,997],[4,1196],[5,1395],[6,1594],[7,1793],[8,1990],[10,1990],[15,1990],[20,1990],[21,2089],[30,2980],[50,4960],[100,9910]])(
    "%i unités donnent %i centimes par mois", (biens, prix) => {
      expect(montantAbonnementUnique(biens, "mensuel")).toBe(prix);
      expect(montantAbonnementUnique(biens, "annuel")).toBe(prix * 10);
    }
  );
  it("applique les incréments et dix mensualités sur les 100 premières unités", () => {
    for (let n = 1; n <= 100; n++) {
      const prix = montantAbonnementUnique(n, "mensuel");
      const precedent = montantAbonnementUnique(n - 1, "mensuel");
      expect(prix - precedent).toBe(n === 1 ? 599 : n <= 7 ? 199 : n === 8 ? 197 : n <= 20 ? 0 : 99);
      expect(montantAbonnementUnique(n, "annuel")).toBe(prix * 10);
    }
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("refuse une quantité invalide ou un débordement", (n) => {
    expect(() => montantAbonnementUnique(n, "annuel")).toThrow(RangeError);
  });
});

describe("Montant transmis au prestataire", () => {
  it("conserve une ligne de montant exact sans multiplier deux fois par le nombre de lots", () => {
    for (const periode of ["mensuel", "annuel"] as const) for (let n=0; n<=100; n++) {
      const offre=offreAbonnementUnique(n,periode);
      expect(offre.capacite).toBe(n);
      expect(offre.lignes.map(l => l.quantite*l.prixUnitaireCents)).toEqual([montantAbonnementUnique(n,periode)]);
      expect(respectePlancherOffre(offre)).toBe(true);
    }
  });
  it("refuse une ligne falsifiée même si le total affiché paraît correct", () => {
    const offre=offreAbonnementUnique(8,"mensuel");
    offre.lignes[0].quantite=8;
    expect(respectePlancherOffre(offre)).toBe(false);
  });
  it("relit le prix historique sans le remplacer par le prix des nouveaux clients", () => {
    expect(offreParticulier(3,"mensuel").montantCents).toBe(1770);
    expect(offreAbonnementUnique(3,"mensuel").montantCents).toBe(997);
  });
});
