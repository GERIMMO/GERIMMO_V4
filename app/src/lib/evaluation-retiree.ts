import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Décision du dirigeant du 24/11/2026 (Q20), précisée le même jour (reprise, M5) : quand Gerimmo retire une évaluation
 * d'artisan après une contestation, seul l'AUTEUR de la note lit le motif du retrait.
 *
 *  · l'organisation lit le motif du retrait de SA note (source « gerant »), sur le dossier de l'intervention ;
 *  · le locataire lit le motif du retrait de SA note (source « locataire »), là où il voit son avis ;
 *  · l'organisation ne lit pas le motif du retrait de la note de son locataire ; l'artisan ne lit rien ;
 *  · la supervision garde sa lecture tracée (fonction `evaluations_contestation`).
 *
 * En base (migration 20261124120000) : la colonne `artisan_evaluations.retrait_motif` n'est plus lisible directement
 * par un compte connecté, même par l'API ; la seule lecture est la fonction `retraits_de_mes_notes`, qui vérifie que
 * l'appelant est l'auteur. L'application ne lit donc jamais la colonne : elle passe par `lireRetraitsDeMesNotes`.
 */
export type RetraitDeMaNote = { intervention_id: string; source: "gerant" | "locataire"; note_globale: number; retiree_le: string; retrait_motif: string | null };

/** Les notes retirées dont la personne connectée est l'auteur, dans cette organisation. Lecture en échec : aucune (l'annonce du retrait reste, sans motif). */
export async function lireRetraitsDeMesNotes(db: SupabaseClient, orgId: string): Promise<RetraitDeMaNote[]> {
  const { data, error } = await db.rpc("retraits_de_mes_notes", { p_org: orgId });
  return error ? [] : ((data ?? []) as RetraitDeMaNote[]);
}

export function phraseNoteRetiree(note: { note_globale: number; retrait_motif: string | null }): string {
  const annonce = `Votre note (${note.note_globale}/5) a été retirée par Gerimmo : elle ne compte plus dans la moyenne de l'artisan.`;
  const motif = note.retrait_motif?.trim();
  return motif ? `${annonce} Motif du retrait : « ${motif} »` : annonce;
}
