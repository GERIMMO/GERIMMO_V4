import { describe, expect, it, vi, afterEach } from "vitest";
import { avancementLot, caracteristiquesManquantes } from "@/lib/avancement-lot";

const dossier = {
  lot: { nom: "T2", surface_m2: 42, pieces: 2, identifiant_fiscal: "1234567890123", chauffage: "Individuel", eau_chaude: "Ballon", locaux_privatifs: "Néant", description: "Néant" },
  bien: { type: "appartement", address_line1: "12 rue des Lilas", postal_code: "69001", city: "Lyon" },
  quoteParts: 100, pieces: 3,
  diagnosticsLot: [{ type: "dpe", date_expiration: "2030-01-01", classe_dpe: "C" }],
  diagnosticsBien: [{ type: "erp", date_expiration: "2026-12-01" }],
};
afterEach(() => vi.useRealTimers());
describe("avancement de la fiche du lot", () => {
  it("se complète sans exiger un locataire ou un bail", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    expect(avancementLot(dossier)).toMatchObject({ faits: 5, total: 5, pourcentage: 100 });
  });
  it("redescend quand un ERP expire ou qu'un DPE est classé G", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    for (const changement of [
      { diagnosticsBien: [{ type: "erp", date_expiration: "2026-10-01" }] },
      { diagnosticsLot: [{ type: "dpe", date_expiration: "2030-01-01", classe_dpe: "G" }] },
    ]) expect(avancementLot({ ...dossier, ...changement })).toMatchObject({ faits: 4, pourcentage: 80, prochain: { titre: "Diagnostics" } });
  });
  it("signale les informations manquantes sans compter les champs facultatifs", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    expect(avancementLot({ ...dossier, lot: { ...dossier.lot, chauffage: " " } })?.prochain?.ancre).toBe("caracteristiques");
    expect(avancementLot({ ...dossier, quoteParts: 80 })?.prochain?.ancre).toBe("detention");
  });
  it("ne donne aucun pourcentage en cas d'échec de lecture", () => {
    expect(avancementLot({ ...dossier, quoteParts: null })).toBeNull();
    expect(avancementLot({ ...dossier, pieces: null })).toBeNull();
    expect(avancementLot({ ...dossier, diagnosticsLot: null })).toBeNull();
  });
  it("n'exige ni pièces ni DPE pour un parking", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    expect(avancementLot({ ...dossier, bien: { ...dossier.bien, type: "parking" }, pieces: 0, diagnosticsLot: [] })).toMatchObject({ faits: 4, total: 4, pourcentage: 100 });
  });
});

describe("FL-05 : la fiche nomme les caractéristiques que la liste des biens réclame", () => {
  it("nomme chaque manque avec le libellé de la carte « Le logement »", () => {
    const lot = { ...dossier.lot, chauffage: " ", eau_chaude: null, identifiant_fiscal: "", locaux_privatifs: null, description: null };
    expect(caracteristiquesManquantes(lot, "maison")).toEqual(["Chauffage", "Eau chaude", "Locaux privatifs", "Autres parties du logement", "Identifiant fiscal"]);
    expect(avancementLot({ ...dossier, lot })?.prochain?.ancre).toBe("caracteristiques");
  });
  it("ne réclame que le nom et la surface hors habitation, et rien pour un lot complet", () => {
    expect(caracteristiquesManquantes({ ...dossier.lot, surface_m2: null, chauffage: null }, "parking")).toEqual(["Surface"]);
    expect(caracteristiquesManquantes(dossier.lot, "appartement")).toEqual([]);
  });
});
