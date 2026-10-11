import { expect, it } from "vitest";
import { recapitulatifFiscal } from "@/lib/fiscal";
import { csvRecapitulatifFiscal } from "@/lib/fiscal-export";

it("exporte la quote-part affichée et laisse les rubriques à compléter vides", () => {
  const recap = recapitulatifFiscal([], 2026);
  recap.ventile = true;
  recap.rubriques = [
    { code:"211", libelle:'Loyers "nus"', sens:"recette", categories:[], montant:1200, montantQuotePart:600 },
    { code:"212", libelle:"À reporter", sens:"recette", categories:[], montant:0, montantQuotePart:0, aCompleter:true },
  ];
  const csv = csvRecapitulatifFiscal(recap, 2026);
  expect(csv).toContain('"2026";"211";"Loyers ""nus""";"600,00"');
  expect(csv).not.toContain('"1200,00"');
  expect(csv).toContain('"2026";"212";"À reporter";""');
});
