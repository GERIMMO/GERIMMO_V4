/**
 * Audit du 13/10/2026 (PROP-02, PROP-04, PROP-07) : ce que le formulaire laissait
 * passer et que le bail imprimait ensuite — « 7501 », 1500, une naissance en
 * 2030, un téléphone « abc », une surface qui déborde la colonne.
 */
import { describe, expect, it } from "vitest";
import {
  SURFACE_MAX_M2,
  verifierAnneeConstruction,
  verifierCodePostalBien,
  verifierCodePostalPersonne,
  verifierDateNaissance,
  verifierSurface,
  verifierTelephone,
} from "../src/lib/validation-fiches";

describe("code postal d'un bien", () => {
  it.each(["75011", "01000", "20000"])("accepte %s", (cp) => {
    expect(verifierCodePostalBien(cp)).toBeNull();
  });
  it.each(["7501", "750111", "75 11", "ABCDE", ""])("refuse « %s »", (cp) => {
    expect(verifierCodePostalBien(cp)).toMatch(/cinq chiffres/);
  });
});

describe("code postal d'une personne (peut résider à l'étranger)", () => {
  it.each(["75011", "1000", "SW1A 1AA", "B-1000"])("accepte %s", (cp) => {
    expect(verifierCodePostalPersonne(cp)).toBeNull();
  });
  it.each(["75", "ab", "abc", "----", "!!!!!"])("refuse « %s »", (cp) => {
    expect(verifierCodePostalPersonne(cp)).toMatch(/pas valide/);
  });
});

describe("téléphone", () => {
  it.each(["", "06 12 34 56 78", "+33 6 12 34 56 78", "01.42.00.00.00", "(0033) 1 42 00 00 00"])("accepte « %s »", (t) => {
    expect(verifierTelephone(t)).toBeNull();
  });
  it.each(["abc", "06 12 abc", "12", "+++", "0612345678901234567"])("refuse « %s »", (t) => {
    expect(verifierTelephone(t)).toMatch(/pas valide/);
  });
});

describe("date de naissance", () => {
  const AUJOURDHUI = "2026-10-13";
  it("accepte une date passée et le vide (facultatif pour une société)", () => {
    expect(verifierDateNaissance("1984-03-21", AUJOURDHUI)).toBeNull();
    expect(verifierDateNaissance("", AUJOURDHUI)).toBeNull();
    expect(verifierDateNaissance("2026-10-13", AUJOURDHUI)).toBeNull();
  });
  it("refuse le futur, l'avant-1900 et l'inexistant", () => {
    expect(verifierDateNaissance("2030-01-01", AUJOURDHUI)).toMatch(/futur/);
    expect(verifierDateNaissance("1850-05-05", AUJOURDHUI)).toMatch(/1900/);
    expect(verifierDateNaissance("1990-02-31", AUJOURDHUI)).toMatch(/pas valide/);
    expect(verifierDateNaissance("21/03/1984", AUJOURDHUI)).toMatch(/pas valide/);
  });
});

describe("année de construction", () => {
  it("accepte de 1600 à cinq ans après l'année en cours", () => {
    expect(verifierAnneeConstruction(1600, 2026)).toBeNull();
    expect(verifierAnneeConstruction(1948, 2026)).toBeNull();
    expect(verifierAnneeConstruction(2031, 2026)).toBeNull();
  });
  it("refuse 1500 (cas de l'audit) et 2032", () => {
    expect(verifierAnneeConstruction(1500, 2026)).toBe("L'année de construction doit être comprise entre 1600 et 2031.");
    expect(verifierAnneeConstruction(2032, 2026)).toMatch(/entre 1600 et 2031/);
  });
});

describe("surface", () => {
  it("accepte une surface ordinaire et laisse l'obligation à l'autre contrôle", () => {
    expect(verifierSurface(42.5)).toBeNull();
    expect(verifierSurface(SURFACE_MAX_M2)).toBeNull();
    expect(verifierSurface(0)).toBeNull();
    expect(verifierSurface(Number.NaN)).toBeNull();
  });
  it("refuse une surface qui fait déborder la colonne, sans jargon technique", () => {
    const refus = verifierSurface(1_000_000, "La surface habitable");
    expect(refus).toMatch(/^La surface habitable dépasse 9\s?999,99 m²/);
    expect(refus).not.toMatch(/overflow/i);
  });
});
