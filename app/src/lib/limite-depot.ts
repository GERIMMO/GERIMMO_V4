import { TAILLE_MAX_DEPOT_OCTETS } from "./file-type";
/** Marge sous la limite de transport, y compris pour un envoi de plusieurs pièces. */
export function erreurVolumeDepot(fichiers: Iterable<{size:number}>): string | null {
 let total=0;
 for(const fichier of fichiers){
  if(fichier.size>TAILLE_MAX_DEPOT_OCTETS)return "Ce fichier dépasse 4 Mo. Réduisez sa taille avant de l’envoyer.";
  total+=fichier.size;
 }
 return total>TAILLE_MAX_DEPOT_OCTETS ? "Les fichiers dépassent 4 Mo au total. Réduisez leur taille ou déposez-les en plusieurs envois." : null;
}
