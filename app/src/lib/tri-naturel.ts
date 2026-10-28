// Tri « naturel » des libellés du parc : « Lot 2 » avant « Lot 10 », sans tenir compte des majuscules ni des accents.
// Le tri texte de la base (`order("nom")`) rangeait « Lot 1, Lot 10, Lot 11 … Lot 2 » (audit final, DOC-14).
export function comparerNaturel(a: string, b: string): number {
  return a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
}
