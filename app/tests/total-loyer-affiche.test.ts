import { expect, it } from "vitest";
import { totalLoyerAffiche } from "../src/lib/total-loyer-affiche";

it("ne présente pas de total trompeur lorsque le contrat est incomplet", () => {
  for (const absent of [null, undefined, "", "  ", "invalide", NaN, Infinity]) {
    expect(totalLoyerAffiche(absent, 70)).toBeNull();
    expect(totalLoyerAffiche(750, absent)).toBeNull();
  }
});

it("conserve les véritables montants nuls", () => {
  expect(totalLoyerAffiche(750, 0)).toBe(750);
  expect(totalLoyerAffiche(0, 0)).toBe(0);
  expect(totalLoyerAffiche("750.00", "0.00")).toBe(750);
});

it("additionne en centimes les montants reçus de la base", () => {
  expect(totalLoyerAffiche("750.50", "70.25")).toBe(820.75);
  expect(totalLoyerAffiche(0.1, 0.2)).toBe(0.3);
});
