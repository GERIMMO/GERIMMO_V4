import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MontantsDuLoyer } from "@/components/montants-loyer";
import { csvSuiviLoyers, documentSuiviLoyers } from "@/lib/export-suivi-loyers";
import { ventilerLoyers } from "@/lib/loyers-parc-mois";

const contexte = { mois: "2026-11", espace: "Banc fictif", selection: "SCI du Verger" };
const termeSansCredit = { lot_nom: "Verger", locataire: "Camille Fictive", montant_du: 640, montant_couvert: 240 };

describe("Montants du suivi propriétaire", () => {
  it("omet la compensation à zéro dans le résumé, le PDF et le CSV", () => {
    const totaux = ventilerLoyers([termeSansCredit])!;
    expect(renderToStaticMarkup(createElement(MontantsDuLoyer, { montants: totaux }))).not.toContain("Compensé");
    const csv = csvSuiviLoyers([termeSansCredit], totaux);
    expect(csv).toContain("Logement;Locataire;Attendu;Reçu;Reste dû");
    expect(csv).toContain("Total;;640,00;240,00;400,00");
    expect(csv).not.toContain("Compensé");
    const pdf = documentSuiviLoyers([termeSansCredit], totaux, contexte);
    expect(pdf.html).not.toContain("Compensé");
  });

  it("signale les loyers exclus par le filtre SCI sans les ajouter aux montants numériques du CSV ou du PDF", () => {
    const totaux = ventilerLoyers([termeSansCredit])!;
    const aRattacher = [{ lot_nom: 'Logement à rattacher', montant_du: 300 }];
    const csv = csvSuiviLoyers([termeSansCredit], totaux, aRattacher);
    expect(csv).toContain("Loyers à rattacher, exclus du total");
    expect(csv).toContain("Logement à rattacher · 300,00");
    expect(csv).toContain("Total;;640,00;240,00;400,00");
    const pdf = documentSuiviLoyers([termeSansCredit], totaux, { ...contexte, aRattacher });
    expect(pdf.html).toContain("Loyers à rattacher, exclus du total");
    expect(pdf.html).toContain("Logement à rattacher · 300,00");
  });
  it("distingue 240 € reçus et un crédit de 100 € déjà imputé à un terme de 640 €", () => {
    const terme = { lot_nom: "Verger", locataire: "Camille Fictive", montant_du: "640.00", montant_couvert: "240.00", montant_compense: "100.00" };
    const totaux = ventilerLoyers([terme]);
    expect(totaux).toEqual({ attendu: 640, recu: 240, compense: 100, resteDu: 300 });
    expect(renderToStaticMarkup(createElement(MontantsDuLoyer, { montants: totaux! }))).toContain("Compensé");
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
