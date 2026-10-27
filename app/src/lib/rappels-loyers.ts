import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RappelLoyer = {
  appel_id: string;
  bail_id: string;
  lot_nom: string;
  locataire: string | null;
  periode: string;
  date_echeance: string;
  montant_du: number | string;
  montant_couvert: number | string;
  non_recu_signale_le: string | null;
  derniere_relance?: { niveau: string; date_envoi: string } | null;
  historique_relances_disponible?: boolean;
};

/** Même repère que les relances du bail : une relance après l'échéance ouvre déjà le suivi. */
export async function lireDerniereRelanceReception(supabase: SupabaseClient, orgId: string, ligne: Pick<RappelLoyer, "bail_id" | "date_echeance">) {
  // Une ligne par stade suffit, même si le bail contient plus d'une page de relances.
  // À date égale, le stade le plus avancé prime sur l'ordre arbitraire des identifiants.
  const niveaux = ["mise_en_demeure", "relance_2", "relance_1"];
  const resultats = await Promise.all(niveaux.map(niveau => supabase.from("relances").select("niveau,date_envoi")
    .eq("organization_id", orgId).eq("bail_id", ligne.bail_id).eq("niveau", niveau)
    .gte("date_envoi", ligne.date_echeance.slice(0,10))
    .order("date_envoi", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle()));
  const erreur = resultats.find(r => r.error)?.error;
  if (erreur) return { data: null, error: erreur };
  const relances = resultats.flatMap(r => r.data ? [r.data] : []);
  relances.sort((a,b) => b.date_envoi.localeCompare(a.date_envoi) || niveaux.indexOf(a.niveau) - niveaux.indexOf(b.niveau));
  return { data: relances[0] ?? null, error: null };
}

/** Un seul geste par bail : régler la plus ancienne échéance avant la suivante. */
export function organiserRappelsLoyers(lignes: RappelLoyer[], aujourdHui: string) {
  const tries = [...lignes].filter(l => Number(l.montant_du) > Number(l.montant_couvert))
    .sort((a,b) => a.periode.localeCompare(b.periode) || a.appel_id.localeCompare(b.appel_id));
  const premiers = new Map<string, RappelLoyer>();
  for (const ligne of tries) if (!premiers.has(ligne.bail_id)) premiers.set(ligne.bail_id, ligne);
  const dus = [...premiers.values()].filter(l => l.date_echeance.slice(0,10) <= aujourdHui)
    .sort((a,b) => a.date_echeance.localeCompare(b.date_echeance) || a.appel_id.localeCompare(b.appel_id));
  const prochaines = [...premiers.values()].filter(l => l.date_echeance.slice(0,10) > aujourdHui)
    .sort((a,b) => a.date_echeance.localeCompare(b.date_echeance) || a.appel_id.localeCompare(b.appel_id));
  return { dus, prochaine: prochaines[0] ?? null, totalEcheancesDues: tries.filter(l => l.date_echeance.slice(0,10) <= aujourdHui).length };
}

/** Une lecture paginée : les rappels anciens ne disparaissent pas au plafond de l'API. */
export const lireRappelsLoyers = cache(async (supabase: SupabaseClient, orgId: string) => {
  const lignes: RappelLoyer[] = [];
  for (let debut = 0; ; debut += 500) {
    const { data, error } = await supabase.rpc("rappels_loyers_proprietaire", { p_org: orgId })
      .order("date_echeance").order("appel_id").range(debut, debut + 499);
    if (error) return { lignes: [] as RappelLoyer[], error };
    lignes.push(...(data ?? []) as RappelLoyer[]);
    if ((data?.length ?? 0) < 500) return { lignes, error: null };
  }
});
