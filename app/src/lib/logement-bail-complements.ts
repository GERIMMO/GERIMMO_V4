/** Les champs requis par les formulaires existants, sans redemander les valeurs enregistrées. */
type Valeurs = Record<string, unknown>;
const absent = (valeur: unknown) => valeur == null || String(valeur).trim() === "";

export function complementsLogementBail(lot: Valeurs, bien: Valeurs) {
  const logement = ["nom", "identifiant_fiscal", "surface_m2", "pieces", "chauffage", "eau_chaude", "locaux_privatifs", "description"]
    .filter(champ => absent(lot[champ]) || (["surface_m2", "pieces"].includes(champ) && !(Number(lot[champ]) > 0)));
  const batiment = ["nom", "address_line1", "postal_code", "city", "annee_construction", "parties_communes", "acces_tic"]
    .filter(champ => absent(bien[champ]) || (champ === "annee_construction" && (!Number.isInteger(Number(bien[champ])) || Number(bien[champ]) < 1000 || Number(bien[champ]) > 2100)));
  return { logement, batiment };
}
