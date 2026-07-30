import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlerteSynthese } from "@/components/cloche-alertes";

// Synthèse des alertes ouvertes pour la pop-up de connexion et la cloche :
// toutes agences confondues — la RLS ne renvoie que celles de l'utilisateur,
// chacun selon ses droits (spécification S2, tous personas).
export async function chargerSyntheseAlertes(
  supabase: SupabaseClient
): Promise<AlerteSynthese[]> {
  const { data } = await supabase
    .from("alerts")
    .select(
      "id, organization_id, criticite, titre, echeance, created_at, organization:organizations(name)"
    )
    .eq("statut", "ouverte")
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []).map((a) => ({
    id: a.id,
    organization_id: a.organization_id,
    organisation:
      (a.organization as unknown as { name: string } | null)?.name ?? "—",
    criticite: a.criticite,
    titre: a.titre,
    echeance: a.echeance,
    created_at: a.created_at,
  }));
}
