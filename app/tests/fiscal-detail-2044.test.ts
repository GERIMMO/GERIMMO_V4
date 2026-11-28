import { describe, expect, it } from "vitest";
import { recapitulatifFiscal, type ExerciceFiscalLot } from "@/lib/fiscal";

const exercice: ExerciceFiscalLot = {
  lot_id: "appartement", annee: 2026, justification: "Dossier de détention",
  periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 75, regime: "nu" }],
  regularisation230: 40, quote_part230: 75, justification230: "Décompte annuel du syndic",
};
const loyer = {
  id: "loyer-mars", date_piece: "2026-03-05", categorie: "Loyer",
  sens: "recette", montant: 840, lot_id: exercice.lot_id,
};
const options = {
  exigerPerimetre: true,
  exercices: new Map([[exercice.lot_id, exercice]]),
  composantes: new Map([[loyer.id, { ecriture_id: loyer.id, loyer_hc: 780, charges: 60, non_ventile: 0 }]]),
};

describe("Détail de calcul de la 2044", () => {
  it("explique le loyer hors charges, sa quote-part et la régularisation", () => {
    const { rubriques } = recapitulatifFiscal([loyer], 2026, options);
    expect(rubriques.find(r => r.code === "211")).toMatchObject({
      montant: 780, montantQuotePart: 585,
      detail: [{ ecriture: loyer, montant: 780, quotePart: 75, charges: 60, nonVentile: 0 }],
    });
    expect(rubriques.find(r => r.code === "230")).toMatchObject({
      montant: 40, montantQuotePart: 30,
      detail: [{ lotId: exercice.lot_id, montant: 40, quotePart: 75, justification: exercice.justification230 }],
    });
  });

  it("laisse la location meublée hors des lignes de revenus fonciers", () => {
    const meuble: ExerciceFiscalLot = { ...exercice, periodes: [{ ...exercice.periodes[0], regime: "meuble" }] };
    const { rubriques, meuble: totalMeuble } = recapitulatifFiscal([loyer], 2026, {
      ...options, exercices: new Map([[meuble.lot_id, meuble]]),
    });
    expect(totalMeuble.recettes).toBe(840);
    expect(rubriques.every(r => "detail" in r && Array.isArray(r.detail) && r.detail.length === 0)).toBe(true);
  });
});
