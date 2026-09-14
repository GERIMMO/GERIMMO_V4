// Bail unique : le plafond porte sur le loyer HC de tout le logement.
// Le caractère meublé du lot complète le type « colocation » du modèle.
export function moisDepotGarantie(type: string, logementMeuble: boolean): 1 | 2 {
  return type === "meuble" || (type === "colocation" && logementMeuble) ? 2 : 1;
}
