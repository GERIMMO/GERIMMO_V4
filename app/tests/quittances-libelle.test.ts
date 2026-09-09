/**
 * Libellé d'émission des reçus/quittances (audit 09/09) : vrai singulier/
 * pluriel et vraie distinction reçu/quittance — fini le « 1 quittance(s)
 * émise(s) » sur un reçu partiel.
 */
import { describe, expect, it } from "vitest";
import { libelleEmission } from "../src/lib/quittances";

describe("libelleEmission", () => {
  it("accorde le singulier et le pluriel des quittances", () => {
    expect(libelleEmission(1, 0)).toBe("1 quittance émise");
    expect(libelleEmission(2, 0)).toBe("2 quittances émises");
  });

  it("distingue les reçus des quittances", () => {
    expect(libelleEmission(0, 1)).toBe("1 reçu émis");
    expect(libelleEmission(0, 2)).toBe("2 reçus émis");
  });

  it("combine les deux natures dans une seule phrase", () => {
    expect(libelleEmission(1, 1)).toBe("1 quittance et 1 reçu émis");
    expect(libelleEmission(2, 1)).toBe("2 quittances et 1 reçu émis");
  });

  it("dit explicitement quand il n'y a rien à émettre", () => {
    expect(libelleEmission(0, 0)).toBe("aucun reçu ni quittance à émettre");
  });
});
