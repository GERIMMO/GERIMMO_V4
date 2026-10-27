import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { estUuid } from "@/lib/identifiants";

export type IncidentVerification = {
  id: string;
  etat: string;
  categorie: string;
  description: string | null;
  imputation: string | null;
  imputation_justification: string | null;
  imputation_contestation: string | null;
  declarant_person_id: string | null;
  /** Bail rattaché : son locataire voit la décision, même sans déclarant (FL-01). */
  bail_id: string | null;
};

/** Relit l'état réel avant de proposer un geste depuis une alerte qui peut dater. */
export async function chargerIncidentsVerifications(
  supabase: SupabaseClient,
  orgId: string,
  actions: ActionDuJour[],
): Promise<{ incidents: Map<string, IncidentVerification>; indisponible: boolean }> {
  const ids = [...new Set(actions.flatMap(action => {
    const id = action.source === "alerte" ? action.alerte.details?.incident_id : null;
    return estUuid(id) ? [id] : [];
  }))];
  const incidents = new Map<string, IncidentVerification>();
  if (!ids.length) return { incidents, indisponible: false };

  try {
    // Une liste bornée évite une URL PostgREST trop longue et reste en dessous
    // du plafond de lignes de l'API, même pour un grand portefeuille.
    for (let debut = 0; debut < ids.length; debut += 100) {
      const lot = ids.slice(debut, debut + 100);
      const { data, error } = await supabase.from("incidents")
        .select("id,etat,categorie,description,imputation,imputation_justification,imputation_contestation,declarant_person_id,bail_id")
        .eq("organization_id", orgId).in("id", lot);
      if (error || !data) return { incidents: new Map(), indisponible: true };
      const attendus = new Set(lot);
      for (const incident of data as IncidentVerification[]) {
        if (attendus.has(incident.id)) incidents.set(incident.id, incident);
      }
    }
  } catch {
    return { incidents: new Map(), indisponible: true };
  }
  // Un dossier supprimé ou devenu inaccessible ne fournit jamais un faux état
  // permettant une action ; l'écran conserve son lien de consultation.
  return { incidents, indisponible: incidents.size !== ids.length };
}
