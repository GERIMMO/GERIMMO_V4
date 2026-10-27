import { afterEach, describe, expect, it, vi } from "vitest";
import { alerteDiagnosticsNiveau, diagnosticsExigibles, diagnosticsManquants } from "../src/lib/diagnostics";
import type { QualificationDiagnostic } from "../src/lib/qualification-diagnostics";

const bien = { type: "appartement", annee_construction: 2000 };
const dpe = { type: "dpe", date_expiration: "2030-01-01" };
const types = (lignes: { type: string }[]) => lignes.map(ligne => ligne.type);
afterEach(() => vi.useRealTimers());

describe("Les documents manquants respectent la qualification des installations", () => {
  it("distingue les installations à qualifier des rapports réellement manquants", () => {
    expect(types(diagnosticsExigibles(bien, "lot"))).toEqual(["dpe", "electricite", "gaz"]);
    expect(types(diagnosticsManquants(bien, [], "lot"))).toEqual(["dpe"]);
    expect(types(diagnosticsManquants({ ...bien, annee_construction: null }, [], "lot"))).toEqual(["dpe"]);
  });

  it("une installation explicitement inconnue ne crée aucun faux manque", () => {
    const qualifications: QualificationDiagnostic[] = [
      { type: "gaz", situation: "inconnue", date_installation: null },
      { type: "electricite", situation: "inconnue", date_installation: null },
    ];
    expect(diagnosticsManquants(bien, [dpe], "lot", qualifications)).toEqual([]);
  });

  it("demande uniquement le rapport de l’installation déclarée ancienne", () => {
    const qualifications: QualificationDiagnostic[] = [
      { type: "gaz", situation: "absente", date_installation: null },
      { type: "electricite", situation: "plus_15_ans", date_installation: null },
    ];
    expect(types(diagnosticsManquants(bien, [dpe], "lot", qualifications))).toEqual(["electricite"]);
    expect(types(diagnosticsManquants(bien, [dpe], "bien", qualifications))).toEqual(["erp"]);
  });

  it("la date connue fait évoluer les pièces nécessaires sans ressaisie", () => {
    vi.useFakeTimers();
    const qualifications: QualificationDiagnostic[] = [{ type: "electricite", situation: "date_connue", date_installation: "2011-10-26" }];
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    expect(diagnosticsManquants(bien, [dpe], "lot", qualifications)).toEqual([]);
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    expect(types(diagnosticsManquants(bien, [dpe], "lot", qualifications))).toEqual(["electricite"]);
  });

  it("un rapport expiré est à renouveler et ne se compte pas aussi comme absent", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const qualification: QualificationDiagnostic[] = [{ type: "gaz", situation: "absente", date_installation: null }];
    const rapports = [dpe, { type: "gaz", date_expiration: "2026-10-20" }];
    expect(diagnosticsManquants(bien, rapports, "lot", qualification)).toEqual([]);
    expect(alerteDiagnosticsNiveau(bien, rapports, "lot", qualification)).toBe("1 périmé (au lot)");
  });

  it("les compteurs nomment seulement les manques confirmés", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    expect(alerteDiagnosticsNiveau(bien, [dpe], "lot")).toBeUndefined();
    expect(alerteDiagnosticsNiveau(bien, [dpe], "lot", [{ type: "gaz", situation: "plus_15_ans", date_installation: null }])).toBe("1 manquant (au lot)");
    expect(alerteDiagnosticsNiveau(bien, [dpe], "lot", [{ type: "gaz", situation: "absente", date_installation: null }])).toBeUndefined();
  });

  it("les termites ne font plus partie des pièces manquantes du dossier de location", () => {
    expect(types(diagnosticsExigibles(bien, "bien"))).toEqual(["erp"]);
    expect(types(diagnosticsManquants(bien, [], undefined))).toEqual(["dpe", "erp"]);
  });
});
