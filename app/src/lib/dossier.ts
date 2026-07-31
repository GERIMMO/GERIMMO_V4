// Types de pièces d'un dossier locataire (module 0b). Constante partagée entre
// l'action serveur et les composants (donc hors fichier "use server").
export const TYPES_PIECE_DOSSIER: Record<string, string> = {
  piece_identite: "Pièce d'identité",
  justificatif: "Justificatif (revenus, domicile…)",
  attestation_assurance: "Attestation d'assurance",
  autre: "Autre",
};
