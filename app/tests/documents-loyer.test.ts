import { expect, it } from "vitest";
import { libelleDocumentLoyer } from "../src/lib/documents-loyer";

it("ne présente pas un paiement partiel comme une quittance", () => {
  expect(libelleDocumentLoyer("partiel")).toBe("reçu de paiement partiel");
});
it("présente le terme soldé comme une quittance", () => {
  expect(libelleDocumentLoyer("paye")).toBe("quittance");
});
it("reste neutre si le statut ne permet pas de qualifier le document", () => {
  expect(libelleDocumentLoyer("inconnu")).toBe("justificatif de paiement");
});
