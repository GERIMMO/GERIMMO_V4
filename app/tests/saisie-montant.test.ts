/**
 * Audit du 13/10/2026 (PROP-12, PROP-13, AUD-C-01) : l'encaissement acceptait un
 * montant au dixième de centime et une date dans le futur. Les deux règles se
 * vérifient côté serveur, sur la saisie brute.
 */
import { describe, expect, it } from "vitest";
import {
  MONTANT_MAX,
  erreurDuChamp,
  lireDecimal,
  lireDecimalFacultatif,
  lireMontant,
  lireMontantFacultatif,
  verifierDateDejaPassee,
} from "../src/lib/saisie-montant";

// VFL-04 : le format attendu se dit dans le message, une seule fois, au point central.
const MONTANT_ILLISIBLE = "Montant invalide : écrivez 1234,50, sans espace ni point de milliers.";

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
    expect("erreur" in r && r.erreur).toBe(MONTANT_ILLISIBLE);
  });

  // VFL-04 : le format français usuel est refusé (jamais deviné), mais le message dit quoi écrire.
  it.each(["1 234,50", "1.234,50", "1\u00A0234,50", "1\u202F234,50", "1 234.50", "1,234.50"])(
    "refuse « %s » en disant d'écrire 1234,50 sans espace ni point de milliers",
    (saisie) => {
      const r = lireMontant(saisie);
      expect("erreur" in r && r.erreur).toBe(MONTANT_ILLISIBLE);
      expect("erreur" in r && r.erreur).toContain("1234,50");
      expect("erreur" in r && r.erreur).toContain("sans espace ni point de milliers");
    }
  );

  it("refuse un montant qui ferait déborder la colonne", () => {
    const r = lireMontant("10000000");
    expect("erreur" in r && r.erreur).toMatch(/trop élevé/);
  });

  it("une valeur absente du formulaire est un montant invalide", () => {
    expect(lireMontant(null)).toEqual({ erreur: MONTANT_ILLISIBLE });
  });
});

// VER-TS-02 : les champs de montant passent en type="text" ; ce que le serveur reçoit alors est le texte
// tel que tapé. Les trois écritures d'un même montant doivent valoir la même chose.
describe("lireMontant : le texte tel que tapé dans un champ de montant", () => {
  it.each(["840,00", "840.00", "840", " 840,0 "])("« %s » vaut 840 €", (saisie) => {
    expect(lireMontant(saisie)).toEqual({ montant: 840 });
  });
  it("ne confond pas la virgule décimale avec un séparateur de milliers", () => {
    expect(lireMontant("840,00")).not.toEqual({ montant: 84000 });
  });
});

describe("lireMontantFacultatif", () => {
  it("vide ou absent : non renseigné", () => {
    expect(lireMontantFacultatif("")).toEqual({ montant: null });
    expect(lireMontantFacultatif("   ")).toEqual({ montant: null });
    expect(lireMontantFacultatif(null)).toEqual({ montant: null });
  });
  it.each([
    ["0", 0],
    ["0,00", 0],
    ["0.0", 0],
    ["1234,5", 1234.5],
    ["1234.50", 1234.5],
  ])("accepte « %s »", (saisie, attendu) => {
    expect(lireMontantFacultatif(saisie)).toEqual({ montant: attendu });
  });
  it.each(["abc", "12a", "-5", "1e3", "12.", "1 000"])("refuse « %s » au lieu de le prendre pour un champ vide", (saisie) => {
    expect(lireMontantFacultatif(saisie)).toEqual({ erreur: MONTANT_ILLISIBLE });
  });
  it("refuse un troisième chiffre après la virgule et un montant énorme", () => {
    expect(lireMontantFacultatif("12,345")).toEqual({ erreur: "Le montant s'exprime au centime près : deux décimales au plus." });
    expect(lireMontantFacultatif("10000000")).toEqual({ erreur: "Montant trop élevé : vérifiez la saisie." });
  });
});

// VFL-07 : l'indice IRL (145,17) n'est pas de l'argent mais s'écrit de la même façon : un décimal lu sur le texte
// tel que tapé, sans seuil ni arrondi.
describe("lireDecimal : un nombre décimal qui n'est pas un montant (indice IRL)", () => {
  it.each([
    ["145,17", 145.17],
    ["145.17", 145.17],
    ["145", 145],
    [" 143,46 ", 143.46],
    ["0", 0],
    ["145,175", 145.175],
  ])("accepte « %s »", (saisie, attendu) => {
    expect(lireDecimal(saisie)).toEqual({ valeur: attendu });
  });

  it("ne confond pas la virgule décimale avec un séparateur de milliers", () => {
    expect(lireDecimal("145,17")).not.toEqual({ valeur: 14517 });
  });

  it.each(["", "abc", "-5", "1e3", "12.", ".5", "1 450,5", "1.450,5", "1,2,3", "Infinity", "NaN"])(
    "refuse « %s » avec le format attendu",
    (saisie) => {
      const r = lireDecimal(saisie);
      expect("erreur" in r && r.erreur).toBe("Valeur invalide : écrivez 145,17, sans espace.");
    }
  );

  it("une valeur absente du formulaire est refusée", () => {
    expect(lireDecimal(null)).toHaveProperty("erreur");
  });

  it("refuse un nombre trop grand pour être un nombre", () => {
    expect(lireDecimal("9".repeat(400))).toHaveProperty("erreur");
  });
});

describe("lireDecimalFacultatif", () => {
  it("vide ou absent : non renseigné, jamais zéro", () => {
    expect(lireDecimalFacultatif("")).toEqual({ valeur: null });
    expect(lireDecimalFacultatif("   ")).toEqual({ valeur: null });
    expect(lireDecimalFacultatif(null)).toEqual({ valeur: null });
  });
  it.each([["145,17", 145.17], ["145.17", 145.17], ["145", 145], ["0", 0]])("accepte « %s »", (saisie, attendu) => {
    expect(lireDecimalFacultatif(saisie)).toEqual({ valeur: attendu });
  });
  it.each(["abc", "-5", "1 450"])("refuse « %s » au lieu de le prendre pour un champ vide", (saisie) => {
    expect(lireDecimalFacultatif(saisie)).toHaveProperty("erreur");
  });
});

describe("erreurDuChamp", () => {
  it("nomme le champ fautif quand un formulaire en porte plusieurs", () => {
    expect(erreurDuChamp("Loyer hors charges", MONTANT_ILLISIBLE)).toBe(
      "Loyer hors charges : montant invalide : écrivez 1234,50, sans espace ni point de milliers."
    );
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
