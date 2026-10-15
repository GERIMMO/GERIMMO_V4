// LE MÉNAGE DU COMPARTIMENT `devis-preparations` (X17, SUP-09, décision du 14/10/2026).
//
// Chaque validation d'un devis dépose un NOUVEAU PDF (chemin aléatoire) ; seul le dernier est référencé par
// `artisan_devis_preparations.pdf_path`. Avant cette décision, les autres restaient dans le compartiment pour
// toujours : valider, modifier, revalider trois fois laissait trois objets pour une référence, et une validation
// qui perdait une course (deux onglets) laissait son PDF.
//
// Règles, toutes volontairement prudentes — mieux vaut un fichier de trop qu'un fichier référencé qui manque :
//  · Seul le compartiment `devis-preparations` est touché : jamais `documents`, où le PDF est classé à l'envoi.
//  · Un devis déjà ENVOYÉ n'est jamais touché.
//  · L'ancien PDF n'est effacé qu'APRÈS une mise à jour dont la base a répondu qu'elle a réussi.
//  · Le PDF qu'on vient de déposer n'est effacé que si la base, relue, ne le référence PAS. Une réponse perdue
//    (la mise à jour a pu aboutir) ou une relecture impossible laisse le fichier en place.
//  · Un échec d'effacement ne fait jamais échouer le geste de l'artisan : il est consigné, l'objet reste.

import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPARTIMENT_PREPARATIONS = "devis-preparations";

type Preparation = { statut?: string | null; pdf_bucket?: string | null; pdf_path?: string | null } | null | undefined;

/**
 * Le chemin du PDF que la mise à jour remplace, ou null s'il n'y a rien à effacer : première validation,
 * brouillon sans PDF, PDF classé ailleurs que dans le compartiment de préparation, devis déjà envoyé.
 */
export function pdfRemplace(preparation: Preparation, nouveauChemin: string | null): string | null {
  if (!preparation || preparation.statut === "envoye") return null;
  if (preparation.pdf_bucket !== COMPARTIMENT_PREPARATIONS || !preparation.pdf_path) return null;
  return preparation.pdf_path === nouveauChemin ? null : preparation.pdf_path;
}

/** Efface un PDF du compartiment de préparation. Ne lève jamais. */
export async function effacerPdfPreparation(service: SupabaseClient, chemin: string | null | undefined): Promise<void> {
  if (!chemin) return;
  try {
    const { error } = await service.storage.from(COMPARTIMENT_PREPARATIONS).remove([chemin]);
    if (error) console.error("[devis] Un ancien PDF de préparation n’a pas pu être effacé.");
  } catch {
    console.error("[devis] Un ancien PDF de préparation n’a pas pu être effacé.");
  }
}

/**
 * Efface le PDF qu'on vient de déposer quand la validation n'a pas abouti — SAUF si la base le référence
 * (la mise à jour a pu réussir alors que la réponse s'est perdue) ou si on ne peut pas le savoir.
 */
export async function abandonnerPdfDepose(
  service: SupabaseClient,
  sollicitationId: string,
  artisanId: string,
  chemin: string | null
): Promise<void> {
  if (!chemin) return;
  try {
    const { data, error } = await service
      .from("artisan_devis_preparations")
      .select("pdf_path")
      .eq("sollicitation_id", sollicitationId)
      .eq("artisan_id", artisanId)
      .maybeSingle();
    if (error) return;
    if ((data as { pdf_path?: string | null } | null)?.pdf_path === chemin) return;
  } catch {
    return;
  }
  await effacerPdfPreparation(service, chemin);
}
