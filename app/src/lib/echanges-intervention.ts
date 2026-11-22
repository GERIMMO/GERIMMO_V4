import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Audit palier 1 (P1-05) — la discussion d'une intervention signale ses nouveaux messages.
 *
 * Une ligne par intervention dont la discussion porte des messages d'un AUTRE compte que l'appelant n'a pas lus
 * (`echanges_intervention_non_lus`, 20261122180000). La base décide seule de ce que l'appelant a le droit de lire.
 */
export type EchangeNonLu = {
  intervention_id: string;
  incident_id: string;
  organization_id: string;
  non_lus: number;
  dernier_le: string;
};

/**
 * Les discussions à lire. Avec un espace : celles de cet espace (gestionnaire, locataire). Sans : les missions de
 * l'artisan. Une lecture en échec se distingue de « rien à lire » : l'écran n'affirme pas qu'il n'y a pas de message.
 */
export async function lireEchangesNonLus(supabase: Pick<SupabaseClient, "rpc">, orgId: string | null) {
  const { data, error } = await supabase.rpc("echanges_intervention_non_lus", orgId ? { p_org: orgId } : {});
  return { lignes: (data ?? []) as EchangeNonLu[], erreur: Boolean(error) };
}

/** L'instant d'un message tel que la base le rend (à la microseconde) : il lui est renvoyé tel quel, jamais arrondi. */
export const INSTANT_MESSAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** « Nouveau message » ou « 3 nouveaux messages » : l'étiquette posée sur un dossier, une demande, une mission. */
export function etiquetteNouveauxMessages(nombre: number) {
  return nombre > 1 ? `${nombre} nouveaux messages` : "Nouveau message";
}

/** Par incident (gestionnaire, locataire) ou par intervention (artisan) : combien de messages attendent. */
export function nonLusPar(lignes: EchangeNonLu[], cle: "incident_id" | "intervention_id") {
  const total = new Map<string, number>();
  for (const l of lignes) total.set(l[cle], (total.get(l[cle]) ?? 0) + Number(l.non_lus));
  return total;
}
