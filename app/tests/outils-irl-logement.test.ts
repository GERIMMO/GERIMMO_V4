/**
 * Outil « Calcul IRL » (30/09) : le code postal du logement désigne la série
 * de l'IRL (métropole, Corse, outre-mer) et le DPE F ou G bloque la révision.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASSES_DPE,
  MESSAGE_GEL_DPE,
  MESSAGE_ZONE_SPECIFIQUE,
  codePostalDeAdresse,
  lireSuggestionsAdresse,
  revisionInterditeDpe,
  urlRechercheAdresse,
  zoneIrlDuCodePostal,
} from "../src/lib/outils/irl-logement";

describe("code postal → série de l'IRL", () => {
  it("France métropolitaine : série nationale", () => {
    for (const cp of ["75011", "69003", "13001", "01000", "59000", "21000", "19100"]) {
      expect(zoneIrlDuCodePostal(cp)).toBe("metropole");
    }
  });

  it("Corse (20xxx) : indice spécifique, jamais celui de la métropole", () => {
    for (const cp of ["20000", "20090", "20200", "20600"]) expect(zoneIrlDuCodePostal(cp)).toBe("corse");
    expect(MESSAGE_ZONE_SPECIFIQUE.corse).toMatch(/Corse/);
    expect(MESSAGE_ZONE_SPECIFIQUE.corse).toMatch(/à saisir/);
  });

  it("outre-mer (97x, 98x) : indice spécifique", () => {
    for (const cp of ["97100", "97200", "97400", "97600", "98800"]) expect(zoneIrlDuCodePostal(cp)).toBe("outre-mer");
    expect(MESSAGE_ZONE_SPECIFIQUE["outre-mer"]).toMatch(/outre-mer/);
  });

  it("code postal illisible : aucune série supposée", () => {
    expect(zoneIrlDuCodePostal("")).toBeNull();
    expect(zoneIrlDuCodePostal("7501")).toBeNull();
    expect(zoneIrlDuCodePostal(null)).toBeNull();
  });

  it("le code postal se lit aussi dans une adresse saisie à la main", () => {
    expect(codePostalDeAdresse("12 rue des Lilas 69003 Lyon")).toBe("69003");
    expect(codePostalDeAdresse("Route du Cap, 20260 Calvi")).toBe("20260");
    expect(codePostalDeAdresse("12 rue des Lilas")).toBeNull();
  });
});

describe("Base Adresse Nationale", () => {
  it("adresse de recherche : autocomplétion, 5 suggestions", () => {
    expect(urlRechercheAdresse(" 12 rue des Lilas ")).toBe(
      "https://api-adresse.data.gouv.fr/search/?q=12%20rue%20des%20Lilas&limit=5&autocomplete=1"
    );
  });

  it("lit les suggestions, ignore une réponse inattendue", () => {
    const json = {
      features: [
        { properties: { label: "12 Rue des Lilas 69003 Lyon", name: "12 Rue des Lilas", postcode: "69003", city: "Lyon" } },
        { properties: { name: "sans libellé" } },
      ],
    };
    expect(lireSuggestionsAdresse(json)).toEqual([
      { label: "12 Rue des Lilas 69003 Lyon", name: "12 Rue des Lilas", postcode: "69003", city: "Lyon" },
    ]);
    expect(lireSuggestionsAdresse(null)).toEqual([]);
    expect(lireSuggestionsAdresse({ features: "x" })).toEqual([]);
  });

  it("la CSP autorise déjà la BAN (connect-src), rien à y ajouter", () => {
    const config = readFileSync(path.resolve(__dirname, "../next.config.ts"), "utf8");
    expect(config).toContain('"https://api-adresse.data.gouv.fr"');
    expect(config).not.toContain("insee.fr");
  });
});

describe("DPE : gel des loyers des passoires thermiques", () => {
  it("F et G bloquent la révision, les autres classes non", () => {
    expect(revisionInterditeDpe("F")).toBe(true);
    expect(revisionInterditeDpe("G")).toBe(true);
    for (const c of ["A", "B", "C", "D", "E", "inconnue"] as const) expect(revisionInterditeDpe(c)).toBe(false);
  });

  it("le choix propose A à G et « Je ne sais pas »", () => {
    expect(CLASSES_DPE.map((c) => c.libelle)).toEqual(["A", "B", "C", "D", "E", "F", "G", "Je ne sais pas"]);
    expect(MESSAGE_GEL_DPE).toMatch(/24 août 2022/);
    expect(MESSAGE_GEL_DPE).toMatch(/Climat et résilience/);
  });

  it("l'écran ne produit pas de lettre quand la révision est interdite", () => {
    const ecran = readFileSync(path.resolve(__dirname, "../src/app/outils/calcul-irl/calculateur-irl.tsx"), "utf8");
    expect(ecran).toContain("revisionInterditeDpe(");
    expect(ecran).toMatch(/\{!gel && \(\s*<>/);
  });
});
