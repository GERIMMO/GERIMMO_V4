import { afterEach, describe, expect, it, vi } from "vitest";
import { bilanDiagnostics, presentationDiagnostic } from "../src/lib/presentation-diagnostics";
const document = { type: "dpe", document_id: "pdf", date_expiration: "2028-10-24" };
afterEach(() => vi.useRealTimers());
describe("Un état documentaire compréhensible", () => {
  it("un rapport sans fichier ne peut jamais être présenté comme à jour", () => {
    expect(presentationDiagnostic("dpe", { ...document, document_id: null }).etat).toBe("a_joindre");
  });
  it("sépare une obligation conditionnelle d'un document réellement manquant", () => {
    for (const type of ["termites", "gaz", "electricite"]) expect(presentationDiagnostic(type, undefined).etat).toBe("a_confirmer");
    expect(presentationDiagnostic("dpe", undefined).etat).toBe("a_ajouter");
  });
  it("une absence d'échéance ne vaut pas une validité illimitée", () => {
    expect(presentationDiagnostic("plomb", { ...document, type:"plomb", date_expiration: null })).toMatchObject({ etat:"disponible", libelle:"Validité à vérifier", ton:"neutre" });
  });
  it("distingue document expiré, échéance proche et rapport à jour", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    expect(presentationDiagnostic("dpe", document).etat).toBe("valide");
    expect(presentationDiagnostic("dpe", {...document, date_expiration:"2026-10-20"}).etat).toBe("expire");
    expect(presentationDiagnostic("dpe", {...document, date_expiration:"2026-11-20"}).etat).toBe("expire_bientot");
  });
  it("le bilan n'additionne pas deux fois un type et ses quatre compteurs ne se chevauchent pas", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const bilan = bilanDiagnostics(["dpe", "dpe", "erp", "termites", "plomb", "gaz"], [document,
      {...document, type:"erp",date_expiration:"2026-10-20"}, {...document,type:"plomb",date_expiration:null},
      {...document,type:"gaz",document_id:null}]);
    expect(bilan).toMatchObject({ disponibles:3, aJour:1, aAjouter:1, aRenouveler:1, aVerifier:2, aConfirmer:1 });
    expect(bilan.aJour + bilan.aAjouter + bilan.aRenouveler + bilan.aVerifier).toBe(bilan.lignes.length);
  });
});
