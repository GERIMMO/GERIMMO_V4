import { jourIsoValide } from "./dates";
/** La présence d’une pièce ne certifie pas la couverture ni les personnes assurées. */
export function statutAttestationBail(piece: { expire_le: string | null } | null, aujourd: string, reference: string, erreur = false) {
  if (erreur) return { libelle: "Indisponible", ton: "neutre" };
  if (!piece) return { libelle: "À ajouter", ton: "attention" };
  if (!jourIsoValide(piece.expire_le)) return { libelle: "Couverture à vérifier", ton: "attention" };
  if (piece.expire_le < aujourd) return { libelle: "À renouveler", ton: "attention" };
  if (piece.expire_le < reference) return { libelle: "À renouveler avant l’entrée", ton: "attention" };
  return { libelle: "Attestation déposée", ton: "ok" };
}
