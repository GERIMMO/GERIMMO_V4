import type { DocumentAssemble } from "./gabarit";

export type RefusCompletude = { erreur: string; manquants: string[] };

/**
 * Dernière barrière commune à tous les modèles : un document comportant un
 * libellé de fusion non alimenté reste un brouillon de données, jamais un PDF.
 */
export function refusDocumentIncomplet(document: Pick<DocumentAssemble, "manquants">): RefusCompletude | null {
  const manquants = [...new Set(document.manquants.map((champ) => champ.trim()).filter(Boolean))];
  if (manquants.length === 0) return null;
  return {
    erreur: `PDF non généré : ${manquants.length} information${manquants.length > 1 ? "s sont" : " est"} encore obligatoire${manquants.length > 1 ? "s" : ""}. Complétez ${manquants.length > 1 ? "les fiches indiquées" : "la fiche indiquée"}, puis relancez la génération.`,
    manquants,
  };
}
