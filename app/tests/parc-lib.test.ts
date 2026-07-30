/**
 * Tests unitaires du référentiel du parc (lib/parc.ts) : proposition de clé
 * de répartition, statut des diagnostics, diagnostics attendus, décence.
 */
import { describe, expect, it } from "vitest";
import {
  proposerCle,
  statutDiagnostic,
  diagnosticsAttendus,
  alertesDecence,
} from "../src/lib/parc";

describe("proposerCle", () => {
  const lots = [
    { id: "a", surface_m2: 30, tantieme: 300 },
    { id: "b", surface_m2: 30, tantieme: 500 },
    { id: "c", surface_m2: 40, tantieme: 200 },
  ];

  it("répartit au prorata des surfaces et somme à 100,00 exactement", () => {
    const parts = proposerCle("surface", lots);
    expect(parts.map((p) => p.pourcentage)).toEqual([30, 30, 40]);
  });

  it("l'écart d'arrondi va au lot de plus grande valeur (RM-0.4.5)", () => {
    const parts = proposerCle("surface", [
      { id: "a", surface_m2: 1, tantieme: null },
      { id: "b", surface_m2: 1, tantieme: null },
      { id: "c", surface_m2: 1, tantieme: null },
    ]);
    const total = parts.reduce((s, p) => s + p.pourcentage, 0);
    expect(Math.round(total * 100) / 100).toBe(100);
  });

  it("répartit au prorata des tantièmes", () => {
    const parts = proposerCle("tantiemes", lots);
    expect(parts.map((p) => p.pourcentage)).toEqual([30, 50, 20]);
  });

  it("retombe sur les parts égales quand les données manquent", () => {
    const parts = proposerCle("surface", [
      { id: "a", surface_m2: null, tantieme: null },
      { id: "b", surface_m2: null, tantieme: null },
    ]);
    expect(parts.map((p) => p.pourcentage)).toEqual([50, 50]);
  });
});

describe("statutDiagnostic", () => {
  const aujourdhui = new Date("2026-07-30");

  it("sans expiration : valide (illimité, RM-0.6.4)", () => {
    expect(statutDiagnostic(null, aujourdhui)).toBe("valide");
  });

  it("expiré hier", () => {
    expect(statutDiagnostic("2026-07-29", aujourdhui)).toBe("expire");
  });

  it("expire dans moins de 90 jours : à surveiller", () => {
    expect(statutDiagnostic("2026-09-15", aujourdhui)).toBe("expire_bientot");
  });

  it("expire dans plus de 90 jours : valide", () => {
    expect(statutDiagnostic("2027-07-30", aujourdhui)).toBe("valide");
  });
});

describe("diagnosticsAttendus", () => {
  it("habitation ancienne : DPE, ERP, plomb, amiante, électricité, gaz", () => {
    const attendus = diagnosticsAttendus({ type: "appartement", annee_construction: 1930 });
    expect(attendus).toContain("dpe");
    expect(attendus).toContain("erp");
    expect(attendus).toContain("plomb");
    expect(attendus).toContain("amiante_privatif");
    expect(attendus).toContain("electricite");
  });

  it("local récent : pas de DPE d'habitation ni de plomb", () => {
    const attendus = diagnosticsAttendus({ type: "local", annee_construction: 2020 });
    expect(attendus).not.toContain("dpe");
    expect(attendus).not.toContain("plomb");
    expect(attendus).toContain("erp");
  });

  it("sans année connue : seuls DPE/ERP/termites sont proposés", () => {
    const attendus = diagnosticsAttendus({ type: "maison", annee_construction: null });
    expect(attendus).toEqual(["dpe", "erp", "termites"]);
  });
});

describe("alertesDecence", () => {
  it("surface < 9 m² : alerte non bloquante (RM-0.5.2)", () => {
    expect(alertesDecence({ surface_m2: 8 })).toHaveLength(1);
    expect(alertesDecence({ surface_m2: 9 })).toHaveLength(0);
    expect(alertesDecence({ surface_m2: null })).toHaveLength(0);
  });
});
