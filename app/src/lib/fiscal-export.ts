import type { recapitulatifFiscal } from "./fiscal";

/** Export des seuls montants affichés, à la quote-part du déclarant si nécessaire. */
export function csvRecapitulatifFiscal(recap: ReturnType<typeof recapitulatifFiscal>, annee: number) {
  const lignes = [
    ["État", recap.incomplet ? "À compléter : montants confirmés uniquement" : "Montants qualifiés ; rubriques complémentaires à vérifier", "Règles", recap.versionRegles],
    ["Export préparé le", new Date().toISOString(), "", ""],
    ...recap.alertes.map(a => ["À compléter",a,"",""]),
    ["Année", "Rubrique", "Libellé", "Montant affiché (EUR)"],
    ...recap.rubriques.map(r => [String(annee), r.code, r.libelle,
      r.aCompleter ? "" : (recap.ventile ? r.montantQuotePart : r.montant).toFixed(2).replace(".", ",")]),
    [String(annee),"HORS TOTAL","Montant net à qualifier",recap.aQualifier.toFixed(2).replace(".",",")],
    [String(annee),"HORS TOTAL","Non déductible confirmé",recap.nonDeductible.toFixed(2).replace(".",",")],
    [String(annee),"HORS TOTAL","Provisions et charges récupérées",recap.chargesRecuperees.toFixed(2).replace(".",",")],
    [String(annee),"HORS TOTAL","Fonds travaux ALUR versé",recap.fondsTravauxAlur.toFixed(2).replace(".",",")],
  ];
  return "\uFEFF" + lignes.map(l => l.map(v => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\r\n");
}
