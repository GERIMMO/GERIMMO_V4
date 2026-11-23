import type { SupabaseClient } from "@supabase/supabase-js";
import { interlocuteurLocataire, type InterlocuteurLocataire } from "./interlocuteur-locataire";

/**
 * Lot 47 : l'interlocuteur du locataire, lu avec le client de la session (locataire compris) dans la vue
 * `organisations_portail`, déjà ouverte à chaque membre de l'espace (type, nom, apparence ; aucun droit nouveau).
 * Une lecture en échec donne « bailleur », comme le titre « Mon bailleur » de l'espace locataire. Elle ne lève jamais :
 * les actions la lisent pour composer leur message APRÈS leur écriture, qu'un libellé ne doit pas faire passer pour un
 * échec.
 */
export async function lireInterlocuteurLocataire(db: SupabaseClient, orgId: string): Promise<InterlocuteurLocataire> {
  try {
    const { data, error } = await db.from("organisations_portail").select("type").eq("id", orgId).maybeSingle();
    return interlocuteurLocataire(error ? null : (data as { type?: string | null } | null)?.type);
  } catch {
    return interlocuteurLocataire(null);
  }
}
