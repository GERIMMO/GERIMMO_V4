import { describe, expect, it } from "vitest";
import { preparerDiagnosticsBail, statutRapportBail, type ContexteDiagnosticsBail } from "@/lib/exigences-diagnostics-bail";
import type { DiagnosticBail } from "@/lib/documents-bail";

const aujourdhui = "2026-10-27";
const contexte = (patch: Partial<ContexteDiagnosticsBail> = {}): ContexteDiagnosticsBail => ({
  typeBien: "appartement", anneeConstruction: 2005, qualifications: [], referenceDate: aujourdhui, ...patch,
});
const diagnostic = (patch: Partial<DiagnosticBail> = {}): DiagnosticBail => ({
  id: "dpe", type: "dpe", niveau: "lot", date_realisation: "2026-10-01", date_expiration: "2036-10-01", document_id: "fichier", classe_dpe: "B", ...patch,
});

describe("Diagnostics à préparer pour le bail", () => {
  it("montre les rapports attendus même lorsqu’aucun n’est encore déposé", () => {
    const { lignes } = preparerDiagnosticsBail([], aujourdhui, contexte());
    expect(lignes.map(l => l.cle)).toEqual(["lot:dpe", "lot:electricite", "lot:gaz", "bien:erp"]);
    expect(lignes.find(l => l.type === "dpe")).toMatchObject({ exigence: "attendu", statut: { libelle: "À ajouter" }, action: "Ajouter le rapport" });
    expect(lignes.find(l => l.type === "gaz")).toMatchObject({ exigence: "a_preciser", statut: { libelle: "À préciser", ton: "neutre" }, action: "Préciser l’installation" });
  });

  it("réutilise l’ancienneté du bâtiment sans imposer les termites", () => {
    const { lignes } = preparerDiagnosticsBail([], aujourdhui, contexte({ anneeConstruction: 1940 }));
    expect(lignes.map(l => l.cle)).toEqual(expect.arrayContaining(["lot:plomb", "lot:amiante_privatif", "bien:amiante_communes"]));
    expect(lignes.some(l => l.type === "termites")).toBe(false);
    const sansAnnee = preparerDiagnosticsBail([], aujourdhui, contexte({ anneeConstruction: null }));
    expect(sansAnnee.anneeAPreciser).toBe(true);
    expect(sansAnnee.lignes.find(l => l.type === "plomb")).toMatchObject({ exigence: "a_preciser", statut: { libelle: "À préciser" }, action: "Préciser le bâtiment", destinationAction: "bien" });
    expect(sansAnnee.lignes.find(l => l.type === "amiante_privatif")?.exigence).toBe("a_preciser");
    expect(lignes.find(l => l.type === "amiante_privatif")).toMatchObject({ exigence: "a_disposition", statut: { libelle: "À tenir à disposition", ton: "neutre" } });
    expect(lignes.find(l => l.type === "amiante_privatif")?.precision).toContain("sans annexion au bail");
  });

  it("conserve le type réel du bien au lieu de présumer une habitation", () => {
    expect(preparerDiagnosticsBail([], aujourdhui, contexte({ typeBien: "parking" })).lignes.map(l => l.type)).toEqual(["erp"]);
  });

  it("distingue l’absence déclarée de gaz, l’installation ancienne et le cas encore inconnu", () => {
    const { lignes } = preparerDiagnosticsBail([], aujourdhui, contexte({ qualifications: [
      { type: "gaz", situation: "absente", date_installation: null },
      { type: "electricite", situation: "plus_15_ans", date_installation: null },
    ] }));
    expect(lignes.find(l => l.type === "gaz")).toMatchObject({ exigence: "non_concerne", statut: { libelle: "Non concerné", ton: "neutre" }, action: undefined });
    expect(lignes.find(l => l.type === "electricite")).toMatchObject({ exigence: "attendu", action: "Ajouter le rapport" });
  });

  it("réévalue l’âge à la date d’entrée et conserve l’incertitude d’une année charnière", () => {
    const qualifications = [{ type: "gaz" as const, situation: "annee_connue" as const, annee_installation: 2011, date_installation: null }];
    expect(preparerDiagnosticsBail([], aujourdhui, contexte({ qualifications })).lignes.find(l => l.type === "gaz")?.exigence).toBe("a_preciser");
    expect(preparerDiagnosticsBail([], aujourdhui, contexte({ qualifications, referenceDate: "2027-01-01" })).lignes.find(l => l.type === "gaz")?.exigence).toBe("attendu");
  });

  it("retient le rapport récent et garde les autres consultables sans doublon", () => {
    const ancien = diagnostic({ id: "ancien", date_realisation: "2025-02-01" });
    const recent = diagnostic({ id: "recent", document_id: null });
    const { lignes } = preparerDiagnosticsBail([ancien, recent, ancien], aujourdhui, contexte());
    const dpe = lignes.find(l => l.type === "dpe");
    expect(dpe?.rapport?.id).toBe("recent");
    expect(dpe?.anciens.map(d => d.id)).toEqual(["ancien"]);
    expect(dpe).toMatchObject({ statut: { libelle: "Fichier manquant" }, action: "Joindre le fichier" });
  });

  it("ne laisse pas un rapport rattaché au mauvais niveau couvrir le rapport attendu", () => {
    const { lignes } = preparerDiagnosticsBail([diagnostic({ niveau: "bien" })], aujourdhui, contexte());
    expect(lignes.find(l => l.cle === "lot:dpe")?.rapport).toBeUndefined();
    expect(lignes.find(l => l.cle === "bien:dpe")?.exigence).toBe("complementaire");
  });

  it("garde un rapport termites existant comme complément", () => {
    const { lignes } = preparerDiagnosticsBail([diagnostic({ type: "termites", niveau: "bien", classe_dpe: null })], aujourdhui, contexte());
    expect(lignes.find(l => l.type === "termites")?.exigence).toBe("complementaire");
  });

  it("ne confirme pas les obligations lorsque le contexte ne peut pas être relu", () => {
    for (const resultat of [
      preparerDiagnosticsBail([diagnostic()], aujourdhui, contexte(), true),
      preparerDiagnosticsBail([diagnostic()], aujourdhui),
      preparerDiagnosticsBail([diagnostic()], aujourdhui, contexte({ typeBien: "inconnu" })),
    ]) {
      expect(resultat.contexteIndisponible).toBe(true);
      expect(resultat.lignes).toHaveLength(1);
      expect(resultat.lignes[0]).toMatchObject({ exigence: "indisponible", statut: { ton: "neutre" } });
    }
  });
});

describe("État du rapport à la date utile", () => {
  it("annonce un renouvellement avant l’entrée sans dire que le rapport est déjà expiré", () => {
    const rapport = diagnostic({ type: "erp", date_expiration: "2026-11-15", niveau: "bien" });
    expect(statutRapportBail(rapport, aujourdhui).libelle).toBe("Rapport disponible");
    expect(statutRapportBail(rapport, aujourdhui, "2026-12-01").libelle).toBe("À renouveler avant l’entrée");
    expect(statutRapportBail({ ...rapport, date_expiration: "2026-10-26" }, aujourdhui).libelle).toBe("Expiré");
  });

  it("ne recule jamais le contrôle avant aujourd’hui pour un bail déjà commencé", () => {
    const { referenceDate, lignes } = preparerDiagnosticsBail([diagnostic({ date_expiration: "2026-10-20" })], aujourdhui, contexte({ referenceDate: "2026-10-01" }));
    expect(referenceDate).toBe(aujourdhui);
    expect(lignes.find(l => l.type === "dpe")?.statut.libelle).toBe("Expiré");
  });

  it("signale les dates incohérentes, les classes absentes et une validité non établie", () => {
    expect(statutRapportBail(diagnostic({ date_expiration: "2026-02-30" }), aujourdhui).libelle).toBe("Date à vérifier");
    expect(statutRapportBail(diagnostic({ date_realisation: "2026-12-01" }), aujourdhui).libelle).toBe("Date à vérifier");
    expect(statutRapportBail(diagnostic({ classe_dpe: null }), aujourdhui).libelle).toBe("Classe à compléter");
    expect(statutRapportBail(diagnostic({ type: "plomb", date_expiration: null }), aujourdhui)).toEqual({ libelle: "Validité à vérifier", ton: "neutre" });
  });
});
