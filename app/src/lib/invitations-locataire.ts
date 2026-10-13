export type InvitationLocataire = {
  id: string; etat: string; expire_le: string; cree_le: string;
  email?: string; envoye_le?: string | null; erreur_envoi?: boolean;
};
export function etatInvitation(invitation: InvitationLocataire, maintenant = Date.now()) {
  return invitation.etat === "en_attente" && new Date(invitation.expire_le).getTime() <= maintenant ? "expiree" : invitation.etat;
}
export const LIBELLES_INVITATION: Record<string, string> = {
  en_attente: "En attente d’acceptation", acceptee: "Acceptée", refusee: "Refusée", expiree: "Expirée", annulee: "Annulée",
};
