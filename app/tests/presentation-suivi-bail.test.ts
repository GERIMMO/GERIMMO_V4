import { describe, it, expect } from "vitest";
import { presentationSuiviBail } from "@/lib/presentation-suivi-bail";
const bail = { id: "bail", etat: "brouillon", document_signe: null };
const circuit = { bail_id: bail.id, modele: "bail", etat: "termine", document_id: "original", document_signe: "archive", created_at: "2026-10-24T10:00:00Z" };
describe("prochaine action sur un bail", () => {
  it("reconnaît l'archive signée avant activation sans refaire signer", () => {
    expect(presentationSuiviBail(bail, { circuits: [circuit], erreur: false })).toEqual({ action: "Bail signé · location non activée", statut: "Activation par le gestionnaire" });
  });
  it("n'annonce pas un contrat non signé quand sa lecture échoue", () => {
    expect(presentationSuiviBail(bail, { circuits: [], erreur: true })?.action).toBe("Signature du bail à vérifier");
    expect(presentationSuiviBail(undefined, { circuits: [], erreur: false })?.statut).toBe("Lecture indisponible");
  });
  it("garde un nouveau circuit en attente et ignore les signatures des autres contrats", () => {
    expect(presentationSuiviBail(bail, { circuits: [circuit, { ...circuit, document_signe: null, etat: "en_cours", created_at: "2026-10-24T11:00:00Z" }], erreur: false })?.action).toBe("Signature du bail en cours");
    expect(presentationSuiviBail(bail, { circuits: [{ ...circuit, bail_id: "autre" }], erreur: false })?.action).toBe("Bail à compléter et à signer");
  });
  it("laisse le suivi des loyers et restitutions aux règles existantes", () => {
    for (const etat of ["actif", "preavis", "termine"]) expect(presentationSuiviBail({ ...bail, etat }, { circuits: [circuit], erreur: false })).toBeNull();
  });
});
