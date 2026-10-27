import type { ValeursParcoursBail } from "./champs-etape-bail";

/** Les valeurs enregistrées gagnent toujours, y compris zéro et « non ».
 * Les valeurs par défaut sont les réglages déjà employés par le parcours,
 * jamais des montants, des dates ou une situation locative supposés. */
export function initialiserParcoursBail(defauts: ValeursParcoursBail, meuble: boolean): Record<string, string> {
  const valeurs = {
    ...defauts,
    type: defauts.chambre_id ? "colocation_individuelle" : (defauts.type ?? (meuble ? "meuble" : "nu")),
    logement_meuble: meuble,
    charges_mode: defauts.charges_mode ?? "provision",
    paiement_echeance: defauts.paiement_echeance ?? "echoir",
    revision_irl: defauts.revision_irl ?? false,
    meuble_etudiant: defauts.meuble_etudiant ?? false,
    clause_resolutoire_assurance: defauts.clause_resolutoire_assurance ?? true,
    clause_resolutoire_troubles: defauts.clause_resolutoire_troubles ?? true,
    clause_resolutoire_servitude: defauts.clause_resolutoire_servitude ?? false,
  };
  return Object.fromEntries(Object.entries(valeurs).map(([nom, valeur]) => [nom, valeur == null ? "" : String(valeur)]));
}
