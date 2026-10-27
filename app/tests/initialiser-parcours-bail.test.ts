import { describe, expect, it } from "vitest";
import { initialiserParcoursBail } from "@/lib/initialiser-parcours-bail";
import { lireEtapeBail } from "@/lib/champs-etape-bail";

describe("reprise des informations du bail", () => {
  it("conserve les montants nuls et les choix négatifs enregistrés", () => {
    expect(initialiserParcoursBail({ charges: 0, depot_garantie: 0, revision_irl: false, clause_resolutoire_assurance: false, clause_resolutoire_troubles: false }, true)).toMatchObject({ charges: "0", depot_garantie: "0", revision_irl: "false", clause_resolutoire_assurance: "false", clause_resolutoire_troubles: "false" });
  });
  it("respecte le contrat existant même si le lot a un autre type", () => {
    expect(initialiserParcoursBail({ type: "colocation", charges_mode: "forfait", paiement_echeance: "echu" }, false)).toMatchObject({ type: "colocation", charges_mode: "forfait", paiement_echeance: "echu" });
  });
  it("reprend le meublé du lot en l’absence de contrat défini", () => {
    expect(initialiserParcoursBail({}, true).type).toBe("meuble");
    expect(initialiserParcoursBail({}, false).type).toBe("nu");
  });
  it("conserve la chambre d’un contrat individuel", () => {
    expect(initialiserParcoursBail({ type: "colocation", chambre_id: "chambre-existante" }, true)).toMatchObject({ type: "colocation_individuelle", chambre_id: "chambre-existante" });
  });
  it("ne devine ni date, ni montant, ni situation locative", () => {
    const valeurs = initialiserParcoursBail({ date_debut: null, loyer_hc: null, precedente_location: null }, true);
    expect(valeurs).toMatchObject({ date_debut: "", loyer_hc: "", precedente_location: "" });
    expect(valeurs).not.toHaveProperty("locataire_principal");
    expect(valeurs).not.toHaveProperty("jour_echeance");
  });
  it("réenregistre les réglages repris sans effacer révision ou précédent loyer", () => {
    const existant = { type: "nu", loyer_hc: 500, charges: 0, depot_garantie: 0, jour_echeance: 5, revision_irl: true, irl_trimestre: "T2", irl_valeur: 145.17, precedente_location: "recente", dernier_loyer: 490, dernier_loyer_versement: "2026-09-05", precedent_loyer_revise: false, paiement_echeance: "echu" };
    const form = new FormData();
    Object.entries(initialiserParcoursBail(existant, false)).forEach(([cle, valeur]) => form.set(cle, valeur));
    const resultat = lireEtapeBail("loyer", form, existant, { meuble: false, surface: 45 });
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.patch).toMatchObject({ charges: 0, depot_garantie: 0, revision_irl: true, irl_valeur: 145.17, dernier_loyer: 490, precedent_loyer_revise: false, paiement_echeance: "echu" });
  });
});
