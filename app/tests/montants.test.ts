/**
 * Audit final du 27/10 (COD-05) : le module commun d'affichage des montants (src/lib/montants.ts). Deux unités, deux noms ;
 * espaces insécables ; jamais « -0,00 € ».
 */
import { describe, expect, it } from "vitest";
import { formaterCentimes, formaterEuros } from "@/lib/montants";
import { eur } from "@/lib/ged";

describe("formaterEuros et formaterCentimes", () => {
  it("« 1 234,50 € » : espace fine insécable entre les milliers, insécable avant l'euro", () => {
    expect(formaterEuros(1234.5)).toBe("1 234,50 €");
    expect(formaterCentimes(123450)).toBe("1 234,50 €");
  });
  it.each([[-0.004, "0,00 €"], [0, "0,00 €"], [-12.345, "-12,35 €"], [0.005, "0,01 €"], [1e6, "1 000 000,00 €"]])(
    "formaterEuros(%s) = %s", (n, attendu) => expect(formaterEuros(n)).toBe(attendu));
  it("eur() de la GED garde sa forme et son tiret pour un montant absent", () => {
    for (const n of [1234.5, 0, -12.345, 650]) expect(eur(n)).toBe(formaterEuros(n));
    expect(eur("650.5")).toBe("650,50 €");
    expect(eur(null)).toBe("—");
    expect(eur("")).toBe("—");
  });
});
