import type { recapitulatifFiscal } from "./fiscal";

/** Export des seuls montants affichés, à la quote-part du déclarant si nécessaire. */
export function csvRecapitulatifFiscal(recap: ReturnType<typeof recapitulatifFiscal>, annee: number) {
  const lignes = [
    ["Année", "Rubrique", "Libellé", "Montant affiché (EUR)"],
    ...recap.rubriques.map(r => [String(annee), r.code, r.libelle,
      r.aCompleter ? "" : (recap.ventile ? r.montantQuotePart : r.montant).toFixed(2).replace(".", ",")]),
  ];
  return "\uFEFF" + lignes.map(l => l.map(v => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\r\n");
}
