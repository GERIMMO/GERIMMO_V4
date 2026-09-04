import type { SupabaseClient } from "@supabase/supabase-js";

// Périmètre « mon portefeuille » (maquette v3, RM-18.1.3) : un agent ne suit
// que les lots des mandats qui lui sont confiés (mandats.agent_account_id).
//
// Renvoie l'ensemble des lots du portefeuille, ou `null` quand l'utilisateur
// voit tout : admin d'agence, propriétaire direct — et l'agent à qui aucun
// mandat n'est encore confié (état de reprise : tant que l'admin n'a pas
// affecté les mandats, rien ne disparaît de l'écran de personne).
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
  return lots.size > 0 ? lots : null;
}
