import type { ContratFourniture } from "./consommations";

type Contrat = Pick<ContratFourniture, "fournisseur" | "categorie" | "lot_id" | "actif">;
const normaliser = (nom: string) => nom.trim().toLocaleLowerCase("fr-FR");

/** Une information connue n'est une valeur par défaut que si elle est sans ambiguïté. */
export function contexteDepenseSimple(contrats: Contrat[], lotId: string | null) {
  const pertinents = contrats.filter(c => c.actif && c.lot_id === lotId);
  const uniques = new Map(pertinents.map(c => [normaliser(c.fournisseur), c.fournisseur]));
  const fournisseur = uniques.size === 1 ? [...uniques.values()][0] : "";
  return { fournisseur, categorie: natureFournisseur(pertinents, fournisseur), fournisseurs: [...uniques.values()] };
}

export function natureFournisseur(contrats: Contrat[], fournisseur: string): Contrat["categorie"] | "" {
  const natures = new Set(contrats.filter(c => c.actif && normaliser(c.fournisseur) === normaliser(fournisseur)).map(c => c.categorie));
  return natures.size === 1 ? [...natures][0] : "";
}

/** Les montants d'un avis fiscal entier ne décrivent pas nécessairement sa ligne TEOM. */
export function valeursLectureFacture(lecture: Record<string, unknown>, categorie: string) {
  const champs = ["reference", "periode_debut", "periode_fin", "total", "frais_fixes", "frais_gestion", "consommation"];
  return Object.fromEntries(champs.flatMap(cle => {
    if (categorie === "teom" && ["total", "frais_fixes", "frais_gestion"].includes(cle)) return [];
    const valeur = lecture[cle];
    return typeof valeur === "string" && valeur.trim() ? [[cle, valeur]] : [];
  }));
}
