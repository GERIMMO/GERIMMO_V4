// Le libellé de la catégorie d'une écriture du livre.
//
// Les catégories posées par le système sont des codes (« depot_garantie ») : affichés bruts, ils parlaient la langue de la
// base. Une catégorie saisie à la main passe telle quelle, capitale en tête. Né sur l'écran du livre
// (comptabilite/page.tsx) ; partagé en phase 3 de la mission palier 1 (lot 42, C91) avec les documents imprimés (journal de
// clôture, relevé annuel du mandat), pour qu'ils écrivent la catégorie comme l'écran.
export const LIBELLES_CATEGORIE_ECRITURE: Record<string, string> = {
  loyer: "Loyer",
  honoraires: "Honoraires",
  depot_garantie: "Dépôt de garantie",
  charges: "Charges",
  travaux: "Travaux",
  assurance: "Assurance",
  taxe_fonciere: "Taxe foncière",
  regularisation_charges: "Régularisation des charges",
  // Solde de tout compte (audit métier du 27/09) : avance restituée au locataire
  trop_percu_restitue: "Trop-perçu restitué",
  reversement: "Reversement",
};

export function libelleCategorieEcriture(categorie: string): string {
  const connu = LIBELLES_CATEGORIE_ECRITURE[categorie];
  if (connu) return connu;
  const texte = categorie.replace(/_/g, " ").trim();
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : "Sans catégorie";
}
