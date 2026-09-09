import type { SupabaseClient } from "@supabase/supabase-js";

// Périmètre « mon portefeuille » (maquette v3, RM-18.1.3) : un agent ne suit
// que les lots des mandats qui lui sont confiés (mandats.agent_account_id).
//
// Renvoie l'ensemble des lots du portefeuille, ou `null` quand l'utilisateur
// voit tout (admin d'agence, propriétaire direct). Audit 09/09 (P0) : un agent
// SANS mandat reçoit un ensemble VIDE — listes vides, pas l'agence entière.
// La base applique le même périmètre de son côté (RLS restrictive + garde) ;
// ce helper ne sert qu'à afficher des écrans cohérents sans aller-retours.
export async function lotsDuPortefeuille(
  supabase: SupabaseClient,
  orgId: string,
  role: string,
  accountId: string
): Promise<Set<string> | null> {
  if (role !== "agent") return null;
  const { data } = await supabase
    .from("mandats")
    .select("lignes:mandat_lignes(lot_id, date_fin)")
    .eq("organization_id", orgId)
    .eq("agent_account_id", accountId)
    .in("etat", ["brouillon", "a_signer", "actif", "preavis"]);
  const lots = new Set<string>();
  for (const m of (data ?? []) as { lignes: { lot_id: string; date_fin: string | null }[] }[]) {
    for (const l of m.lignes ?? []) if (!l.date_fin) lots.add(l.lot_id);
  }
  return lots;
}
