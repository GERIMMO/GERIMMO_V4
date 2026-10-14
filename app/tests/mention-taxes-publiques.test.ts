/**
 * Retrait des agences du site public de la V1 (audit du 13/10/2026) : la phrase de taxes des pages publiques
 * ne nomme plus les agences ; l'ancienne rédaction reste disponible pour le jour où leur grille reviendra.
 */
import { describe, expect, it } from "vitest";
import { MENTION_REGIME_INCONNU, mentionTaxesPubliques } from "../src/lib/tarifs";

describe("mentionTaxesPubliques", () => {
  it("franchise en base : ne nomme pas les agences par défaut", () => {
    const phrase = mentionTaxesPubliques({ nature: "franchise" });
    expect(phrase).toBe("TVA non applicable, art. 293 B du CGI : les prix affichés sont les montants payés.");
    expect(phrase).not.toMatch(/agence/i);
  });

  it("assujetti : prix TTC seul par défaut", () => {
    const phrase = mentionTaxesPubliques({ nature: "assujetti", tauxPourcent: 20 });
    expect(phrase).toBe("Prix TTC, TVA 20 % incluse.");
    expect(phrase).not.toMatch(/agence/i);
  });

  it("régime inconnu : la mention d'attente, inchangée", () => {
    expect(mentionTaxesPubliques(null)).toBe(MENTION_REGIME_INCONNU);
  });

  it("l'ancienne rédaction reste disponible avec l'option agences", () => {
    expect(mentionTaxesPubliques({ nature: "franchise" }, { agences: true })).toMatch(/comme pour les agences/);
    expect(mentionTaxesPubliques({ nature: "assujetti", tauxPourcent: 20 }, { agences: true })).toMatch(/Agences : prix HT/);
  });
});
