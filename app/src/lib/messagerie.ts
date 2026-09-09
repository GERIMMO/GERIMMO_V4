import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Total des messages locataires non lus pour le gérant courant — le périmètre
// (portefeuille de l'agent, RM-18.1.3) est appliqué EN SQL par la RPC.
// cache() : le layout et le tableau de bord le demandent dans la même requête,
// un seul aller-retour (audit 09/09 — la RPC partait deux fois par page).
export const totalMessagesNonLus = cache(
  async (supabase: SupabaseClient, orgId: string): Promise<number> => {
    const { data } = await supabase.rpc("messages_non_lus_gerant", { p_org: orgId });
    return ((data ?? []) as { non_lus: number }[]).reduce((s, r) => s + r.non_lus, 0);
  }
);
