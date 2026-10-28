// LE PREMIER MOT DE PASSE D'UN INVITÉ (audit final du 27/10/2026, DRT-05).
//
// Le lien d'invitation (responsable ouvert par la supervision, agent, locataire, renvoi) est un lien de récupération :
// la personne, qui n'a jamais eu de mot de passe, lisait « Accéder à votre compte », « Nouveau mot de passe »,
// « Changer le mot de passe », puis était déconnectée et devait ressaisir ce qu'elle venait de créer. La fabrique de
// liens (lib/lien-mot-de-passe.ts) pose cette marque dans `app_metadata` — que seul le service écrit, jamais le
// titulaire, à la différence de `user_metadata` (actions/auth.ts) — sur le compte invité qui ne s'est encore jamais
// connecté ; la page et l'action du nouveau mot de passe la lisent, et l'action l'efface une fois le choix fait.
import { clientDeService } from "@/lib/supabase/service";

export const CLE_PREMIER_MOT_DE_PASSE = "premier_mot_de_passe";

/** Vrai si le compte attend son premier mot de passe (marque posée par le service lors de l'invitation). */
export function premierMotDePasse(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.app_metadata?.[CLE_PREMIER_MOT_DE_PASSE] === true;
}

/**
 * Efface la marque (clé de service : le titulaire ne peut pas écrire app_metadata). Ne lève jamais : un échec laisse
 * la marque, dont l'effet est seulement le titre « Créez votre mot de passe ».
 */
export async function effacerMarquePremierMotDePasse(compte: string): Promise<boolean> {
  try {
    const service = clientDeService();
    if (!service) return false;
    const { error } = await service.auth.admin.updateUserById(compte, { app_metadata: { [CLE_PREMIER_MOT_DE_PASSE]: false } });
    if (error) console.error("[premier mot de passe] marque non effacée :", error.message);
    return !error;
  } catch (e) {
    console.error("[premier mot de passe] marque non effacée :", e instanceof Error ? e.message : e);
    return false;
  }
}
