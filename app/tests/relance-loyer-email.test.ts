/**
 * Les deux courriers de relance d'impayé (20/09) : ce qu'ils disent, et ce
 * qu'ils ne disent pas.
 */
import { describe, expect, it } from "vitest";
import { corpsRelanceLoyer, sujetRelanceLoyer } from "../src/lib/relance-loyer-email";

const base = {
  prenom: "Claire",
  emetteur: "Agence Alpha",
  lot: "Appartement T2 — 12 rue des Lilas",
  periode: "2026-09-01",
  dateEcheance: "2026-09-01",
  reste: 400,
  lien: "https://gerimmo.fr/locataire/org/loyers",
} as const;

describe("le sujet dit le mois et le niveau", () => {
  it("première relance : un règlement semble en attente", () => {
    expect(sujetRelanceLoyer({ niveau: "relance_1", periode: "2026-09-01" })).toMatch(/septembre 2026/);
    expect(sujetRelanceLoyer({ niveau: "relance_1", periode: "2026-09-01" })).toMatch(/semble en attente/);
  });
  it("seconde relance : toujours en attente", () => {
    expect(sujetRelanceLoyer({ niveau: "relance_2", periode: "2026-09-01" })).toMatch(/^Seconde relance/);
  });
});

describe("le corps", () => {
  it("dit le montant, le lot, l'échéance, et où régler — sans accuser", () => {
    const html = corpsRelanceLoyer({ ...base, niveau: "relance_1" });
    expect(html).toContain("Bonjour Claire");
    expect(html).toContain("400,00");
    expect(html).toContain(base.lot);
    expect(html).toContain("01/09/2026");
    expect(html).toContain(base.lien);
    expect(html).toContain("ne pas tenir compte de ce message");
    expect(html).not.toMatch(/mise en demeure/i);
    expect(html).not.toMatch(/pénalit|poursuite|huissier/i);
  });
  it("la seconde annonce la mise en demeure comme suite possible, pas comme menace chiffrée", () => {
    const html = corpsRelanceLoyer({ ...base, niveau: "relance_2" });
    expect(html).toMatch(/mise en demeure/);
    expect(html).toMatch(/lettre recommandée/);
    expect(html).not.toMatch(/€ de frais|pénalité/i);
    expect(html).toContain("— Agence Alpha");
  });
  it("sans prénom, la salutation reste polie", () => {
    expect(corpsRelanceLoyer({ ...base, prenom: null, niveau: "relance_1" })).toContain("<p>Bonjour,</p>");
  });
});
