/**
 * Outil gratuit « Comparateur GLI / Visale » (29/09). Règles Visale vérifiées
 * le 29/09/2026 (Action Logement), à revérifier chaque janvier.
 */
import { describe, expect, it } from "vitest";
import {
  DATE_VERIFICATION_VISALE,
  PLAFONDS_VISALE_2026,
  coutGli,
  evaluerVisale,
} from "../src/lib/outils/gli-visale";
import { formaterEuros } from "../src/lib/outils/nombres";

describe("coût d'une GLI", () => {
  it("970 € × 12 × 2,7 % = 314,28 € brut, 165,94 € net à TMI 30 %", () => {
    const r = coutGli({ loyerCc: 970, taux: 0.027, tmi: 0.3 });
    expect(r?.brutAnnuel).toBe(314.28);
    expect(r?.netAnnuel).toBe(165.94);
    expect(formaterEuros(r!.netAnnuel)).toBe("165,94 €");
  });

  it("sans loyer, pas de coût", () => {
    expect(coutGli({ loyerCc: null, taux: 0.027, tmi: 0.3 })).toBeNull();
  });
});

describe("éligibilité Visale", () => {
  it("30 ans et plus, situation « Autre » : Visale est exclue", () => {
    const r = evaluerVisale({ zone: "reste", moinsDe30Ans: false, situation: "autre", etudiantSansRevenus: false, loyerCc: 600 });
    expect(r.eligible).toBe(false);
    expect(r.motifs[0]).toMatch(/30 ans/);
  });

  it("moins de 30 ans, 2 500 € en Île-de-France : exclue par le plafond de 1 940 €", () => {
    const r = evaluerVisale({ zone: "ile-de-france", moinsDe30Ans: true, situation: "autre", etudiantSansRevenus: false, loyerCc: 2500 });
    expect(r.eligible).toBe(false);
    expect(r.plafond).toBe(1940);
    expect(r.motifs.join(" ")).toMatch(/plafond/);
  });

  // Audit final (PUB-13) : un loyer de −100 € donnait « Visale est possible », et le passage à « 30 ans ou plus »
  // pré-choisissait le cas le plus favorable sans que l'utilisateur ait rien dit.
  it("loyer absent ou négatif : rien à conclure, et le dit", () => {
    for (const loyerCc of [null, 0, -100]) {
      const r = evaluerVisale({ zone: "reste", moinsDe30Ans: true, situation: null, etudiantSansRevenus: false, loyerCc });
      expect(r.eligible).toBe(false);
      expect(r.aCompleter).toBe("Indiquez le loyer charges comprises.");
    }
  });

  it("30 ans et plus sans situation choisie : aucun verdict tant que la situation manque", () => {
    const r = evaluerVisale({ zone: "reste", moinsDe30Ans: false, situation: null, etudiantSansRevenus: false, loyerCc: 970 });
    expect(r.eligible).toBe(false);
    expect(r.aCompleter).toBe("Indiquez la situation du locataire.");
    // Moins de 30 ans : la situation ne compte pas.
    expect(evaluerVisale({ zone: "reste", moinsDe30Ans: true, situation: null, etudiantSansRevenus: false, loyerCc: 970 }).aCompleter).toBeNull();
  });

  it("moins de 30 ans sous le plafond : éligible", () => {
    expect(evaluerVisale({ zone: "reste", moinsDe30Ans: true, situation: "autre", etudiantSansRevenus: false, loyerCc: 970 }).eligible).toBe(true);
  });

  it("30 ans et plus, salarié embauché depuis moins de 6 mois : éligible", () => {
    expect(
      evaluerVisale({ zone: "grande-agglomeration", moinsDe30Ans: false, situation: "salarie-recent", etudiantSansRevenus: false, loyerCc: 1500 }).eligible
    ).toBe(true);
  });

  it("étudiant sans revenus : plafond réduit", () => {
    const r = evaluerVisale({ zone: "reste", moinsDe30Ans: true, situation: "autre", etudiantSansRevenus: true, loyerCc: 700 });
    expect(r.plafond).toBe(680);
    expect(r.eligible).toBe(false);
  });

  it("plafonds 2026 par zone, date de vérification", () => {
    expect(PLAFONDS_VISALE_2026).toEqual({
      "ile-de-france": { general: 1940, etudiantSansRevenus: 1000 },
      "grande-agglomeration": { general: 1575, etudiantSansRevenus: 840 },
      reste: { general: 1365, etudiantSansRevenus: 680 },
    });
    expect(DATE_VERIFICATION_VISALE).toBe("29/09/2026");
  });
});
