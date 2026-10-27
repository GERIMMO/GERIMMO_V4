import { afterEach, describe, expect, it, vi } from "vitest";
import { etatAssuranceLocataire } from "@/lib/assurance-locataire";

afterEach(() => vi.useRealTimers());

describe("lecture de l’assurance par le locataire", () => {
  it.each([null, "", "inconnue", "2026-02-30", "2026-13-01"])("ne valide jamais une échéance absente ou incorrecte : %s", expire_le => {
    const etat = etatAssuranceLocataire({ expire_le, verifie_le: "2026-01-01" });
    expect(etat).toMatchObject({ dateConnue: false, nonExpiree: false, validee: false, libelle: "Date à vérifier" });
  });
  it("n’annonce pas comme manquante une attestation déposée sans échéance", () => {
    expect(etatAssuranceLocataire(undefined).libelle).toBe("À déposer");
    expect(etatAssuranceLocataire({ expire_le: null, verifie_le: null }).libelle).toBe("Date à vérifier");
  });
  it("sépare la vérification humaine de la date de couverture", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    expect(etatAssuranceLocataire({ expire_le: "2027-01-01", verifie_le: null })).toMatchObject({ nonExpiree: true, validee: false, libelle: "En cours de vérification" });
    expect(etatAssuranceLocataire({ expire_le: "2027-01-01", verifie_le: "2026-10-01" })).toMatchObject({ validee: true, libelle: "Validée" });
  });
  it("ne prolonge pas une assurance validée après son échéance à Paris", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T22:30:00Z"));
    expect(etatAssuranceLocataire({ expire_le: "2026-10-24", verifie_le: "2026-10-01" })).toMatchObject({ dateConnue: true, validee: false, libelle: "Expirée" });
  });
  it("conserve le rappel à trente jours et une couverture jusqu’au dernier jour inclus", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    expect(etatAssuranceLocataire({ expire_le: "2026-10-24", verifie_le: "2026-10-01" })).toMatchObject({ validee: true, aRenouveler: true });
    expect(etatAssuranceLocataire({ expire_le: "2026-11-23", verifie_le: null }).aRenouveler).toBe(true);
    expect(etatAssuranceLocataire({ expire_le: "2026-11-24", verifie_le: null }).aRenouveler).toBe(false);
  });
});
