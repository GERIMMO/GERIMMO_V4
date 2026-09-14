import { describe, expect, it } from "vitest";
import { regrouperDocumentsLot } from "@/lib/documents-lot";

describe("Documents d'un logement", () => {
  it("réunit les liens lot et bail sans perdre les métadonnées ni modifier la source", () => {
    const source = [
      { document_id: "edl", rattachement: "le bail", titre: "État des lieux", expire_le: null },
      { document_id: "edl", rattachement: "ce lot", titre: "État des lieux", expire_le: null },
      { document_id: "recu", rattachement: "le bail", titre: "Reçu partiel", expire_le: "2027-01-01" },
    ];
    expect(regrouperDocumentsLot(source)).toEqual([
      { ...source[0], rattachement: "le bail · ce lot" }, source[2],
    ]);
    expect(source[0].rattachement).toBe("le bail");
    expect(source).toHaveLength(3);
  });
  it("conserve deux pièces distinctes de même titre et déduplique un contexte répété", () => {
    expect(regrouperDocumentsLot([
      { document_id: "a", rattachement: "le bail", titre: "Photo" },
      { document_id: "b", rattachement: "ce lot", titre: "Photo" },
      { document_id: "a", rattachement: "le bail", titre: "Photo" },
    ])).toEqual([
      { document_id: "a", rattachement: "le bail", titre: "Photo" },
      { document_id: "b", rattachement: "ce lot", titre: "Photo" },
    ]);
  });
});
