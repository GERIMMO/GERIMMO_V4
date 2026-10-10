import type { SupabaseClient } from "@supabase/supabase-js";

export type EcritureFinances = {
  id: string; categorie: string; sens: string; montant: number | string;
  date_imputation: string; libelle: string | null; lot_id: string | null;
  contre_ecriture_de: string | null;
};

/** Lire toutes les pages : un total ne doit pas dépendre de la limite API. */
export async function lireLivreFinances(supabase: SupabaseClient, orgId: string) {
  const lignes: EcritureFinances[] = [];
  for (let debut = 0; ; debut += 500) {
    const { data, error } = await supabase.from("ecritures")
      .select("id, categorie, sens, montant, date_imputation, libelle, lot_id, contre_ecriture_de")
      .eq("organization_id", orgId).order("date_imputation", { ascending: false }).order("id")
      .range(debut, debut + 499);
    if (error) return { lignes: [], error };
    lignes.push(...(data ?? []) as EcritureFinances[]);
    if ((data ?? []).length < 500) return { lignes, error: null };
  }
}

/** Même exclusion des paires annulées que totaux_ecritures, même hors exercice. */
export function resumerLivre(ecritures: EcritureFinances[], annee: number, lots: Set<string> | null) {
  const annulees = new Set(ecritures.map(e => e.contre_ecriture_de).filter(Boolean));
  const lignes = ecritures.filter(e => e.date_imputation.startsWith(`${annee}-`) &&
    (!lots || (e.lot_id != null && lots.has(e.lot_id))) &&
    e.categorie !== "depot_garantie" && !e.contre_ecriture_de && !annulees.has(e.id));
  return {
    lignes,
    recettes: lignes.reduce((s,e) => s + (e.sens === "recette" ? Number(e.montant) : 0),0),
    depenses: lignes.reduce((s,e) => s + (e.sens === "depense" ? Number(e.montant) : 0),0),
  };
}
