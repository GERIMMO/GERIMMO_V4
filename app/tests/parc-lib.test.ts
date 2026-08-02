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
  cibleBlocage,
  alerteDiagnostics,
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

describe("cibleBlocage", () => {
  const ctx = { orgId: "o", bienId: "b", lotId: "l" };
  const bien = "/agence/o/parc/b";
  const lot = `${bien}/lots/l`;

  it("renvoie la clé de répartition vers la fiche bien, pas vers les diagnostics", () => {
    // Régression : ce message tombait dans le cas par défaut et proposait
    // « Mettre à jour les diagnostics » du lot, sans rapport avec le blocage.
    const c = cibleBlocage("Clé de répartition à (re)valider", ctx);
    expect(c.href).toBe(`${bien}#cle`);
    expect(c.libelle).toMatch(/clé/i);
  });

  it("renvoie l'ERP vers la fiche bien et le DPE vers la fiche lot", () => {
    expect(cibleBlocage("ERP absent ou expiré", ctx).href).toBe(`${bien}#diagnostics`);
    expect(cibleBlocage("DPE absent ou expiré", ctx).href).toBe(`${lot}#diagnostics`);
  });

  it("aiguille détention, surface et nom vers leurs sections du lot", () => {
    expect(cibleBlocage("Détention incomplète (0 %)", ctx).href).toBe(`${lot}#detention`);
    expect(cibleBlocage("Surface manquante", ctx).href).toBe(`${lot}#caracteristiques`);
    expect(cibleBlocage("Nom du lot manquant", ctx).href).toBe(`${lot}#caracteristiques`);
  });
});

describe("alerteDiagnostics", () => {
  const dans = (jours: number) =>
    new Date(Date.now() + jours * 86400000).toISOString().slice(0, 10);

  it("reste silencieuse quand tout est en règle", () => {
    expect(alerteDiagnostics([], [{ date_expiration: dans(400) }])).toBeUndefined();
    expect(alerteDiagnostics([], [{ date_expiration: null }])).toBeUndefined();
  });

  it("signale les manquants, les périmés et les bientôt périmés", () => {
    expect(alerteDiagnostics(["dpe"], [])).toBe("1 manquant");
    expect(alerteDiagnostics([], [{ date_expiration: dans(-1) }])).toBe("1 périmé");
    expect(alerteDiagnostics([], [{ date_expiration: dans(10) }])).toBe(
      "1 bientôt périmé"
    );
  });

  it("cumule les motifs et accorde le pluriel", () => {
    expect(
      alerteDiagnostics(["dpe", "erp"], [{ date_expiration: dans(-5) }, { date_expiration: dans(-2) }])
    ).toBe("2 manquants · 2 périmés");
  });
});
