/** Une signature archivée et une location active sont deux faits distincts. */
export type SignatureLisible = { bail_id: string | null; modele: string; etat: string; document_id: string; document_signe: string | null; created_at: string };
export function signatureDuBail(circuits: SignatureLisible[], bailId: string) {
  return circuits.filter(c => c.modele === "bail" && c.bail_id === bailId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
export function archiveSignee(circuit: SignatureLisible | undefined) {
  return circuit?.etat === "termine" ? circuit.document_signe : null;
}
export function etatSignatureDocument(circuits: SignatureLisible[], documentId: string) {
  // Une archive ancienne reste signée, même si un autre contrat est préparé ensuite.
  if (circuits.some(c => c.etat === "termine" && c.document_signe === documentId)) return "signe" as const;
  if (circuits.some(c => c.etat === "termine" && c.document_signe && c.document_id === documentId)) return "original" as const;
  if (circuits.some(c => ["preparation", "en_cours", "a_verifier"].includes(c.etat) && c.document_id === documentId)) return "en_cours" as const;
  return null;
}
