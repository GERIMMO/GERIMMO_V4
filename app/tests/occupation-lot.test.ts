import { describe, expect, it } from "vitest";
import { occupationLot } from "@/lib/occupation-lot";

describe("Occupation du lot et de ses chambres", () => {
  const chambres = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("compte les chambres occupées une fois et conserve celles sans bail", () => {
    expect(occupationLot(chambres, [{ etat: "actif", chambre_id: "a" }, { etat: "preavis", chambre_id: "b" }, { etat: "brouillon", chambre_id: "c" }]))
      .toEqual({ contratsActifs: 2, logementEntierOccupe: false, chambresPreparees: 3, chambresLouees: 2, chambresSansBail: 1 });
  });
  it("ne présente pas comme libres les chambres d'un logement loué entier", () => {
    expect(occupationLot(chambres, [{ etat: "actif", chambre_id: null }])).toMatchObject({ contratsActifs: 1, logementEntierOccupe: true, chambresLouees: 0, chambresSansBail: 0 });
  });
  it("écarte les contrats terminés et les chambres extérieures au lot", () => {
    expect(occupationLot(chambres, [{ etat: "termine", chambre_id: "a" }, { etat: "actif", chambre_id: "autre-lot" }])).toMatchObject({ chambresLouees: 0, chambresSansBail: 3 });
  });
});
