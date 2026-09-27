// La réponse d'une inscription, en un seul endroit (audit du 27/09).
//
// ÉNUMÉRATION DE COMPTES. /inscription répondait « Un compte existe déjà pour
// cette adresse » : n'importe qui pouvait vérifier qu'une adresse avait un
// compte Gerimmo — celle d'un locataire, d'un artisan, d'un gérant. La
// connexion et « mot de passe oublié » restaient neutres ; l'inscription était
// la seule porte bavarde.
//
// Désormais, une adresse déjà inscrite reçoit la MÊME réponse qu'une adresse
// neuve dont la confirmation est partie : « vérifiez votre boîte mail ». Le
// titulaire, lui, reçoit un lien de réinitialisation (l'action l'envoie) : s'il
// avait oublié son compte, il le retrouve ; si quelqu'un d'autre a tenté
// l'inscription, il n'apprend rien de plus que ce que sa boîte lui dit.
//
// Limite connue : quand le projet Supabase ne demande PAS de confirmer
// l'adresse, une inscription neuve ouvre la session aussitôt, et la
// différence de comportement subsiste. Avec « Confirm email » activé
// (réglage de production attendu), les deux cas sont indiscernables.

export const MESSAGE_BOITE_MAIL =
  "Vérifiez votre boîte mail : nous venons de vous écrire pour finir d'ouvrir votre accès. Si vous aviez déjà un compte, le message vous permet de vous reconnecter. Pensez à regarder vos courriers indésirables.";

export type IssueInscription =
  | { type: "adresse_deja_inscrite" }
  | { type: "mot_de_passe_faible"; erreur: string }
  | { type: "autre"; message: string };

/** Classe l'erreur rendue par `auth.signUp`, sans jamais la laisser dire qu'un compte existe. */
export function classerErreurInscription(error: { code?: string; message: string }): IssueInscription {
  if (error.code === "user_already_exists" || error.code === "email_exists" || /already registered/i.test(error.message)) {
    return { type: "adresse_deja_inscrite" };
  }
  if (error.code === "weak_password") {
    return {
      type: "mot_de_passe_faible",
      erreur:
        "Mot de passe refusé : trop faible ou présent dans des fuites de données connues. Choisissez-en un autre.",
    };
  }
  return { type: "autre", message: error.message };
}
