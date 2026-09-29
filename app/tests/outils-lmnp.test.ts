/**
 * Outil gratuit « Simulateur LMNP » (29/09), location meublée de longue durée.
 *
 * Les valeurs de départ de la page (DEFAUTS_LMNP), refaites à la main :
 *   recettes 9 600 €, charges 3 800 € → résultat avant amortissement 5 800 €
 *   bâti : (160 000 + 14 000 de frais) × (1 − 20 % de terrain) ÷ 30 ans = 4 640,00 €
 *   mobilier : 5 000 ÷ 7 ans = 714,29 €
 *   travaux : 10 000 ÷ 10 ans = 1 000,00 €
 *   amortissement annuel = 6 354,29 € ; utilisé 5 800,00 € ; reporté 554,29 €
 *   → base 0, impôt au réel 0,00 €
 *   micro-BIC : 9 600 × 50 % = 4 800 € × (30 % + 17,2 %) = 2 265,60 €
 *   économie du réel : 2 265,60 €
 */
import { describe, expect, it } from "vitest";
import { DEFAUTS_LMNP, simulerLmnp, simulerMicroBic, simulerReel } from "../src/lib/outils/lmnp";

describe("valeurs de départ de la page", () => {
  it("les valeurs documentées", () => {
    expect(DEFAUTS_LMNP).toEqual({
      recettes: 9600,
      charges: 3800,
      prix: 160000,
      frais: 14000,
      fraisAmortis: true,
      partTerrain: 0.2,
      dureeBati: 30,
      mobilier: 5000,
      dureeMobilier: 7,
      travaux: 10000,
      dureeTravaux: 10,
      tmi: 0.3,
      prelevementsSociaux: 0.172,
    });
  });

  it("impôt réel 0,00 €, micro 2 265,60 €, économie 2 265,60 €, amortissement reporté 554,29 €", () => {
    const r = simulerLmnp(DEFAUTS_LMNP);
    expect(r.reel.resultatAvantAmortissement).toBe(5800);
    expect(r.reel.amortissementBati).toBe(4640);
    expect(r.reel.amortissementMobilier).toBe(714.29);
    expect(r.reel.amortissementTravaux).toBe(1000);
    expect(r.reel.amortissementAnnuel).toBe(6354.29);
    expect(r.reel.amortissementUtilise).toBe(5800);
    expect(r.reel.amortissementReporte).toBe(554.29);
    expect(r.reel.impot).toBe(0);
    expect(r.micro).toEqual({ applicable: true, abattement: 4800, base: 4800, impot: 2265.6 });
    expect(r.economieReel).toBe(2265.6);
  });
});

describe("micro-BIC", () => {
  it("fermé au-delà de 77 700 € de recettes", () => {
    const m = simulerMicroBic({ recettes: 80000, tmi: 0.3, prelevementsSociaux: 0.172 });
    expect(m.applicable).toBe(false);
    expect(simulerLmnp({ ...DEFAUTS_LMNP, recettes: 80000 }).economieReel).toBeNull();
  });

  it("abattement minimum de 305 €, sans dépasser les recettes", () => {
    const petit = simulerMicroBic({ recettes: 500, tmi: 0.3, prelevementsSociaux: 0.172 });
    expect(petit.applicable && petit.abattement).toBe(305);
    const minuscule = simulerMicroBic({ recettes: 200, tmi: 0.3, prelevementsSociaux: 0.172 });
    expect(minuscule.applicable && minuscule.base).toBe(0);
  });
});

describe("régime réel", () => {
  it("frais non retenus : ils sortent de la base amortissable", () => {
    expect(simulerReel({ ...DEFAUTS_LMNP, fraisAmortis: false }).amortissementBati).toBe(4266.67);
  });

  it("résultat négatif avant amortissement : déficit reportable, tout l'amortissement est reporté", () => {
    const r = simulerReel({ ...DEFAUTS_LMNP, charges: 10000 });
    expect(r.deficitReportable).toBe(400);
    expect(r.amortissementUtilise).toBe(0);
    expect(r.amortissementReporte).toBe(6354.29);
    expect(r.impot).toBe(0);
  });

  it("résultat supérieur à l'amortissement : la différence est imposée", () => {
    const r = simulerReel({ ...DEFAUTS_LMNP, charges: 1000 });
    expect(r.base).toBe(2245.71);
    expect(r.amortissementReporte).toBe(0);
    expect(r.impot).toBe(1059.98);
  });
});
