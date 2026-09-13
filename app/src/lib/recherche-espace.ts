import { motifLitteral } from "@/lib/ged";

export type ResultatRecherche = {
  id: string;
  type: "Logement" | "Personne" | "Bail";
  titre: string;
  detail: string;
  href: string;
};
export type ReponseRecherche = { resultats: ResultatRecherche[]; erreur?: string };

/** Le filtre OR de PostgREST a sa propre grammaire, distincte de LIKE. */
export function filtreRecherche(champs: string[], texte: string) {
  const motif = `%${motifLitteral(texte)}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return champs.map((champ) => `${champ}.ilike."${motif}"`).join(",");
}

export function normaliserRecherche(texte: string) {
  return texte.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function filtrePersonnes(texte: string) {
  const complet = filtreRecherche(["nom", "prenom", "email"], texte);
  const espace = texte.indexOf(" ");
  if (espace < 0) return complet;
  const debut = texte.slice(0, espace), fin = texte.slice(espace + 1);
  return `${complet},and(${filtreRecherche(["nom"], debut)},${filtreRecherche(["prenom"], fin)}),and(${filtreRecherche(["prenom"], debut)},${filtreRecherche(["nom"], fin)})`;
}
