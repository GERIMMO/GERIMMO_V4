// LES ENVOIS AUTOMATIQUES OUVERTS UN PAR UN PAR LE SUPERVISEUR (audit palier 1 du 22/11/2026, P1-08).
//
// Quatre envois étaient écrits et planifiés, mais suspendus par la liste fermée des e-mails : l'avis d'échéance du
// loyer, la relance amiable d'un impayé, le rappel d'un rendez-vous d'intervention, la relance d'une invitation de
// locataire. Chacun a maintenant son interrupteur, FERMÉ PAR DÉFAUT, que seul le superviseur permanent ouvre depuis la
// console (migration 20261122200000).
//
// Ce module ne fait que LIRE l'interrupteur pour la tâche qui envoie. Fermé, illisible ou absent : la tâche ne joint
// aucun contexte métier, et l'envoi reste suspendu exactement comme avant. Ouvert : elle joint le contexte, et la base
// refait la preuve juste avant l'envoi (interrupteur toujours ouvert, aucun arrêt d'urgence, e-mail redit dû).

import type { SupabaseClient } from "@supabase/supabase-js";

export const FLUX_ENVOIS_AUTOMATIQUES = ["avis_echeance", "relance_loyer", "rappel_rendez_vous", "relance_invitation"] as const;
export type FluxEnvoiAutomatique = (typeof FLUX_ENVOIS_AUTOMATIQUES)[number];

/** Ce que la console et les messages disent de chaque envoi. */
export const LIBELLES_ENVOIS_AUTOMATIQUES: Record<FluxEnvoiAutomatique, { titre: string; detail: string }> = {
  avis_echeance: {
    titre: "Avis d’échéance du loyer",
    detail: "Envoyé au locataire avant chaque échéance, pour les espaces qui ont demandé l’envoi automatique des avis.",
  },
  relance_loyer: {
    titre: "Relance amiable d’un loyer impayé",
    detail: "Deux relances aux délais choisis par chaque espace qui l’a demandé ; la caution est informée à la seconde. La mise en demeure n’en fait pas partie.",
  },
  rappel_rendez_vous: {
    titre: "Rappel d’un rendez-vous d’intervention",
    detail: "Envoyé au locataire et à l’artisan sept jours avant, puis la veille.",
  },
  relance_invitation: {
    titre: "Relance d’une invitation de locataire",
    detail: "Deux relances (trois et dix jours après l’invitation) tant que le locataire n’a pas répondu.",
  },
};

/**
 * Vrai seulement si la base dit que le superviseur a ouvert cet envoi. Toute autre réponse (fermé, erreur, fonction
 * absente, valeur inattendue) vaut « fermé » : rien ne part sur une supposition.
 */
export async function envoiAutomatiqueOuvert(db: Pick<SupabaseClient, "rpc">, flux: FluxEnvoiAutomatique): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("envoi_automatique_ouvert", { p_flux: flux });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Un montant tel que la base le compare : « 750 », « 750.5 » ; null s'il n'est pas un montant positif ou nul au centime. */
export function montantDeContexte(valeur: unknown): string | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0 || n >= 1e9) return null;
  const centimes = Math.round(n * 100);
  if (Math.abs(n * 100 - centimes) > 1e-6) return null;
  return String(centimes / 100);
}

/** Ce que les écrans d'un espace peuvent proposer : un oui/non par envoi. */
export type EnvoisProposes = Record<FluxEnvoiAutomatique, boolean>;
export const AUCUN_ENVOI_PROPOSE: EnvoisProposes = { avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false };

/**
 * Les envois que le superviseur a ouverts, pour les écrans des espaces (profil, accueil, loyers, invitation). Toute
 * réponse autre que quatre booléens (erreur, fonction absente, valeur inattendue) vaut « rien n'est proposé » : l'écran
 * continue alors d'afficher « envoi suspendu », comme avant.
 */
export async function lireEnvoisProposes(db: Pick<SupabaseClient, "rpc">): Promise<EnvoisProposes> {
  try {
    const { data, error } = await db.rpc("envois_automatiques_proposes");
    if (error || !data || typeof data !== "object") return AUCUN_ENVOI_PROPOSE;
    const lu = data as Record<string, unknown>;
    if (!FLUX_ENVOIS_AUTOMATIQUES.every((f) => typeof lu[f] === "boolean")) return AUCUN_ENVOI_PROPOSE;
    return Object.fromEntries(FLUX_ENVOIS_AUTOMATIQUES.map((f) => [f, lu[f] === true])) as EnvoisProposes;
  } catch {
    return AUCUN_ENVOI_PROPOSE;
  }
}
