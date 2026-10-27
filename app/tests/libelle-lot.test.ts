/**
 * Audit #264, DOC-06 — « Lier à une fiche » proposait trois « Lot unique »
 * identiques : un lot se nomme désormais avec son bien, comme sur la page Parc.
 */
import { describe, expect, it } from "vitest";
import { libelleLot } from "@/lib/parc";

describe("libellé d’un lot", () => {
  it("deux biens à lot unique donnent deux libellés distincts, au nom du bien", () => {
    expect(libelleLot("Lot unique", "VDD Gambetta")).toBe("VDD Gambetta");
    expect(libelleLot("Lot unique", "VDD Belleville")).toBe("VDD Belleville");
  });
  it("un lot nommé dans un immeuble garde son nom, précédé du bien", () => {
    expect(libelleLot("Lot 3", "Immeuble Vasseur")).toBe("Immeuble Vasseur · Lot 3");
    expect(libelleLot("  ", "Immeuble Vasseur")).toBe("Immeuble Vasseur");
  });
  it("sans bien lisible, le nom du lot reste affiché", () => {
    expect(libelleLot("Lot 3", null)).toBe("Lot 3");
    expect(libelleLot("", undefined)).toBe("Lot");
  });
});
