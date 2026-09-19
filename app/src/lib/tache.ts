// Ce qu'une tâche planifiée laisse derrière elle — et comment on la lit.
//
// LE PREMIER CAPTEUR (wiki : « Gerimmo en autonomie », 19/09). Les quatre
// tâches quotidiennes rendaient leur bilan à Vercel, dans une réponse HTTP que
// personne ne relit, et n'écrivaient rien en base : impossible de savoir, le
// lendemain, si les avis étaient partis. Chaque passe consigne désormais son
// bilan dans `tech_log` sous `tache_<nom>` — y compris une passe qui n'avait
// rien à faire, parce qu'une tâche qui n'a PAS consigné à l'heure prévue est
// elle-même le signal qu'on attend.
//
// `tech_log` est purgé selon `retention_rules` (six mois) : le bilan est un
// journal, pas une comptabilité.

import { timingSafeEqual } from "node:crypto";

/** Le strict nécessaire d'un client Supabase pour consigner : `rpc`. */
export type ClientQuiConsigne = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Consigne le bilan d'une passe. Ne lève jamais : un capteur qui casse la
 * tâche qu'il observe ferait plus de mal que l'absence de capteur.
 */
export async function consignerTache(
  supabase: ClientQuiConsigne,
  tache: string,
  bilan: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_tech", {
      evenement: `tache_${tache}`,
      details: bilan,
    });
    if (error) console.error(`[tâche ${tache}] bilan non consigné:`, error.message);
  } catch (e) {
    console.error(`[tâche ${tache}] bilan non consigné:`, e instanceof Error ? e.message : e);
  }
}

/**
 * La requête porte-t-elle le secret des tâches (`Authorization: Bearer …`) ?
 * Comparaison à temps constant, refus sans secret configuré — la même règle
 * que les quatre routes de tâches, qui gardent chacune leur copie datée.
 */
export function porteurDuSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const entete = request.headers.get("authorization") ?? "";
  if (!entete.startsWith("Bearer ")) return false;
  const a = Buffer.from(entete.slice("Bearer ".length));
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type PasseConsignee = { evenement: string; details: unknown; created_at: string };

/**
 * La dernière passe de chaque tâche, à partir des lignes de `tech_log` lues du
 * plus récent au plus ancien. Le nom de la tâche est rendu sans son préfixe.
 */
export function dernieresTaches(
  lignes: PasseConsignee[]
): Record<string, { le: string; bilan: unknown }> {
  const dernieres: Record<string, { le: string; bilan: unknown }> = {};
  for (const l of lignes) {
    if (!l.evenement.startsWith("tache_")) continue;
    const nom = l.evenement.slice("tache_".length);
    if (!(nom in dernieres)) dernieres[nom] = { le: l.created_at, bilan: l.details };
  }
  return dernieres;
}
