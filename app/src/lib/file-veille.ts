import type { SupabaseClient } from "@supabase/supabase-js";

export type VeilleEnAttente = { id: string; titre: string; source_url: string; publie_source_le: string | null; analyse_le: string | null; analyse_tentee_le: string | null };
/** Pagination explicite : les anciens hors-sujets ne doivent ni masquer les
 * sujets utiles ni faire sous-estimer la file. Une lecture partielle échoue.
 */
export async function lireFileVeille(db: Pick<SupabaseClient, "from">) {
  const lignes: VeilleEnAttente[] = [];
  for (let de = 0; de < 10_000; de += 200) {
    const { data, error } = await db.from("regulatory_watch")
      .select("id,titre,source_url,publie_source_le,analyse_le,analyse_tentee_le")
      .eq("statut", "a_examiner").order("reperage_le", { ascending: true }).order("id").range(de, de + 199);
    if (error || !data) throw new Error("Lecture de la file de veille indisponible.");
    lignes.push(...data as VeilleEnAttente[]);
    if (data.length < 200) return lignes;
  }
  throw new Error("La file de veille dépasse la limite de lecture. Aucun ajout automatique.");
}
