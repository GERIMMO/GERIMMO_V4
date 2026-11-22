// L'ÉTAT DE L'IA, LU À UN SEUL ENDROIT (interrupteur IA, mission palier 1, 22/11/2026).
//
// Trois états, et pas un de plus :
//  · « active »        : le superviseur laisse l'IA activée et la connexion au fournisseur est en place ;
//  · « desactivee »    : le superviseur a coupé l'IA (réglage `ia_plafond_reglage.ia_active`, lu par `ia_disponible()`) ;
//  · « non_connectee » : l'IA est activée, mais aucun appel ne peut partir de ce serveur : la clé du fournisseur
//    manque, ou le serveur est en mode pilote (lib/verrou-pilote.ts : hors production commerciale, les opérations
//    payantes externes sont suspendues, et six appels à l'IA sur huit consultent ce verrou juste avant de partir).
//
// Les écrans du propriétaire, du locataire et de l'artisan ne proposent une fonction assistée que dans l'état
// « active » : dans les deux autres, ils montrent l'équivalent manuel. La console, elle, distingue les trois états.
// Les gardes de la base (`reserver_appel_ia`, `reserver_appel_ia_prive`) refusent de toute façon l'appel quand l'IA est
// désactivée : un écran qui oublierait de masquer son bouton ne fait partir aucun appel.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paiementsInterdits } from "./verrou-pilote";

export type EtatIA = "active" | "desactivee" | "non_connectee";

/** La clé du fournisseur est-elle posée ? (Nom courant, puis l'ancien nom encore accepté.) */
export function cleIAPosee(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim() || env.OPEN_AI_KEY?.trim());
}

/**
 * Pourquoi aucun appel ne peut partir de ce serveur alors que l'IA est activée : la clé manque, ou le mode pilote
 * suspend les opérations payantes. `null` quand rien ne s'y oppose.
 */
export function motifIANonConnectee(env: Record<string, string | undefined> = process.env): "cle" | "pilote" | null {
  if (!cleIAPosee(env)) return "cle";
  return paiementsInterdits(env) ? "pilote" : null;
}

/**
 * L'état de l'IA pour cette requête. Une lecture impossible vaut « désactivée » : par prudence, aucun écran ne propose
 * alors une fonction dont il ne sait pas si elle répondra ; la saisie manuelle reste offerte.
 *
 * `verrouPilote: false` pour les deux seules fonctions que le mode pilote ne retient pas (analyse du brief et rédaction
 * assistée d'un article, dans la console) : elles ne dépendent que de l'interrupteur et de la clé.
 */
export async function etatIA(
  db: Pick<SupabaseClient, "rpc">,
  env: Record<string, string | undefined> = process.env,
  { verrouPilote = true }: { verrouPilote?: boolean } = {}
): Promise<EtatIA> {
  let lu;
  try {
    lu = await db.rpc("ia_disponible");
  } catch {
    return "desactivee";
  }
  if (lu.error || lu.data !== true) return "desactivee";
  const motif = motifIANonConnectee(env);
  return motif === null || (motif === "pilote" && !verrouPilote) ? "active" : "non_connectee";
}

/**
 * Pour les tâches de fond et la page Santé : l'IA est-elle DÉSACTIVÉE par le superviseur ? Seul un « non » explicite
 * de la base le dit. Une lecture impossible rend `false` : la tâche continue comme avant (la garde de la base refusera
 * de toute façon l'appel si l'IA est coupée) et une alerte de santé reste en place plutôt que de se taire à tort.
 * C'est l'inverse, voulu, de `etatIA` : un écran, dans le doute, propose la saisie manuelle.
 */
export async function iaDesactiveeParLeSuperviseur(db: unknown): Promise<boolean> {
  const client = db as { rpc?: (fonction: string) => PromiseLike<{ data: unknown; error: unknown }> } | null;
  if (typeof client?.rpc !== "function") return false;
  try {
    const lu = await client.rpc("ia_disponible");
    return !lu.error && lu.data === false;
  } catch {
    return false;
  }
}

/** Vrai seulement quand une fonction assistée peut réellement répondre. */
export const iaUtilisable = (etat: EtatIA): boolean => etat === "active";

/** Les dix fonctions qui utilisent l'IA et ce qui les remplace quand elle est coupée (affiché dans les paramètres). */
export const EQUIVALENTS_MANUELS_IA: { fonction: string; pour: string; manuel: string }[] = [
  { fonction: "Assistant « Demander à Gerimmo »", pour: "Propriétaire, locataire", manuel: "Les liens d’aide, la foire aux questions et la messagerie prennent sa place." },
  { fonction: "Lecture assistée d’une facture", pour: "Propriétaire", manuel: "Les montants et la période se saisissent dans le même formulaire." },
  { fonction: "Lecture d’une photo de compteur", pour: "Locataire", manuel: "L’index se saisit à la main." },
  { fonction: "Proposition de devis", pour: "Artisan", manuel: "Un devis vierge, ou les prestations du catalogue de références." },
  { fonction: "Analyse des signaux du brief", pour: "Console", manuel: "Le point du matin et les indicateurs sont calculés sans IA." },
  { fonction: "Rédaction assistée d’un article", pour: "Console", manuel: "Un brouillon vierge à écrire dans l’éditeur." },
  { fonction: "Étude des actualités de la veille", pour: "Tâche planifiée", manuel: "La collecte continue ; la présentation de chaque actualité se rédige à la main." },
  { fonction: "Rédaction d’un post à partir d’une actualité", pour: "Tâche planifiée", manuel: "Un sujet du catalogue éditorial, sans IA." },
  { fonction: "Image d’un post", pour: "Tâche planifiée", manuel: "La préparation automatique des posts est suspendue ; un article se publie à la main avec l’image de votre choix." },
  { fonction: "Atelier de corrections", pour: "Console", manuel: "Sans objet : le suivi des propositions reste consultable." },
];
