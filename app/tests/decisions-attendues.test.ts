import { describe, expect, it } from "vitest";
import { totalDecisions } from "../src/lib/decisions-attendues";

describe("ce qui attend une décision, en un chiffre", () => {
  it("compte les décisions du point quand il est préparé, sinon les artisans", () => {
    expect(totalDecisions({ pointPrepare: true, pointDuMatin: 3, artisans: 2, santeBloquants: 0 })).toBe(3);
    expect(totalDecisions({ pointPrepare: false, pointDuMatin: null, artisans: 2, santeBloquants: 0 })).toBe(2);
  });
  it("ajoute une seule ligne pour la santé, quel que soit le nombre de points", () => {
    expect(totalDecisions({ pointPrepare: true, pointDuMatin: 0, artisans: 0, santeBloquants: 21 })).toBe(1);
    expect(totalDecisions({ pointPrepare: false, pointDuMatin: null, artisans: null, santeBloquants: 0 })).toBe(0);
  });
});
