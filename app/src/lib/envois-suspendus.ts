// LES ENVOIS AUTOMATIQUES OUVERTS UN PAR UN PAR LE SUPERVISEUR (audit palier 1 du 22/11/2026, P1-08).
//
// Quatre envois étaient écrits et planifiés, mais suspendus par la liste fermée des e-mails : l'avis d'échéance du
// loyer, la relance amiable d'un impayé, le rappel d'un rendez-vous d'intervention, la relance d'une invitation de
// locataire. Chacun a maintenant son interrupteur, FERMÉ PAR DÉFAUT, que seul le superviseur permanent ouvre depuis la
// console (migration 20261122200000).
//
// Décision du dirigeant du 24/11/2026 (Q37) : un CINQUIÈME envoi, sur le même modèle — la relance envoyée à l'artisan
// qui n'a pas encore répondu à une demande de report de rendez-vous (migration 20261125110000). Fermé par défaut lui
// aussi ; son ouverture est un geste du superviseur, pas du code.
// Décision Q24 : la relance de loyer qu'un propriétaire envoie lui-même, d'un clic, suit l'interrupteur « relance_loyer »
// (aucun interrupteur de plus) ; l'accord permanent de l'espace ne reste exigé que pour les envois automatiques.
//
// Ce module ne fait que LIRE l'interrupteur pour la tâche qui envoie. Fermé, illisible ou absent : la tâche ne joint
// aucun contexte métier, et l'envoi reste suspendu exactement comme avant. Ouvert : elle joint le contexte, et la base
// refait la preuve juste avant l'envoi (interrupteur toujours ouvert, aucun arrêt d'urgence, e-mail redit dû).

import type { SupabaseClient } from "@supabase/supabase-js";

export const FLUX_ENVOIS_AUTOMATIQUES = ["avis_echeance", "relance_loyer", "rappel_rendez_vous", "relance_invitation", "relance_report_rdv"] as const;
export type FluxEnvoiAutomatique = (typeof FLUX_ENVOIS_AUTOMATIQUES)[number];

/** Ce que la console et les messages disent de chaque envoi. */
export const LIBELLES_ENVOIS_AUTOMATIQUES: Record<FluxEnvoiAutomatique, { titre: string; detail: string }> = {
  avis_echeance: {
    titre: "Avis d’échéance du loyer",
    detail: "Envoyé au locataire avant chaque échéance, pour les espaces qui ont demandé l’envoi automatique des avis.",
  },
  relance_loyer: {
    titre: "Relance amiable d’un loyer impayé",
    detail: "Deux relances aux délais choisis par chaque espace qui l’a demandé ; la caution est informée à la seconde. La mise en demeure n’en fait pas partie. Ouvert, un propriétaire peut aussi envoyer lui-même une relance depuis son tableau de bord, sans réglage préalable.",
  },
  rappel_rendez_vous: {
    titre: "Rappel d’un rendez-vous d’intervention",
    detail: "Envoyé au locataire et à l’artisan sept jours avant, puis la veille.",
  },
  relance_invitation: {
    titre: "Relance d’une invitation de locataire",
    detail: "Deux relances (trois et dix jours après l’invitation) tant que le locataire n’a pas répondu.",
  },
  relance_report_rdv: {
    titre: "Relance d’une demande de report de rendez-vous",
    detail: "Envoyée une fois à l’artisan qui n’a pas encore répondu à la demande de report d’un locataire, avant la fin de son délai de réponse.",
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
export const AUCUN_ENVOI_PROPOSE: EnvoisProposes = { avis_echeance: false, relance_loyer: false, rappel_rendez_vous: false, relance_invitation: false, relance_report_rdv: false };

/**
 * Les envois que le superviseur a ouverts, pour les écrans des espaces (profil, accueil, loyers, invitation). Toute
 * réponse autre que cinq booléens (erreur, fonction absente, valeur inattendue) vaut « rien n'est proposé » : l'écran
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

// ── Le panneau du superviseur : ce qui se calcule sans écran ─────────────────────────────────────────────────────
// Ces fonctions vivent ICI, pas dans le composant du panneau : celui-ci est un composant « client », et la page
// (serveur) qui l'affiche ne peut pas appeler une fonction exportée par un module client.

export type EtatEnvoisAutomatiques = Record<FluxEnvoiAutomatique, boolean>;
/** Combien d'espaces ont déjà donné leur accord permanent (avis d'échéance, relance) : null = non lu. */
export type AccordsEspaces = { avis_echeance: number | null; relance_loyer: number | null };

/** Ce que l'ouverture déclenche tout de suite, dit avant de cocher. Rien à dire pour les envois sans accord d'espace. */
export function phraseAccords(flux: FluxEnvoiAutomatique, ouvert: boolean, accords: AccordsEspaces | undefined): string | null {
  if (flux !== "avis_echeance" && flux !== "relance_loyer") return null;
  const n = accords?.[flux];
  if (n === null || n === undefined) return null;
  if (n === 0) return ouvert ? "Aucun espace n’a encore donné son accord : rien ne part pour le moment." : "Aucun espace n’a donné son accord : ouvert, rien ne partira tant qu’un espace ne l’aura pas demandé dans son profil.";
  const espaces = `${n} espace${n > 1 ? "s ont" : " a"}`;
  return ouvert ? `${espaces} donné ${n > 1 ? "leur" : "son"} accord.` : `${espaces} déjà donné ${n > 1 ? "leur" : "son"} accord : ${n > 1 ? "leurs" : "ses"} e-mails partiront dès l’ouverture.`;
}

/** Combien d'envois sont ouverts — pour la carte de résumé de la page. */
export function envoisOuverts(etat: EtatEnvoisAutomatiques | null): number | null {
  return etat ? FLUX_ENVOIS_AUTOMATIQUES.filter((f) => etat[f] === true).length : null;
}
