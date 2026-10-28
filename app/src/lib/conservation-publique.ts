import "server-only";
import { createClientPublic } from "@/lib/supabase/public";
import type { RegleConservation } from "./conservation-reglages";

export type DureePublique = Omit<RegleConservation, "minimum_mois" | "revision">;
/**
 * Le catalogue public des durées de conservation (page Confidentialité). Lecture anonyme, y compris quand le visiteur
 * est connecté à un espace restreint.
 *
 * Audit final (PUB-05) : la page est relue toutes les heures (ISR). Une lecture en échec LÈVE au lieu de rendre une
 * liste vide marquée « indisponible » : Next garde la dernière version réussie, et un build sans base échoue au lieu de
 * figer le message de repli pendant une heure (relecture adverse du 28/10). Sans configuration, la liste est vide.
 */
export async function lireDureesPubliques(): Promise<{ regles: DureePublique[]; indisponible: boolean }> {
  const db = createClientPublic();
  if (!db) return { regles: [], indisponible: true };
  const { data, error } = await db.from("retention_rules").select("data_type,libelle,declencheur,duree_mois,duree_initiale_mois,sort,actif,updated_at").order("libelle");
  if (error) throw new Error(`Durées de conservation illisibles : la page publique n'est pas mise en cache (${error.message}).`);
  return { regles: (data ?? []) as DureePublique[], indisponible: !data?.length };
}
