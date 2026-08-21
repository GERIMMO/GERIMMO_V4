// Types de pièces d'un dossier locataire (module 0b). Constante partagée entre
// l'action serveur et les composants (donc hors fichier "use server").
export const TYPES_PIECE_DOSSIER: Record<string, string> = {
  piece_identite: "Pièce d'identité",
  justificatif: "Justificatif (revenus, domicile…)",
  attestation_assurance: "Attestation d'assurance",
  autre: "Autre",
};

// État d'échéance d'une pièce datée (attestation d'assurance, module 0b) —
// même lecture côté agence et côté locataire (recette 21/08 : la date
// d'expiration n'apparaissait nulle part côté agence).
export function statutEcheancePiece(
  expire: string | null | undefined
): { texte: string; classe: string } | null {
  if (!expire) return null;
  const jours = Math.ceil(
    (new Date(expire).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  const date = new Date(expire).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  if (jours < 0) return { texte: `expirée depuis ${-jours} j`, classe: "text-destructive" };
  if (jours <= 30)
    return { texte: `expire dans ${jours} j (${date})`, classe: "text-warning-soft-foreground" };
  return { texte: `valide jusqu'au ${date}`, classe: "text-success-soft-foreground" };
}
