import { unstable_rethrow } from "next/navigation";

export const MESSAGE_DECONNEXION_HORS_LIGNE = "Déconnexion impossible hors ligne ; votre saisie est conservée. Réessayez une fois la connexion rétablie.";
export const MESSAGE_DECONNEXION_ECHEC = "La déconnexion n’a pas abouti ; votre saisie est conservée. Réessayez dans un instant.";

/**
 * Lance la déconnexion et dit pourquoi elle n'a pas pu aboutir (audit du 14/10, VFL-02). Sans cela, l'échec réseau de
 * l'action serveur remontait à la limite d'erreur : la page était remplacée par « Cette page n'a pas pu s'afficher » et la
 * saisie disparaissait de l'écran, alors que la session et la copie locale étaient intactes.
 *
 * Renvoie `null` si l'action revient sans erreur, sinon le message à afficher. La déconnexion RÉUSSIE, elle, lève la
 * redirection vers /connexion?raison=deconnecte : `unstable_rethrow` la relaie à Next, qui navigue. C'est à l'arrivée
 * sur cette adresse que les copies locales sont purgées (VER-PR178-05), jamais ici.
 * `enLigne` est `() => navigator.onLine` : hors ligne, la requête n'est même pas envoyée.
 */
export async function tenterDeconnexion(action: () => Promise<unknown>, enLigne: () => boolean): Promise<string | null> {
  if (!enLigne()) return MESSAGE_DECONNEXION_HORS_LIGNE;
  try {
    await action();
    return null;
  } catch (erreur) {
    unstable_rethrow(erreur);
    return enLigne() ? MESSAGE_DECONNEXION_ECHEC : MESSAGE_DECONNEXION_HORS_LIGNE;
  }
}
