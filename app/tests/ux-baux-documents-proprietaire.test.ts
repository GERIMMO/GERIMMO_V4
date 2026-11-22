import { describe, expect, it } from "vitest";
import { situationDatesBail } from "@/app/agence/[orgId]/baux/[bailId]/presentation-fiche-bail";
import { presentationDocumentProprietaire, titreDocumentProprietaire } from "@/app/agence/[orgId]/documents/presentation-proprietaire";

describe("Fiche bail : dates connues, sans échéance juridique supposée", () => {
  it.each([
    ["actif", "Location en cours · aucun départ renseigné"],
    ["brouillon", "Dates à confirmer avant la signature"],
    ["preavis", "Préavis en cours · date de départ à confirmer"],
    ["termine", "Bail terminé · date de sortie absente du dossier"],
    ["inconnu", "Aucune date de fin indiquée dans le dossier"],
  ])("explique le cas %s sans inventer de date", (etat, attendu) => {
    expect(situationDatesBail({ etat, date_fin: null, date_sortie_reelle: null })).toBe(attendu);
  });
  it("conserve la fin indiquée ET la sortie effective, même différentes", () => {
    const texte = situationDatesBail({ etat: "termine", date_fin: "2026-11-30", date_sortie_reelle: "2026-11-15" });
    expect(texte).toContain("30/11/2026");
    expect(texte).toContain("15/11/2026");
    expect(texte).not.toContain("en cours");
  });
});

const facture = { montant_ttc_cents: 10000, validee_le: null, decision_motif: null };
describe("Documents propriétaire : titres sans modifier les fichiers", () => {
  it("présente une facture depuis son seul rattachement explicite", () => {
    expect(titreDocumentProprietaire("Facture FA-2026-001 — incident INC-2026-0001", { incident: "Fuite sous évier", facture })).toMatch(/^Facture d’artisan — Fuite sous évier — 100,00\s€$/);
  });
  it("ne déduit pas le montant de la référence et n’invente pas le métier", () => {
    expect(titreDocumentProprietaire("Facture FA-2026-640 — incident INC-2026-0100")).toBe("Facture d’artisan");
  });
  it("préserve un titre choisi par le propriétaire, particulier ou SCI", () => {
    for (const titre of ["Contrat signé — SCI des Amandiers", "Facture de Jeanne — 100 €"]) expect(titreDocumentProprietaire(titre, { incident: "Autre", facture })).toBe(titre);
  });
  it("distingue les photos et le devis sans supposer une validation", () => {
    expect(titreDocumentProprietaire("Devis — incident INC-2026-0001")).toBe("Devis d’intervention");
    expect(titreDocumentProprietaire("Chantier (apres) — INC-2026-0001")).toBe("Photo après intervention");
    expect(titreDocumentProprietaire("Photo — INC-2026-0001")).toBe("Photo de l’incident");
  });
});

describe("Documents : action attendue et disponibilité ne sont pas une validité", () => {
  it("ne demande plus une vérification sans motif", () => {
    expect(presentationDocumentProprietaire({})).toMatchObject({ libelle: "Disponible" });
    expect(presentationDocumentProprietaire({}).detail).toContain("ne vaut pas validation");
  });
  it("signale une décision attendue pour une facture, sans en déduire un paiement", () => {
    expect(presentationDocumentProprietaire({}, null, false, facture).libelle).toBe("À valider");
    expect(presentationDocumentProprietaire({}, null, false, { ...facture, validee_le: "2026-11-18" }).libelle).toBe("Disponible");
    expect(presentationDocumentProprietaire({}, null, false, { ...facture, decision_motif: "Montant contesté" }).libelle).toBe("Disponible");
    // Audit palier 1 (P1-03) : une facture refusée n'attend plus de décision.
    const refusee = presentationDocumentProprietaire({}, null, false, { ...facture, refusee_le: "2026-11-22T10:00:00Z" });
    expect(refusee.libelle).toBe("Refusée");
    expect(refusee.detail).toBe("Cette facture a été refusée. Elle reste au dossier ; l’artisan peut en déposer une autre.");
  });
  it("conserve les alertes réelles, les signatures et les preuves", () => {
    expect(presentationDocumentProprietaire({ expire_le: "invalide" }).libelle).toBe("À vérifier");
    expect(presentationDocumentProprietaire({ expire_le: "2020-01-01" }).libelle).toBe("Expiré");
    expect(presentationDocumentProprietaire({ verifie_le: "2026-11-18" }).libelle).toBe("Vérifié");
    expect(presentationDocumentProprietaire({}, "en_cours").libelle).toBe("Signature en cours");
    expect(presentationDocumentProprietaire({}, "signe").libelle).toBe("Signé");
    expect(presentationDocumentProprietaire({}, null, true).libelle).toBe("Remplacé");
    expect(presentationDocumentProprietaire({ purged_at: "2026-11-18" }).libelle).toBe("Fichier supprimé");
  });
});
