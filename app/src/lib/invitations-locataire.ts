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

/**
 * Où mène le lien de l'e-mail d'invitation, une fois le mot de passe choisi : la page de réponse de CETTE invitation.
 * Le même pour l'invitation, ses renvois et ses relances automatiques (décision X16 du 15/10/2026) : une relance ne crée
 * pas de nouvelle invitation.
 */
export function suiteInvitationLocataire(invitationId: string): string {
  return `/nouveau-mot-de-passe?suite=${encodeURIComponent(`/invitations/${invitationId}`)}`;
}

/** Une relance automatique, telle que la fiche personne la lit (table `relances_invitations_locataires`). */
export type RelanceInvitation = {
  invitation_id: string;
  rang: number;
  jour: string;
  etat: "reservee" | "envoyee" | "incertaine" | string;
  envoyee_le: string | null;
};

const jourDeParis = (instant: string) => new Date(instant).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
/** « 2026-11-05 » (jour de Paris enregistré) → « 05/11/2026 », sans passer par un fuseau. */
const jourEnregistre = (jour: string) => jour.split("-").reverse().join("/");

/**
 * Les phrases de la fiche personne sur les relances automatiques d'une invitation : « Relancé le 05/11/2026 », puis
 * « Relancé le 05/11/2026 et le 12/11/2026 ». Une relance dont l'envoi n'est pas confirmé se dit à part, sans laisser
 * croire qu'elle est partie ni qu'elle n'est pas partie.
 */
export function phrasesRelances(relances: RelanceInvitation[]): string[] {
  const triees = [...relances].sort((a, b) => a.rang - b.rang);
  const envoyees = triees.filter((r) => r.etat === "envoyee" && r.envoyee_le).map((r) => jourDeParis(r.envoyee_le!));
  const phrases: string[] = [];
  if (envoyees.length > 0) phrases.push(`Relancé le ${envoyees.join(" et le ")}`);
  for (const r of triees) {
    if (r.etat !== "envoyee") phrases.push(`Relance du ${jourEnregistre(r.jour)} : envoi non confirmé`);
  }
  return phrases;
}
