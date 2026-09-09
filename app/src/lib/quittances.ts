import type { SupabaseClient } from "@supabase/supabase-js";
import { sansJargon } from "@/lib/erreurs";

// Émission des reçus/quittances d'un bail — le geste partagé entre
// l'encaissement (déclenchement automatique) et le bouton de rattrapage
// manuel. La base (RPC emettre_quittances) garantit l'idempotence : un
// document au plus par appel (contrainte unique), promu de reçu en quittance
// quand le mois se solde — jamais de doublon.

export type ResultatEmission = {
  erreur?: string;
  quittances: number;
  recus: number;
};

export async function emettreRecusQuittances(
  supabase: SupabaseClient,
  bailId: string
): Promise<ResultatEmission> {
  const { data, error } = await supabase.rpc("emettre_quittances", { p_bail: bailId });
  if (error) return { erreur: sansJargon(error.message), quittances: 0, recus: 0 };
  const ligne = ((data ?? []) as { nb_quittances: number; nb_recus: number }[])[0];
  return {
    quittances: Number(ligne?.nb_quittances ?? 0),
    recus: Number(ligne?.nb_recus ?? 0),
  };
}

// « 1 quittance émise », « 2 reçus émis », « 1 quittance et 1 reçu émis » —
// vrai singulier/pluriel, vraie distinction reçu/quittance (audit 09/09).
export function libelleEmission(quittances: number, recus: number): string {
  const morceaux: string[] = [];
  if (quittances > 0) morceaux.push(`${quittances} quittance${quittances > 1 ? "s" : ""}`);
  if (recus > 0) morceaux.push(`${recus} reçu${recus > 1 ? "s" : ""}`);
  if (morceaux.length === 0) return "aucun reçu ni quittance à émettre";
  const participe = recus > 0 ? "émis" : quittances > 1 ? "émises" : "émise";
  return `${morceaux.join(" et ")} ${participe}`;
}
