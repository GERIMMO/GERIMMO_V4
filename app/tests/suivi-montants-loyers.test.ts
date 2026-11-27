import { describe, expect, it } from "vitest";
import { csvSuiviLoyers, documentSuiviLoyers } from "@/lib/export-suivi-loyers";
import { ventilerLoyers } from "@/lib/loyers-parc-mois";

describe("Montants du suivi propriétaire", () => {
  it("distingue 240 € reçus et un crédit de 100 € déjà imputé à un terme de 640 €", () => {
    const terme = { lot_nom: "Verger", locataire: "Camille Fictive", montant_du: "640.00", montant_couvert: "240.00", montant_compense: "100.00" };
    const totaux = ventilerLoyers([terme]);
    expect(totaux).toEqual({ attendu: 640, recu: 240, compense: 100, resteDu: 300 });
    expect(csvSuiviLoyers([terme], totaux!)).toContain("Total;;640,00;240,00;100,00;300,00");
    const rapport = documentSuiviLoyers([terme], totaux!, { mois: "2026-11", espace: "Banc fictif", selection: "SCI du Verger" });
    const texte = rapport.html.split("<table>")[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(texte).toContain("Total 640,00 € 240,00 € 100,00 € 300,00 €");
  });

  it("plafonne la couverture par échéance, sans solder une autre échéance avec un excédent", () => {
    const chiffres = ventilerLoyers([
      { montant_du: 640, montant_couvert: 650 },
      { montant_du: 640, montant_couvert: 40, montant_compense: 80 },
    ]);
    expect(chiffres).toMatchObject({ attendu: 1280, recu: 680, compense: 80, resteDu: 520 });
  });
});
