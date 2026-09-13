import { describe, expect, it } from "vitest";
import { cheminFicheAlerte } from "../src/lib/chemin-alerte";

describe("destination du traitement des alertes", () => {
  it.each(["edl_entree", "edl_sortie"])("ouvre la carte état des lieux pour %s", (type) => {
    expect(cheminFicheAlerte({ type, details: { bail_id: "bail" } }, "agence"))
      .toBe("/agence/agence/baux/bail#edl");
  });
  it("ouvre le document retourné pour contrôle", () => {
    expect(cheminFicheAlerte({ type: "signature_retournee", details: { document_id: "doc" } }, "agence"))
      .toBe("/agence/agence/documents?sel=doc");
  });
  it.each(["message_locataire", "piece_deposee"])("ouvre la personne pour %s", (type) => {
    expect(cheminFicheAlerte({ type, details: { person_id: "personne" } }, "agence"))
      .toBe("/agence/agence/personnes/personne");
  });
  it("conserve la carte de restitution", () => {
    expect(cheminFicheAlerte({ type: "decompte", details: { bail_id: "bail" } }, "agence"))
      .toBe("/agence/agence/baux/bail#restitution");
  });
  it.each([
    { type: "edl_entree", details: null },
    { type: "edl_entree", details: { lot_id: "lot" } },
    { type: "retenue_sans_justificatif", details: { restitution_id: "restitution" } },
    { type: "inconnu", details: { bail_id: "bail" } },
  ])("ne fabrique pas de destination sans contexte suffisant", (alerte) => {
    expect(cheminFicheAlerte(alerte, "agence")).toBeNull();
  });
});
