import { describe, expect, it } from "vitest";
import { etapeChantier } from "@/app/artisan/chantiers/[chantierId]/etape-chantier";

const base = { statut: "brouillon", facture: false, actif: true, clientArchive: false };
describe("Chantier externe : une prochaine action issue de l’état existant", () => {
  it.each([
    ["brouillon", undefined, "devis"],
    ["brouillon", "brouillon", "valider"],
    ["brouillon", "valide", "accord"],
    ["brouillon", "refuse", "devis"],
    ["accepte", "accepte", "planning"],
    ["planifie", "accepte", "demarrer"],
    ["en_cours", "accepte", "bilan"],
    ["termine", "accepte", "facture"],
  ])("%s / devis %s → %s", (statut, devis, action) => {
    expect(etapeChantier({ ...base, statut, devis }).action).toBe(action);
  });
  it("ne prétend pas qu’un PDF validé a été envoyé ou accepté", () => {
    const etape = etapeChantier({ ...base, devis: "valide" });
    expect(etape.titre).toBe("Enregistrer l’accord du client");
    expect(etape.detail).toContain("Gerimmo ne confirme pas son envoi");
  });
  it("ne confond pas facture déposée et paiement", () => {
    const etape = etapeChantier({ ...base, statut: "termine", facture: true });
    expect(etape.action).toBe("suivi-facture");
    expect(etape.detail).toContain("ne signifie pas qu’elle a été réglée");
  });
  it("propose le dépôt d’une nouvelle facture quand aucune facture courante ne subsiste", () => {
    expect(etapeChantier({ ...base, statut: "termine", facture: false }).action).toBe("facture");
  });
  it("n’invite pas à agir si l’écriture est fermée ou le chantier annulé", () => {
    expect(etapeChantier({ ...base, actif: false, devis: "valide" }).action).toBeNull();
    expect(etapeChantier({ ...base, statut: "annule", devis: "valide" }).action).toBeNull();
  });
  it("n’invente pas une transition pour un état inconnu ou un client archivé sans devis", () => {
    expect(etapeChantier({ ...base, statut: "inconnu" }).action).toBeNull();
    expect(etapeChantier({ ...base, clientArchive: true }).action).toBeNull();
  });
});
