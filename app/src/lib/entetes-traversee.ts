/**
 * Les en-têtes que le proxy pose sur chaque requête pour la trace de traversée (D08, audit du 13/10).
 * Dans leur propre fichier, sans import : le proxy les lit sans embarquer `next/headers`.
 *
 * Le proxy les ÉCRASE à chaque requête : une valeur envoyée par le navigateur n'arrive jamais jusqu'aux
 * pages. Ils ne décident d'aucun droit ; ils ne servent qu'à décrire la ligne d'audit.
 */
export const ENTETE_CHEMIN = "x-gerimmo-chemin";
export const ENTETE_METHODE = "x-gerimmo-methode";
