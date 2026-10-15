import type { SupabaseClient } from "@supabase/supabase-js";
import { baseEspace } from "@/lib/racine-espace";

/**
 * La base d'adresses d'une organisation — « /espace/<id> » chez un propriétaire direct, « /agence/<id> » sinon —
 * d'après son TYPE, lu avec les droits du client donné (décision D27, lib/racine-espace.ts).
 *
 * Pour les gestes serveur qui n'ont pas le rôle sous la main : retour d'un paiement, redirection après une action
 * d'abonnement, lien d'un courrier. C'est un confort, jamais une condition : une lecture qui échoue, un client sans
 * droit de lecture ou une organisation illisible donnent la racine des agences, et le proxy redirige alors l'ancienne
 * adresse vers /espace — rien n'est cassé.
 */
export async function baseDeLOrganisation(supabase: SupabaseClient, orgId: string): Promise<string> {
  try {
    const { data } = await supabase.from("organizations").select("type").eq("id", orgId).maybeSingle();
    return baseEspace(orgId, (data as { type?: string } | null)?.type === "proprietaire_direct");
  } catch {
    return baseEspace(orgId, false);
  }
}
