import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiParis } from "@/lib/ged";
import { lirePlansApurementEnCours } from "@/lib/rappels-loyers";
import type { LigneQuittancement } from "@/app/agence/[orgId]/comptabilite/quittancement-mois";

/**
 * Phase 3, lot 44 (reprise, C65) : « Loyers & charges » (agence) et les Finances du propriétaire invitaient à « Relancer
 * sur le bail » chaque terme non couvert, même d'un bail sous plan d'apurement en cours, où les relances sont suspendues et
 * où le bail refuse d'enregistrer une relance datée de l'activation ou après. Chaque terme non couvert porte donc l'état du
 * plan de son bail, lu comme le suivi des loyers (lirePlansApurementEnCours, sous la RLS de l'appelant). Les termes couverts
 * ne sont pas touchés ; lecture impossible : « illisible » pour tous les termes non couverts.
 */
export async function marquerPlansApurement(
  supabase: SupabaseClient,
  orgId: string,
  lignes: LigneQuittancement[]
): Promise<LigneQuittancement[]> {
  const nonCouvert = (l: LigneQuittancement) => Number(l.montant_couvert) < Number(l.montant_du);
  const baux = lignes.filter(nonCouvert).map((l) => l.bail_id);
  if (!baux.length) return lignes;
  const { enCours, error } = await lirePlansApurementEnCours(supabase, orgId, baux);
  return lignes.map((l) =>
    nonCouvert(l)
      ? { ...l, plan_apurement: error ? "illisible" : enCours.has(l.bail_id) ? "en_cours" : "aucun" }
      : l
  );
}

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
