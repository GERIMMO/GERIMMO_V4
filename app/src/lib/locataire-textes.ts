import { queElide } from "@/lib/elision";

// Textes de l'espace locataire dits à plusieurs endroits — écrits une fois.

/**
 * La conservation des quittances et reçus (audit du 27/09). « Mes paiements »
 * promettait « pendant toute la durée du bail », « Mes documents » « pendant
 * toute la durée légale — vous n'avez rien à archiver ». La matrice [[RGPD]]
 * prévoit un archivage (comptable : 10 ans) puis une anonymisation : le
 * locataire garde donc intérêt à conserver son propre exemplaire.
 * Intégration des textes de la V1 (24/10/2026) : la durée annoncée est celle de la page confidentialité (quittances :
 * pendant le bail, puis trois ans, règle document:quittance), et non plus une « durée légale » sans nom.
 */
export const CONSERVATION_DOCUMENTS_LOCATAIRE =
  "Vos quittances et reçus restent consultables ici tant que votre espace est ouvert ; leur fichier est retiré trois ans après la fin du bail (page Confidentialité). Enregistrez-les en PDF pour garder votre propre exemplaire.";

/**
 * La légende du bouton grisé « Attestation de bon paiement » de « Mes paiements » : le dernier mois en souffrance et le nombre
 * d'autres mois, accordés (audit final du 27/10, DRT-12 : « dès que octobre 2026 et 1 autre mois sera soldés »).
 */
export function legendeAttestationIndisponible(dernierMois: string, autresMois: number): string {
  const plusieurs = autresMois > 0;
  const autres = plusieurs ? ` et ${autresMois} autre${autresMois > 1 ? "s" : ""} mois` : "";
  return `Disponible dès ${queElide(dernierMois)}${autres} ${plusieurs ? "seront soldés" : "sera soldé"}.`;
}
