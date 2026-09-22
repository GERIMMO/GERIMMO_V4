import type { SupabaseClient } from "@supabase/supabase-js";
import { consignerTache } from "@/lib/tache";

/** Actualisation atomique et idempotente; les règles métier restent en base. */
export async function orchestrerDossiers(supabase: SupabaseClient) {
  try {
    // Le service prépare les rapports sur des mois déjà clôturés. Le bouton
    // humain conserve son rôle de simple actualisation du suivi.
    const { data: rapports, error: erreurPreparation } = await supabase.rpc("preparer_rapports_automatiques");
    if (erreurPreparation) console.error("[orchestrateur] Préparation des rapports indisponible.");
    const { data, error } = await supabase.rpc("actualiser_orchestration");
    const resultat = error
      ? { dossiers: 0, erreur: "Le suivi des dossiers n’a pas pu être actualisé." }
      : { dossiers: Number(data ?? 0), erreur: null };
    await consignerTache(supabase, "orchestrateur", { ...resultat, rapports_prepares: Number(rapports ?? 0), preparation_erreur: erreurPreparation ? "Les comptes rendus n’ont pas pu être préparés." : null });
    return resultat;
  } catch {
    const resultat = { dossiers: 0, erreur: "La connexion au suivi des dossiers a été interrompue." };
    await consignerTache(supabase, "orchestrateur", resultat);
    return resultat;
  }
}
