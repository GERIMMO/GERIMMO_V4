// « La confirmation n'a pas pu être reçue » ne dit pas que la session a expiré.
//
// Audit du 13/10/2026 (PR178-A-05, PR178-B-01) : quand la session expire pendant la saisie, le proxy répond à l'envoi
// par une redirection vers /connexion ; le navigateur la suit, l'action n'a jamais tourné, et l'écran affichait le
// message d'une réponse perdue (« vérifiez le dossier avant de recommencer »), sans mot sur la session ni moyen de
// se reconnecter. Un envoi qui échoue demande donc d'abord : la session est-elle encore ouverte ?

export const MESSAGE_SESSION_EXPIREE =
  "Votre session a expiré : cette saisie n’a pas été enregistrée. Ouvrez la page de connexion dans un autre onglet, reconnectez-vous, puis revenez ici : votre saisie est conservée.";

/**
 * Vrai si la page courante, demandée maintenant, est redirigée (le proxy renvoie vers /connexion pour une page privée
 * quand la session est expirée). Une requête HEAD sans suivre la redirection : aucune donnée n'est lue ni écrite.
 * Faux en cas de doute (réseau coupé, réponse normale) : le message d'origine reste alors celui d'une réponse perdue.
 */
export async function sessionExpiree(adresse: string | undefined = globalThis.location?.href): Promise<boolean> {
  if (!adresse || typeof fetch !== "function") return false;
  try {
    const reponse = await fetch(adresse, { method: "HEAD", redirect: "manual", credentials: "same-origin", cache: "no-store" });
    return reponse.type === "opaqueredirect";
  } catch {
    return false;
  }
}

/** Le message à afficher quand un envoi échoue : la session expirée si c'est la cause, sinon le message d'origine. */
export async function messageApresEchec(messageHabituel: string): Promise<string> {
  return (await sessionExpiree()) ? MESSAGE_SESSION_EXPIREE : messageHabituel;
}

/**
 * Retire d'un bilan mémorisé le message « session expirée » (audit du 13/10, VER-PR178-04). Ce message dit « reconnectez-vous,
 * puis revenez ici » : le relire à la reprise, une fois la personne reconnectée (la page ne s'ouvre que session ouverte), ment sur
 * l'état présent. Les autres messages (création incertaine, justificatif non confirmé) sont des faits sur les données : conservés.
 */
export function sansMessageSessionExpiree<T extends { erreur?: string }>(bilan: T): T {
  if (bilan.erreur !== MESSAGE_SESSION_EXPIREE) return bilan;
  const { erreur: _erreur, ...reste } = bilan;
  void _erreur;
  return reste as T;
}
