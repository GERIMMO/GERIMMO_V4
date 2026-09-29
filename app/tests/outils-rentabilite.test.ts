/**
 * Outil gratuit « Rentabilité locative » (29/09). Exemple refait à la main :
 *   prix total = 150 000 + 11 000 de frais + 9 000 de travaux = 170 000 €
 *   loyer annuel = 750 × 12 = 9 000 € → brute = 9 000 ÷ 170 000 = 5,29 %
 *   revenu net = 9 000 − 400 (charges non récupérables) − 800 (taxe foncière)
 *              − 120 (PNO) − 0 (gestion) − 1 × 750 (un mois de vacance) = 6 930 €
 *   → nette = 6 930 ÷ 170 000 = 4,08 %
 *   crédit 160 000 € à 3,5 % sur 20 ans : t = 0,035 ÷ 12, n = 240
 *   M = 160 000 × t ÷ (1 − (1 + t)^−240) = 927,94 €
 *   cash-flow = 6 930 ÷ 12 − 927,94 = 577,50 − 927,94 = −350,44 € par mois
 */
import { describe, expect, it } from "vitest";
import { EXEMPLE_RENTABILITE, calculerRentabilite, mensualiteCredit } from "../src/lib/outils/rentabilite";
import { formaterPourcent } from "../src/lib/outils/nombres";

describe("rentabilité", () => {
  it("brute 5,29 %, nette 4,08 %, cash-flow −350,44 €", () => {
    const r = calculerRentabilite(EXEMPLE_RENTABILITE);
    expect(r.prixTotal).toBe(170000);
    expect(r.loyerAnnuel).toBe(9000);
    expect(r.revenuNet).toBe(6930);
    expect(formaterPourcent(r.rentabiliteBrute!)).toBe("5,29 %");
    expect(formaterPourcent(r.rentabiliteNette!)).toBe("4,08 %");
    expect(r.mensualite).toBe(927.94);
    expect(r.cashFlowMensuel).toBe(-350.44);
  });

  it("sans crédit, pas de cash-flow", () => {
    const r = calculerRentabilite({ ...EXEMPLE_RENTABILITE, credit: { mode: "aucun" } });
    expect(r.mensualite).toBeNull();
    expect(r.cashFlowMensuel).toBeNull();
  });

  it("mensualité saisie : utilisée telle quelle", () => {
    const r = calculerRentabilite({ ...EXEMPLE_RENTABILITE, credit: { mode: "mensualite", mensualite: 500 } });
    expect(r.cashFlowMensuel).toBe(77.5);
  });

  it("prix total nul : pas de rentabilité", () => {
    const r = calculerRentabilite({ ...EXEMPLE_RENTABILITE, prix: 0, frais: 0, travaux: 0 });
    expect(r.rentabiliteBrute).toBeNull();
  });
});

describe("mensualité d'annuité", () => {
  it("formule standard, taux nul compris", () => {
    expect(mensualiteCredit(160000, 0.035, 20)).toBe(927.94);
    expect(mensualiteCredit(120000, 0, 10)).toBe(1000);
    expect(mensualiteCredit(0, 0.03, 20)).toBeNull();
  });
});
