import type { ModeleSignature } from "./politique-signature";

/**
 * Interrupteurs serveur par modèle de signature (lot B7, 19 octobre 2026).
 *
 * Ce module lit `process.env` : il ne doit jamais être importé par un composant client, ni par
 * `politique-signature.ts` (partagé avec le navigateur). `tests/signature-interrupteurs.test.ts` le vérifie.
 */

/** Message exact validé par le dirigeant ; il traverse `sansJargon` sans être remplacé. */
export const MESSAGE_CAUTIONNEMENT_FERME =
  "L’envoi en signature électronique de l’acte de cautionnement est suspendu pour le moment. Vous pouvez préparer le document et le faire signer hors ligne.";

/**
 * Fermeture ciblée du seul acte de cautionnement.
 *
 * `ZOHO_SIGN_CAUTIONNEMENT_FERME` : la valeur « 1 » ou « true » (espaces autour ignorés ; décision du 19/10, « true »
 * étant la forme des autres drapeaux ZOHO_SIGN_*) suspend l'ENVOI en signature électronique de l'acte de cautionnement
 * pour toutes les organisations, essais compris. Absente, vide ou toute autre valeur : ouvert, comportement inchangé.
 * Seul l'envoi est fermé : la préparation du PDF, le suivi, l'actualisation et l'annulation des circuits déjà envoyés
 * continuent. Un circuit ancien sans `modele` est un bail : jamais concerné.
 *
 * @returns le message à afficher au propriétaire quand l'envoi de ce modèle est fermé, sinon `null`.
 */
export function fermetureModeleSignature(code: ModeleSignature | undefined, env: Record<string, string | undefined> = process.env): string | null {
  const valeur = (env.ZOHO_SIGN_CAUTIONNEMENT_FERME ?? "").trim();
  return code === "cautionnement" && (valeur === "1" || valeur === "true") ? MESSAGE_CAUTIONNEMENT_FERME : null;
}
