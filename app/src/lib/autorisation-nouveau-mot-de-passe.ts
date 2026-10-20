import type { createClient } from "@/lib/supabase/server";
import { METHODES_LIEN_EMAIL } from "@/lib/session-lien-email";

export const DUREE_PREUVE_EMAIL_SECONDES = 15 * 60;

/** La date de la preuve reste inchangée lors du renouvellement du jeton. */
export function preuveEmailRecente(amr: unknown, maintenant = Date.now()): boolean {
  if (!Array.isArray(amr)) return false;
  const secondes = Math.floor(maintenant / 1000);
  return amr.some((entree) => {
    if (!entree || typeof entree !== "object") return false;
    const { method, timestamp } = entree;
    return typeof method === "string" && METHODES_LIEN_EMAIL.has(method)
      && typeof timestamp === "number" && Number.isSafeInteger(timestamp)
      && timestamp <= secondes + 30 && timestamp >= secondes - DUREE_PREUVE_EMAIL_SECONDES;
  });
}

type Autorisation = "accordee" | "lien_requis" | "second_facteur_requis" | "indisponible";

/** Même contrôle pour le rendu et l'action, avant toute mutation. */
export async function autorisationNouveauMotDePasse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  compteId: string,
): Promise<Autorisation> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || data?.claims?.sub !== compteId || !preuveEmailRecente(data?.claims?.amr)) return "lien_requis";
  const { data: adhesion, error: erreurDroits } = await supabase.from("memberships").select("id")
    .eq("account_id", compteId).eq("role", "super_admin").eq("status", "active").limit(1).maybeSingle();
  if (erreurDroits) return "indisponible";
  if (adhesion && data.claims.aal !== "aal2") return "second_facteur_requis";
  return "accordee";
}
