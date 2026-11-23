// Phase 3 (C41, C52, C70, C71 ; lot 47 pour les e-mails et les écrans) : l'interlocuteur vers lequel Gerimmo renvoie le
// locataire. Il n'y a de « gestionnaire » que dans un espace d'agence ; ailleurs le bailleur gère lui-même, et c'est lui
// que le locataire contacte. Le texte garde son article (« votre gestionnaire », « au bailleur »).
//
// Module pur, sans dépendance : les modèles de documents, les e-mails, les actions et les écrans du locataire (y compris
// les composants client) partagent cette seule règle. Un type d'espace inconnu (lecture en échec) donne « bailleur »,
// comme le titre « Mon bailleur » de l'espace locataire (identite-contact-locataire.ts).

export type InterlocuteurLocataire = "gestionnaire" | "bailleur";

export function interlocuteurLocataire(typeOrganisation: string | null | undefined): InterlocuteurLocataire {
  return typeOrganisation === "agence" ? "gestionnaire" : "bailleur";
}

/** « Gestionnaire », « Bailleur » : en tête de phrase ou d'étiquette. */
export function interlocuteurMajuscule(interlocuteur: InterlocuteurLocataire): string {
  return interlocuteur === "gestionnaire" ? "Gestionnaire" : "Bailleur";
}

/**
 * Lot 47 : quelques refus écrits en base, pour le locataire, disent « votre gestionnaire » quel que soit l'espace
 * (demander_report_rdv, annuler_rdv_locataire, mon_conge_locataire). Les réécrire demanderait de remplacer ces fonctions
 * par migration ; l'action qui les affiche les rend ici dans les mots de l'espace. Seule la tournure « votre
 * gestionnaire » change, et seulement hors agence : le reste du message est celui de la base.
 */
export function messageDeLaBasePourLocataire(message: string, interlocuteur: InterlocuteurLocataire): string {
  return interlocuteur === "gestionnaire" ? message : message.replace(/\b([Vv])otre gestionnaire\b/g, "$1otre bailleur");
}

/**
 * Lot 47 (second tour) : les refus de la réponse à une invitation (repondre_invitation_locataire) disent eux aussi
 * « Contactez votre gestionnaire ». La personne invitée n'est pas encore membre de l'espace : elle n'en lit pas le type,
 * et l'on ne sait pas s'il s'agit d'une agence. Le renvoi prend la tournure de l'écran des espaces, vraie dans les deux
 * cas : « votre bailleur ou son gestionnaire ».
 */
export function messageDeLaBasePourInvite(message: string): string {
  return message.replace(/\b([Vv])otre gestionnaire\b/g, "$1otre bailleur ou son gestionnaire");
}
