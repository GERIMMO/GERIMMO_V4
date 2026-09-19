import { describe, expect, it } from "vitest";
import {
  DEPARTEMENTS,
  departement,
  departementDuCodePostal,
  empreinteParDepartement,
  empreinteParRegion,
} from "../src/lib/territoire";

describe("référentiel des départements", () => {
  it("compte 101 départements aux codes uniques", () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS.map((d) => d.code)).size).toBe(101);
  });
  it("place l'Essonne en Île-de-France, avec ses sept voisins de région", () => {
    expect(departement("91")).toEqual({ code: "91", nom: "Essonne", region: "Île-de-France" });
    expect(DEPARTEMENTS.filter((d) => d.region === "Île-de-France")).toHaveLength(8);
  });
  it("connaît la Corse et l'outre-mer", () => {
    expect(departement("2A")?.nom).toBe("Corse-du-Sud");
    expect(departement("974")?.region).toBe("La Réunion");
  });
});

describe("du code postal au département", () => {
  it.each([
    ["91300", "91"],
    ["75008", "75"],
    ["01000", "01"],
    [" 91 300 ", "91"],
    ["20000", "2A"],
    ["20137", "2A"],
    ["20200", "2B"],
    ["20600", "2B"],
    ["97100", "971"],
    ["97600", "976"],
    ["98000", "980"],
  ])("%s → %s", (cp, attendu) => {
    expect(departementDuCodePostal(cp)).toBe(attendu);
  });
  it.each(["", "9130", "913000", "ABCDE", null, undefined])(
    "ne devine rien pour %s",
    (cp) => {
      expect(departementDuCodePostal(cp)).toBeNull();
    }
  );
});

describe("l'empreinte par département", () => {
  const aujourdhui = new Date("2026-09-19T08:00:00Z");
  const donnees = {
    organisations: [
      { id: "A", type: "agence", status: "active", postal_code: "91000", created_at: "2026-03-02T10:00:00Z" },
      { id: "B", type: "proprietaire_direct", status: "essai", postal_code: "91300", created_at: "2026-09-03T10:00:00Z" },
      { id: "C", type: "agence", status: "suspendue", postal_code: "78000", created_at: "2026-08-30T10:00:00Z" },
      { id: "D", type: "agence", status: "archivee", postal_code: "78000", created_at: "2026-01-01T00:00:00Z" },
      { id: "E", type: "agence", status: "active", postal_code: null, created_at: "2026-09-10T00:00:00Z" },
      { id: "F", type: "agence", status: "active", postal_code: "98000", created_at: "2026-09-10T00:00:00Z" },
    ],
    biens: [
      { id: "b1", organization_id: "A", postal_code: "91100" },
      { id: "b2", organization_id: "A", postal_code: "91200" },
      // Géré par une agence de l'Essonne, mais situé dans les Hauts-de-Seine
      { id: "b3", organization_id: "A", postal_code: "92160" },
      { id: "b4", organization_id: "B", postal_code: null },
    ],
    lots: [
      { id: "l1", bien_id: "b1", etat: "loue" },
      { id: "l2", bien_id: "b1", etat: "archive" },
      { id: "l3", bien_id: "b2", etat: "disponible" },
      { id: "l4", bien_id: "b3", etat: "loue" },
      { id: "l5", bien_id: "inconnu", etat: "loue" },
    ],
    baux: [
      { id: "x1", lot_id: "l1", etat: "actif" },
      { id: "x2", lot_id: "l4", etat: "preavis" },
      { id: "x3", lot_id: "l3", etat: "resilie" },
      { id: "x4", lot_id: "l2", etat: "actif" },
    ],
  };
  const empreinte = empreinteParDepartement(donnees, aujourdhui);
  const par = (code: string) => empreinte.lignes.find((l) => l.code === code);

  it("compte les organisations là où elles sont domiciliées, hors archivées", () => {
    expect(par("91")).toMatchObject({
      nom: "Essonne",
      agences: 1,
      proprietairesDirects: 1,
      actives: 1,
      enEssai: 1,
      suspendues: 0,
      inscriptionsDuMois: 1,
    });
    expect(par("78")).toMatchObject({ agences: 1, suspendues: 0 + 1, inscriptionsDuMois: 0 });
  });

  it("compte les biens, lots et baux là où ils sont, quel que soit le siège", () => {
    expect(par("91")).toMatchObject({ biens: 2, lots: 2, bauxEnCours: 1 });
    expect(par("92")).toMatchObject({ agences: 0, proprietairesDirects: 0, biens: 1, lots: 1, bauxEnCours: 1 });
  });

  it("ignore les lots archivés, les baux terminés et les rattachements orphelins", () => {
    // l2 est archivé : pas compté, et son bail actif non plus ; l5 n'a pas de bien.
    expect(empreinte.lignes.reduce((n, l) => n + l.lots, 0)).toBe(3);
    expect(empreinte.lignes.reduce((n, l) => n + l.bauxEnCours, 0)).toBe(2);
  });

  it("dit ce qu'il n'a pas pu placer au lieu de le taire", () => {
    expect(empreinte.sansCodePostal).toEqual({ organisations: 1, biens: 1 });
    expect(empreinte.horsReferentiel).toBe(1);
  });

  it("range du plus actif au moins actif", () => {
    expect(empreinte.lignes.map((l) => l.code)).toEqual(["91", "92", "78"]);
  });

  it("remonte à la région", () => {
    const regions = empreinteParRegion(empreinte.lignes);
    expect(regions).toEqual([
      { region: "Île-de-France", departements: 3, organisations: 3, biens: 3, lots: 3, bauxEnCours: 2 },
    ]);
  });

  it("rend un tableau vide sans rien inventer quand il n'y a rien", () => {
    expect(empreinteParDepartement({ organisations: [], biens: [], lots: [], baux: [] })).toEqual({
      lignes: [],
      sansCodePostal: { organisations: 0, biens: 0 },
      horsReferentiel: 0,
    });
  });
});
