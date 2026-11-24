import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Carte « Sur place » de la mission de l'artisan (phase 3, lot 60, E005 ; reprise R2).
 *
 * Sans numéro de téléphone, la carte renvoyait à « la discussion de l'intervention, plus bas » comme si l'occupant la
 * lisait. Or la base n'ouvre la discussion au locataire que s'il a un compte Gerimmo (`role_echange_intervention`) : sans
 * compte, seul le client de l'artisan lit le message. La phrase le dit ; et elle ne renvoie à la discussion que si celle-ci
 * est ouverte et lisible (fermée ou en échec de lecture, il n'y a rien où écrire « plus bas »).
 */
export type EtatDiscussion = "ouverte" | "fermee" | "illisible";

export const PHRASE_CONTACT_OUVERT = "Ce contact vous est ouvert le temps de la mission, et refermé à la fin.";
export const PHRASE_SANS_NUMERO = "Aucun numéro de téléphone n’a été communiqué pour cette personne. Son nom vous est donné le temps de la mission";
export const PHRASE_RENVOI_DISCUSSION = "pour un message, écrivez dans la discussion de l’intervention, plus bas : votre client la lit, et le locataire aussi s’il a un compte Gerimmo.";

export function phraseContactOccupant({ telephone, discussion }: { telephone: string | null | undefined; discussion: EtatDiscussion }): string {
  if (telephone) return PHRASE_CONTACT_OUVERT;
  return discussion === "ouverte" ? `${PHRASE_SANS_NUMERO} ; ${PHRASE_RENVOI_DISCUSSION}` : `${PHRASE_SANS_NUMERO}.`;
}

/**
 * L'état de la discussion tel que `EchangesIntervention` le rendra plus bas sur la même page : mêmes lectures, mêmes règles
 * (participant reconnu, intervention acceptée, planifiée ou en cours, discussion non fermée). Lecture seule.
 */
export async function lireEtatDiscussion(db: SupabaseClient, intervention: string): Promise<EtatDiscussion> {
  const role = await db.rpc("contexte_echange_intervention", { p_intervention: intervention });
  if (role.error) return "illisible";
  const contexte = (role.data as { statut_intervention: string }[] | null)?.[0];
  if (!contexte) return "illisible";
  const [messages, etat] = await Promise.all([
    db.from("intervention_messages").select("id", { count: "exact", head: true }).eq("intervention_id", intervention),
    db.from("intervention_echanges_etat").select("fermee_le").eq("intervention_id", intervention).maybeSingle(),
  ]);
  if (messages.error || etat.error) return "illisible";
  const terminee = !["acceptee", "planifiee", "en_cours"].includes(contexte.statut_intervention);
  return terminee || etat.data?.fermee_le ? "fermee" : "ouverte";
}
