import type { SupabaseClient } from "@supabase/supabase-js";
import { configurationAr24 } from "./ar24";

// Audit palier 1 (P1-18, décision Q10 du 22/11/2026). Le recommandé électronique (AR24) est codé, mais il n'est relié
// à rien tant que (1) la plateforme n'a pas ses accès au service et (2) l'espace n'a pas son expéditeur — une ligne
// que seul l'opérateur peut poser (docs/recommandes-ar24.md). Les écrans ne le proposent donc que lorsque les deux
// existent ; sinon, seul le courrier en PDF est proposé, et le locataire n'est pas invité à accepter un mode d'envoi
// qui n'existe pas. Mêmes conditions que `preparerRecommande` (actions/recommandes.ts) : aucune promesse de plus.
// Côté serveur uniquement (lib/ar24.ts emploie le chiffrement de Node).

type Environnement = Record<string, string | undefined>;

/** La plateforme a ses accès au service de recommandé électronique. */
export function recommandeElectroniqueConfigure(env: Environnement = process.env): boolean {
  return configurationAr24(env) !== null && Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** … et cet espace a son expéditeur actif, dans le même environnement. Toute lecture douteuse vaut « non ». */
export async function recommandeElectroniqueDisponible(supabase: SupabaseClient, orgId: string, env: Environnement = process.env): Promise<boolean> {
  const config = configurationAr24(env);
  if (!config || !recommandeElectroniqueConfigure(env)) return false;
  const environnement = config.baseUrl.includes("sandbox") ? "sandbox" : "production";
  try {
    const { data, error } = await supabase.from("connexions_ar24").select("actif, environnement").eq("organization_id", orgId).maybeSingle();
    return !error && data?.actif === true && data.environnement === environnement;
  } catch {
    return false;
  }
}
