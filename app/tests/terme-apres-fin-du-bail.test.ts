/**
 * Cinquième relecture du 28/10 (migration 20261028100100) : un terme d'un mois postérieur à la fin du bail n'est pas
 * dû. Les écrans qui lisent `appels_loyer` sans passer par etat_loyers_bail_brut (tableau de bord, actions attendues,
 * avis d'échéance) et l'espace locataire (bail fini, plus d'échéance à venir) appliquent la même règle.
 */
import { describe, expect, it } from "vitest";
import { bailFiniAvantMoisSuivant, phraseFinDeBail, termeApresFinDuBail } from "@/lib/echeances";

describe("terme après la fin du bail", () => {
  it("un mois postérieur au mois de fin n'est pas dû ; le mois de fin l'est", () => {
    expect(termeApresFinDuBail("2026-10-01", "2026-09-25")).toBe(true);
    expect(termeApresFinDuBail("2026-09-01", "2026-09-25")).toBe(false);
    expect(termeApresFinDuBail("2026-10-01", "2026-10-31")).toBe(false);
    expect(termeApresFinDuBail("2027-01-01", "2026-12-31")).toBe(true);
  });
  it("sans date de fin, tout terme appelé est dû", () => {
    expect(termeApresFinDuBail("2030-01-01", null)).toBe(false);
    expect(termeApresFinDuBail("2030-01-01", undefined)).toBe(false);
  });
});

describe("bail fini : plus d'échéance à venir", () => {
  it("fin avant le mois suivant (jour de Paris), y compris le dernier jour du mois", () => {
    expect(bailFiniAvantMoisSuivant("2026-09-25", "2026-10-28")).toBe(true);
    expect(bailFiniAvantMoisSuivant("2026-10-25", "2026-10-28")).toBe(true);
    expect(bailFiniAvantMoisSuivant("2026-11-25", "2026-10-28")).toBe(false);
    expect(bailFiniAvantMoisSuivant("2026-12-31", "2026-12-31")).toBe(true);
    expect(bailFiniAvantMoisSuivant(null, "2026-10-28")).toBe(false);
  });
  it("la phrase dit le temps juste et la date à la française", () => {
    expect(phraseFinDeBail("2026-09-25", "2026-10-28")).toBe("Votre bail a pris fin le 25/09/2026 : aucune échéance n’est plus à venir.");
    expect(phraseFinDeBail("2026-10-31", "2026-10-28")).toBe("Votre bail prend fin le 31/10/2026 : aucune échéance n’est plus à venir.");
  });
});
