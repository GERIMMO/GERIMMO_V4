// Le gabarit de la balance d'ouverture, et sa lecture.
//
// La mécanique CSV est celle de l'import du parc (`csv.ts`) : mêmes tolérances
// sur le séparateur, les guillemets et les en-têtes. Ne vivent ici que les
// colonnes de la reprise comptable — et elles sont peu nombreuses, à dessein.
// Une balance d'ouverture, c'est QUATRE questions : de quoi s'agit-il, combien,
// pour qui, et qui détient l'argent.

import { gabarit, lire, type Colonne, type LectureCsv, type LigneCsv } from "@/lib/csv";

export type LigneSolde = LigneCsv;
export type { LectureCsv };

/** Les quatre natures de solde que le référentiel nomme (module 16). */
export const TYPES_SOLDE = [
  ["depot_garantie", "Dépôt de garantie détenu pour un locataire"],
  ["solde_locataire", "Solde du locataire : positif s'il a de l'avance, négatif s'il doit"],
  ["provision_charges", "Provisions pour charges détenues"],
  ["fonds_mandant", "Fonds détenus pour un propriétaire"],
] as const;

export const COLONNES = [
  ["type", "Type (depot_garantie / solde_locataire / provision_charges / fonds_mandant)", true],
  ["montant", "Montant (€)", true],
  ["locataire_email", "Email du locataire", false],
  ["bien", "Nom du bien", false],
  ["lot", "Nom du lot", false],
  ["proprietaire_email", "Email du propriétaire", false],
  ["detenteur", "Détenteur du dépôt (agence ou proprietaire)", false],
  ["reference", "Référence (facultatif)", false],
] as const satisfies readonly Colonne[];

/** Le gabarit : l'en-tête, et une ligne de chaque nature pour montrer la forme. */
export function gabaritCsv(): string {
  return gabarit(COLONNES, [
    "depot_garantie",
    "700",
    "locataire@exemple.fr",
    "Résidence des Tilleuls",
    "A12",
    "",
    "agence",
    "DG repris de l'ancien mandat",
  ]);
}

export function lireCsv(contenu: string): LectureCsv {
  return lire(COLONNES, contenu);
}

/**
 * Le total de trésorerie que le fichier représente, calculé comme la base le
 * calculera — pour que l'écran puisse proposer le montant à annoncer au lieu
 * de laisser l'agence le deviner.
 *
 * N'y entre QUE l'argent que l'agence détient : un dépôt gardé par le
 * propriétaire n'est pas chez elle, et une dette de locataire n'est pas de
 * l'argent.
 */
export function tresorerieDuFichier(lignes: LigneSolde[]): number {
  return lignes.reduce((total, l) => {
    const type = (l.type ?? "").trim().toLowerCase();
    const montant = Number((l.montant ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(montant)) return total;
    const detenteur = (l.detenteur ?? "").trim().toLowerCase();
    if (type === "depot_garantie") return detenteur === "agence" ? total + montant : total;
    if (type === "solde_locataire") return montant > 0 ? total + montant : total;
    if (type === "provision_charges" || type === "fonds_mandant") {
      return montant > 0 ? total + montant : total;
    }
    return total;
  }, 0);
}
