import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presentationDocument } from "@/lib/presentation-document";
import { bilanDiagnostics, presentationDiagnostic } from "@/lib/presentation-diagnostics";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("Validité documentaire", () => {
  it("ne confond jamais présence, vérification et validité", () => {
    expect(presentationDocument({}).libelle).toBe("À vérifier");
    expect(presentationDocument({ verifie_le: "2026-10-20" }).libelle).toBe("Vérifié");
    expect(presentationDocument({ expire_le: "2027-04-24" }).libelle).toBe("Valide");
    expect(presentationDocument({ expire_le: "2026-10-23", verifie_le: "2026-10-20" }).libelle).toBe("Expiré");
    for (const expire_le of ["incorrect", "2026-02-30", "2026-13-01"]) expect(presentationDocument({ expire_le }).libelle).toBe("À vérifier");
  });
  it("une échéance reste valide jusqu'à la fin du jour à Paris", () => {
    vi.setSystemTime(new Date("2026-10-24T21:59:59Z"));
    expect(presentationDocument({ expire_le: "2026-10-24" }).libelle).toBe("Valide");
    vi.setSystemTime(new Date("2026-10-24T22:00:00Z"));
    expect(presentationDocument({ expire_le: "2026-10-24" }).libelle).toBe("Expiré");
  });
  it("conserve la priorité d'une purge, d'un remplacement et d'une expiration sur la signature", () => {
    expect(presentationDocument({ purged_at: "2026-10-24" }, "signe").libelle).toBe("Fichier supprimé");
    expect(presentationDocument({}, "signe", true).libelle).toBe("Remplacé");
    expect(presentationDocument({ expire_le: "2026-10-23" }, "signe").libelle).toBe("Expiré");
    expect(presentationDocument({}, "signe").libelle).toBe("Signé");
    expect(presentationDocument({}, "original").libelle).toBe("Original non signé");
  });
  it("un diagnostic qui expire bientôt est encore valide dans le bilan", () => {
    const diagnostic = { type: "dpe", document_id: "fichier", date_expiration: "2026-11-01" };
    expect(presentationDiagnostic("dpe", diagnostic).libelle).toBe("Valide · expire bientôt");
    expect(bilanDiagnostics(["dpe"], [diagnostic])).toMatchObject({ aJour: 1, aRenouveler: 0, aAjouter: 0, aVerifier: 0 });
    expect(presentationDiagnostic("dpe", { ...diagnostic, date_expiration: "2026-02-30" }).libelle).toBe("Validité à vérifier");
  });
});
