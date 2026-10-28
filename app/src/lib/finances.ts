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

/** Une ligne de quittancement_mois : ce qui compte ici, le montant demandé, le montant couvert et le statut de l'échéance. */
export type EcheanceDuMois = { montant_du: number | string; montant_couvert: number | string; statut: string };

/**
 * Les chiffres des échéances d'un mois, au centime. « Reste dû » ne compte que les échéances atteintes : un terme dont
 * l'échéance n'est pas arrivée (statut « attendu », bail payé à terme échu le 5 du mois suivant) se dit « à échoir » à part
 * (audit final du 27/10, LOY-07 : « Reste dû 3 110 € » dont 710 € pas encore exigibles).
 */
export function totauxEcheances(lignes: EcheanceDuMois[]) {
  const centimes = (v: number | string) => Math.round(Number(v) * 100);
  const totaux = { demande: 0, regle: 0, resteDu: 0, aEchoir: 0 };
  for (const l of lignes) {
    const du = centimes(l.montant_du), couvert = Math.min(du, centimes(l.montant_couvert));
    totaux.demande += du; totaux.regle += couvert;
    if (l.statut === "attendu") totaux.aEchoir += Math.max(0, du - couvert); else totaux.resteDu += Math.max(0, du - couvert);
  }
  return { demande: totaux.demande / 100, regle: totaux.regle / 100, resteDu: totaux.resteDu / 100, aEchoir: totaux.aEchoir / 100 };
}
