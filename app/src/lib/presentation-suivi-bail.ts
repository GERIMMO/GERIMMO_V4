import { archiveSignee, signatureDuBail, type SignatureLisible } from "./presentation-signatures";

/** Le suivi différé ne doit pas contredire l'état relu du contrat. */
export function presentationSuiviBail(
  bail: { id: string; etat: string; document_signe: string | null } | undefined,
  signatures: { circuits: SignatureLisible[]; erreur: boolean },
) {
  if (!bail) return { action: "État du bail à vérifier", statut: "Lecture indisponible" };
  // Conserver notamment les restitutions attendues après un bail terminé.
  if (bail.etat !== "brouillon") return null;
  const signature = signatureDuBail(signatures.circuits, bail.id);
  if (bail.document_signe || archiveSignee(signature)) {
    return { action: "Bail signé · location non activée", statut: "Activation par le gestionnaire" };
  }
  if (signatures.erreur) return { action: "Signature du bail à vérifier", statut: "Lecture indisponible" };
  if (["preparation", "en_cours", "a_verifier"].includes(signature?.etat ?? "")) {
    return { action: "Signature du bail en cours", statut: "Suivi par le gestionnaire" };
  }
  return { action: "Bail à compléter et à signer", statut: "Préparation par le gestionnaire" };
}
