// Dernière version active d'un document généré pour un dossier. Un contrat regénéré remplace sa version précédente
// (remplace_id) au lieu de s'empiler dans Documents et sur la fiche du locataire (audit final, BAIL-03), et le
// récapitulatif du bail retrouve le dernier PDF après un rechargement (BAIL-04). L'historique reste lisible par la
// chaîne remplace_id, comme pour toute pièce versionnée.
import type { SupabaseClient } from "@supabase/supabase-js";

export type VersionGeneree = { id: string; titre: string | null; created_at: string };

export async function derniereVersionGeneree(
  supabase: SupabaseClient,
  orgId: string,
  options: { typeGed: string; entite: string; entiteId: string; titre: (titre: string | null) => boolean }
): Promise<{ version: VersionGeneree | null; erreur?: string }> {
  const liens = await supabase.from("document_liens").select("document_id")
    .eq("organization_id", orgId).eq("entite", options.entite).eq("entite_id", options.entiteId);
  if (liens.error) return { version: null, erreur: liens.error.message };
  const ids = [...new Set((liens.data ?? []).map((l) => l.document_id))];
  if (!ids.length) return { version: null };
  const documents = await supabase.from("documents").select("id, titre, created_at, remplace_id")
    .eq("organization_id", orgId).eq("type", options.typeGed).in("id", ids).is("purged_at", null)
    .order("created_at", { ascending: false });
  if (documents.error) return { version: null, erreur: documents.error.message };
  // Une pièce déjà remplacée n'est plus la version active, quel que soit le titre de sa remplaçante.
  const remplacees = new Set((documents.data ?? []).map((d) => d.remplace_id).filter(Boolean));
  const version = (documents.data ?? []).find((d) => !remplacees.has(d.id) && options.titre(d.titre));
  return { version: version ? { id: version.id, titre: version.titre, created_at: version.created_at } : null };
}
