import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Périmètre « mon portefeuille » (RM-18.1.3).
 *
 * Renvoie l'ensemble des lots sur lesquels l'appelant peut travailler, ou
 * `null` quand il voit tout (admin d'agence, propriétaire direct).
 *
 * LA LISTE VIENT DE LA BASE, ET C'EST LE CORRECTIF DU 12/09. Ce helper
 * recomposait la règle en TypeScript — les lots des mandats dont l'agent est
 * titulaire — pendant que la base en appliquait une autre. Deux écritures d'une
 * même règle finissent toujours par diverger, et elles avaient divergé : un
 * bien qu'un agent venait de créer était accepté par la base et masqué par
 * l'écran. `lots_de_mon_portefeuille` est désormais la seule source, ici comme
 * dans les vingt-cinq politiques qui s'y adossent.
 *
 * La règle qu'elle applique : un lot sort du portefeuille d'un agent seulement
 * s'il est CONFIÉ À QUELQU'UN D'AUTRE. Ce que personne ne gère appartient à
 * l'agence — sinon un agent ne pourrait jamais enregistrer un bien, puisqu'un
 * bien tout neuf n'est sous aucun mandat.
 */
export async function lotsDuPortefeuille(
  supabase: SupabaseClient,
  orgId: string,
  role: string,
  _accountId: string
): Promise<Set<string> | null> {
  if (role !== "agent") return null;
  const { data, error } = await supabase.rpc("lots_de_mon_portefeuille", { p_org: orgId });
  // Une lecture qui échoue ne doit PAS ouvrir le parc entier : on rend un
  // ensemble vide, l'écran affiche « aucun lot » et l'encart d'échec dit
  // pourquoi. L'inverse montrerait à un agent le portefeuille de ses collègues.
  if (error) return new Set<string>();
  return new Set<string>(((data ?? []) as (string | { lots_de_mon_portefeuille: string })[]).map(
    (l) => (typeof l === "string" ? l : l.lots_de_mon_portefeuille)
  ));
}
