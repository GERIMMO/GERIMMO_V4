/**
 * La quittance délivrée au locataire suit le modèle conforme (audit du 27/09).
 *
 * La page /quittance/[id] — celle que le locataire ouvre depuis l'e-mail —
 * avait sa propre mise en page : ni adresse de l'émetteur, ni période
 * « du … au … », ni « Fait à », ni règlement, et « représenté par » même
 * chez un propriétaire direct. Elle rend désormais le modèle PDF conforme
 * (wiki « Quittance conforme » : loyer et charges séparés, identité et
 * adresse de l'émetteur), avec la même barrière de complétude.
 */
import { describe, expect, it } from "vitest";
import {
  assemblerQuittanceDelivree,
  libelleMode,
  manquantsQuittance,
  motifQuittanceIncomplete,
  parties,
} from "@/lib/quittance-conforme";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

const PD = () =>
  quittanceDocumentComplete({
    organisation: {
      ...quittanceDocumentComplete().organisation,
      type: "proprietaire_direct",
      nom: "Parc de Claire Moreau",
      siret: null,
      carte_pro: null,
    },
    bailleurs: [{ nom: "Moreau", prenom: "Claire" }],
  });

describe("le document conforme délivré au locataire", () => {
  it("porte l'article 21, la période du … au …, loyer et charges séparés, le Fait à et la signature", () => {
    const doc = assemblerQuittanceDelivree(quittanceDocumentComplete());
    expect(doc.html).toContain("Article 21 de la loi n° 89-462 du 6 juillet 1989");
    expect(doc.html).toContain("Période du 01/09/2026 au 30/09/2026");
    expect(doc.html).toContain("Loyer hors charges");
    expect(doc.html).toContain("Provision sur charges");
    expect(doc.html).toMatch(/Fait à <span class="v">Paris<\/span>/);
    expect(doc.html).toContain('class="sig-emetteur"');
    expect(doc.html).toContain("Règlement reçu le");
    expect(doc.html).toContain("par <span class=\"v\">virement</span>");
    expect(manquantsQuittance(doc)).toEqual([]);
  });

  it("agence : l'émetteur, son adresse, son SIRET et sa carte professionnelle ; le bailleur « représenté par »", () => {
    const d = quittanceDocumentComplete();
    const doc = assemblerQuittanceDelivree(d);
    expect(doc.html).toContain("3 place de la Mairie, 75004 Paris");
    expect(doc.html).toContain("SIRET 12345678900011");
    expect(doc.html).toContain("carte professionnelle CPI 7501 2026 000 000 001");
    expect(doc.html).toContain("Dupont Jean</span>, représenté par <span class=\"v\">Agence Alpha</span>");
    expect(parties(d).emetteur).toBe("Agence Alpha");
  });

  it("propriétaire direct : le bailleur émet et signe, sans mandataire fictif", () => {
    const d = PD();
    const doc = assemblerQuittanceDelivree(d);
    expect(doc.html).not.toContain("représenté par");
    expect(doc.html).not.toContain("Parc de Claire Moreau");
    expect(doc.html).toContain('<div class="sig-nom">Moreau Claire</div>');
    expect(parties(d)).toMatchObject({ emetteur: "Moreau Claire", bailleur: "Moreau Claire", mandataire: null });
  });

  it("un reçu partiel reste un reçu : il ne vaut pas quittance", () => {
    const doc = assemblerQuittanceDelivree(
      quittanceDocumentComplete({ est_quittance: false, montant: 300 })
    );
    expect(doc.html).toContain("Reçu de paiement partiel");
    expect(doc.html).toContain("il ne vaut pas quittance");
  });

  it("même barrière que le PDF : sans adresse ni e-mail de l'émetteur, le document n'est pas délivrable", () => {
    const d = quittanceDocumentComplete();
    d.organisation = { ...d.organisation, adresse: null, email: null, ville: null };
    const manquants = manquantsQuittance(assemblerQuittanceDelivree(d));
    expect(manquants).toEqual(
      expect.arrayContaining(["domicile ou siège social", "adresse électronique", "commune"])
    );
    expect(motifQuittanceIncomplete(manquants)).toContain("La quittance n'est pas envoyée");
    expect(motifQuittanceIncomplete(manquants, false)).toContain("Le reçu n'est pas envoyé");
  });

  it("propriétaire direct sans détenteur enregistré : le nom du bailleur manque, pas de repli sur le nom du parc", () => {
    const d = PD();
    d.bailleurs = [];
    const manquants = manquantsQuittance(assemblerQuittanceDelivree(d));
    expect(manquants).toContain("nom et prénom(s), ou dénomination");
  });

  it("le mode de règlement s'écrit en toutes lettres", () => {
    expect(libelleMode("cheque")).toBe("chèque");
    expect(libelleMode("caf")).toBe("versement CAF / APL");
    expect(libelleMode(null)).toBeNull();
  });
});
