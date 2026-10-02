import { describe, expect, it } from "vitest";
import { libelleZone, lireZones, zoneCouvre } from "@/lib/zone-artisan";

// Retour recette du 02/10 (testeur artisan) : saisir tous les codes postaux
// du 91 n'est pas tenable ; un département doit suffire.
describe("lireZones", () => {
  it("accepte codes postaux et départements, dédoublonne, met la Corse en majuscules", () => {
    expect(lireZones("91300, 91 ; 94  2a 974 91300").zones).toEqual(["91300", "91", "94", "2A", "974"]);
  });
  it("refuse ce qui n'est ni l'un ni l'autre, en le nommant", () => {
    expect(lireZones("9130").erreur).toContain("« 9130 »");
    expect(lireZones("913000").erreur).toBeDefined();
    expect(lireZones("abc").erreur).toBeDefined();
    expect(lireZones("").zones).toEqual([]);
  });
});

describe("zoneCouvre", () => {
  it("un code postal ne couvre que lui-même", () => {
    expect(zoneCouvre("91300", "91300")).toBe(true);
    expect(zoneCouvre("91300", "91400")).toBe(false);
  });
  it("un département couvre tous ses codes postaux", () => {
    expect(zoneCouvre("91", "91300")).toBe(true);
    expect(zoneCouvre("91", "94000")).toBe(false);
    expect(zoneCouvre("97", "97100")).toBe(false);
    expect(zoneCouvre("971", "97100")).toBe(true);
    expect(zoneCouvre("971", "97200")).toBe(false);
  });
  it("sépare la Corse-du-Sud de la Haute-Corse", () => {
    expect(zoneCouvre("2A", "20000")).toBe(true);
    expect(zoneCouvre("2A", "20200")).toBe(false);
    expect(zoneCouvre("2B", "20200")).toBe(true);
    expect(zoneCouvre("2B", "20100")).toBe(false);
  });
});

it("libelleZone dit « tout le » pour un département", () => {
  expect(libelleZone("91300")).toBe("91300");
  expect(libelleZone("91")).toBe("tout le 91");
});
