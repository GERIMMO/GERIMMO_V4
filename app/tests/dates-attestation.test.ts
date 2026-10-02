import { describe, expect, it } from "vitest";
import { erreurDatesAttestation, jourAttestation } from "../src/lib/dates-attestation";

const maintenant = new Date("2026-10-02T12:00:00Z");
describe("dates des attestations", () => {
  it("refuse une émission future et une validité inversée", () => {
    expect(erreurDatesAttestation("2026-10-03", "2027-01-01", maintenant)).toMatch(/futur/);
    expect(erreurDatesAttestation("2026-10-02", "2026-10-01", maintenant)).toMatch(/précéder/);
  });
  it("refuse les dates impossibles et mal formées", () => {
    for (const date of ["2026-02-30", "invalide", "2026-13-01"]) expect(erreurDatesAttestation(date, "", maintenant)).toBeTruthy();
  });
  it("accepte aujourd’hui, les dates facultatives et les documents anciens", () => {
    expect(erreurDatesAttestation("2026-10-02", "2027-10-02", maintenant)).toBeNull();
    expect(erreurDatesAttestation("", "", maintenant)).toBeNull();
    expect(erreurDatesAttestation("2025-01-01", "2025-12-31", maintenant)).toBeNull();
  });
  it("utilise le jour de Paris, même avant minuit UTC", () => {
    expect(jourAttestation(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
  });
});
