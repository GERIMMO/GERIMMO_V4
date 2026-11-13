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
  it("accepte aujourd’hui, les dates facultatives et une attestation ancienne encore valable", () => {
    expect(erreurDatesAttestation("2026-10-02", "2027-10-02", maintenant)).toBeNull();
    expect(erreurDatesAttestation("", "", maintenant)).toBeNull();
    expect(erreurDatesAttestation("2025-01-01", "2026-12-31", maintenant)).toBeNull();
  });
  it("G-40 : refuse une attestation déjà expirée, accepte celle qui expire aujourd’hui", () => {
    expect(erreurDatesAttestation("2025-01-01", "2025-12-31", maintenant)).toMatch(/n’est plus valable depuis le 31\/12\/2025/);
    expect(erreurDatesAttestation("", "2026-10-01", maintenant)).toMatch(/plus valable/);
    expect(erreurDatesAttestation("", "2026-10-02", maintenant)).toBeNull();
    // Jour de Paris : le 02/10 à 23 h 30 à Paris, une fin au 02/10 est encore valable ; à 00 h 30 le 03/10 elle ne l’est plus.
    expect(erreurDatesAttestation("", "2026-10-02", new Date("2026-10-02T21:30:00Z"))).toBeNull();
    expect(erreurDatesAttestation("", "2026-10-02", new Date("2026-10-02T22:30:00Z"))).toMatch(/plus valable/);
  });
  it("utilise le jour de Paris, même avant minuit UTC", () => {
    expect(jourAttestation(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
  });
});
