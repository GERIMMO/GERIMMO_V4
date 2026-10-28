/** Audit final (DOC-09) : un SIRET à clé de Luhn fausse ou nul est refusé avant d'être enregistré. */
import { describe, expect, it } from "vitest";
import { siretPlausible } from "@/lib/siret";

describe("siretPlausible", () => {
  it("accepte un SIRET dont la clé de Luhn est juste", () => {
    expect(siretPlausible("12345678901237")).toBe(true);
    expect(siretPlausible("35600000000048")).toBe(true); // siège de La Poste : clé de Luhn juste
  });
  it("accepte un établissement de La Poste numéroté par sa propre clé (somme des chiffres multiple de 5)", () => {
    expect(siretPlausible("35600000012346")).toBe(true);
  });
  it("refuse une faute de frappe, une suite nulle et ce qui n'a pas quatorze chiffres", () => {
    expect(siretPlausible("12345678901234")).toBe(false);
    expect(siretPlausible("00000000000000")).toBe(false);
    expect(siretPlausible("1234567890123")).toBe(false);
    expect(siretPlausible("1234567890123A")).toBe(false);
  });
});
