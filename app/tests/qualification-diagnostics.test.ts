import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluerQualificationDiagnostic, qualificationsDiagnosticsIdentiques, type QualificationDiagnostic } from "../src/lib/qualification-diagnostics";

const dateConnue = (date: string | null, type: "electricite" | "gaz" = "electricite"): QualificationDiagnostic => ({
  type, situation: "date_connue", date_installation: date,
});
const anneeConnue = (annee: number | null, type: "electricite" | "gaz" = "electricite"): QualificationDiagnostic => ({
  type, situation: "annee_connue", date_installation: null, annee_installation: annee,
});
afterEach(() => vi.useRealTimers());

describe("L’obligation dépend de l’installation déclarée", () => {
  it("n’invente aucune réponse quand la situation ou le type manque", () => {
    expect(evaluerQualificationDiagnostic("gaz")).toBe("a_preciser");
    expect(evaluerQualificationDiagnostic("electricite", { type: "electricite", situation: "inconnue", date_installation: null })).toBe("a_preciser");
    expect(evaluerQualificationDiagnostic("electricite", { type: "gaz", situation: "absente", date_installation: null })).toBe("a_preciser");
    expect(evaluerQualificationDiagnostic("termites", dateConnue("2000-01-01"))).toBe("a_preciser");
  });

  it("seul le gaz peut être déclaré absent", () => {
    expect(evaluerQualificationDiagnostic("gaz", { type: "gaz", situation: "absente", date_installation: null })).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic("electricite", { type: "electricite", situation: "absente", date_installation: null })).toBe("a_preciser");
  });

  it("une installation déclarée de plus de quinze ans appelle le rapport", () => {
    for (const type of ["gaz", "electricite"] as const) {
      expect(evaluerQualificationDiagnostic(type, { type, situation: "plus_15_ans", date_installation: null })).toBe("necessaire");
    }
  });

  it("ne réclame le diagnostic qu’après le quinzième anniversaire", () => {
    const installation = dateConnue("2011-10-26");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-10-25")).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-10-26")).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-10-27")).toBe("necessaire");
  });

  it("une réponse datée évolue d’elle-même avec le calendrier", () => {
    vi.useFakeTimers();
    const installation = dateConnue("2011-10-26", "gaz");
    vi.setSystemTime(new Date("2026-10-26T22:59:00Z"));
    expect(evaluerQualificationDiagnostic("gaz", installation)).toBe("non_concerne");
    // Minuit à Paris, alors que le navigateur pourrait être dans un autre fuseau.
    vi.setSystemTime(new Date("2026-10-26T23:01:00Z"));
    expect(evaluerQualificationDiagnostic("gaz", installation)).toBe("necessaire");
  });

  it("traite une installation un 29 février sans décaler son anniversaire en mars", () => {
    const installation = dateConnue("2008-02-29");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2023-02-28")).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2023-03-01")).toBe("necessaire");
    expect(evaluerQualificationDiagnostic("electricite", dateConnue("2009-02-28"), "2024-02-29")).toBe("necessaire");
  });

  it.each([null, "", "2026-02-30", "01/01/2000", "2027-01-01"])("une date invalide, manquante ou future (%s) reste à préciser", date => {
    expect(evaluerQualificationDiagnostic("electricite", dateConnue(date), "2026-10-26")).toBe("a_preciser");
  });
});

describe("Une année suffit sans inventer le mois ou le jour", () => {
  it.each(["electricite", "gaz"] as const)("qualifie %s seulement lorsque l’année tranche l’âge de l’installation", type => {
    expect(evaluerQualificationDiagnostic(type, anneeConnue(2012, type), "2026-10-26")).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic(type, anneeConnue(2010, type), "2026-10-26")).toBe("necessaire");
    expect(evaluerQualificationDiagnostic(type, anneeConnue(2011, type), "2026-10-26")).toBe("a_preciser");
  });

  it("garde l’année charnière à préciser du 1er janvier au 31 décembre", () => {
    const installation = anneeConnue(2011);
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-01-01")).toBe("a_preciser");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-12-31")).toBe("a_preciser");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2027-01-01")).toBe("necessaire");
  });

  it("réévalue au changement d’année à Paris, sans attendre le fuseau du navigateur", () => {
    vi.useFakeTimers();
    const installation = anneeConnue(2011, "gaz");
    vi.setSystemTime(new Date("2025-12-31T22:59:00Z"));
    expect(evaluerQualificationDiagnostic("gaz", installation)).toBe("non_concerne");
    vi.setSystemTime(new Date("2025-12-31T23:01:00Z"));
    expect(evaluerQualificationDiagnostic("gaz", installation)).toBe("a_preciser");
    vi.setSystemTime(new Date("2026-12-31T23:01:00Z"));
    expect(evaluerQualificationDiagnostic("gaz", installation)).toBe("necessaire");
  });

  it.each([null, undefined, 1799, 2027, 2011.5, NaN, Infinity, "2010"])("une année absente ou mal formée (%s) ne donne pas de conclusion", annee => {
    const qualification = { ...anneeConnue(null), annee_installation: annee } as QualificationDiagnostic;
    expect(evaluerQualificationDiagnostic("electricite", qualification, "2026-10-26")).toBe("a_preciser");
  });

  it("accepte les bornes 1800 et année courante, et refuse une date de référence invalide", () => {
    expect(evaluerQualificationDiagnostic("electricite", anneeConnue(1800), "2026-10-26")).toBe("necessaire");
    expect(evaluerQualificationDiagnostic("electricite", anneeConnue(2026), "2026-10-26")).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic("electricite", anneeConnue(2010), "2026-02-30")).toBe("a_preciser");
    expect(evaluerQualificationDiagnostic("electricite", anneeConnue(2010), "")).toBe("a_preciser");
  });

  it("ne transforme pas une ancienne date précise en année approximative", () => {
    const installation = dateConnue("2011-03-15");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-03-15")).toBe("non_concerne");
    expect(evaluerQualificationDiagnostic("electricite", installation, "2026-03-16")).toBe("necessaire");
    expect(installation).toEqual({ type: "electricite", situation: "date_connue", date_installation: "2011-03-15" });
  });

  it("ne tranche pas une donnée contradictoire mêlant année seule et date précise", () => {
    expect(evaluerQualificationDiagnostic("electricite", { ...anneeConnue(2010), date_installation: "2020-01-01" }, "2026-10-26")).toBe("a_preciser");
  });
});

describe("Comparaison des qualifications confirmées", () => {
  it("tolère le champ année omis sur les anciennes réponses mais détecte une année modifiée", () => {
    expect(qualificationsDiagnosticsIdentiques(dateConnue("2011-03-15"), { ...dateConnue("2011-03-15"), annee_installation: null })).toBe(true);
    expect(qualificationsDiagnosticsIdentiques(anneeConnue(2011), anneeConnue(2012))).toBe(false);
    expect(qualificationsDiagnosticsIdentiques(anneeConnue(2011), anneeConnue(2011, "gaz"))).toBe(false);
  });

  it("distingue absence de réponse, précision annuelle et date exacte", () => {
    expect(qualificationsDiagnosticsIdentiques(undefined, undefined)).toBe(true);
    expect(qualificationsDiagnosticsIdentiques(anneeConnue(2011), undefined)).toBe(false);
    expect(qualificationsDiagnosticsIdentiques(anneeConnue(2011), dateConnue("2011-01-01"))).toBe(false);
    expect(qualificationsDiagnosticsIdentiques(dateConnue("2011-03-15"), dateConnue("2011-03-16"))).toBe(false);
  });
});
