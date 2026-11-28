import { describe, expect, it } from "vitest";
import { signalementAideLogement } from "@/lib/impaye-aide-logement";

describe("le signalement d’un impayé en tiers payant", () => {
  const defauts = [
    { jour: "2026-10-05", detteCentimes: 39000 },
    { jour: "2026-11-05", detteCentimes: 78000 },
  ];
  it("en 2026, atteint exactement deux termes nets et laisse deux mois", () => {
    expect(signalementAideLogement("2026-11-04", defauts, 39000)).toBeNull();
    expect(signalementAideLogement("2026-11-05", defauts, 39000)).toEqual({
      constitution: "2026-11-05", limite: "2027-01-05",
    });
  });
  it("en 2027, dépasse strictement 450 €", () => {
    const solde = [
      { jour: "2027-01-05", detteCentimes: 45000 },
      { jour: "2027-02-05", detteCentimes: 45001 },
    ];
    expect(signalementAideLogement("2027-02-04", solde)).toBeNull();
    expect(signalementAideLogement("2027-02-05", solde)).toEqual({
      constitution: "2027-02-05", limite: "2027-04-05",
    });
  });
  it("en 2027, retient aussi trois mois après le premier défaut, même de 1 €", () => {
    const solde = [{ jour: "2027-01-31", detteCentimes: 100 }];
    expect(signalementAideLogement("2027-04-29", solde)).toBeNull();
    expect(signalementAideLogement("2027-04-30", solde)).toEqual({
      constitution: "2027-04-30", limite: "2027-06-30",
    });
  });
  it("efface le délai quand la dette est entièrement réglée", () => {
    expect(signalementAideLogement("2027-04-30", [...defauts, { jour: "2027-02-04", detteCentimes: 0 }])).toBeNull();
  });
});
