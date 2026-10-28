import { describe, expect, it } from "vitest";
import { bailPrecedentDuLot, periodeBailPrecedent, valeursReprisesDuBail, type BailPrecedent } from "@/lib/reprise-bail-precedent";

// Décision du 27/10 (CB-08) : en relocation, le brouillon reprend les conditions du bail précédent le plus récent.
const termine = (suite: Partial<BailPrecedent>): BailPrecedent => ({
  id: "ancien", chambre_id: null, type: "nu", date_debut: "2023-09-01", date_fin: "2026-08-31", date_sortie_reelle: "2026-08-31",
  loyer_hc: 930, charges: 65, charges_mode: "provision", jour_echeance: 5, paiement_echeance: "echoir", revision_irl: true, irl_trimestre: "T2 2023", irl_valeur: 140.59,
  ...suite,
});

describe("bail précédent du lot", () => {
  it("aucun bail antérieur : rien à reprendre", () => {
    expect(bailPrecedentDuLot([])).toBeNull();
  });
  it("retient le plus récent d’après la sortie réelle, sinon le terme, sinon le début", () => {
    const ancien = termine({ id: "a", date_sortie_reelle: "2020-06-30", date_fin: "2021-08-31" });
    const recent = termine({ id: "b", date_sortie_reelle: null, date_fin: "2025-02-28" });
    const enPreavis = termine({ id: "c", date_sortie_reelle: null, date_fin: null, date_debut: "2024-03-01" });
    expect(bailPrecedentDuLot([ancien, recent])?.id).toBe("b");
    expect(bailPrecedentDuLot([ancien, enPreavis, recent])?.id).toBe("b");
    expect(bailPrecedentDuLot([ancien, enPreavis])?.id).toBe("c");
  });
  it("colocation à baux individuels : seul le bail de la même chambre compte, jamais celui d’une autre ni celui du lot entier", () => {
    const chambreA = termine({ id: "a", chambre_id: "chambre-a", type: "colocation", loyer_hc: 450 });
    const chambreB = termine({ id: "b", chambre_id: "chambre-b", type: "colocation", loyer_hc: 500, date_sortie_reelle: "2026-09-30" });
    const lotEntier = termine({ id: "lot", date_sortie_reelle: "2026-10-15" });
    expect(bailPrecedentDuLot([chambreA, chambreB, lotEntier], "chambre-a")?.id).toBe("a");
    expect(bailPrecedentDuLot([chambreA, chambreB])).toBeNull();
    expect(bailPrecedentDuLot([chambreA, chambreB, lotEntier])?.id).toBe("lot");
  });
});

describe("valeurs reprises", () => {
  it("reprend le type nu/meublé, le loyer, les charges et leur mode, l’échéance, le paiement et la référence IRL", () => {
    expect(valeursReprisesDuBail(termine({}), "meuble")).toEqual({ type: "nu", loyer_hc: 930, charges: 65, charges_mode: "provision", jour_echeance: 5, paiement_echeance: "echoir", revision_irl: true, irl_trimestre: "T2 2023", irl_valeur: 140.59 });
    // Un trimestre sans année n'est jamais repris (décision du 28/10, relecture BAIL-02) : le champ reste à choisir.
    expect(valeursReprisesDuBail(termine({ irl_trimestre: "T2" }), "meuble")).not.toHaveProperty("irl_trimestre");
  });
  it("ne reprend jamais le locataire, les dates ni le dépôt de garantie", () => {
    const reprises = valeursReprisesDuBail({ ...termine({}), locataire_principal: "ancien-locataire", depot_garantie: 900 } as BailPrecedent, "nu");
    for (const interdit of ["locataire_principal", "depot_garantie", "date_debut", "date_fin", "date_sortie_reelle", "id", "chambre_id"]) expect(reprises).not.toHaveProperty(interdit);
  });
  it("ignore les valeurs absentes et garde le type du lot quand l’ancien bail était une colocation", () => {
    expect(valeursReprisesDuBail(termine({ type: "colocation", irl_trimestre: null, irl_valeur: null, charges: null }), "meuble")).toEqual({ type: "meuble", loyer_hc: 930, charges_mode: "provision", jour_echeance: 5, paiement_echeance: "echoir", revision_irl: true });
  });
  it("un bail nu ne reprend pas un forfait de charges (contrat type, section IV.B)", () => {
    expect(valeursReprisesDuBail(termine({ type: "colocation", charges_mode: "forfait" }), "nu").charges_mode).toBe("provision");
    expect(valeursReprisesDuBail(termine({ type: "meuble", charges_mode: "forfait" }), "nu").charges_mode).toBe("forfait");
  });
});

describe("période du bail précédent", () => {
  it("du … au …, avec la sortie réelle de préférence au terme", () => {
    expect(periodeBailPrecedent(termine({ date_sortie_reelle: "2026-07-15" }))).toBe("du 01/09/2023 au 15/07/2026");
    expect(periodeBailPrecedent(termine({ date_sortie_reelle: null }))).toBe("du 01/09/2023 au 31/08/2026");
  });
  it("depuis le … quand la fin n’est pas connue (préavis en cours)", () => {
    expect(periodeBailPrecedent(termine({ date_sortie_reelle: null, date_fin: null }))).toBe("depuis le 01/09/2023");
    expect(periodeBailPrecedent(termine({ date_debut: null, date_sortie_reelle: null, date_fin: null }))).toBe("");
  });
});
