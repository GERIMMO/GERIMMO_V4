// LES PHOTOS DE DÉCOR DU TABLEAU DE BORD — v4.3.
//
// Servies par le CDN d'Unsplash sous la licence Unsplash (usage commercial
// autorisé, sans attribution obligatoire). Chaque emplacement liste plusieurs
// sources : `PhotoDecor` prend la première qui répond. Pour passer aux photos
// de l'agence, déposer les fichiers dans `src/images/` et les importer ici.

function unsplash(id: string, largeur: number) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${largeur}&q=72`;
}

/** Le bandeau d'accueil : une façade, une maison, en fin de journée. */
export const PHOTOS_ACCUEIL = [
  unsplash("photo-1568605114967-8130f3a36994", 1600),
  unsplash("photo-1512917774080-9991f1c4c750", 1600),
  unsplash("photo-1570129477492-45c003edd2be", 1600),
];

/** Le parcours de démarrage : un intérieur prêt à louer. */
export const PHOTOS_PREMIER_LOT = [
  unsplash("photo-1522708323590-d24dbb6b0267", 480),
  unsplash("photo-1502672260266-1c1ef2d93688", 480),
  unsplash("photo-1600585154340-be6161a56a0c", 480),
];
