// Mobilier minimum du logement meublé — décret n° 2015-981 du 31 juillet 2015
// (article 2 : onze éléments). Une seule liste, partagée par le rappel du
// formulaire d'inventaire (client) et l'ajout groupé (action serveur) : décision
// du 27/10 (CB-14), aucune copie ailleurs. Libellés courts, utilisables tels quels
// comme désignation d'une ligne d'inventaire (liste non revérifiée en ligne le 27/10).
export const MOBILIER_DECRET_2015_981 = [
  "Literie (couette/couverture)",
  "Occultation fenêtres (chambres)",
  "Plaques de cuisson",
  "Four ou micro-ondes",
  "Réfrigérateur / congélateur",
  "Vaisselle suffisante",
  "Ustensiles de cuisine",
  "Table et sièges",
  "Étagères de rangement",
  "Luminaires",
  "Matériel d'entretien ménager",
] as const;

// Valeurs admises par la contrainte `inventaire_lignes.etat` (migration 20260801).
export const ETATS_INVENTAIRE = ["neuf", "bon", "usage", "mauvais"] as const;
export const LIBELLE_ETAT_INVENTAIRE: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon",
  usage: "Usagé",
  mauvais: "Mauvais",
};

/** Clé de comparaison d'une désignation : casse, accents et espaces ignorés. */
export function cleDesignation(designation: string): string {
  return designation.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Éléments du décret absents d'un inventaire, dans l'ordre du décret (un second ajout ne crée aucun doublon). */
export function mobilierDecretManquant(designations: readonly string[]): string[] {
  const presentes = new Set(designations.map(cleDesignation));
  return MOBILIER_DECRET_2015_981.filter((element) => !presentes.has(cleDesignation(element)));
}
