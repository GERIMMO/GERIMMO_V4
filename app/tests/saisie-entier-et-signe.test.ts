/**
 * D04 (1), fiche VER-TS-02 : la lecture qui manquait pour brancher TOUS les montants sur le texte tapé.
 *
 * `lireMontantSigne` : un montant qui peut être négatif ou nul (la trésorerie reprise d'une agence peut être à
 * découvert). `Number("")` valait 0 et passait : un champ vide était lu « 0 ».
 */
import { describe, expect, it } from "vitest";
import { MESSAGE_MONTANT_INVALIDE, lireMontantAvecEspaces, lireMontantSigne } from "../src/lib/saisie-montant";

describe("lireMontantAvecEspaces : le montant d'une zone de texte qui sert à produire un document", () => {
  it.each([
    ["245000,50", 245000.5],
    ["245000.50", 245000.5],
    ["245 000,50", 245000.5],
    ["245 000,50", 245000.5],
    ["245 000,50", 245000.5],
    ["245000,50 €", 245000.5],
    ["15000", 15000],
  ])("accepte « %s »", (saisie, attendu) => {
    expect(lireMontantAvecEspaces(saisie)).toEqual({ montant: attendu });
  });

  it.each(["", " ", "1e5", "0x10", "abc", "-5", "0", "245.000,50", "12,345"])("refuse « %s »", (saisie) => {
    expect("erreur" in lireMontantAvecEspaces(saisie)).toBe(true);
  });

  it("une valeur absente est refusée", () => {
    expect("erreur" in lireMontantAvecEspaces(null)).toBe(true);
    expect("erreur" in lireMontantAvecEspaces(undefined)).toBe(true);
  });
});

describe("lireMontantSigne", () => {
  it.each([
    ["1500", 1500],
    ["1500,50", 1500.5],
    ["-1500,50", -1500.5],
    ["-0,5", -0.5],
    ["0", 0],
    ["0,00", 0],
    ["-0", 0],
    [" 12.5 ", 12.5],
  ])("accepte « %s »", (saisie, attendu) => {
    expect(lireMontantSigne(saisie)).toEqual({ montant: attendu });
  });

  it.each(["", "  ", "abc", "1e3", "12.", "--5", "+5", "1 500", "1.500,50", "12,345"])("refuse « %s »", (saisie) => {
    const r = lireMontantSigne(saisie);
    expect("erreur" in r).toBe(true);
  });

  it("un champ absent ou vide est un montant illisible, jamais zéro", () => {
    expect(lireMontantSigne(null)).toEqual({ erreur: MESSAGE_MONTANT_INVALIDE });
    expect(lireMontantSigne("")).toEqual({ erreur: MESSAGE_MONTANT_INVALIDE });
  });

  it("refuse un montant qui ferait déborder la colonne, dans les deux sens", () => {
    expect("erreur" in lireMontantSigne("10000000")).toBe(true);
    expect("erreur" in lireMontantSigne("-10000000")).toBe(true);
    expect(lireMontantSigne("9999999,99")).toEqual({ montant: 9999999.99 });
    expect(lireMontantSigne("-9999999,99")).toEqual({ montant: -9999999.99 });
  });

  it("le zéro négatif sort sans signe", () => {
    const r = lireMontantSigne("-0,00");
    expect(r).toEqual({ montant: 0 });
    expect("montant" in r && Object.is(r.montant, -0)).toBe(false);
  });
});
