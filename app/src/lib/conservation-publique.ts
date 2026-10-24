import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { RegleConservation } from "./conservation-reglages";

export type DureePublique = Omit<RegleConservation, "minimum_mois" | "revision">;
export async function lireDureesPubliques(): Promise<{ regles: DureePublique[]; indisponible: boolean }> {
  // Catalogue public : lecture anonyme, y compris quand le visiteur est connecté à un espace restreint.
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  const { data, error } = await db.from("retention_rules").select("data_type,libelle,declencheur,duree_mois,duree_initiale_mois,sort,actif,updated_at").order("libelle");
  return { regles: error ? [] : (data ?? []) as DureePublique[], indisponible: Boolean(error) || !data?.length };
}
