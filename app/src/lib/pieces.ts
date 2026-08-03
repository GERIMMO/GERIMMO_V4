// Les pièces d'un lot servent à découper la grille d'état des lieux. Sans elles,
// la grille retombe sur une liste « Général » de sept lignes — un document qui
// tient mal devant un locataire qui conteste une retenue sur son dépôt.
//
// Les saisir une par une décourage. On les propose donc d'après le nombre de
// pièces déjà renseigné sur le lot, à charge pour l'agent d'ajuster : c'est plus
// rapide de retirer une chambre que d'en écrire six.
//
// Convention française : « 3 pièces » compte le séjour et les chambres, jamais
// la cuisine, la salle de bain ni les WC.
export function piecesHabituelles(nbPieces: number | null | undefined): string[] {
  const n = Math.min(Math.max(Math.trunc(nbPieces ?? 1), 1), 12);

  // Un studio n'a ni entrée ni séjour distinct : tout tient dans une pièce.
  if (n === 1) return ["Pièce principale", "Cuisine", "Salle d'eau", "WC"];

  const liste = ["Entrée", "Séjour"];
  const chambres = n - 1;
  for (let i = 1; i <= chambres; i++) {
    liste.push(chambres === 1 ? "Chambre" : `Chambre ${i}`);
  }
  liste.push("Cuisine", "Salle de bain", "WC");
  return liste;
}
