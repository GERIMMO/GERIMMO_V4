/**
 * Audit du 13/10/2026 (PROP-12, PROP-13, AUD-C-01) : l'encaissement acceptait un
 * montant au dixième de centime et une date dans le futur. Les deux règles se
 * vérifient côté serveur, sur la saisie brute.
 */
import { describe, expect, it } from "vitest";
import { MONTANT_MAX, lireMontant, verifierDateDejaPassee } from "../src/lib/saisie-montant";

describe("lireMontant", () => {
  it.each([
    ["750", 750],
    ["750.5", 750.5],
    ["750,50", 750.5],
    [" 19.99 ", 19.99],
    ["0.01", 0.01],
    ["9999999.99", MONTANT_MAX],
  ])("accepte « %s »", (saisie, attendu) => {
    expect(lireMontant(saisie)).toEqual({ montant: attendu });
  });

  it.each(["12.345", "0.004", "100.001", "12,345"])("refuse « %s » : plus de deux décimales", (saisie) => {
    const r = lireMontant(saisie);
    expect("erreur" in r && r.erreur).toBe("Le montant s'exprime au centime près : deux décimales au plus.");
  });

  it.each(["", "abc", "0", "0.00", "-5", "1e3", "12.", ".5", "1 000"])("refuse « %s » : montant invalide", (saisie) => {
    const r = lireMontant(saisie);
    expect("erreur" in r && r.erreur).toBe("Montant invalide.");
  });

  it("refuse un montant qui ferait déborder la colonne", () => {
    const r = lireMontant("10000000");
    expect("erreur" in r && r.erreur).toMatch(/trop élevé/);
  });

  it("une valeur absente du formulaire est un montant invalide", () => {
    expect(lireMontant(null)).toEqual({ erreur: "Montant invalide." });
  });
});

describe("verifierDateDejaPassee", () => {
  const AUJOURDHUI = "2026-10-13";

  it("laisse passer l'absence de date (la base posera le jour) et les dates passées ou du jour", () => {
    expect(verifierDateDejaPassee(null, "La date", AUJOURDHUI)).toBeNull();
    expect(verifierDateDejaPassee("", "La date", AUJOURDHUI)).toBeNull();
    expect(verifierDateDejaPassee("2026-10-13", "La date", AUJOURDHUI)).toBeNull();
    expect(verifierDateDejaPassee("2026-01-05", "La date", AUJOURDHUI)).toBeNull();
  });

  it("refuse demain et l'an prochain", () => {
    expect(verifierDateDejaPassee("2026-10-14", "La date d'encaissement", AUJOURDHUI)).toBe(
      "La date d'encaissement ne peut pas être dans le futur : un encaissement a déjà eu lieu."
    );
    expect(verifierDateDejaPassee("2027-01-01", "La date", AUJOURDHUI)).toMatch(/futur/);
  });

  it("refuse une date qui n'existe pas ou mal écrite", () => {
    expect(verifierDateDejaPassee("2026-02-30", "La date", AUJOURDHUI)).toBe("La date n'est pas valide.");
    expect(verifierDateDejaPassee("13/10/2026", "La date", AUJOURDHUI)).toBe("La date n'est pas valide.");
  });
});
