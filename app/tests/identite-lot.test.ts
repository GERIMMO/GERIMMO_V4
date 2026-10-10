import { expect, it } from "vitest";
import { identiteLot } from "../src/lib/identite-lot";

const bien = { bien_nom: "Résidence des Lilas", bien_type: "appartement", adresse: "12 rue des Lilas", ville: "Lyon" };

it("distingue deux lots à la même adresse", () => {
  expect(identiteLot({ ...bien, lot_nom: "A12" }).titre).toBe("A12");
  expect(identiteLot({ ...bien, lot_nom: "A05" }).titre).toBe("A05");
  expect(identiteLot({ ...bien, lot_nom: "A12" }).repere).toContain(bien.adresse);
});
it("ne répète pas une adresse déjà présente dans le nom du lot", () => {
  expect(identiteLot({ ...bien, lot_nom: "Appartement T2 — 12 RUE DES LILAS" }).repere)
    .toBe("Résidence des Lilas · Lyon");
});
it("remplace un nom générique ou absent par une identité utile", () => {
  for (const lot_nom of ["Lot unique", "", "  lot UNIQUE "]) {
    const resultat = identiteLot({ ...bien, lot_nom });
    expect(resultat.titre).toContain(bien.adresse);
    expect(resultat.repere).toBe("Résidence des Lilas · Lyon");
  }
});
