// Les catégories posées par le système sont des codes (« depot_garantie ») :
// affichés bruts, ils parlaient la langue de la base. Une catégorie saisie à
// la main passe telle quelle, capitale en tête. Partagé entre le livre et
// l'aide fiscale (audit final du 27/10, LOY-14 : « taxe_fonciere » à l'écran).
const LIBELLES_CATEGORIE: Record<string, string> = {
  loyer: "Loyer",
  honoraires: "Honoraires",
  depot_garantie: "Dépôt de garantie",
  charges: "Charges",
  travaux: "Travaux",
  assurance: "Assurance",
  taxe_fonciere: "Taxe foncière",
  teom: "Taxe d’enlèvement des ordures ménagères",
  regularisation_charges: "Régularisation des charges",
  // Solde de tout compte (audit métier du 27/09) : avance restituée au locataire
  trop_percu_restitue: "Trop-perçu restitué",
  reversement: "Reversement",
};

export function libelleCategorie(categorie: string): string {
  const connu = LIBELLES_CATEGORIE[categorie];
  if (connu) return connu;
  const texte = categorie.replace(/_/g, " ").trim();
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : "Sans catégorie";
}
