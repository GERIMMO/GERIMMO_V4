/**
 * Décision du dirigeant du 24/11/2026 (Q20) : quand Gerimmo retire une évaluation d'artisan après une contestation,
 * le CLIENT qui a noté lit le motif du retrait ; l'ARTISAN ne le lit pas.
 *
 * Qui peut lire le motif en base (vérifié le 24/11, test evaluation-contestee-base) : les membres de l'organisation qui
 * a noté (règle de lecture de `artisan_evaluations`) et le super admin (fonction `evaluations_contestation`). L'artisan
 * n'a aucun accès à cette table. Rien n'a donc été changé en base : seul l'affichage manquait.
 *
 * Cette phrase ne s'affiche que dans l'espace du client, sur le dossier de l'intervention.
 */
export function phraseNoteRetiree(note: { note_globale: number; retrait_motif: string | null }): string {
  const annonce = `Votre note (${note.note_globale}/5) a été retirée par Gerimmo : elle ne compte plus dans la moyenne de l'artisan.`;
  const motif = note.retrait_motif?.trim();
  return motif ? `${annonce} Motif du retrait : « ${motif} »` : annonce;
}
