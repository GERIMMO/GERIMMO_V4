import { describe, expect, it } from "vitest";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { rendrePdf } from "@/lib/documents/rendu";

describe("barrière de complétude des PDF", () => {
  it("autorise un document dont tous les champs sont alimentés", () => {
    expect(refusDocumentIncomplet({ manquants: [] })).toBeNull();
  });

  it("refuse le rendu, nettoie et dédoublonne les champs manquants", () => {
    expect(refusDocumentIncomplet({ manquants: ["adresse", " adresse ", "date", ""] })).toEqual({
      erreur: "PDF non généré : 2 informations sont encore obligatoires. Complétez les fiches indiquées, puis relancez la génération.",
      manquants: ["adresse", "date"],
    });
  });

  it("protège aussi le moteur de rendu contre tout appel direct", async () => {
    await expect(rendrePdf({ html: "<p>test</p>", piedHtml: "", titreDocument: "test", reference: "T", empreinte: "x", manquants: ["adresse"] }))
      .rejects.toThrow("Rendu PDF refusé : adresse");
  });
});
