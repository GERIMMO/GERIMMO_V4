import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlerteSynthese } from "@/components/synthese-alertes";

// Valeur sentinelle du sélecteur d'assignation : « tout le monde »
// (réservée au responsable de l'agence — voir actions/alertes.ts)
export const ASSIGNATION_TOUS = "tous";

// « Mes alertes » (retour recette 08/08) : celles qui me sont confiées
// nominativement, plus celles assignées à tout le monde.
export function estConfieeAMoi(
  alerte: { assignee_account_id: string | null; assigned_all: boolean },
  userId: string
) {
  return alerte.assigned_all || alerte.assignee_account_id === userId;
}

// Synthèse des alertes ouvertes pour la pop-up de connexion (et son rappel).
// Retour recette 08/08 : uniquement celles qui me sont confiées (à moi ou à
// tout le monde) — la vision macro « toutes agences, toutes mains » est
// abandonnée. `orgId` restreint à l'agence courante (layout agence) ; sans
// lui (page /espaces), toutes mes agences confondues.
export async function chargerSyntheseAlertes(
  supabase: SupabaseClient,
  options: { orgId?: string } = {}
): Promise<AlerteSynthese[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let requete = supabase
    .from("alerts")
    .select(
      "id, organization_id, criticite, titre, echeance, created_at, assignee_account_id, assigned_all, escalades, details, organization:organizations(name)"
    )
    .eq("statut", "ouverte")
    .or(`assigned_all.eq.true,assignee_account_id.eq.${user.id}`)
    .order("created_at", { ascending: true })
    .limit(100);
  if (options.orgId) requete = requete.eq("organization_id", options.orgId);

  const { data } = await requete;
  return (data ?? []).map((a) => ({
    id: a.id,
    organization_id: a.organization_id,
    organisation:
      (a.organization as unknown as { name: string } | null)?.name ?? "—",
    criticite: a.criticite,
    titre: a.titre,
    echeance: a.echeance,
    created_at: a.created_at,
    assignee_account_id: a.assignee_account_id,
    assigned_all: a.assigned_all,
    escalades: a.escalades,
    details: a.details,
  }));
}
