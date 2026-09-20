import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import type { LigneQuittancement } from "@/app/agence/[orgId]/comptabilite/quittancement-mois";

/**
 * Le quittancement du mois : les appels de loyer du mois courant, et à défaut
 * ceux du mois précédent (les premiers jours du mois, le cycle n'a parfois pas
 * encore tourné, et un écran vide ferait croire à un mois sans loyer).
 *
 * Partagé entre « Loyers & charges » (qui porte les gestes) et la comptabilité
 * (qui n'en montre plus que le résumé) — audit du 20/09.
 */
export async function chargerQuittancementDuMois(
  supabase: SupabaseClient,
  orgId: string,
  dansPortefeuille: (lotId: string | null | undefined) => boolean
): Promise<{ mois: string; lignes: LigneQuittancement[]; error: unknown }> {
  const lire = async (mois: string) => {
    const { data, error } = await supabase.rpc("quittancement_mois", {
      p_org: orgId,
      p_mois: `${mois}-01`,
    });
    return {
      lignes: ((data ?? []) as LigneQuittancement[]).filter((l) => dansPortefeuille(l.lot_id)),
      error,
    };
  };
  const moisCourant = aujourdhuiParis().slice(0, 7);
  const courant = await lire(moisCourant);
  if (courant.error || courant.lignes.length > 0) {
    return { mois: moisCourant, lignes: courant.lignes, error: courant.error };
  }
  const precedent = new Date(`${moisCourant}-01T00:00:00Z`);
  precedent.setUTCMonth(precedent.getUTCMonth() - 1);
  const moisPrecedent = precedent.toISOString().slice(0, 7);
  const veille = await lire(moisPrecedent);
  if (!veille.error && veille.lignes.length > 0) {
    return { mois: moisPrecedent, lignes: veille.lignes, error: null };
  }
  return { mois: moisCourant, lignes: [], error: veille.error };
}
