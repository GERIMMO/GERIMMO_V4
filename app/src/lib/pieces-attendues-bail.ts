export type NaturePieceAttendue = "assurance_proprietaire" | "assurance_locataire";

export const LIBELLES_PIECES_ATTENDUES: Record<NaturePieceAttendue, string> = {
  assurance_proprietaire: "Assurance du propriétaire",
  assurance_locataire: "Assurance du locataire",
};

export function naturePieceAttendue(valeur: unknown): valeur is NaturePieceAttendue {
  return valeur === "assurance_proprietaire" || valeur === "assurance_locataire";
}

/** L'échéance renseigne la date, pas le contenu ni l'étendue de la couverture. */
export function statutPieceAttendue(expireLe: string | null | undefined, aujourdhui: string): "presente" | "expiree" | "couverture_a_verifier" {
  return !expireLe ? "couverture_a_verifier" : expireLe < aujourdhui ? "expiree" : "presente";
}
