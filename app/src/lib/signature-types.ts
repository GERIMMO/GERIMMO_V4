/** Format commun des archives de signature, indépendant du prestataire actif. */
export type SignataireSignature = {
  prenom: string; nom: string; email: string; telephone?: string | null;
};
export type DemandeSignatureLue = {
  id: string; status: string; external_id?: string | null; expiration_date?: string;
  signers: { id: string; status: string }[];
  decline_information?: { reason?: string | null } | null;
};
