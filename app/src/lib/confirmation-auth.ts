import "server-only";
import { clientDeService } from "@/lib/supabase/service";
import { ipDeLaRequete } from "@/lib/lien-mot-de-passe";

export type ConfirmationAutorisee = { user_id: string; premiere_confirmation: boolean };

/** Réserve une tentative et vérifie le contexte du lien avant sa consommation par Auth. */
export async function preparerConfirmationAuth(email: string, type: string, tokenHash: string): Promise<ConfirmationAutorisee | null> {
  const adresse = email.trim().toLowerCase();
  if (!adresse || adresse.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return null;
  if (!/^(pkce_)?[a-f0-9]{56}$/.test(tokenHash)) return null;
  const service = clientDeService();
  if (!service) return null;
  const { data, error } = await service.rpc("autoriser_confirmation_auth", {
    p_email: adresse,
    p_ip: await ipDeLaRequete(),
    p_type: type,
    p_token_hash: tokenHash,
  });
  if (error || !data || typeof data !== "object" || typeof data.user_id !== "string" || typeof data.premiere_confirmation !== "boolean") return null;
  return { user_id: data.user_id, premiere_confirmation: data.premiere_confirmation };
}
