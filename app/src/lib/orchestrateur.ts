import type { SupabaseClient } from "@supabase/supabase-js";
import { consignerTache } from "@/lib/tache";

/** Actualisation atomique et idempotente; les règles métier restent en base. */
export async function orchestrerDossiers(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.rpc("actualiser_orchestration");
    const resultat = error
      ? { dossiers: 0, erreur: "Le suivi des dossiers n’a pas pu être actualisé." }
      : { dossiers: Number(data ?? 0), erreur: null };
    await consignerTache(supabase, "orchestrateur", resultat);
    return resultat;
  } catch {
    const resultat = { dossiers: 0, erreur: "La connexion au suivi des dossiers a été interrompue." };
    await consignerTache(supabase, "orchestrateur", resultat);
    return resultat;
  }
}
