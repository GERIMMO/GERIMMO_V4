import type { SupabaseClient } from "@supabase/supabase-js";

export type EcritureFinances = {
  id: string; categorie: string; sens: string; montant: number | string;
  date_imputation: string; libelle: string | null; lot_id: string | null;
  contre_ecriture_de: string | null; bien_id?: string | null;
};

/** Lire toutes les pages : un total ne doit pas dépendre de la limite API. */
export async function lireLivreFinances(supabase: SupabaseClient, orgId: string, lotId?: string) {
  const lignes: EcritureFinances[] = [];
  for (let debut = 0; ; debut += 500) {
    let lecture = supabase.from("journal_par_bien")
      .select("id, categorie, sens, montant, date_imputation, libelle, lot_id, bien_id, contre_ecriture_de")
      .eq("organization_id", orgId);
    if (lotId) lecture = lecture.eq("lot_id", lotId);
    const { data, error } = await lecture.order("date_imputation", { ascending: false }).order("id")
      .range(debut, debut + 499);
    if (error) return { lignes: [], error };
    lignes.push(...(data ?? []) as EcritureFinances[]);
    if ((data ?? []).length < 500) return { lignes, error: null };
  }
}

/** Une part de bâtiment entière ne peut être imputée à une SCI qui en détient seulement certains lots. */
export function biensDuPerimetre(lots: {id:string; bien_id:string}[], selection: Set<string> | null, bien?: string) {
  const biens = new Set<string>();
  for (const lot of lots) if (!bien || lot.bien_id === bien) biens.add(lot.bien_id);
  if (selection) for (const lot of lots) if (!selection.has(lot.id)) biens.delete(lot.bien_id);
  return biens;
}

export function dansPerimetreFinancier(lot: string | null | undefined, bien: string | null | undefined, lots: Set<string> | null, biens: Set<string>) {
  return !lots || (lot ? lots.has(lot) : !!bien && biens.has(bien));
}

/** Même exclusion des paires annulées que totaux_ecritures, même hors exercice. */
export function resumerLivre(ecritures: EcritureFinances[], annee: number, lots: Set<string> | null, biens = new Set<string>()) {
  const annulees = new Set(ecritures.map(e => e.contre_ecriture_de).filter(Boolean));
  const lignes = ecritures.filter(e => e.date_imputation.startsWith(`${annee}-`) &&
    dansPerimetreFinancier(e.lot_id,e.bien_id,lots,biens) &&
    e.categorie !== "depot_garantie" && !e.contre_ecriture_de && !annulees.has(e.id));
  return {
    lignes,
    recettes: lignes.reduce((s,e) => s + (e.sens === "recette" ? Number(e.montant) : 0),0),
    depenses: lignes.reduce((s,e) => s + (e.sens === "depense" ? Number(e.montant) : 0),0),
  };
}
