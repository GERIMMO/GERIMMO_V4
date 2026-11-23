import { describe, expect, it } from "vitest";
import { documentRegularisationFournitures, type BrouillonRegularisationFourniture } from "../src/lib/regularisation-fournitures";
const d: BrouillonRegularisationFourniture = { id: "test", bail_id: "bail", annee: 2026, empreinte: "hash", regularisation_id: null, source: { bailleur: "SCI des Trois Lots", annee: 2026, locataire: "Locataire test", logement: "Studio", adresse: "1 rue test, Lyon", provisions: 120, charges_reelles: 180.01, ecart: -60.01, factures: [{ repartition_id: "r", document_id: "doc", facture_id: "f", reference: "Eau <script>alert(1)</script>", fournisseur: "Fournisseur test", debut: "2026-01-01", fin: "2026-12-31", montant_cents: 18001 }] } };
describe("décompte annuel depuis les factures", () => {
  it("reprend les montants, sans confondre provision appelée et encaissement", () => {
    const doc = documentRegularisationFournitures(d, false, "proprietaire_direct");
    expect(doc.manquants).toEqual([]);expect(doc.html).toContain("Provisions appelées sur l’exercice");
    expect(doc.html).toContain("60,01");expect(doc.html).toContain("180,01");expect(doc.html).toContain("ne constitue ni une quittance");
  });
  it("échappe toutes les références provenant des factures", () => {
    const doc = documentRegularisationFournitures(d, false, "proprietaire_direct");expect(doc.html).not.toContain("<script>");expect(doc.html).toContain("&lt;script&gt;");
  });
  it("refuse une identité absente au rendu PDF et distingue un crédit locataire", () => {
    const doc = documentRegularisationFournitures({ ...d, source: { ...d.source, locataire: "", ecart: 10 } }, false, "proprietaire_direct");
    expect(doc.manquants).toContain("Nom du locataire");expect(doc.html).toContain("Solde en faveur du locataire");
  });
  // Reprise du lot 37 (même cause que C41, C52, C70, C71) : « auprès du gestionnaire » était imprimé sans condition, aussi chez
  // un propriétaire qui gère lui-même (le décompte est rangé dans les documents du bail et du locataire).
  it("renvoie aux justificatifs auprès du bailleur hors agence, du gestionnaire en agence", () => {
    const proprietaire = documentRegularisationFournitures(d, false, "proprietaire_direct").html;
    expect(proprietaire).toContain("Les justificatifs peuvent être consultés auprès du bailleur.");
    expect(proprietaire).not.toContain("gestionnaire");
    expect(documentRegularisationFournitures(d, false, "agence").html).toContain("Les justificatifs peuvent être consultés auprès du gestionnaire.");
  });
  it("ne promet un échéancier que lorsque demandé", () => {
    expect(documentRegularisationFournitures(d, false, "proprietaire_direct").html).not.toContain("douze mensualités");
    expect(documentRegularisationFournitures(d, true, "proprietaire_direct").html).toContain("douze mensualités");
  });
});
